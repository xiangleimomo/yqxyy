"""Review/apply scoped timestamp repairs from immutable speech evidence.
English comes from XET timed captions or verified public Read, never ASR wording.
"""
import argparse,hashlib,json,re,subprocess,sys,os,time
from pathlib import Path
from urllib.parse import urlparse
sys.path.insert(0,str(Path(__file__).resolve().parent/'lib'))
from subtitle_alignment import parse_vtt,to_vtt,align_cues,align_read,match_cues,tokens
ROOT=Path(__file__).resolve().parent.parent

def clean(text):return re.sub(r'\[(?:i|b|u|g)@|@(?:i|b|u|g)\]','',text).strip()
def digest(text):return hashlib.sha256(text.encode('utf-8')).hexdigest()
def main():
 p=argparse.ArgumentParser();p.add_argument('--speech-root',action='append',required=True);p.add_argument('--xet-root',action='append',default=[]);p.add_argument('--apply',action='store_true');p.add_argument('--allow-pending',action='store_true');p.add_argument('--adopt-verified-media',action='store_true');p.add_argument('--baseline',default='174cb935bdc19cd75643c526e9c27c5828598e4e');p.add_argument('--manifest');p.add_argument('--report',default='docs/speech-timing-repairs-2026-10-28.json');args=p.parse_args()
 evidence={};source={};baseline={};plans=[];pending=[];media_plans={}
 previous=json.loads(Path(args.report).read_text(encoding='utf-8')) if Path(args.report).exists() else {}
 previous_by_id={(r['seriesId'],r['episodeId']):r for r in previous.get('lessons',[])}
 for folder in args.speech_root:
  for f in sorted(Path(folder).rglob('*.json')):
   r=json.loads(f.read_text(encoding='utf-8'))
   if isinstance(r,dict) and 'words' in r:evidence[(r['seriesId'],r['episodeId'])]=r
 for folder in args.xet_root:
  for f in Path(folder).rglob('review.json'):
   doc=json.loads(f.read_text(encoding='utf-8'))
   for r in doc['lessons']:source[(r['seriesId'],r['episodeId'])]=(r,f.parent)
 targets=json.loads(Path(args.manifest).read_text(encoding='utf-8'))['lessons'] if args.manifest else [dict(seriesId=s,episodeId=e) for s,e in evidence]
 for target in targets:
  sid,eid=target['seriesId'],target['episodeId'];key=(sid,eid)
  if not re.fullmatch(r'[a-z0-9-]+',sid) or not isinstance(eid,int) or eid<1:raise ValueError('Invalid lesson selector')
  try:
   r=evidence.get(key)
   if not r:raise ValueError('Speech evidence not yet available')
   directory=ROOT/'data'/sid;eps=json.loads((directory/'episodes.json').read_text(encoding='utf-8'));ep=next(e for e in eps if e['episodeId']==eid)
   current_path=urlparse(ep['video']['hlsUrl']).path
   previous_media=None;candidate_url=None
   if r.get('mediaFingerprint'):
    if digest(current_path)!=r['mediaFingerprint']:
     if not args.adopt_verified_media or key not in source:raise ValueError('Speech evidence belongs to a different media version')
     row,_=source[key];candidate_url=row.get('reviewVideoCandidate','');candidate=urlparse(candidate_url)
     if candidate.scheme!='https' or candidate.hostname!='cdn.littlefox.co.kr' or candidate.query or digest(candidate.path)!=r['mediaFingerprint'] or row['sourceContentId']!=ep.get('sourceContentId') or row['title']!=ep['title']:raise ValueError('Unverified replacement media identity')
     read=json.loads((directory/'reading-lessons.json').read_text(encoding='utf-8'))[str(eid)]
     agreement,anchors=match_cues([dict(startMs=0,endMs=1,text=p['text']) for p in read['paragraphs'] if p.get('text')],r['words'])
     if agreement<.9 or sum(a.get('confidence',0)>=.8 for a in anchors)<len(anchors)*.8:raise ValueError('Replacement media does not independently match the complete Read')
     previous_media=digest(current_path);current_path=candidate.path
   else:
    if sid not in baseline:baseline[sid]=json.loads(subprocess.check_output(['git','show',f'{args.baseline}:data/{sid}/episodes.json'],cwd=ROOT,text=True,encoding='utf-8'))
    before=next(e for e in baseline[sid] if e['episodeId']==eid)
    if urlparse(before['video']['hlsUrl']).path!=current_path:raise ValueError('Original speech evidence is stale after video correction')
   path=directory/'subtitles'/f'{eid:03}.vtt';before=parse_vtt(path.read_text(encoding='utf-8'));canonical=before;mode='existing-verified-text';duration=r['durationMs']
   if key in source:
    row,folder=source[key]
    if row['sourceContentId']!=ep['sourceContentId']:raise ValueError('XET content ID mismatch')
    fresh=folder/'data'/sid/'subtitles'/f'{eid:03}.vtt'
    if fresh.exists():
     canonical=parse_vtt(fresh.read_text(encoding='utf-8'))
     for c in canonical:c['text']=clean(c['text'])
     canonical=[c for c in canonical if c['text']];mode='xet-original-text'
    candidate=row.get('reviewVideoCandidate','')
    measured=row['remoteVideoDurationMs'] if candidate and urlparse(candidate).path==current_path else row['videoDurationMs']
    duration=min(duration,measured)
   reads=json.loads((directory/'reading-lessons.json').read_text(encoding='utf-8'));read=reads[str(eid)]
   if read.get('sourceId') and read['sourceId']!=ep.get('sourceContentId'):raise ValueError('Read/source ID still mismatched')
   coverage,_=match_cues(canonical,r['words'])
   if coverage<.8:
    corrected,review=align_read(read['paragraphs'],r['words'],duration);mode='public-Read-restored-from-placeholders'
   else:
    try:corrected,review=align_cues(canonical,r['words'],duration)
    except ValueError as error:
     # An existing SRT timebase can be retained only when independent speech
     # anchors verify it; this never introduces a weakly supported new shift.
     if 'independent speech boundaries' not in str(error):raise
     corrected,review=align_cues(before,r['words'],duration);mode='existing-verified-timebase'
   if not corrected or any(c['startMs']<0 or c['endMs']>duration or c['endMs']<=c['startMs'] for c in corrected):raise ValueError('Corrected cues exceed media bounds')
   info=dict(seriesId=sid,episodeId=eid,sourceContentId=ep.get('sourceContentId'),title=ep['title'],mediaFingerprint=digest(current_path),wordingHash=digest(' '.join(c['text'] for c in corrected)),sourceMode=mode,beforeCueCount=len(before),afterCueCount=len(corrected),beforeFirstMs=before[0]['startMs'],afterFirstMs=corrected[0]['startMs'],afterLastMs=corrected[-1]['endMs'],durationMs=duration,**review)
   old=previous_by_id.get(key)
   if old and old.get('afterFirstMs')==before[0]['startMs'] and old.get('wordingHash')==info['wordingHash']:
    info['beforeFirstMs']=old['beforeFirstMs'];info['beforeCueCount']=old['beforeCueCount']
   plans.append((path,corrected,info))
   if candidate_url:
    info['previousMediaFingerprint']=previous_media
    media_plans.setdefault(sid,{})[eid]=candidate_url
   print(json.dumps({k:info[k] for k in ['seriesId','episodeId','coverage','offsetMs','afterCueCount','sourceMode']},ensure_ascii=False),flush=True)
  except Exception as error:pending.append(dict(seriesId=sid,episodeId=eid,error=str(error)))
 report=dict(method='Independent ASR word anchors, exact canonical XET/public-Read wording, per-media timebase checks. Automatic recognition is approximate, not a human listening certificate.',lessons=[info for _,_,info in plans],pending=pending)
 Path(args.report).parent.mkdir(parents=True,exist_ok=True);Path(args.report).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 if pending and not args.allow_pending:raise SystemExit('Pending reviews; no VTT files written: '+json.dumps(pending,ensure_ascii=False))
 if args.apply:
  for path,cues,info in plans:
   path.parent.mkdir(parents=True,exist_ok=True)
   temporary=path.with_name(path.name+'.tmp')
   for attempt in range(3):
    try:
     temporary.write_text(to_vtt(cues),encoding='utf-8');os.replace(temporary,path)
     sidecar={k:v for k,v in info.items() if k!='cueChecks'};sidecar['method']='canonical-text+independent-speech-word-anchors';sidecar['vttSha256']=digest(to_vtt(cues))
     path.with_suffix('.timing.json').write_text(json.dumps(sidecar,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
     path.with_suffix('.source-repair.json').unlink(missing_ok=True)
     break
    except OSError:
     if attempt==2:raise
     time.sleep(.2*(attempt+1))
  for sid,replacements in media_plans.items():
   target=ROOT/'data'/sid/'episodes.json';episodes=json.loads(target.read_text(encoding='utf-8'))
   for ep in episodes:
    if ep['episodeId'] in replacements:ep['video']['hlsUrl']=replacements[ep['episodeId']]
   target.write_text(json.dumps(episodes,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
 print(json.dumps(dict(apply=args.apply,validated=len(plans),pending=pending),ensure_ascii=False),flush=True)
if __name__=='__main__':main()
