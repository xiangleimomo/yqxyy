#!/usr/bin/env python3
"""Inventory the whole course catalogue and select the next word-timing batch."""
import argparse, json, re
from pathlib import Path
from urllib.parse import urlparse

ROOT=Path(__file__).resolve().parent.parent
LF_HOSTS={"cdn.littlefox.com","cdn.littlefox.co.kr"}
MOVIES={"movie-harry-potter-1","movie-harry-potter-2","movie-harry-potter-3"}
MOVIE_SUBTITLE_PATH="/.netlify/functions/movie-study-subtitles"

def approved_remote(value):
    try:
        u=urlparse(value)
        return u.scheme=="https" and u.hostname in LF_HOSTS and not u.username and not u.password and not u.port
    except Exception:
        return False

def choose_media(series,episode):
    video=episode.get("video") or {}
    local=video.get("hlsUrl","")
    if series in MOVIES and re.fullmatch(r"data/"+re.escape(series)+r"/hls/\d{3}\.m3u8",local):
        if (ROOT/local).is_file():
            return local, [], "local-movie-hls"
    candidates=[]
    for key in ("backupHlsUrl","hls720Url","hlsUrl","originalHlsUrl","mp4Url","directUrl"):
        value=video.get(key)
        if value and approved_remote(value) and value not in candidates:
            candidates.append(value)
    if not candidates:return None, [], None
    return candidates[0], candidates[1:], "remote-littlefox"

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--limit",type=int,default=100)
    p.add_argument("--output",default="word-timing-targets.json")
    p.add_argument("--retry-failed",action="store_true")
    args=p.parse_args()
    if args.limit<1 or args.limit>500:raise SystemExit("--limit must be between 1 and 500")
    ledger=ROOT/"reports/word-timing-failures.json"
    failed=set()
    if ledger.exists() and not args.retry_failed:
        try:failed={(r["seriesId"],int(r["episodeId"])) for r in json.loads(ledger.read_text()).get("failures",[])}
        except Exception:failed=set()
    stats={"series":0,"episodes":0,"staticSubtitles":0,"dynamicSubtitles":0,"existingWordFiles":0,
           "failedSkipped":0,"unsupportedMedia":0,"eligible":0}
    candidates=[]
    for directory in sorted((ROOT/"data").iterdir()):
        manifest=directory/"episodes.json"
        if not directory.is_dir() or not manifest.is_file():continue
        try:episodes=json.loads(manifest.read_text(encoding="utf-8"))
        except Exception:continue
        stats["series"]+=1
        series=directory.name
        for episode in episodes:
            stats["episodes"]+=1
            try:eid=int(episode["episodeId"])
            except Exception:continue
            if episode.get("status") not in (None,"published"):continue
            if (episode.get("modules") or {}).get("watch") is False:continue
            number=f"{eid:03d}"
            subtitle=directory/"subtitles"/(number+".vtt")
            subtitle_url=str((episode.get("video") or {}).get("subtitleUrl") or "")
            if subtitle.is_file():
                stats["staticSubtitles"]+=1
                subtitle_mode="static"
            elif series in MOVIES and urlparse(subtitle_url).path==MOVIE_SUBTITLE_PATH:
                stats["dynamicSubtitles"]+=1
                subtitle_mode="dynamic"
            else:continue
            if (directory/"subtitles"/(number+".words.json")).is_file():
                stats["existingWordFiles"]+=1
                continue
            if (series,eid) in failed:
                stats["failedSkipped"]+=1
                continue
            media,fallbacks,kind=choose_media(series,episode)
            if not media:
                stats["unsupportedMedia"]+=1
                continue
            row={"seriesId":series,"episodeId":eid,"hlsUrl":media,"hlsFallbacks":fallbacks,
                 "mediaKind":kind,"subtitleMode":subtitle_mode,"reason":"whole-site word-karaoke batch"}
            if subtitle_mode=="dynamic":row["subtitleUrl"]=subtitle_url
            if episode.get("sourceContentId"):row["sourceContentId"]=episode["sourceContentId"]
            candidates.append(row)
    candidates.sort(key=lambda x:(x["seriesId"],x["episodeId"]))
    stats["eligible"]=len(candidates)
    selected=candidates[:args.limit]
    result={"inventory":stats,"batch":{"limit":args.limit,"selected":len(selected),
             "retryFailed":args.retry_failed},"lessons":selected}
    output=Path(args.output);output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(result["inventory"]|{"selected":len(selected),"output":str(output)},ensure_ascii=False))
if __name__=="__main__":main()
