#!/usr/bin/env python3
"""Run one of five shards in a 50-episode video→WhisperX→XML Text→forced-align batch."""
import argparse
import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace

ROOT=Path(__file__).resolve().parents[1]
SPEC=importlib.util.spec_from_file_location("whisperx_read_engine",ROOT/"scripts/whisperx-read-align.py")
ENGINE=importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ENGINE)

def main():
    p=argparse.ArgumentParser()
    p.add_argument("--manifest",required=True)
    p.add_argument("--shard",type=int,required=True)
    p.add_argument("--shards",type=int,required=True)
    p.add_argument("--model",default="small.en")
    p.add_argument("--output",default="whisperx-batch-results")
    args=p.parse_args()
    if args.shards<1 or args.shard<0 or args.shard>=args.shards:
        raise ValueError("Invalid shard")
    manifest=json.loads(Path(args.manifest).read_text(encoding="utf-8"))
    if manifest.get("pipeline")!="audio-whisperx-xml-text-only-forced-alignment" or manifest.get("usesExistingSiteSubtitlesAsInput") is not False:
        raise ValueError("Refusing non-WhisperX or VTT-dependent batch")
    rows=manifest["lessons"][args.shard::args.shards]
    root=Path(args.output)
    root.mkdir(parents=True,exist_ok=True)
    results=[]
    for item in rows:
        sid=item["seriesId"]
        eid=int(item["episodeId"])
        try:
            options=SimpleNamespace(series=sid,episode=eid,output=str(root),
                model=args.model,model_cache="/tmp/yqxyy-whisperx-model-cache",
                min_text_match=0.82,min_aligned=0.90)
            code=ENGINE.run_one(options)
            results.append(dict(seriesId=sid,episodeId=eid,status="approved" if code==0 else "rejected"))
        except Exception as exc:
            results.append(dict(seriesId=sid,episodeId=eid,status="error",error=type(exc).__name__+":"+str(exc)[:180]))
        print(json.dumps(results[-1],ensure_ascii=False),flush=True)
    (root/f"shard-{args.shard:02}.json").write_text(
        json.dumps(dict(shard=args.shard,count=len(rows),results=results),ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(dict(shard=args.shard,attempted=len(rows),accepted=sum(x["status"]=="approved" for x in results)),ensure_ascii=False))
if __name__=="__main__":main()
