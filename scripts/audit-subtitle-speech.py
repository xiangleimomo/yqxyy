"""Compare published video speech with existing VTT and produce word timestamps."""
import argparse, difflib, json, os, re, subprocess, tempfile, time, hashlib
from pathlib import Path
from urllib.parse import urlparse, urljoin
from urllib.request import Request, urlopen
from faster_whisper import WhisperModel
import shutil, wave
import numpy as np

ROOT=Path(__file__).resolve().parent.parent
LF_HOSTS={"cdn.littlefox.com","cdn.littlefox.co.kr"}
MOVIE_SEGMENT_HOSTS={"mujizybf00.com"}
SITE_BASE=os.environ.get("YQXYY_SITE_URL","https://yqxyy.netlify.app").rstrip("/")

def tokens(text):
    return re.findall(r"[a-z0-9]+", text.replace("’", "'").lower())

def millis(value):
    h,m,s=value.replace(",",".").split(":")
    return round((int(h)*3600+int(m)*60+float(s))*1000)

def cues_from_vtt(text):
    cues=[]
    for block in text.replace("\r","").strip().split("\n\n"):
        lines=block.splitlines()
        at=next((i for i,l in enumerate(lines) if "-->" in l),None)
        if at is None:continue
        left,right=lines[at].split("-->")
        cues.append(dict(startMs=millis(left.strip()),endMs=millis(right.strip().split()[0]),text=" ".join(lines[at+1:])))
    return cues

def compare(cues,words):
    expected=[];boundaries=[];actual=[];times=[]
    for cue in cues:
        start=len(expected);expected.extend(tokens(cue["text"]));boundaries.append((start,len(expected)))
    for word in words:
        for token in tokens(word["word"]):
            actual.append(token);times.append((round(word["start"]*1000),round(word["end"]*1000),word.get("probability",1)))
    mapping={}
    for block in difflib.SequenceMatcher(None,expected,actual,autojunk=False).get_matching_blocks():
        for n in range(block.size):mapping[block.a+n]=times[block.b+n]
    result=[]
    for index,(cue,(a,b)) in enumerate(zip(cues,boundaries)):
        matched=[mapping[i] for i in range(a,b) if i in mapping]
        coverage=len(matched)/max(1,b-a)
        row=dict(index=index+1,**cue,matchedFraction=round(coverage,4))
        if matched:
            row.update(speechStartMs=matched[0][0],speechEndMs=matched[-1][1],
                startErrorMs=cue["startMs"]-matched[0][0],endErrorMs=cue["endMs"]-matched[-1][1],
                meanWordConfidence=round(sum(t[2] for t in matched)/len(matched),4),
                edgeWordsMatched=a in mapping and b-1 in mapping)
        result.append(row)
    return dict(expectedWords=len(expected),recognizedWords=len(actual),
                matchedFraction=round(len(mapping)/max(1,len(expected)),4),cues=result)

def media_source(raw):
    if not raw:raise ValueError("Missing video source")
    if raw.startswith("data/"):
        if not re.fullmatch(r"data/movie-harry-potter-[123]/hls/\d{3}\.m3u8",raw):
            raise ValueError("Local media path is outside the approved movie playlists")
        path=(ROOT/raw).resolve()
        if not path.is_file() or ROOT not in path.parents:raise ValueError("Local HLS playlist not found")
        playlist=path.read_text(encoding="utf-8")
        refs=[]
        for line in playlist.splitlines():
            line=line.strip()
            if not line:continue
            if line.startswith("#"):refs.extend(re.findall(r'URI="([^"]+)"',line))
            else:refs.append(line)
        if not refs:raise ValueError("Movie playlist has no media segments")
        for ref in refs:
            u=urlparse(urljoin("https://mujizybf00.com/",ref))
            if u.scheme!="https" or u.hostname not in MOVIE_SEGMENT_HOSTS or u.username or u.password:
                raise ValueError("Movie playlist contains an unapproved media host")
        return str(path),raw,hashlib.sha256(raw.encode()).hexdigest(),True
    u=urlparse(raw)
    if u.scheme!="https" or u.hostname not in LF_HOSTS or u.username or u.password or u.port:
        raise ValueError("Video source is not on an approved Little Fox CDN")
    return raw,u.path,hashlib.sha256(u.path.encode()).hexdigest(),False

def subtitle_source(item,series,eid,output):
    path=ROOT/"data"/series/"subtitles"/f"{eid:03}.vtt"
    if path.is_file():
        text=path.read_text(encoding="utf-8-sig")
        return text,hashlib.sha256(text.encode()).hexdigest(),None
    raw=item.get("subtitleUrl","")
    if not raw:raise ValueError("No static or dynamic subtitle source")
    url=urljoin(SITE_BASE+"/",raw)
    u=urlparse(url)
    if u.scheme!="https" or u.hostname!=urlparse(SITE_BASE).hostname or u.path!="/.netlify/functions/movie-study-subtitles":
        raise ValueError("Dynamic subtitle endpoint is not the approved site function")
    request=Request(url,headers={"User-Agent":"yqxyy-word-karaoke/1.0","Accept":"text/vtt"})
    with urlopen(request,timeout=35) as response:
        if response.status!=200:raise ValueError("Dynamic subtitle endpoint unavailable")
        body=response.read(4*1024*1024+1)
    if len(body)>4*1024*1024:raise ValueError("Dynamic subtitle response too large")
    text=body.decode("utf-8-sig")
    if not text.lstrip().startswith("WEBVTT") or "NOTE Subtitles temporarily unavailable" in text:
        raise ValueError("Dynamic subtitle response is not a usable VTT")
    saved=output/"subtitles"/f"{series}-{eid:03}.vtt"
    saved.parent.mkdir(parents=True,exist_ok=True)
    saved.write_text(text,encoding="utf-8")
    return text,hashlib.sha256(text.encode()).hexdigest(),saved.relative_to(output).as_posix()

def extract_audio(media,local,wav):
    command=[shutil.which("ffmpeg") or "ffmpeg","-hide_banner","-loglevel","error"]
    if local:command += ["-protocol_whitelist","file,http,https,tcp,tls,crypto","-allowed_extensions","ALL"]
    else:command += ["-reconnect","1","-reconnect_streamed","1","-reconnect_delay_max","3"]
    command += ["-i",media,"-vn","-ac","1","-ar","16000","-y",str(wav)]
    return subprocess.run(command,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=600)

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--manifest",required=True)
    parser.add_argument("--shard",type=int,default=0)
    parser.add_argument("--shards",type=int,default=1)
    parser.add_argument("--output",default="speech-review")
    parser.add_argument("--model",choices=["tiny.en","base.en"],default="tiny.en")
    parser.add_argument("--allow-failures",action="store_true")
    args=parser.parse_args()
    output=Path(args.output);output.mkdir(parents=True,exist_ok=True)
    manifest=Path("scripts/subtitle-review/2026-10-28-placeholder-retry.json") if os.environ.get("SPEECH_SCOPE")=="placeholder-retry" else Path("scripts/subtitle-review/2026-10-28-extended-placeholders.json") if os.environ.get("SPEECH_SCOPE")=="extended-placeholders" else Path("scripts/subtitle-review/2026-10-28-placeholder-speech.json") if os.environ.get("SPEECH_SCOPE")=="placeholder-speech" else Path("scripts/subtitle-review/2026-10-28-binding-samples.json") if os.environ.get("SPEECH_SCOPE")=="binding-samples" else Path(args.manifest)
    rows=json.loads(manifest.read_text(encoding="utf-8"))["lessons"][args.shard::args.shards]
    if not rows:return
    model=WhisperModel(args.model,device="cpu",compute_type="int8",cpu_threads=4,download_root=os.path.join(tempfile.gettempdir(),"yqxyy-whisper-models"))
    probe,_=model.transcribe(np.zeros(16000,dtype=np.float32),language="en",word_timestamps=True,vad_filter=False)
    list(probe)
    failures=[]
    for item in rows:
        started=time.time();sid=item["seriesId"];eid=int(item["episodeId"])
        try:
            directory=ROOT/"data"/sid
            episodes=json.loads((directory/"episodes.json").read_text(encoding="utf-8"))
            ep=next(e for e in episodes if int(e["episodeId"])==eid)
            subtitle_text,subtitle_hash,subtitle_file=subtitle_source(item,sid,eid,output)
            cues=cues_from_vtt(subtitle_text)
            if not cues:raise ValueError("Subtitle has no valid timed cues")
            candidates=[item.get("hlsUrl")]+(item.get("hlsFallbacks") or [])
            last_error=None;decoded_samples=None;media_path=None;media_hash=None;media_kind=None
            for candidate in candidates:
                if not candidate:continue
                try:
                    media,media_path,media_hash,local=media_source(candidate)
                    with tempfile.TemporaryDirectory(prefix="yqxyy-speech-") as temp:
                        wav=Path(temp)/"audio.wav"
                        result=extract_audio(media,local,wav)
                        if result.returncode:
                            last_error="Audio extraction failed"
                            continue
                        with wave.open(str(wav),"rb") as decoded:
                            if decoded.getnchannels()!=1 or decoded.getframerate()!=16000 or decoded.getsampwidth()!=2:
                                raise ValueError("Unexpected PCM audio format")
                            decoded_samples=np.frombuffer(decoded.readframes(decoded.getnframes()),dtype=np.int16).astype(np.float32)/32768.0
                    media_kind="local-movie-hls" if local else "remote-littlefox"
                    break
                except Exception as error:
                    last_error=str(error)
                    decoded_samples=None
            if decoded_samples is None:raise ValueError(last_error or "All approved video sources failed")
            segments,info=model.transcribe(decoded_samples,language="en",beam_size=3,word_timestamps=True,
                vad_filter=True,condition_on_previous_text=False)
            words=[dict(start=w.start,end=w.end,word=w.word,probability=w.probability)
                   for segment in segments for w in (segment.words or [])]
            report=dict(seriesId=sid,episodeId=eid,title=ep.get("title",""),
                sourceContentId=ep.get("sourceContentId"),mediaPath=media_path,
                mediaFingerprint=media_hash,mediaKind=media_kind,subtitleSha256=subtitle_hash,
                subtitleFile=subtitle_file,subtitleMode=item.get("subtitleMode","static"),
                model="faster-whisper "+args.model+" int8",durationMs=round(info.duration*1000),
                **compare(cues,words),words=words)
            name=sid+"-"+str(eid)+".json"
            (output/name).write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
            print(json.dumps(dict(seriesId=sid,episodeId=eid,coverage=report["matchedFraction"],
                elapsedSeconds=round(time.time()-started)),ensure_ascii=False),flush=True)
        except Exception as error:
            reason=str(error) if not isinstance(error,subprocess.TimeoutExpired) else "Audio extraction timed out"
            if "http" in reason.lower():reason=type(error).__name__
            failures.append(dict(seriesId=sid,episodeId=eid,error=reason))
            print(json.dumps(failures[-1],ensure_ascii=False),flush=True)
    (output/f"failures-{args.shard}.json").write_text(json.dumps(failures,indent=2)+"\n",encoding="utf-8")
    if failures and not args.allow_failures:raise SystemExit(1)

if __name__=="__main__":main()
