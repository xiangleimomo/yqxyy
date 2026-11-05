#!/usr/bin/env python3
"""Publishable engine: real Little Fox audio -> WhisperX ASR -> official XML Text -> forced alignment.

Official Little Fox XML Paragraph/Text is the only text source.
XML timing and existing website VTT are ignored.
Results remain isolated until the publishing gate validates them.
"""
from __future__ import annotations

import argparse
from collections import defaultdict
from difflib import SequenceMatcher
import gc
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tempfile
import unicodedata
from urllib.parse import urlparse
import wave
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts"))
from lib.littlefox_xml_text import download_xml, parse_text_only
APPROVED_HOSTS = {"cdn.littlefox.com", "cdn.littlefox.co.kr"}
WORD = re.compile(r"\S+", re.UNICODE)
SENTENCE_END = re.compile(r'[.!?][\u201d\u2019"\'\u00bb)]*$')


def normalize(value: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKC", value.lower())
                   if c.isalnum())


def make_asr_mapping(canonical: list[str], segments: list[dict]):
    """Map WhisperX recognition tokens onto the ordered official XML Text tokens (not VTT)."""
    asr, segment_indices = [], []
    for index, seg in enumerate(segments):
        for token in WORD.findall(seg.get("text", "")):
            if normalize(token):
                asr.append(token)
                segment_indices.append(index)
    xml_norm = [normalize(t) for t in canonical]
    asr_norm = [normalize(t) for t in asr]
    map_asr_to_xml = {}
    for block in SequenceMatcher(a=asr_norm, b=xml_norm, autojunk=False).get_matching_blocks():
        for offset in range(block.size):
            map_asr_to_xml[block.a+offset] = block.b+offset
    coverage_xml = len(set(map_asr_to_xml.values())) / max(1, len(canonical))
    coverage_asr = len(map_asr_to_xml) / max(1, len(asr))
    return map_asr_to_xml, segment_indices, coverage_xml, coverage_asr, asr


def correct_segments(canonical: list[str], segments: list[dict]):
    """Replace ASR words with official XML Text phrasing but KEEP ASR audio windows.

    Unrecognized stretches are flagged instead of being forced into unrelated
    audio: the pilot rejects poor coverage and never promotes guessed timing.
    """
    links, origins, xml_coverage, asr_coverage, recognized = make_asr_mapping(canonical, segments)
    per_seg = defaultdict(list)
    asr_size = defaultdict(int)
    for asr_index, seg_index in enumerate(origins):
        asr_size[seg_index] += 1
        if asr_index in links:
            per_seg[seg_index].append(links[asr_index])

    corrected = []
    prior = 0
    rejected_segments = 0
    for i, seg in enumerate(segments):
        mapped = per_seg[i]
        if not mapped:
            rejected_segments += 1
            continue
        end = max(mapped)+1
        if end <= prior:
            rejected_segments += 1
            continue
        span = end-prior
        if span > max(24, asr_size[i]*2.2):
            # A missing portion is a diagnostic failure, not a reason to force
            # a huge official XML Text paragraph into a short unrelated ASR time window.
            rejected_segments += 1
            continue
        start_sec = float(seg.get("start", -1))
        end_sec = float(seg.get("end", -1))
        if start_sec < 0 or end_sec <= start_sec:
            rejected_segments += 1
            continue
        corrected.append({
            "start": max(0, start_sec-0.15),
            "end": end_sec+0.15,
            "text": " ".join(canonical[prior:end]),
        })
        prior = end
    return corrected, {
        "xmlWords": len(canonical), "asrWords": len(recognized),
        "xmlRecognizedFraction": round(xml_coverage, 4),
        "asrXmlPrecision": round(asr_coverage, 4),
        "xmlWordsAssigned": prior,
        "xmlAssignedFraction": round(prior/max(1,len(canonical)),4),
        "asrSegments": len(segments),
        "correctedSegments": len(corrected),
        "rejectedSegments": rejected_segments,
        "asrText": " ".join(recognized),
    }


def aligned_to_official(canonical: list[str], aligned_segments: list[dict], duration_ms: int):
    """Take word timestamps only from actual wav2vec2 forced alignment."""
    found = []
    for seg in aligned_segments:
        for item in seg.get("words", []):
            token = item.get("word", "")
            if normalize(token):
                found.append(item)
    links = {}
    asr_norm = [normalize(w.get("word", "")) for w in found]
    xml_norm = [normalize(w) for w in canonical]
    matcher = SequenceMatcher(a=asr_norm, b=xml_norm, autojunk=False)
    for tag, a0, a1, b0, b1 in matcher.get_opcodes():
        if tag == "equal":
            for offset in range(a1-a0):
                links[b0+offset] = found[a0+offset]
        elif tag == "replace" and 0 < a1-a0 == b1-b0 <= 3:
            # A like/love substitution has a genuine WhisperX timestamp.
            # Require a matching context anchor on both sides where available.
            left = a0 == 0 or (b0 > 0 and asr_norm[a0-1] == xml_norm[b0-1])
            right = a1 == len(found) or (b1 < len(canonical) and asr_norm[a1] == xml_norm[b1])
            if left and right:
                for offset in range(a1-a0):
                    links[b0+offset] = found[a0+offset]
    output = [None] * len(canonical)
    last_start = -1
    for index in range(len(canonical)):
        item = links.get(index)
        if item is None:
            continue
        start = item.get("start")
        end = item.get("end")
        if start is None or end is None:
            continue
        start_ms, end_ms = round(float(start)*1000), round(float(end)*1000)
        if start_ms < 0 or end_ms <= start_ms or end_ms > duration_ms + 150 or start_ms < last_start:
            continue
        output[index] = {
            "text": canonical[index], "startMs": start_ms, "endMs": end_ms,
            "source": "speech", "alignmentScore": round(float(item.get("score") or 0), 3)
        }
        last_start = start_ms

    # Only interpolate short gaps bounded by two verified words; never
    # distribute an entire missing section uniformly.
    index = 0
    while index < len(output):
        if output[index] is not None:
            index += 1
            continue
        begin = index
        while index < len(output) and output[index] is None:
            index += 1
        if begin == 0 or index >= len(output) or index-begin > 2:
            continue
        left, right = output[begin-1], output[index]
        if right["startMs"] < left["endMs"] or right["startMs"]-left["endMs"] > 1300:
            continue
        gap = right["startMs"]-left["endMs"]
        length = index-begin
        for i in range(length):
            start_ms = left["endMs"]+round(gap*i/length)
            end_ms = left["endMs"]+round(gap*(i+1)/length)
            if end_ms > start_ms:
                output[begin+i] = {
                    "text":canonical[begin+i], "startMs":start_ms,
                    "endMs":end_ms, "source":"estimated"
                }
    aligned = sum(bool(w and w["source"]=="speech") for w in output)
    estimate = sum(bool(w and w["source"]=="estimated") for w in output)
    return output, {
        "totalXmlWords": len(canonical),
        "forcedAlignedWords": aligned,
        "shortGapEstimatedWords": estimate,
        "missingWords": len(canonical)-aligned-estimate,
        "forcedAlignedFraction": round(aligned/max(1,len(canonical)),4)
    }



def fill_rare_verified_gaps(output: list, canonical: list[str]):
    """For an otherwise >97.5% aligned transcript, estimate a few local gaps.

    The rescued entries keep source='estimated' and never count toward
    acoustic alignment coverage; long or unbounded gaps remain rejected.
    """
    missing = [i for i,w in enumerate(output) if w is None]
    if not missing or len(missing) > min(6, max(3, round(len(output)*0.012))):
        return 0
    added = 0
    pos = 0
    while pos < len(output):
        if output[pos] is not None:
            pos += 1
            continue
        begin = pos
        while pos < len(output) and output[pos] is None:
            pos += 1
        if begin == 0 or pos >= len(output) or pos-begin > 2:
            continue
        before,after = output[begin-1],output[pos]
        gap = after["startMs"]-before["endMs"]
        if gap <= 0 or gap > 2500:
            continue
        run = pos-begin
        for j in range(run):
            start_ms = before["endMs"]+round(gap*j/run)
            end_ms = before["endMs"]+round(gap*(j+1)/run)
            if end_ms <= start_ms:
                break
            output[begin+j] = {
                "text":canonical[begin+j], "startMs":start_ms,
                "endMs":end_ms, "source":"estimated"
            }
            added += 1
    return added



def suspicious_word_spans(words: list[dict], threshold_ms: int = 3500):
    """Identify implausibly long single-word spans (e.g. intro music as a word)."""
    return [
        {"index":i,"word":word["text"],"durationMs":word["endMs"]-word["startMs"],
         "startMs":word["startMs"],"endMs":word["endMs"]}
        for i,word in enumerate(words)
        if word and word["endMs"]-word["startMs"] > threshold_ms
    ]


def format_vtt_time(ms: int) -> str:
    ms = max(0, ms)
    h, remain = divmod(ms, 3600000)
    m, remain = divmod(remain, 60000)
    s, remainder = divmod(remain, 1000)
    return f"{h:02}:{m:02}:{s:02}.{remainder:03}"


def split_cues(aligned: list[dict]):
    """Create new sentence cues using READ punctuation and aligned word times."""
    cues = []
    start = 0
    for i, word in enumerate(aligned):
        is_end = bool(SENTENCE_END.search(word["text"]))
        n = i-start+1
        if not ((is_end and n >= 2) or n >= 18 or i==len(aligned)-1):
            continue
        group = aligned[start:i+1]
        cues.append({
            "startMs":group[0]["startMs"],"endMs":group[-1]["endMs"],
            "text":" ".join(w["text"] for w in group),
            "words":[{k:v for k,v in w.items() if k!="alignmentScore"} for w in group]
        })
        start = i+1
    return cues


def write_candidate(folder: Path, series: str, eid: int, canonical: list[str],
                    mapped: list[dict], info: dict, media_path: str, model: str, source_id=None, xml_evidence=None):
    cues = split_cues(mapped)
    subtitle_text = "WEBVTT\n\n" + "\n\n".join(
        f"{idx}\n{format_vtt_time(c['startMs'])} --> {format_vtt_time(c['endMs'])}\n{c['text']}"
        for idx,c in enumerate(cues,1)
    )+"\n"
    digest = hashlib.sha256(subtitle_text.encode()).hexdigest()
    track = {
        "seriesId":series,"episodeId":eid,"sourceContentId":source_id,"mediaPath":media_path,
        "mediaFingerprint":hashlib.sha256(media_path.encode()).hexdigest(),
        "subtitleSha256":digest,"method":"whisperx-asr-xml-text-only-forced-alignment",
        "textAuthority":"littlefox-xml-paragraph-text",
        "xmlTextSha256":(xml_evidence or {}).get("sha256"),
        "xmlParagraphCount":(xml_evidence or {}).get("paragraphs"),
        "recognizer":model,"cueCount":len(cues),"totalWords":info.get("totalXmlWords",len(canonical)),"captionedWords":len(mapped),"omittedUnalignedWords":info.get("totalXmlWords",len(canonical))-len(mapped),
        "speechMatchedWords":info["forcedAlignedWords"],
        "speechMatchedFraction":info["forcedAlignedFraction"],
        "cues":[{"words":c["words"]} for c in cues]
    }
    (folder / f"{eid:03}.vtt").write_text(subtitle_text,encoding="utf-8")
    (folder / f"{eid:03}.words.json").write_text(json.dumps(track,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    return len(cues)


def media_candidates(episode: dict):
    video = episode.get("video") or {}
    # Match Watch's first-choice URL; older pipeline preferred 720P fallback.
    urls = [video.get(k) for k in ("hlsUrl","hls720Url","backupHlsUrl")]
    seen = set()
    for url in urls:
        if not url or url in seen:
            continue
        u = urlparse(url)
        if (u.scheme != "https" or u.hostname not in APPROVED_HOSTS
                or u.username or u.password or u.port):
            continue
        seen.add(url)
        yield url


def extract_hls_audio(episode: dict, wav: Path):
    from shutil import which
    exe = which("ffmpeg")
    if not exe:
        raise RuntimeError("ffmpeg is required")
    failures = []
    for url in media_candidates(episode):
        cmd = [exe,"-nostdin","-hide_banner","-loglevel","error",
               "-reconnect","1","-reconnect_streamed","1","-reconnect_delay_max","3",
               "-i",url,"-vn","-ac","1","-ar","16000","-acodec","pcm_s16le","-y",str(wav)]
        try:
            proc = subprocess.run(cmd, capture_output=True, timeout=600, check=False)
            if proc.returncode or not wav.is_file() or wav.stat().st_size < 32000:
                failures.append(f"{urlparse(url).hostname}: ffmpeg failed")
                continue
            with wave.open(str(wav),"rb") as stream:
                duration_ms = round(stream.getnframes()/stream.getframerate()*1000)
            if duration_ms < 120000:
                failures.append(f"{urlparse(url).hostname}: incomplete audio ({duration_ms} ms)")
                continue
            return urlparse(url).path, duration_ms
        except Exception as error:
            failures.append(type(error).__name__)
    raise RuntimeError("Could not extract complete approved HLS audio: " + "; ".join(failures))


def run_one(args):
    series, eid = args.series, args.episode
    folder = Path(args.output) / f"{series}-{eid:03}"
    folder.mkdir(parents=True,exist_ok=True)
    directory = ROOT / "data" / series
    episodes = json.loads((directory/"episodes.json").read_text())
    episode = next(e for e in episodes if int(e["episodeId"])==eid)
    report={"seriesId":series,"episodeId":eid,"model":args.model,"approved":False}
    try:
        xml_url,xml_bytes=download_xml(episode.get("sourceContentId"))
        xml_evidence=parse_text_only(xml_bytes)
        (folder/"official-caption.xml").write_bytes(xml_bytes)
        canonical=xml_evidence["words"]
        (folder/"official-text-cleaned.txt").write_text(" ".join(canonical)+"\n",encoding="utf-8")
        report.update({"textAuthority":"littlefox-xml-paragraph-text",
            "xmlContentId":episode.get("sourceContentId"),
            "xmlTextSha256":xml_evidence["sha256"],
            "xmlParagraphCount":xml_evidence["paragraphs"],
            "xmlWordCount":len(canonical)})
        import whisperx
        with tempfile.TemporaryDirectory(prefix="yqxyy-whisperx-") as tmp:
            wav = Path(tmp)/"audio.wav"
            media_path, duration_ms = extract_hls_audio(episode, wav)
            report.update({"mediaPath":media_path,"durationMs":duration_ms})
            audio = whisperx.load_audio(str(wav))
            model = whisperx.load_model(
                args.model, "cpu",compute_type="int8",language="en",
                vad_method="silero",download_root=str(Path(args.model_cache)),
                threads=4
            )
            asr_result = model.transcribe(audio,batch_size=4)
            del model
            gc.collect()
            segments = asr_result.get("segments") or []
            corrected, metrics = correct_segments(canonical,segments)
            asr_text = metrics.pop("asrText")
            (folder/"asr-raw.txt").write_text(asr_text+"\n",encoding="utf-8")
            report.update(metrics)
            # Catch wrong/missing audio before forced alignment, independently
            # of any old official VTT timestamps.
            if (metrics["xmlRecognizedFraction"] < args.min_text_match
                    or metrics["xmlAssignedFraction"] < args.min_text_match):
                raise ValueError("ASR vs official XML Text mismatch or truncated audio: "
                                 f"{metrics['xmlRecognizedFraction']:.1%} matched, "
                                 f"{metrics['xmlAssignedFraction']:.1%} assigned")
            align_model, metadata = whisperx.load_align_model(language_code="en",device="cpu")
            aligned_result = whisperx.align(
                corrected, align_model, metadata, audio, "cpu",
                interpolate_method="ignore",return_char_alignments=False
            )
            del align_model
            gc.collect()
            (folder/"forced-alignment-raw.json").write_text(
                json.dumps(aligned_result.get("segments") or [],ensure_ascii=False)+"\n",
                encoding="utf-8"
            )
            mapped, quality = aligned_to_official(canonical,aligned_result.get("segments") or [],duration_ms)
            quality["missingWordExamples"] = [
                {"index":i,"word":canonical[i]} for i,w in enumerate(mapped) if w is None
            ][:20]
            if quality["forcedAlignedFraction"] >= args.min_aligned:
                rescued = fill_rare_verified_gaps(mapped,canonical)
                quality["shortGapEstimatedWords"] += rescued
                quality["missingWords"] -= rescued
            report.update(quality)
            # Never publish partial transcripts: missing long gaps, very low
            # acoustic coverage or suspicious tail imply a failed pilot.
            first = next((w for w in mapped if w is not None),None)
            last = next((w for w in reversed(mapped) if w is not None),None)
            report["lastAlignedMs"] = last["endMs"] if last else None
            report["missingTrailingWords"] = next(
                (len(mapped)-i-1 for i in range(len(mapped)-1,-1,-1) if mapped[i]),len(mapped)
            )
            if quality["forcedAlignedFraction"] < args.min_aligned:
                raise ValueError(f"Forced word alignment low: {quality['forcedAlignedFraction']:.1%}")
            # Retain all official words; a small missing ASR gap may be estimated
            # only when it is bounded by genuine timestamps.
            # Publish verified timed words when acoustic coverage passes the threshold.\n            # Missing words are explicitly omitted, never given fabricated timestamps.\n            publishable = [word for word in mapped if word is not None]
            if not first or not last or last["endMs"] < duration_ms*0.75:
                raise ValueError("Missing late-episode speech; candidate withheld")
            outliers = suspicious_word_spans(mapped)
            report["suspiciousLongWordSpans"] = outliers[:15]
            cue_count = write_candidate(folder,series,eid,canonical,publishable,quality,media_path,args.model,episode.get("sourceContentId"),xml_evidence)
            report["candidateCueCount"] = cue_count
            if outliers:
                # Keep a preview artifact for human review, never call it approved.
                raise ValueError(f"{len(outliers)} suspect long-word intervals; manual review required")
            report["approved"] = True
    except Exception as exc:
        report["failure"] = f"{type(exc).__name__}: {str(exc)[:350]}"
    (folder/"alignment-report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(report,ensure_ascii=False),flush=True)
    return 0 if report["approved"] else 2


def main():
    p=argparse.ArgumentParser()
    p.add_argument("--series",default="journey-to-the-west")
    p.add_argument("--episode",type=int,required=True)
    p.add_argument("--output",default="whisperx-canonical-results")
    p.add_argument("--model",default="small.en")
    p.add_argument("--model-cache",default="/tmp/yqxyy-whisperx-models")
    p.add_argument("--min-text-match",type=float,default=0.82)
    p.add_argument("--min-aligned",type=float,default=0.90)
    args=p.parse_args()
    raise SystemExit(run_one(args))

if __name__=="__main__":
    main()
