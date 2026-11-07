#!/usr/bin/env python3
import html,json,pathlib,re
SRC=pathlib.Path("hp4-source-inspection/subtitle-track-01/0001.vtt")
PLAN=pathlib.Path("data/movie-harry-potter-4/editorial.json")
def seconds(s):
    a=s.replace(",",".").split(":")
    if len(a)==2:return int(a[0])*60+float(a[1])
    if len(a)==3:return int(a[0])*3600+int(a[1])*60+float(a[2])
    raise ValueError(s)
raw=SRC.read_text(encoding="utf-8-sig").replace("\r\n","\n")
cues=[]
for block in re.split(r"\n\s*\n",raw.strip()):
    lines=block.splitlines()
    ti=next((i for i,x in enumerate(lines) if "-->" in x),None)
    if ti is None:continue
    m=re.match(r"\s*([\d:. ,]+)\s*-->\s*([\d:. ,]+)",lines[ti])
    if not m:continue
    start,end=map(seconds,m.groups())
    text=" ".join(html.unescape(re.sub(r"<[^>]*>","",x)).strip() for x in lines[ti+1:] if x.strip())
    if text:cues.append({"start":start,"end":end,"text":text})
plan=json.loads(PLAN.read_text(encoding="utf-8"))
chapters=plan["chapters"]
assert len(chapters)==20
report=[]
for i,ch in enumerate(chapters):
    subset=[c for c in cues if c["start"]>=ch["targetStart"] and c["start"]<ch["targetEnd"]]
    text=" ".join(c["text"] for c in subset)
    missing=[]
    for w in ch["words"]:
        if not re.search(r"\b"+re.escape(w["word"])+r"\b",text,re.I):
            missing.append(w["word"])
    report.append({"episode":i+1,"title":ch["title"],"start":ch["targetStart"],"end":ch["targetEnd"],
                   "duration":round(ch["targetEnd"]-ch["targetStart"],3),"cueCount":len(subset),
                   "missingWords":missing,"firstCue":subset[0]["text"][:100] if subset else None,
                   "lastCue":subset[-1]["text"][:100] if subset else None})
print(json.dumps({"totalCues":len(cues),"episodes":report},ensure_ascii=False,indent=2))
pathlib.Path("hp4-editorial-validation.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n")
if any(x["missingWords"] or x["cueCount"]==0 for x in report):
    raise SystemExit("Editorial validation failed: at least one vocabulary item is absent from its chapter")
