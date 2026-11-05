#!/usr/bin/env python3
"""Collect Little Fox official caption XML by verified content ID and build VTT.

Only apply when XML content and timing match the existing canonical lesson.
Existing manually/speech-calibrated timing sidecars are never overwritten.
Usage:
 python3 scripts/import-official-captions.py --lesson three-kingdoms:13 --apply
 python3 scripts/import-official-captions.py --manifest subtitle-review/new-lessons.json --apply
"""
import argparse
from difflib import SequenceMatcher
import hashlib
import json
from pathlib import Path
import re
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.parse import urlparse
import xml.etree.ElementTree as ET

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/'data'
HOST='cdn.littlefox.com'
ID=re.compile(r'C\d{7}\Z')
SERIES=re.compile(r'[a-z0-9-]+\Z')
CUE_TAGS={'p','cue','item','entry','line','text','caption','subtitle','sentence'}
START=('begin','start','starttime','start_time','startms','start_ms','from','stime','time')
END=('end','stop','endtime','end_time','endms','end_ms','to','etime')
DURATION=('duration','dur')
WORDS=('text','sentence','script','content','caption','subtitle','value','words')

def local(tag):
    return tag.rsplit('}',1)[-1].split(':')[-1].lower().replace('-','_')

def clean(value):
    return re.sub(r'\s+',' ',re.sub(r'\[n@',' ',value or '')).strip()

def norm(value):
    return ''.join(ch for ch in clean(value).lower() if ch.isalnum())

def ms(value,key=''):
    if value is None or not value.strip():
        raise ValueError('Empty time')
    value=value.strip().replace(',','.')
    factor=1000
    if value.endswith('ms'):
        value,factor=value[:-2],1
    elif value.endswith('s'):
        value=value[:-1]
    elif key.endswith('ms'):
        factor=1
    if re.fullmatch(r'\d+(?:\.\d+)?',value):
        return round(float(value)*factor)
    if re.fullmatch(r'\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?',value):
        total=0.
        for item in value.split(':'):
            total=total*60+float(item)
        return round(total*1000)
    raise ValueError('Unsupported time format')

def field(elem,candidates):
    attrs={local(k):v for k,v in elem.attrib.items()}
    for key in candidates:
        if key in attrs and attrs[key].strip():
            return attrs[key],key
    for child in elem:
        key=local(child.tag)
        if key in candidates and not list(child) and (child.text or '').strip():
            return child.text.strip(),key
    return None,''

def parse_xml(source):
    if b'<!DOCTYPE' in source.upper() or b'<!ENTITY' in source.upper():
        raise ValueError('External entities are prohibited')
    root=ET.fromstring(source)
    cues=[]
    for elem in root.iter():
        if local(elem.tag) not in CUE_TAGS:
            continue
        start,sk=field(elem,START)
        end,ek=field(elem,END)
        dur,dk=field(elem,DURATION)
        if start is None or (end is None and dur is None):
            continue
        try:
            first=ms(start,sk)
            last=ms(end,ek) if end is not None else first+ms(dur,dk)
        except ValueError:
            continue
        word=next((child for child in elem if local(child.tag) in WORDS and (child.text or '').strip()),None)
        if word is not None:
            text=clean(' '.join(word.itertext()))
        else:
            chunks=[elem.text or '']
            for child in elem:
                if local(child.tag) not in START+END+DURATION:
                    chunks.extend(child.itertext())
                if child.tail:
                    chunks.append(child.tail)
            text=clean(' '.join(chunks))
        if text:
            cues.append({'startMs':first,'endMs':last,'text':text})
    if not cues:
        raise ValueError('No supported timed captions in source XML')
    for i,c in enumerate(cues):
        if c['startMs']<0 or c['endMs']<=c['startMs']:
            raise ValueError('Invalid cue time')
        if i and c['startMs']<cues[i-1]['startMs']:
            raise ValueError('Cue starts go backwards')
        if c['endMs']>3600000:
            raise ValueError('Time units appear invalid')
    return cues

def parse_vtt(value):
    cues=[]
    for block in re.split(r'\n\s*\n',value.replace('\r\n','\n')):
        lines=block.strip().splitlines()
        pos=next((i for i,line in enumerate(lines) if ' --> ' in line),-1)
        if pos<0 or pos+1>=len(lines):
            continue
        start,end=lines[pos].split(' --> ',1)
        try:
            cues.append({'startMs':ms(start.strip()),'endMs':ms(end.split()[0]),'text':clean(' '.join(lines[pos+1:]))})
        except ValueError:
            pass
    return cues

def stamp(value):
    h,value=divmod(value,3600000)
    m,value=divmod(value,60000)
    s,value=divmod(value,1000)
    return f'{h:02}:{m:02}:{s:02}.{value:03}'

def to_vtt(cues):
    return 'WEBVTT\n\n'+'\n'.join(
        f'{i}\n{stamp(c["startMs"])} --> {stamp(c["endMs"])}\n{c["text"]}\n'
        for i,c in enumerate(cues,1)
    )+'\n'

class SafeRedirect(HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,newurl):
        target=urlparse(newurl)
        if target.scheme!='https' or target.hostname!=HOST:
            raise ValueError('Unexpected caption redirect')
        return super().redirect_request(req,fp,code,msg,headers,newurl)

def download(content_id):
    url=f'https://{HOST}/contents/caption/{content_id}.xml'
    opener=build_opener(SafeRedirect())
    with opener.open(Request(url,headers={'User-Agent':'yqxyy-caption-sync/1.0'}),timeout=18) as response:
        body=response.read(2000001)
    if len(body)>2000000:
        raise ValueError('XML exceeds size limit')
    return url,body

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--lesson',action='append',default=[])
    parser.add_argument('--manifest',help='JSON containing lessons with seriesId and episodeId')
    parser.add_argument('--xml-file',help='Local XML fixture for exactly one selected lesson')
    parser.add_argument('--apply',action='store_true')
    parser.add_argument('--strict',action='store_true')
    args=parser.parse_args()
    selected=list(args.lesson)
    if args.manifest and Path(args.manifest).exists():
        data=json.loads(Path(args.manifest).read_text(encoding='utf-8'))
        selected += [f'{row["seriesId"]}:{row["episodeId"]}' for row in data.get('lessons',[])]
    selected=list(dict.fromkeys(selected))
    if args.xml_file and len(selected)!=1:
        parser.error('--xml-file requires one selected lesson')
    report=[]
    for item in selected:
        row={'lesson':item,'status':'pending'}
        try:
            sid,num=item.split(':')
            if not SERIES.fullmatch(sid) or not num.isdecimal() or not 1<=int(num)<=9999:
                raise ValueError('Invalid lesson ID')
            num=int(num)
            directory=DATA/sid
            episode=next(e for e in json.loads((directory/'episodes.json').read_text(encoding='utf-8')) if int(e['episodeId'])==num)
            content_id=episode.get('sourceContentId','')
            if not ID.fullmatch(content_id):
                raise ValueError('Unverified source content ID')
            read_path=directory/'reading-lessons.json'
            reads=json.loads(read_path.read_text(encoding='utf-8')) if read_path.exists() else {}
            lesson=reads.get(str(num),{})
            if lesson.get('sourceId') and lesson['sourceId']!=content_id:
                raise ValueError('Read/source content ID mismatch')
            target=directory/'subtitles'/f'{num:03}.vtt'
            timing=target.with_suffix('.timing.json')
            if timing.exists():
                row['status']='skipped-previously-calibrated'
                report.append(row)
                continue
            old=parse_vtt(target.read_text(encoding='utf-8')) if target.exists() else []
            url,source=(f'https://{HOST}/contents/caption/{content_id}.xml',Path(args.xml_file).read_bytes()) if args.xml_file else download(content_id)
            cues=parse_xml(source)
            if len(cues)<8 or len(' '.join(c['text'] for c in cues).split())<80:
                raise ValueError('Captions are incomplete')
            if cues[0]['startMs']>45000:
                raise ValueError('First cue starts too late')
            xml_text=norm(' '.join(c['text'] for c in cues))
            if old:
                ratio=SequenceMatcher(None,norm(' '.join(c['text'] for c in old)),xml_text,autojunk=False).ratio()
                if ratio<.90:
                    raise ValueError(f'Text mismatch ({ratio:.3f})')
                if abs(old[-1]['endMs']-cues[-1]['endMs'])>45000:
                    raise ValueError('Video duration mismatch')
            else:
                paragraphs=lesson.get('paragraphs',[])
                official_read=norm(' '.join(str(p.get('text','')) for p in paragraphs))
                if not official_read or SequenceMatcher(None,official_read,xml_text,autojunk=False).ratio()<.90:
                    raise ValueError('Cannot verify against canonical Read')
            content=to_vtt(cues)
            row.update(status='validated',contentId=content_id,source=url,cues=len(cues),firstMs=cues[0]['startMs'],lastMs=cues[-1]['endMs'])
            if args.apply:
                target.parent.mkdir(parents=True,exist_ok=True)
                target.write_text(content,encoding='utf-8')
                timing.write_text(json.dumps({
                    'seriesId':sid,'episodeId':num,'sourceContentId':content_id,
                    'source':url,'sourceSha256':hashlib.sha256(source).hexdigest(),
                    'method':'official-caption-xml-transcript-checked',
                    'cueCount':len(cues),'firstMs':cues[0]['startMs'],'lastMs':cues[-1]['endMs'],
                    'vttSha256':hashlib.sha256(content.encode()).hexdigest()
                },indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
                row['status']='updated'
        except Exception as error:
            row['error']=str(error)
        report.append(row)
    for row in report:
        print(json.dumps(row,ensure_ascii=False),flush=True)
    if args.strict and any(row['status']=='pending' for row in report):
        raise SystemExit(1)

if __name__=='__main__':
    main()
