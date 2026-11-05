#!/usr/bin/env python3
"""Generate optional per-word karaoke tracks from independent speech evidence.

Official VTT remains the only source for sentence wording and cue boundaries.
ASR supplies timestamps for matched words; gaps are interpolated.
Usage:
 python3 scripts/build-word-timing.py --speech-root speech-review-new --apply
"""
import argparse
from difflib import SequenceMatcher
import hashlib
import json
from pathlib import Path
import re
import unicodedata
from urllib.parse import urlparse

ROOT=Path(__file__).resolve().parent.parent
TIME=re.compile(r'(\d\d):(\d\d):(\d\d)\.(\d{3})\s*-->\s*(\d\d):(\d\d):(\d\d)\.(\d{3})')

def norm(word):
    return ''.join(c for c in unicodedata.normalize('NFKC',str(word or '')).lower() if c.isalnum())

def parse_vtt(value):
    result=[]
    for block in re.split(r'\n\s*\n',value.replace('\r','')):
        lines=block.strip().splitlines()
        index=next((i for i,s in enumerate(lines) if ' --> ' in s),-1)
        if index<0:continue
        match=TIME.search(lines[index])
        if not match:continue
        def instant(begin):
            h,m,s,ms=(int(v) for v in match.groups()[begin:begin+4])
            return h*3600000+m*60000+s*1000+ms
        result.append(dict(startMs=instant(0),endMs=instant(4),text=' '.join(lines[index+1:]).strip()))
    return result

def allocate(words,start,end):
    if not words:return []
    weights=[max(.75,min(3.3,max(1,len(norm(word)))**.5)) for word in words]
    total=sum(weights)
    running=0.
    result=[]
    for word,weight in zip(words,weights):
        a=round(start+(end-start)*running/total)
        running+=weight
        b=round(start+(end-start)*running/total)
        result.append(dict(text=word,startMs=a,endMs=max(a+1,b),source='estimated'))
    return result

def build(cues,evidence,ep):
    source_id=ep.get('sourceContentId')
    video=ep.get('video',{}).get('hlsUrl','')
    media_hash=hashlib.sha256(urlparse(video).path.encode()).hexdigest()
    if not source_id or source_id!=evidence.get('sourceContentId') or media_hash!=evidence.get('mediaFingerprint'):
        raise ValueError('Source ID or media fingerprint differs from speech evidence')
    original=evidence.get('cues') or []
    if len(original)!=len(cues) or any(norm(a.get('text'))!=norm(b['text']) for a,b in zip(original,cues)):
        raise ValueError('Speech evidence is for different subtitle wording')
    token_groups=[re.findall(r'\S+',cue['text']) for cue in cues]
    all_tokens=[word for words in token_groups for word in words]
    speech=[w for w in evidence.get('words',[]) if norm(w.get('word'))]
    matching=SequenceMatcher(None,[norm(w) for w in all_tokens],[norm(w['word']) for w in speech],autojunk=False)
    links={}
    for block in matching.get_matching_blocks():
        for i in range(block.size):links[block.a+i]=block.b+i
    if len(links)/max(1,len(all_tokens))<.7:
        raise ValueError('ASR text does not match official subtitles closely enough')
    output=[]
    cursor=0
    matched=0
    for cue,words in zip(cues,token_groups):
        raw=allocate(words,cue['startMs'],cue['endMs'])
        for index,word in enumerate(words):
            found=links.get(cursor+index)
            if found is None:continue
            recognized=speech[found]
            a=round(float(recognized['start'])*1000)
            b=round(float(recognized['end'])*1000)
            if a<cue['startMs']-150 or b>cue['endMs']+150 or b<=a:continue
            raw[index]=dict(text=word,startMs=max(cue['startMs'],a),endMs=min(cue['endMs'],b),source='speech')
            matched+=1
        anchored=[i for i,item in enumerate(raw) if item['source']=='speech']
        for left,right in zip([-1]+anchored,anchored+[len(words)]):
            if right-left<=1:continue
            a=cue['startMs'] if left<0 else raw[left]['endMs']
            b=cue['endMs'] if right==len(words) else raw[right]['startMs']
            if b<=a:
                a=cue['startMs']+(cue['endMs']-cue['startMs'])*(left+1)//max(1,len(words))
                b=cue['startMs']+(cue['endMs']-cue['startMs'])*right//max(1,len(words))
            raw[left+1:right]=allocate(words[left+1:right],a,max(b,a+right-left-1))
        previous=cue['startMs']
        for item in raw:
            item['startMs']=max(previous,min(cue['endMs']-1,item['startMs']))
            item['endMs']=max(item['startMs']+1,min(cue['endMs'],item['endMs']))
            previous=item['startMs']
        output.append(dict(words=raw))
        cursor+=len(words)
    return dict(seriesId=evidence['seriesId'],episodeId=evidence['episodeId'],sourceContentId=source_id,
        mediaFingerprint=media_hash,method='matched-asr-word-anchors-with-interpolation',
        recognizer=evidence.get('model'),cueCount=len(cues),totalWords=len(all_tokens),
        speechMatchedWords=matched,speechMatchedFraction=round(matched/max(1,len(all_tokens)),4),
        cues=output)

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--speech-root',required=True)
    parser.add_argument('--apply',action='store_true')
    parser.add_argument('--strict',action='store_true')
    args=parser.parse_args()
    speech_root=Path(args.speech_root)
    if not speech_root.is_dir():
        raise SystemExit('Missing speech evidence directory: '+str(speech_root))
    success=[];pending=[]
    for filename in sorted(speech_root.rglob('*.json')):
        try:
            record=json.loads(filename.read_text(encoding='utf-8'))
            if not isinstance(record,dict) or not isinstance(record.get('words'),list):
                continue
            sid,eid=record.get('seriesId'),record.get('episodeId')
            if not isinstance(sid,str) or not re.fullmatch(r'[a-z0-9-]+',sid) or not isinstance(eid,int) or eid<1:
                raise ValueError('Invalid lesson identity')
            directory=ROOT/'data'/sid
            episodes=json.loads((directory/'episodes.json').read_text(encoding='utf-8'))
            ep=next(row for row in episodes if row['episodeId']==eid)
            vtt=(directory/'subtitles'/f'{eid:03}.vtt').read_text(encoding='utf-8')
            result=build(parse_vtt(vtt),record,ep)
            output=directory/'subtitles'/f'{eid:03}.words.json'
            if args.apply:
                output.write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
            success.append(dict(seriesId=sid,episodeId=eid,wordCount=result['totalWords'],
                                speechMatched=result['speechMatchedWords'],written=args.apply))
        except Exception as error:
            pending.append(dict(file=filename.name,error=str(error)))
    print(json.dumps(dict(success=success,pending=pending),ensure_ascii=False))
    if pending and args.strict:raise SystemExit(1)

if __name__=='__main__':
    main()
