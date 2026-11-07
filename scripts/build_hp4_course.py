#!/usr/bin/env python3
"""Build the Goblet of Fire course from its own HLS master and embedded English CC track.

The original video/audio segments remain on the source host. This script writes
episode-local HLS playlists, course metadata, original vocabulary examples,
and plot-based quizzes. It does not copy the complete subtitle transcript into
the repository; the Netlify subtitle endpoint fetches and time-slices the
source's embedded WebVTT track at request time.
"""
import collections
import hashlib
import html
import json
import math
import pathlib
import re
import urllib.parse

ROOT=pathlib.Path(__file__).resolve().parents[1]
INSPECT=ROOT/"hp4-source-inspection"
BASE=ROOT/"data/movie-harry-potter-4"
PLAN=BASE/"editorial.json"
SOURCE="https://api.obj2.top/hls/movie/674/master.m3u8"

def seconds(value):
    p=value.replace(",",".").split(":")
    if len(p)==2:return int(p[0])*60+float(p[1])
    if len(p)==3:return int(p[0])*3600+int(p[1])*60+float(p[2])
    raise ValueError(value)

def stamp(value,comma=False):
    ms=max(0,round(value*1000))
    out=f"{ms//3600000:02d}:{(ms//60000)%60:02d}:{(ms//1000)%60:02d}{',' if comma else '.'}{ms%1000:03d}"
    return out

def parse_vtt(path):
    raw=path.read_text(encoding="utf-8-sig").replace("\r\n","\n").replace("\r","\n")
    cues=[]
    for block in re.split(r"\n\s*\n",raw.strip()):
        lines=block.strip().splitlines()
        ti=next((i for i,line in enumerate(lines) if "-->" in line),None)
        if ti is None:continue
        m=re.match(r"\s*([\d:. ,]+)\s*-->\s*([\d:. ,]+)",lines[ti])
        if not m:continue
        start,end=map(seconds,m.groups())
        text="\n".join(html.unescape(re.sub(r"<[^>]*>","",x)).strip() for x in lines[ti+1:] if x.strip())
        if end>start and text:cues.append({"start":start,"end":end,"text":text})
    if len(cues)<1000:raise ValueError(f"English CC subtitle file incomplete: {len(cues)} cues")
    return raw,cues

def attrs(line):
    out={}
    for k,v in re.findall(r'([A-Z-]+)=("[^"]*"|[^,]+)',line.split(":",1)[1]):
        out[k]=v.strip('"')
    return out

def parse_media(path,base_url):
    lines=[x.strip() for x in path.read_text(encoding="utf-8").splitlines() if x.strip()]
    seq=next((int(x.split(":",1)[1]) for x in lines if x.startswith("#EXT-X-MEDIA-SEQUENCE:")),0)
    segments=[];total=0.0;pending=None;key=None;map_tag=None;discontinuity=False;byte_range=None
    for line in lines:
        if line.startswith("#EXT-X-KEY:"):
            a=attrs(line)
            if "URI" in a:a["URI"]=urllib.parse.urljoin(base_url,a["URI"])
            key="#EXT-X-KEY:"+",".join(f'{k}="{v}"' if k=="URI" else f"{k}={v}" for k,v in a.items())
        elif line.startswith("#EXT-X-MAP:"):
            a=attrs(line)
            if "URI" in a:a["URI"]=urllib.parse.urljoin(base_url,a["URI"])
            map_tag="#EXT-X-MAP:"+",".join(f'{k}="{v}"' if k=="URI" else f"{k}={v}" for k,v in a.items())
        elif line=="#EXT-X-DISCONTINUITY":
            discontinuity=True
        elif line.startswith("#EXT-X-BYTERANGE:"):
            byte_range=line
        elif line.startswith("#EXTINF:"):
            pending=float(line.split(":",1)[1].split(",",1)[0])
        elif not line.startswith("#") and pending is not None:
            segments.append({"start":total,"end":total+pending,"duration":pending,
                             "uri":urllib.parse.urljoin(base_url,line),"key":key,"map":map_tag,
                             "discontinuity":discontinuity,"byterange":byte_range})
            total+=pending;pending=None;discontinuity=False;byte_range=None
    if not segments:raise ValueError(f"No media segments in {path}")
    if any(x["map"] for x in segments) or any(x["byterange"] for x in segments):
        raise ValueError("This source uses fMP4 MAP or BYTERANGE; do not silently repackage it")
    return {"sequence":seq,"segments":segments,"duration":total}

def safe_boundary(target,segments,cues,tolerance=32):
    candidates=[]
    for i,seg in enumerate(segments):
        t=seg["start"]
        if abs(t-target)>tolerance:continue
        overlaps=any(c["start"]<t+0.08 and c["end"]>t-0.08 for c in cues)
        if not overlaps:candidates.append((abs(t-target),i))
    if not candidates:
        raise ValueError(f"No subtitle-safe HLS segment boundary within {tolerance}s of {target}")
    return min(candidates)[1]

def nearest_audio_boundary(target,segments,tolerance=0.5):
    i=min(range(len(segments)),key=lambda n:abs(segments[n]["start"]-target))
    delta=abs(segments[i]["start"]-target)
    if delta>tolerance:raise ValueError(f"Audio/video segment boundary drift {delta:.3f}s exceeds {tolerance}s")
    return i

def write_media(path,media,first,last):
    selected=media["segments"][first:last]
    if not selected:raise ValueError(f"Empty media range for {path}")
    out=["#EXTM3U","#EXT-X-VERSION:3","#EXT-X-PLAYLIST-TYPE:VOD",
         f"#EXT-X-TARGETDURATION:{math.ceil(max(x['duration'] for x in selected))}",
         f"#EXT-X-MEDIA-SEQUENCE:{media['sequence']+first}"]
    prev_key=prev_map=None
    for i,seg in enumerate(selected):
        if seg["discontinuity"] and i:out.append("#EXT-X-DISCONTINUITY")
        if seg["key"] and seg["key"]!=prev_key:out.append(seg["key"])
        elif not seg["key"] and prev_key:out.append("#EXT-X-KEY:METHOD=NONE")
        if seg["map"] and seg["map"]!=prev_map:out.append(seg["map"])
        prev_key,prev_map=seg["key"],seg["map"]
        out.extend([f"#EXTINF:{seg['duration']:.6f},",seg["uri"]])
    out.append("#EXT-X-ENDLIST")
    path.write_text("\n".join(out)+"\n",encoding="utf-8")
    return sum(x["duration"] for x in selected),len(selected)

def make_master(path,eid,variant_meta):
    audio=f"{eid:03d}.audio.m3u8"
    lines=["#EXTM3U","#EXT-X-VERSION:3",
           f'#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="English",LANGUAGE="eng",DEFAULT=YES,AUTOSELECT=YES,URI="{audio}"']
    for v in sorted(variant_meta,key=lambda x:int(x["attrs"].get("BANDWIDTH","0"))):
        res=v["attrs"].get("RESOLUTION","")
        label="720" if res=="1280x720" else "1080"
        uri=f"{eid:03d}.video-{label}.m3u8"
        attrs=v["attrs"]
        bw=attrs.get("BANDWIDTH","2150000")
        codecs=attrs.get("CODECS","avc1.640028,mp4a.40.2")
        lines.extend([f'#EXT-X-STREAM-INF:BANDWIDTH={bw},RESOLUTION={res},CODECS="{codecs}",AUDIO="aud"',uri])
    path.write_text("\n".join(lines)+"\n",encoding="utf-8")

def first_word_evidence(word,cues,start,end):
    pattern=re.compile(r"\b"+re.escape(word)+r"\b",re.I)
    for cue in cues:
        if start<=cue["start"]<end and pattern.search(cue["text"]):
            return cue["start"],cue["text"]
    return None,None

def main():
    report=json.loads((INSPECT/"source-report.json").read_text(encoding="utf-8"))
    plan=json.loads(PLAN.read_text(encoding="utf-8"))
    chapters=plan["chapters"]
    if len(chapters)!=21:raise ValueError(f"Expected 21 story chapters, got {len(chapters)}")
    sub_track=report["subtitleTracks"][0]
    if sub_track.get("language")!="en" or sub_track.get("status")!="fetched":
        raise ValueError("Expected a successfully fetched embedded English subtitle track as track 1")
    source_vtt=INSPECT/"subtitle-track-01/0001.vtt"
    vtt_raw,cues=parse_vtt(source_vtt)
    vtt_bytes=source_vtt.read_bytes()
    subtitle_hash=hashlib.sha256(vtt_bytes).hexdigest()
    subtitle_playlist=INSPECT/"subtitle-track-01/playlist.m3u8"
    sub_lines=[x.strip() for x in subtitle_playlist.read_text(encoding="utf-8").splitlines() if x.strip()]
    sub_segment=next(x for x in sub_lines if not x.startswith("#"))
    subtitle_url=urllib.parse.urljoin(sub_track["uri"],sub_segment)

    video_variants=[]
    for item in report["variants"]:
        playlist=INSPECT/item["mediaPlaylist"]
        base=item.get("url")
        if item.get("nestedVariant"):base=item["nestedVariant"]["url"]
        video_variants.append({"attrs":item["attrs"],"media":parse_media(playlist,base),"resolution":item["attrs"].get("RESOLUTION")})
    video_variants.sort(key=lambda x:int(x["attrs"].get("BANDWIDTH","0")))
    if len(video_variants)<2:raise ValueError("Expected both 720p and 1080p video variants")
    video_ref=next(x for x in video_variants if x["resolution"]=="1920x1080")
    video_segments=video_ref["media"]["segments"]
    for v in video_variants:
        segs=v["media"]["segments"]
        if len(segs)!=len(video_segments):raise ValueError("720p/1080p segment counts differ")
        if any(abs(a["start"]-b["start"])>0.002 or abs(a["duration"]-b["duration"])>0.002 for a,b in zip(video_segments,segs)):
            raise ValueError("Video variant segment timelines do not match")
    audio_track=report["audio"]["track"]
    audio= parse_media(INSPECT/"audio-media.m3u8",audio_track["resolvedUri"])
    if abs(video_ref["media"]["duration"]-audio["duration"])>0.5:
        raise ValueError("Audio/video total duration differs by more than 0.5 seconds")

    # Each target is a plot boundary chosen from the embedded subtitle timeline.
    indices=[0]
    for ch in chapters:
        indices.append(safe_boundary(float(ch["targetEnd"]),video_segments,cues))
    if any(b<=a for a,b in zip(indices,indices[1:])):raise ValueError("Chapter boundaries are not strictly increasing")
    if indices[-1]>=len(video_segments):raise ValueError("Final story boundary exceeds the video")
    out=BASE/"hls";out.mkdir(parents=True,exist_ok=True)
    episode_rows=[];alignment_chapters=[];cut_rows=[];vocab_by_episode={};quiz_by_episode={}
    for i,ch in enumerate(chapters):
        eid=i+1;vf,ve=indices[i],indices[i+1]
        actual_start=video_segments[vf]["start"]
        actual_end=video_segments[ve]["start"]
        if actual_end<=actual_start:raise ValueError(f"Episode {eid} has invalid actual boundaries")
        vtt_cues=[c for c in cues if c["start"]>=actual_start and c["start"]<actual_end]
        if not vtt_cues:raise ValueError(f"Episode {eid} has no subtitle cues")
        # Independently choose audio boundaries; audio/video starts differ by at most 0.5s.
        af=nearest_audio_boundary(actual_start,audio["segments"])
        ae=nearest_audio_boundary(actual_end,audio["segments"])
        if ae<=af:raise ValueError(f"Episode {eid} has invalid audio segment range")
        audio_duration,audio_count=write_media(out/f"{eid:03d}.audio.m3u8",audio,af,ae)
        variant_meta=[]
        for v in video_variants:
            label="720" if v["resolution"]=="1280x720" else "1080"
            duration,count=write_media(out/f"{eid:03d}.video-{label}.m3u8",v["media"],vf,ve)
            if abs(duration-(actual_end-actual_start))>0.01:
                raise ValueError(f"Episode {eid} {label} duration mismatch")
            variant_meta.append(v)
        make_master(out/f"{eid:03d}.m3u8",eid,variant_meta)
        subtitle_url_path=f"/.netlify/functions/movie-study-subtitles?course={plan['seriesId']}&episode={eid}"
        video={
            "source":"hls","hlsUrl":f"data/{plan['seriesId']}/hls/{eid:03d}.m3u8",
            "subtitleUrl":subtitle_url_path,
            "originalHlsUrl":SOURCE,"originalStart":actual_start,"originalEnd":actual_end,
            "duration":round(actual_end-actual_start,6),
            "audioDuration":round(audio_duration,6),
            "audioSegmentCount":audio_count
        }
        episode_rows.append({
            "episodeId":eid,"title":ch["title"],"titleZh":ch["titleZh"],
            "summaryEn":ch["summaryEn"],"summaryZh":ch.get("summaryZh",""),
            "status":"published","sourceType":"hls","video":video,
            "modules":{"watch":True,"read":False,"words":True,"vocabulary":True,"quiz":True}
        })
        alignment_chapters.append({
            "episodeId":eid,"title":ch["title"],"start":actual_start,"end":actual_end,
            "firstSegment":vf,"segmentCount":ve-vf,"audioFirstSegment":af,"audioSegmentCount":ae-af,
            "subtitleCueCount":len(vtt_cues)
        })
        cut_rows.append({
            "episodeId":eid,"targetStart":ch["targetStart"],"targetEnd":ch["targetEnd"],
            "actualStart":actual_start,"actualEnd":actual_end,
            "videoFirstSegment":vf,"videoSegmentCount":ve-vf,
            "audioFirstSegment":af,"audioSegmentCount":ae-af,
            "subtitleCueCount":len(vtt_cues)
        })
        # Validate and store only original, non-quoted example sentences.
        words=[]
        for j,w in enumerate(ch["words"],1):
            evidence_time,evidence_text=first_word_evidence(w["word"],cues,actual_start,actual_end)
            if evidence_time is None:raise ValueError(f"Episode {eid}: vocabulary word absent from its subtitle window: {w['word']}")
            words.append({
                "id":f"{plan['seriesId']}-{eid}-{j}",
                "word":w["word"],"partOfSpeech":w["partOfSpeech"],
                "meaningZh":w["meaningZh"],"definitionEn":w["definitionEn"],
                "example":w["example"],"exampleZh":w["exampleZh"],
                "source":"Matched English subtitle; original example and definition",
                "evidence":{"originalStart":round(evidence_time,3),"localStart":round(evidence_time-actual_start,3)}
            })
        vocab_by_episode[str(eid)]=words
        # Two original plot questions plus three original vocabulary questions.
        questions=[]
        for j,q in enumerate(ch["comprehension"],1):
            opts=q["choices"]
            rotate=(eid+j)%3
            shuffled=opts[rotate:]+opts[:rotate]
            correct=opts[0]
            questions.append({
                "id":f"q{j}","type":"single-choice","category":"comprehension",
                "question":q["question"],
                "options":[{"key":"ABC"[k],"text":v} for k,v in enumerate(shuffled)],
                "answer":"ABC"[shuffled.index(correct)],
                "explanation":q["explanation"],"source":"Original editorial learning question"
            })
        for j,w in enumerate(words[:3],3):
            distractors=[]
            for alt in words[3:]+words[:3]:
                if alt["word"]!=w["word"] and alt["meaningZh"]!=w["meaningZh"] and alt["meaningZh"] not in distractors:
                    distractors.append(alt["meaningZh"])
            if len(distractors)<2:raise ValueError(f"Episode {eid}: insufficient vocabulary distractors")
            opts=[w["meaningZh"],distractors[0],distractors[1]]
            rotate=(eid+j)%3;shuffled=opts[rotate:]+opts[:rotate]
            questions.append({
                "id":f"q{j}","type":"single-choice","category":"vocabulary",
                "question":f'In this episode, what does "{w["word"]}" mean?',
                "options":[{"key":"ABC"[k],"text":v} for k,v in enumerate(shuffled)],
                "answer":"ABC"[shuffled.index(opts[0])],
                "explanation":f'{w["word"]}：{w["meaningZh"]}。{w["definitionEn"]}',
                "source":"Original vocabulary learning question"
            })
        quiz_by_episode[str(eid)]={"episodeId":eid,"title":f'{ch["titleZh"]} · Quiz',"questions":questions}

    # A temporary SRT is created only for the existing catalog test harness; it is not committed.
    srt_lines=[]
    for i,c in enumerate(cues,1):
        srt_lines.extend([str(i),f"{stamp(c['start'],True)} --> {stamp(c['end'],True)}",c["text"],""])
    (INSPECT/"full-film.en.srt").write_text("\n".join(srt_lines),encoding="utf-8")
    series={
        "seriesId":plan["seriesId"],"seriesTitle":"Harry Potter and the Goblet of Fire",
        "seriesTitleZh":"哈利波特与火焰杯 · 剧情分集学习","level":5,"language":"en",
        "status":"completed","totalEpisodes":len(chapters),
        "description":"21 个按原片英文字幕剧情划分的章节，配有英文字幕、Words 和 Quiz。完整电影仍可独立观看。",
        "coverImage":"https://contentful.harrypotter.com/usf1vwtuqyxm/600bJMHJpBT6QdHF29sKvp/243f8920e0e372bbf43fd176b21e057b/hp4-poster.png",
        "movieId":plan["movieId"]
    }
    alignment={
        "seriesId":plan["seriesId"],"movieId":plan["movieId"],"originalHlsUrl":SOURCE,
        "originalDuration":round(video_ref["media"]["duration"],6),
        "storyEnd":alignment_chapters[-1]["end"],"creditsExcludedFromLessons":True,
        "subtitleSource":{"download":subtitle_url,"page":SOURCE,"release":"Embedded HLS English [CC] WebVTT","language":"en","format":"vtt","trackName":"English [CC]"},
        "subtitleSha256":subtitle_hash,"subtitleCueCount":len(cues),
        "offsetSeconds":0,"scale":1,
        "verification":{
            "sourceTrackAligned":True,
            "method":"The English [CC] WebVTT rendition is declared by the same HLS master. Its subtitle playlist duration equals the 1080p video duration; the separate audio duration differs by only 0.124s.",
            "anchors":[],
            "note":"The original subtitle track is retained by URL and sliced per episode at runtime. No external subtitle offset was applied. Browser playback should still be spot-checked before public release."
        },
        "chapters":alignment_chapters
    }
    (BASE/"series.json").write_text(json.dumps(series,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    (BASE/"episodes.json").write_text(json.dumps(episode_rows,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    (BASE/"vocabulary.json").write_text(json.dumps(vocab_by_episode,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    (BASE/"quiz.json").write_text(json.dumps(quiz_by_episode,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    (BASE/"alignment.json").write_text(json.dumps(alignment,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    (BASE/"hls-cuts.json").write_text(json.dumps(cut_rows,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({
        "episodes":len(episode_rows),"vocabulary":sum(map(len,vocab_by_episode.values())),
        "quizQuestions":sum(len(x["questions"]) for x in quiz_by_episode.values()),
        "englishCues":len(cues),"sourceDuration":round(video_ref["media"]["duration"],3),
        "storyEnd":alignment["storyEnd"],"subtitleUrl":subtitle_url,
        "videoVariants":[{"resolution":v["resolution"],"segments":len(v["media"]["segments"])} for v in video_variants],
        "audioSegments":len(audio["segments"])
    },ensure_ascii=False,indent=2))

if __name__=="__main__":main()
