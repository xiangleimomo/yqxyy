#!/usr/bin/env python3
"""Reuse archived WhisperX alignment, publish >=90% timed official words; no ASR rerun."""
import json,re,hashlib,unicodedata,zipfile,xml.etree.ElementTree as ET
from pathlib import Path
from difflib import SequenceMatcher
from collections import Counter
ROOT=Path(__file__).resolve().parents[1]
def norm(s):return ''.join(c for c in unicodedata.normalize('NFKC',s.lower()) if c.isalnum())
def clean(s):
 s=re.sub(r'\[(?:g|i|n)@|@(?:g|i|n)\]|\[(?:g|i|n)@[^\]]*\]',' ',s,flags=re.I)
 return re.sub(r'\s+',' ',s).strip()
def stamp(ms):
 h,r=divmod(ms,3600000);m,r=divmod(r,60000);sec,ms=divmod(r,1000)
 return f'{h:02}:{m:02}:{sec:02}.{ms:03}'
def one(folder):
 eid=int(folder.name.rsplit('-',1)[-1]);rp=folder/'alignment-report.json'
 if not rp.exists():return {'episode':eid,'status':'no_report'}
 report=json.loads(rp.read_text())
 raw=folder/'forced-alignment-raw.json';xml=folder/'official-caption.xml'
 if not raw.exists() or not xml.exists():return {'episode':eid,'status':'not_collected'}
 paras=[]
 for p in ET.parse(xml).iter():
  if p.tag.rsplit('}',1)[-1].lower()=='paragraph':
   for c in p:
    if c.tag.rsplit('}',1)[-1].lower()=='text':
     paras.append(clean(' '.join(c.itertext())));break
 canonical=[w for w in ' '.join(paras).split() if norm(w)]
 found=[w for seg in json.loads(raw.read_text()) for w in seg.get('words',[])
        if norm(w.get('word','')) and w.get('start') is not None and w.get('end') is not None]
 a=[norm(w['word']) for w in found];b=[norm(w) for w in canonical]
 mapped=[None]*len(canonical)
 for block in SequenceMatcher(a=a,b=b,autojunk=False).get_matching_blocks():
  for j in range(block.size):
   idx=block.b+j;w=found[block.a+j];start=round(w['start']*1000);end=round(w['end']*1000)
   if 0<=start<end<=report['durationMs']+200 and end-start<=3500:
    mapped[idx]={'text':canonical[idx],'startMs':start,'endMs':end,'source':'speech'}
 speech=sum(w is not None for w in mapped)
 coverage=speech/max(1,len(canonical))
 if coverage<.90:return {'episode':eid,'status':'below_threshold','coverage':round(coverage,4)}
 words=[w for w in mapped if w]
 if any(words[i]['startMs']<words[i-1]['startMs'] for i in range(1,len(words))):
  return {'episode':eid,'status':'nonmonotonic'}
 cues=[];start=0
 for i,w in enumerate(words):
  if (w['text'].rstrip('”’\"\'').endswith(('.', '!', '?')) and i-start>=1) or i-start>=17 or i==len(words)-1:
   cues.append(words[start:i+1]);start=i+1
 vtt='WEBVTT\n\n'+'\n\n'.join(
  f'{j}\n{stamp(g[0]["startMs"])} --> {stamp(g[-1]["endMs"])}\n'+' '.join(w['text'] for w in g)
  for j,g in enumerate(cues,1))+'\n'
 path=report['mediaPath'];source=report['xmlContentId']
 track={'seriesId':'journey-to-the-west','episodeId':eid,'sourceContentId':source,
  'mediaPath':path,'mediaFingerprint':hashlib.sha256(path.encode()).hexdigest(),
  'subtitleSha256':hashlib.sha256(vtt.encode()).hexdigest(),
  'method':'whisperx-asr-xml-text-only-forced-alignment',
  'textAuthority':'littlefox-xml-paragraph-text','recognizer':'small.en',
  'cueCount':len(cues),'totalWords':len(canonical),'captionedWords':len(words),
  'omittedUnalignedWords':len(canonical)-len(words),'speechMatchedWords':speech,
  'speechMatchedFraction':round(coverage,4),'cues':[{'words':g} for g in cues]}
 dest=ROOT/'data/journey-to-the-west/subtitles';dest.mkdir(parents=True,exist_ok=True)
 (dest/f'{eid:03}.vtt').write_text(vtt)
 (dest/f'{eid:03}.words.json').write_text(json.dumps(track,ensure_ascii=False,indent=2)+'\n')
 return {'episode':eid,'status':'published_candidate','coverage':round(coverage,4),
         'omittedWords':len(canonical)-len(words)}
def main():
 root=ROOT/'whisperx-archive';root.mkdir(exist_ok=True)
 for z in sorted((ROOT/'whisperx-archive-zips').glob('*.zip')):
  with zipfile.ZipFile(z) as arc:
   for info in arc.infolist():
    if '..' in Path(info.filename).parts or info.filename.startswith('/'):raise ValueError('Unsafe archive')
   arc.extractall(root)
 rows=[one(p) for p in sorted(root.glob('journey-to-the-west-*')) if p.is_dir()]
 if len(rows)!=100:raise ValueError(f'Expected 100 archive episodes, got {len(rows)}')
 (ROOT/'reports/whisperx-archive-threshold-release.json').write_text(json.dumps({
  'sourceRunId':42072397000,'threshold':0.90,'results':rows,
  'counts':dict(Counter(r['status'] for r in rows))},ensure_ascii=False,indent=2)+'\n')
 print(Counter(r['status'] for r in rows))
if __name__=='__main__':main()
