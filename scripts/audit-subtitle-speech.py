"""Compare published video speech with existing VTT, without changing transcript text.
Run in the manual GitHub workflow; FFmpeg audio and model caches stay temporary.
"""
import argparse, difflib, json, os, re, subprocess, tempfile, time
from pathlib import Path
from urllib.parse import urlparse
from faster_whisper import WhisperModel
import shutil
import wave
import numpy as np

ROOT=Path(__file__).resolve().parent.parent

def tokens(text):
    return re.findall(r"[a-z0-9]+", text.replace('’', "'").lower())

def millis(value):
    h,m,s=value.split(':')
    return round((int(h)*3600+int(m)*60+float(s))*1000)

def cues_from_vtt(text):
    cues=[]
    for block in text.replace('\r','').strip().split('\n\n'):
        lines=block.splitlines()
        at=next((i for i,l in enumerate(lines) if '-->' in l),None)
        if at is None: continue
        left,right=lines[at].split('-->')
        cues.append(dict(startMs=millis(left.strip()),endMs=millis(right.strip().split()[0]),text=' '.join(lines[at+1:])))
    return cues

def compare(cues, words):
    expected=[]; boundaries=[]; actual=[]; times=[]
    for cue in cues:
        start=len(expected); expected.extend(tokens(cue['text']));boundaries.append((start,len(expected)))
    for w in words:
        for token in tokens(w['word']):actual.append(token);times.append((round(w['start']*1000),round(w['end']*1000),w['probability']))
    mapping={}
    for block in difflib.SequenceMatcher(None,expected,actual,autojunk=False).get_matching_blocks():
        for n in range(block.size):mapping[block.a+n]=times[block.b+n]
    result=[]
    for index,(cue,(a,b)) in enumerate(zip(cues,boundaries)):
        matched=[mapping[i] for i in range(a,b) if i in mapping]
        coverage=len(matched)/max(1,b-a)
        row=dict(index=index+1,**cue,matchedFraction=round(coverage,4))
        if matched:
            row.update(speechStartMs=matched[0][0],speechEndMs=matched[-1][1],startErrorMs=cue['startMs']-matched[0][0],endErrorMs=cue['endMs']-matched[-1][1],meanWordConfidence=round(sum(t[2] for t in matched)/len(matched),4),edgeWordsMatched=a in mapping and b-1 in mapping)
        result.append(row)
    return dict(expectedWords=len(expected),recognizedWords=len(actual),matchedFraction=round(len(mapping)/max(1,len(expected)),4),cues=result)

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--manifest',required=True);parser.add_argument('--shard',type=int,default=0);parser.add_argument('--shards',type=int,default=1);parser.add_argument('--output',default='speech-review');args=parser.parse_args()
    output=Path(args.output);output.mkdir(parents=True,exist_ok=True)
    rows=json.loads(Path(args.manifest).read_text(encoding='utf-8'))['lessons'][args.shard::args.shards]
    model=WhisperModel('tiny.en',device='cpu',compute_type='int8',cpu_threads=4,download_root=os.path.join(tempfile.gettempdir(),'yqxyy-whisper-models'))
    # Validate inference/word timestamps before downloading a whole batch.
    probe,_=model.transcribe(np.zeros(16000,dtype=np.float32),language='en',word_timestamps=True,vad_filter=False)
    list(probe)
    failures=[]
    for item in rows:
        started=time.time();sid=item['seriesId'];eid=item['episodeId']
        try:
            eps=json.loads((ROOT/'data'/sid/'episodes.json').read_text(encoding='utf-8'));ep=next(e for e in eps if e['episodeId']==eid)
            url=ep.get('video',{}).get('hlsUrl','');u=urlparse(url)
            if u.scheme!='https' or u.hostname!='cdn.littlefox.co.kr':raise ValueError('No supported public CDN source')
            path=ROOT/'data'/sid/'subtitles'/f'{eid:03}.vtt';cues=cues_from_vtt(path.read_text(encoding='utf-8'))
            with tempfile.TemporaryDirectory(prefix='yqxyy-speech-') as temp:
                wav=Path(temp)/'audio.wav'
                result=subprocess.run([shutil.which('ffmpeg') or 'ffmpeg','-hide_banner','-loglevel','error','-reconnect','1','-reconnect_streamed','1','-reconnect_delay_max','3','-i',url,'-vn','-ac','1','-ar','16000','-y',str(wav)],stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=240)
                if result.returncode:
                    diagnostic=re.sub(r'https?://[^\s]+','[media URL]',result.stderr.decode('utf-8','replace'))
                    raise ValueError('Audio extraction failed ('+str(result.returncode)+'): '+diagnostic[-700:])
                with wave.open(str(wav),'rb') as decoded:
                    if decoded.getnchannels()!=1 or decoded.getframerate()!=16000 or decoded.getsampwidth()!=2:raise ValueError('Unexpected PCM audio format')
                    samples=np.frombuffer(decoded.readframes(decoded.getnframes()),dtype=np.int16).astype(np.float32)/32768.0
                segments,info=model.transcribe(samples,language='en',beam_size=3,word_timestamps=True,vad_filter=True,condition_on_previous_text=False)
                words=[dict(start=w.start,end=w.end,word=w.word,probability=w.probability) for segment in segments for w in (segment.words or [])]
            report=dict(**item,title=ep['title'],sourceContentId=ep.get('sourceContentId'),model='faster-whisper tiny.en int8',durationMs=round(info.duration*1000),**compare(cues,words),words=words)
            name=sid+'-'+str(eid)+'.json';(output/name).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
            print(json.dumps(dict(seriesId=sid,episodeId=eid,coverage=report['matchedFraction'],elapsedSeconds=round(time.time()-started)),ensure_ascii=False),flush=True)
        except Exception as error:
            # Never include media URLs or subprocess output in exported errors.
            reason=str(error) if not isinstance(error,subprocess.TimeoutExpired) else 'Audio extraction timed out'
            if 'http' in reason.lower():reason=type(error).__name__
            failures.append(dict(**item,error=reason));print(json.dumps(failures[-1]),flush=True)
    (output/f'failures-{args.shard}.json').write_text(json.dumps(failures,indent=2)+'\n',encoding='utf-8')
    if failures:raise SystemExit(1)

if __name__=='__main__':main()
