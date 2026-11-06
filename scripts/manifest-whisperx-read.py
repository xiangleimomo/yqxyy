#!/usr/bin/env python3
"""Select batches for audio→WhisperX→XML Text→forced alignment, never using old VTT."""
import argparse
import json
import re
from pathlib import Path
from urllib.parse import urlparse

ROOT=Path(__file__).resolve().parents[1]
HOSTS={"cdn.littlefox.com","cdn.littlefox.co.kr"}
METHOD="whisperx-asr-xml-text-only-forced-alignment"

def source_ok(episode):
    video=episode.get("video") or {}
    for key in ("hlsUrl","hls720Url","backupHlsUrl"):
        raw=video.get(key)
        if not raw:continue
        u=urlparse(raw)
        if u.scheme=="https" and u.hostname in HOSTS and not u.username and not u.password and not u.port:
            return True
    return False

def existing_new_version(directory, eid, episode):
    prefix=directory/"subtitles"/f"{eid:03}"
    timing=prefix.with_suffix(".words.json")
    vtt=prefix.with_suffix(".vtt")
    if not timing.is_file() or not vtt.is_file():return False
    try:
        obj=json.loads(timing.read_text(encoding="utf-8"))
        return obj.get("method")==METHOD and obj.get("sourceContentId")==episode.get("sourceContentId")
    except (ValueError,OSError):return False

def select(limit=10,retry_failed=False,series_only=None):
    if limit<1 or limit>10:raise ValueError("Batch size cannot exceed 10")
    failed=set()
    failure_file=ROOT/"reports/whisperx-read-failures.json"
    if not retry_failed and failure_file.is_file():
        try:
            for item in json.loads(failure_file.read_text()).get("failures",[]):
                reason=str(item.get("reason",""))
                # Old 100%-coverage and unbounded-word rejection rules are retired.
                # Retrying these is safe under the current >=90% speech gate.
                if any(obsolete in reason for obsolete in (
                    "Unaligned official XML Text words remain",
                    "Unbounded missing speech timestamps",
                    "NameError: name 'publishable' is not defined",
                )):
                    continue
                failed.add((item["seriesId"],int(item["episodeId"])))
        except (ValueError,KeyError,TypeError):pass
    eligible=[]
    stats={"seriesScanned":0,"episodesScanned":0,"missingVideo":0,
           "alreadyPublishedNew":0,"failedHeld":0,"missingXmlContentId":0,"eligible":0}
    for directory in sorted((ROOT/"data").iterdir()):
        if series_only and directory.name!=series_only:continue
        episodes_file=directory/"episodes.json"
        if not episodes_file.is_file():continue
        try:
            episodes=json.loads(episodes_file.read_text(encoding="utf-8"))
        except ValueError:
            continue
        stats["seriesScanned"]+=1
        for episode in episodes:
            stats["episodesScanned"]+=1
            try:eid=int(episode["episodeId"])
            except (ValueError,KeyError,TypeError):continue
            if episode.get("status") not in (None,"published"):continue
            if (episode.get("modules") or {}).get("watch") is False:continue
            if not source_ok(episode):
                stats["missingVideo"]+=1
                continue
            source_id=episode.get("sourceContentId")
            if not isinstance(source_id,str) or not re.fullmatch(r"C[0-9]{7}",source_id):
                stats["missingXmlContentId"]+=1
                continue
            if existing_new_version(directory,eid,episode):
                stats["alreadyPublishedNew"]+=1
                continue
            if (directory.name,eid) in failed and not retry_failed:
                stats["failedHeld"]+=1
                continue
            eligible.append({"seriesId":directory.name,"episodeId":eid,"sourceContentId":episode.get("sourceContentId")})
    eligible.sort(key=lambda e:(0 if e["seriesId"]=="journey-to-the-west" else 1,e["seriesId"],e["episodeId"]))
    stats["eligible"]=len(eligible)
    return {"pipeline":"audio-whisperx-xml-text-only-forced-alignment",
            "usesExistingSiteSubtitlesAsInput":False,
            "batchSize":limit,"selected":len(eligible[:limit]),
            "stats":stats,"lessons":eligible[:limit]}

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--limit",type=int,default=10)
    p.add_argument("--output",default="whisperx-batch-targets.json")
    p.add_argument("--retry-failed",action="store_true")
    p.add_argument("--series",default="")
    args=p.parse_args()
    obj=select(args.limit,args.retry_failed,args.series or None)
    dst=Path(args.output)
    dst.parent.mkdir(parents=True,exist_ok=True)
    dst.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({"selected":obj["selected"],**obj["stats"],"output":str(dst)},ensure_ascii=False))
if __name__=="__main__":
    main()
