#!/usr/bin/env python3
"""Fail-closed publisher for up to 50-item WhisperX+official-XML-Text batch output.

Reads only freshly generated candidates and current canonical Read. It never
uses the site's previous VTT or word timing as generation/validation input.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
from pathlib import Path
import re
import shutil
from urllib.parse import urlparse

ROOT=Path(__file__).resolve().parents[1]
METHOD="whisperx-asr-xml-text-only-forced-alignment"
SPEC=importlib.util.spec_from_file_location("whisperx_read_engine",ROOT/"scripts/whisperx-read-align.py")
ENGINE=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ENGINE)

def digest(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()

def validated_payload(row, folder):
    sid=row["seriesId"];eid=int(row["episodeId"])
    reports=folder/"alignment-report.json"
    vtt_file=folder/f"{eid:03}.vtt"
    words_file=folder/f"{eid:03}.words.json"
    if not reports.is_file():
        raise ValueError("Missing alignment report")
    report=json.loads(reports.read_text(encoding="utf-8"))
    if report.get("approved") is not True:
        raise ValueError(report.get("failure") or "Quality gate rejected this episode")
    if not vtt_file.is_file() or not words_file.is_file():
        raise ValueError("Missing new subtitle/word file pair")
    vtt=vtt_file.read_text(encoding="utf-8")
    word_text=words_file.read_text(encoding="utf-8")
    track=json.loads(word_text)
    if track.get("method")!=METHOD or track.get("seriesId")!=sid or track.get("episodeId")!=eid:
        raise ValueError("Invalid new-method track metadata")
    ep_file=ROOT/"data"/sid/"episodes.json"
    eps=json.loads(ep_file.read_text(encoding="utf-8"))
    ep=next(e for e in eps if int(e["episodeId"])==eid)
    xml_file=folder/"official-caption.xml"
    if not xml_file.is_file():
        raise ValueError("Official XML Text source artifact missing")
    checked=ENGINE.parse_text_only(xml_file.read_bytes())
    canonical=checked["words"]
    if report.get("textAuthority")!="littlefox-xml-paragraph-text" or track.get("textAuthority")!="littlefox-xml-paragraph-text":
        raise ValueError("Candidate did not use original XML Text")
    if report.get("xmlContentId")!=ep.get("sourceContentId"):
        raise ValueError("Official XML content ID does not match episode")
    if checked["sha256"]!=report.get("xmlTextSha256") or checked["sha256"]!=track.get("xmlTextSha256"):
        raise ValueError("Official XML transcript hash mismatch")
    if row.get("sourceContentId")!=ep.get("sourceContentId") or track.get("sourceContentId")!=ep.get("sourceContentId"):
        raise ValueError("Source ID changed since selection")
    if not track.get("mediaPath") or not track.get("mediaFingerprint"):
        raise ValueError("Missing audio source fingerprint")
    allowed={
        urlparse(ep.get("video",{}).get(k,"")).path
        for k in ("hlsUrl","hls720Url","backupHlsUrl")
        if ep.get("video",{}).get(k)
    }
    if track["mediaPath"] not in allowed or digest(track["mediaPath"])!=track["mediaFingerprint"]:
        raise ValueError("Audio source does not belong to this episode")
    if digest(vtt)!=track.get("subtitleSha256"):
        raise ValueError("New VTT checksum differs from aligned words")
    if not vtt.startswith("WEBVTT\n\n"):
        raise ValueError("New captions are not WebVTT")
    blocks=[x for x in re.split(r"\n\s*\n",vtt.strip()) if " --> " in x]
    if len(blocks)!=track.get("cueCount") or len(blocks)!=len(track.get("cues",[])):
        raise ValueError("Cue counts differ")
    flattened=[]
    total_speech=0
    previous_start=-1
    for index,(block,cue) in enumerate(zip(blocks,track["cues"])):
        lines=block.splitlines()
        clock=next((line for line in lines if " --> " in line),None)
        if not clock:
            raise ValueError("VTT timecode missing")
        times=clock.split(" --> ")
        def millis(value):
            h,m,s=value.strip().split(":")
            return round((int(h)*3600+int(m)*60+float(s))*1000)
        start,end=millis(times[0]),millis(times[1].split()[0])
        if start<previous_start or start<0 or end<=start or end>report.get("durationMs",0)+200:
            raise ValueError(f"Invalid sentence time range at {index+1}")
        previous_start=start
        text=" ".join(lines[lines.index(clock)+1:]).strip()
        words=cue.get("words",[])
        if not words or [w.get("text") for w in words]!=text.split():
            raise ValueError(f"Read wording differs from aligned words at {index+1}")
        last=-1
        for word in words:
            a=word.get("startMs");b=word.get("endMs")
            if not isinstance(a,int) or not isinstance(b,int) or b<=a or a<start-150 or b>end+150 or a<last:
                raise ValueError(f"Unreliable word time at {index+1}")
            if word.get("source") not in ("speech","estimated"):
                raise ValueError("Unknown word source")
            total_speech+=word["source"]=="speech"
            flattened.append(word["text"])
            last=a
    # Captioned words must be an in-order subsequence of the official XML.
    # Unaligned words may be omitted but must never be silently timestamped.
    cursor=0
    for token in flattened:
        while cursor<len(canonical) and canonical[cursor]!=token:
            cursor+=1
        if cursor>=len(canonical):
            raise ValueError("Caption contains words outside ordered official XML")
        cursor+=1
    if (track.get("totalWords")!=len(canonical) or
            track.get("captionedWords")!=len(flattened) or
            track.get("omittedUnalignedWords")!=len(canonical)-len(flattened) or
            track.get("speechMatchedWords")!=total_speech):
        raise ValueError("Word totals inconsistent")
    if total_speech/max(1,len(canonical))<.90:
        raise ValueError("Forced acoustic alignment below threshold")
    if report.get("suspiciousLongWordSpans"):
        raise ValueError("Known abnormal spans")
    return vtt,word_text,{"cues":len(blocks),"words":len(flattened),
                          "xmlTextVerified":True,"xmlParagraphs":checked["paragraphs"],
                          "speechWords":total_speech,"coverage":round(total_speech/len(canonical),4),"omittedWords":len(canonical)-len(flattened)}

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--manifest",required=True)
    p.add_argument("--source",default="whisperx-batch-results")
    p.add_argument("--run-id",required=True)
    p.add_argument("--report-prefix", choices=["whisperx-read", "whisperx-recovery"], default="whisperx-read")
    args=p.parse_args()
    plan=json.loads(Path(args.manifest).read_text(encoding="utf-8"))
    if plan.get("pipeline")!="audio-whisperx-xml-text-only-forced-alignment" or plan.get("usesExistingSiteSubtitlesAsInput") is not False:
        raise ValueError("Publisher refused an obsolete VTT-based batch")
    if len(plan.get("lessons",[]))>50 or not plan.get("lessons"):
        raise ValueError("Batch must contain 1–50 episodes")
    root=Path(args.source)
    successes=[];failures=[]
    for row in plan["lessons"]:
        sid,eid=row["seriesId"],int(row["episodeId"])
        folder=root/f"{sid}-{eid:03}"
        try:
            vtt,word_text,metrics=validated_payload(row,folder)
            target=ROOT/"data"/sid/"subtitles"
            target.mkdir(parents=True,exist_ok=True)
            (target/f"{eid:03}.vtt").write_text(vtt,encoding="utf-8")
            (target/f"{eid:03}.words.json").write_text(word_text,encoding="utf-8")
            successes.append(dict(seriesId=sid,episodeId=eid,**metrics))
        except Exception as error:
            failures.append(dict(seriesId=sid,episodeId=eid,reason=re.sub(r"https?://\S+","[media]",str(error))[:300]))
    now=datetime.now(timezone.utc).isoformat()
    output={
        "pipeline":METHOD,"runId":str(args.run_id),"completedAt":now,
        "batchSize":plan.get("batchSize",50),"selected":len(plan["lessons"]),"published":len(successes),
        "rejected":len(failures),"websiteCommitRequired":True,
        "totalWords":sum(x["words"] for x in successes),
        "speechMatchedWords":sum(x["speechWords"] for x in successes),
        "success":successes,"failures":failures}
    reports=ROOT/"reports"
    reports.mkdir(parents=True,exist_ok=True)
    (reports/f"{args.report_prefix}-batch-latest.json").write_text(json.dumps(output,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    history=reports/f"{args.report_prefix}-batches"
    history.mkdir(parents=True,exist_ok=True)
    (history/f"{args.run_id}.json").write_text(json.dumps(output,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    failed_path=reports/"whisperx-read-failures.json"
    old={}
    if failed_path.is_file():
        try:
            for entry in json.loads(failed_path.read_text(encoding="utf-8")).get("failures",[]):
                old[(entry["seriesId"],int(entry["episodeId"]))]=entry
        except (ValueError,KeyError,TypeError):pass
    for success in successes:old.pop((success["seriesId"],success["episodeId"]),None)
    for failure in failures:old[(failure["seriesId"],failure["episodeId"])]=failure
    failed_path.write_text(json.dumps({"failures":list(old.values())},ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({k:v for k,v in output.items() if k not in ("success","failures")},ensure_ascii=False,indent=2))
    # Do not fail the publishing job for one rejected episode: the quality gate
    # withheld that episode's files, while the report identifies it for retry.
if __name__=="__main__":
    main()
