#!/usr/bin/env python3
"""Recover first-batch artifacts without running ASR or downloading media."""
import hashlib, json, re, sys, zipfile, importlib.util
from pathlib import Path
from difflib import SequenceMatcher
ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location("engine",ROOT/"scripts/whisperx-read-align.py")
engine=importlib.util.module_from_spec(spec);spec.loader.exec_module(engine)
def recover(z,folder,files):
    report=json.loads(z.read(files["alignment-report.json"]))
    eid=int(report["episodeId"]);sid=report["seriesId"]
    if report.get("failure","").startswith("HTTPError"):return {"episodeId":eid,"status":"missing-source"}
    required=("official-caption.xml","forced-alignment-raw.json")
    if not all(k in files for k in required):return {"episodeId":eid,"status":"missing-source"}
    parsed=engine.parse_text_only(z.read(files["official-caption.xml"]))
    canonical=parsed["words"]
    if parsed["sha256"]!=report.get("xmlTextSha256"):raise ValueError("XML hash mismatch")
    raw=json.loads(z.read(files["forced-alignment-raw.json"]))
    duration=report["durationMs"]
    # Preserve all original WhisperX word windows, including recognized substitutions.
    found=[w for seg in raw for w in seg.get("words",[]) if engine.normalize(w.get("word","")) and w.get("start") is not None and w.get("end") is not None]
    a=[engine.normalize(w["word"]) for w in found];b=[engine.normalize(w) for w in canonical]
    sm=SequenceMatcher(None,a,b,autojunk=False)
    pairs={}
    for tag,i,j,k,l in sm.get_opcodes():
        if tag=="equal":
            pairs.update((k+t,i+t) for t in range(j-i))
        elif tag=="replace" and j-i==l-k and j-i<=3:
            # Reuse recognized word's actual timestamp when surrounding anchors confirm order.
            before=(i==0 or (i-1>=0 and k-1>=0 and a[i-1]==b[k-1]))
            after=(j==len(a) or (j<len(a) and l<len(b) and a[j]==b[l]))
            if before and after:
                pairs.update((k+t,i+t) for t in range(j-i))
    mapped=[None]*len(canonical)
    prev=-1
    for idx in sorted(pairs):
        w=found[pairs[idx]]
        start=round(w["start"]*1000);end=round(w["end"]*1000)
        if start<prev or start<0 or end<=start or end>duration+150 or end-start>3500:continue
        mapped[idx]={"text":canonical[idx],"startMs":start,"endMs":end,"source":"speech"}
        prev=start
    speech=sum(x is not None for x in mapped)
    if speech/max(1,len(mapped))<.90:return {"episodeId":eid,"status":"below-90","coverage":round(speech/len(mapped),4)}
    # Genuine missing ASR words have no original timestamp; only interpolate short,
    # tightly bounded local gaps, and mark them as estimates, never as speech.
    i=0
    while i<len(mapped):
        if mapped[i] is not None:i+=1;continue
        j=i
        while j<len(mapped) and mapped[j] is None:j+=1
        if i>0 and j<len(mapped) and j-i<=3:
            left,right=mapped[i-1],mapped[j]
            gap=right["startMs"]-left["endMs"]
            if 0<gap<=1800:
                for n in range(j-i):
                    s=left["endMs"]+round(gap*n/(j-i));e=left["endMs"]+round(gap*(n+1)/(j-i))
                    if e>s:mapped[i+n]={"text":canonical[i+n],"startMs":s,"endMs":e,"source":"estimated"}
        i=j
    # Do not fabricate word timestamps where no audio anchor exists.
    if any(w is None for w in mapped):
        return {"episodeId":eid,"status":"needs-review","coverage":round(speech/len(mapped),4),"missing":sum(w is None for w in mapped)}
    if engine.suspicious_word_spans(mapped):return {"episodeId":eid,"status":"abnormal-spans"}
    if mapped[-1]["endMs"]<duration*.75:return {"episodeId":eid,"status":"truncated"}
    info={"forcedAlignedWords":speech,"forcedAlignedFraction":round(speech/len(mapped),4)}
    out=ROOT/"data"/sid/"subtitles";out.mkdir(parents=True,exist_ok=True)
    engine.write_candidate(out,sid,eid,canonical,mapped,info,report["mediaPath"],report["model"],report["xmlContentId"],parsed)
    return {"episodeId":eid,"status":"published","coverage":info["forcedAlignedFraction"],"estimated":sum(w["source"]=="estimated" for w in mapped)}
def main():
    base=Path(sys.argv[1]);results=[];seen=set()
    for archive in sorted(base.rglob("*.zip")):
        with zipfile.ZipFile(archive) as z:
            groups={}
            for name in z.namelist():
                parts=name.split("/")
                if len(parts)>=2 and parts[-1] in ("alignment-report.json","official-caption.xml","forced-alignment-raw.json"):
                    groups.setdefault("/".join(parts[:-1]),{})[parts[-1]]=name
            for folder,files in groups.items():
                if "alignment-report.json" not in files:continue
                report=json.loads(z.read(files["alignment-report.json"]))
                eid=int(report["episodeId"])
                if eid in seen:continue
                seen.add(eid)
                try:results.append(recover(z,folder,files))
                except Exception as exc:results.append({"episodeId":eid,"status":"error","reason":str(exc)[:160]})
    results.sort(key=lambda x:x["episodeId"])
    path=ROOT/"reports"/"whisperx-first-batch-recovery.json";path.parent.mkdir(exist_ok=True)
    path.write_text(json.dumps({"runId":"42072397000","checked":len(results),"published":sum(r["status"]=="published" for r in results),"episodes":results},indent=2)+"\n")
    print(path.read_text())
    if len(results)!=100:raise RuntimeError(f"Expected 100 episodes; got {len(results)}")
if __name__=="__main__":main()
