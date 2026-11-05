#!/usr/bin/env python3
"""Build safe per-word karaoke tracks from independently recognized speech."""
import argparse, hashlib, json, re, unicodedata
from difflib import SequenceMatcher
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

ROOT=Path(__file__).resolve().parent.parent
TIME=re.compile(r"(\d\d):(\d\d):(\d\d)[.,](\d{3})\s*-->\s*(\d\d):(\d\d):(\d\d)[.,](\d{3})")

def norm(word):
    return "".join(c for c in unicodedata.normalize("NFKC",str(word or "")).lower() if c.isalnum())

def path_of(value):
    parsed=urlparse(str(value or ""))
    return parsed.path if parsed.scheme else str(value or "").split("?")[0].lstrip("/")

def fingerprint(path):
    return hashlib.sha256(path.encode()).hexdigest()

def parse_vtt(value):
    cues=[]
    for block in re.split(r"\n\s*\n",value.replace("\r","")):
        lines=block.strip().splitlines()
        index=next((i for i,line in enumerate(lines) if "-->" in line),-1)
        if index<0:continue
        match=TIME.search(lines[index])
        if not match:continue
        nums=[int(x) for x in match.groups()]
        start=((nums[0]*3600+nums[1]*60+nums[2])*1000+nums[3])
        end=((nums[4]*3600+nums[5]*60+nums[6])*1000+nums[7])
        text=" ".join(lines[index+1:]).strip()
        if end>start and text:cues.append(dict(startMs=start,endMs=end,text=text))
    return cues

def allocate(words,start,end):
    if not words:return []
    weights=[max(.75,min(3.3,max(1,len(norm(word)))**.5)) for word in words]
    total=sum(weights);running=0.;result=[]
    for word,weight in zip(words,weights):
        a=round(start+(end-start)*running/total);running+=weight
        b=round(start+(end-start)*running/total)
        result.append(dict(text=word,startMs=a,endMs=max(a+1,b),source="estimated"))
    return result

def evidence_vtt(evidence,evidence_file,sid,eid):
    subtitle_file=evidence.get("subtitleFile")
    if subtitle_file:
        path=(evidence_file.parent/subtitle_file).resolve()
        if evidence_file.parent.resolve() not in path.parents:raise ValueError("Evidence subtitle path escaped its artifact")
    else:path=ROOT/"data"/sid/"subtitles"/f"{eid:03}.vtt"
    if not path.is_file():raise ValueError("Current subtitle VTT is missing")
    text=path.read_text(encoding="utf-8-sig")
    actual=hashlib.sha256(text.encode()).hexdigest()
    if evidence.get("subtitleSha256") and actual!=evidence["subtitleSha256"]:
        raise ValueError("Subtitle changed after speech analysis")
    return parse_vtt(text)

def validate_media(evidence,episode):
    video=episode.get("video") or {}
    candidates={path_of(video.get(key)) for key in
        ("hlsUrl","backupHlsUrl","hls720Url","originalHlsUrl","mp4Url","directUrl") if video.get(key)}
    media_path=evidence.get("mediaPath","")
    if media_path and candidates and media_path not in candidates:
        raise ValueError("Speech evidence belongs to a different video source")
    if evidence.get("mediaFingerprint") and candidates and evidence["mediaFingerprint"] not in {fingerprint(p) for p in candidates}:
        raise ValueError("Video fingerprint changed after speech analysis")
    return media_path or None

def build(cues,evidence,episode):
    source_id=episode.get("sourceContentId")
    if source_id and evidence.get("sourceContentId") and source_id!=evidence["sourceContentId"]:
        raise ValueError("Source content ID mismatch")
    media_path=validate_media(evidence,episode)
    original=evidence.get("cues") or []
    if len(original)!=len(cues) or any(norm(a.get("text"))!=norm(b["text"]) for a,b in zip(original,cues)):
        raise ValueError("Speech evidence is for different subtitle wording")
    token_groups=[re.findall(r"\S+",cue["text"]) for cue in cues]
    all_tokens=[word for group in token_groups for word in group]
    speech=[word for word in evidence.get("words",[]) if norm(word.get("word"))]
    matching=SequenceMatcher(None,[norm(w) for w in all_tokens],[norm(w["word"]) for w in speech],autojunk=False)
    links={}
    for block in matching.get_matching_blocks():
        for i in range(block.size):links[block.a+i]=block.b+i
    if len(links)/max(1,len(all_tokens))<.7:raise ValueError("ASR transcript does not match official subtitles closely enough")
    output=[];cursor=0;matched=0
    for cue,words in zip(cues,token_groups):
        raw=allocate(words,cue["startMs"],cue["endMs"])
        for index,word in enumerate(words):
            found=links.get(cursor+index)
            if found is None:continue
            recognized=speech[found]
            start=round(float(recognized["start"])*1000);end=round(float(recognized["end"])*1000)
            if start<cue["startMs"]-150 or end>cue["endMs"]+150 or end<=start:continue
            if float(recognized.get("probability",1))<.12:continue
            raw[index]=dict(text=word,startMs=max(cue["startMs"],start),endMs=min(cue["endMs"],end),source="speech")
            matched+=1
        anchored=[i for i,item in enumerate(raw) if item["source"]=="speech"]
        for left,right in zip([-1]+anchored,anchored+[len(words)]):
            if right-left<=1:continue
            start=cue["startMs"] if left<0 else raw[left]["endMs"]
            end=cue["endMs"] if right==len(words) else raw[right]["startMs"]
            if end<=start:
                start=cue["startMs"]+(cue["endMs"]-cue["startMs"])*(left+1)//max(1,len(words))
                end=cue["startMs"]+(cue["endMs"]-cue["startMs"])*right//max(1,len(words))
            raw[left+1:right]=allocate(words[left+1:right],start,max(end,start+right-left-1))
        previous=cue["startMs"]
        for item in raw:
            item["startMs"]=max(previous,min(cue["endMs"]-1,item["startMs"]))
            item["endMs"]=max(item["startMs"]+1,min(cue["endMs"],item["endMs"]))
            previous=item["startMs"]
        output.append(dict(words=raw));cursor+=len(words)
    return dict(seriesId=evidence["seriesId"],episodeId=evidence["episodeId"],
        sourceContentId=source_id,mediaPath=media_path,mediaFingerprint=evidence.get("mediaFingerprint"),
        subtitleSha256=evidence.get("subtitleSha256"),method="matched-asr-word-anchors-with-interpolation",
        recognizer=evidence.get("model"),cueCount=len(cues),totalWords=len(all_tokens),
        speechMatchedWords=matched,speechMatchedFraction=round(matched/max(1,len(all_tokens)),4),cues=output)

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--speech-root",required=True)
    parser.add_argument("--apply",action="store_true")
    parser.add_argument("--strict",action="store_true")
    parser.add_argument("--report",default="reports/word-timing-batch-latest.json")
    args=parser.parse_args()
    speech_root=Path(args.speech_root)
    if not speech_root.is_dir():raise SystemExit("Missing speech evidence directory: "+str(speech_root))
    success=[];pending=[];audit_failures=[]
    for filename in sorted(speech_root.rglob("*.json")):
        if filename.name.startswith("failures-"):continue
        try:
            record=json.loads(filename.read_text(encoding="utf-8"))
            if not isinstance(record,dict) or not isinstance(record.get("words"),list):continue
            sid,eid=record.get("seriesId"),int(record.get("episodeId"))
            if not isinstance(sid,str) or not re.fullmatch(r"[a-z0-9-]+",sid) or eid<1:raise ValueError("Invalid lesson identity")
            directory=ROOT/"data"/sid
            episodes=json.loads((directory/"episodes.json").read_text(encoding="utf-8"))
            episode=next(row for row in episodes if int(row["episodeId"])==eid)
            cues=evidence_vtt(record,filename,sid,eid)
            result=build(cues,record,episode)
            output=directory/"subtitles"/f"{eid:03}.words.json"
            if args.apply:
                output.parent.mkdir(parents=True,exist_ok=True)
                output.write_text(json.dumps(result,ensure_ascii=False,separators=(",",":"))+"\n",encoding="utf-8")
            success.append(dict(seriesId=sid,episodeId=eid,words=result["totalWords"],
                speechMatched=result["speechMatchedWords"],fraction=result["speechMatchedFraction"],written=args.apply))
        except Exception as error:
            pending.append(dict(file=filename.name,error=re.sub(r"https?://\S+","[source]",str(error))[:240]))
    for filename in sorted(speech_root.glob("failures-*.json")):
        try:
            rows=json.loads(filename.read_text(encoding="utf-8"))
            audit_failures.extend(dict(seriesId=row["seriesId"],episodeId=int(row["episodeId"]),
                error=re.sub(r"https?://\S+","[source]",str(row.get("error",""))[:240])) for row in rows)
        except Exception:continue
    summary=dict(generatedAt=datetime.now(timezone.utc).isoformat(),processed=len(success),
        generated=sum(1 for row in success if row["written"]),totalWords=sum(row["words"] for row in success),
        speechMatchedWords=sum(row["speechMatched"] for row in success),success=success,
        pending=pending,auditFailures=audit_failures)
    if args.apply:
        report=ROOT/args.report;report.parent.mkdir(parents=True,exist_ok=True)
        report.write_text(json.dumps(summary,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
        ledger=ROOT/"reports/word-timing-failures.json"
        previous={}
        if ledger.exists():
            try:previous={(r["seriesId"],int(r["episodeId"])):r for r in json.loads(ledger.read_text()).get("failures",[])}
            except Exception:previous={}
        for row in success:previous.pop((row["seriesId"],row["episodeId"]),None)
        for row in pending:
            try:
                sid,eid=row["file"].rsplit("-",1);number=int(eid.split(".")[0])
                previous[(sid,number)]=dict(seriesId=sid,episodeId=number,error=row["error"])
            except Exception:pass
        for row in audit_failures:previous[(row["seriesId"],row["episodeId"])]=row
        ledger.parent.mkdir(parents=True,exist_ok=True)
        ledger.write_text(json.dumps({"failures":list(previous.values())},ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({k:v for k,v in summary.items() if k not in ("success","pending","auditFailures")}|{
        "pendingCount":len(pending),"auditFailureCount":len(audit_failures)},ensure_ascii=False))
    if args.strict and (pending or audit_failures):raise SystemExit(1)
if __name__=="__main__":main()
