#!/usr/bin/env python3
"""Rebuild the 20 episode-local HLS manifests from the current upstream master."""
import json, math, pathlib, re, urllib.parse, urllib.request

ROOT=pathlib.Path(__file__).resolve().parents[1]
BASE=ROOT/"data/movie-harry-potter-4"
SOURCE="https://api.obj2.top/hls/movie/674/master.m3u8"

def fetch(url):
    req=urllib.request.Request(url,headers={"User-Agent":"Mozilla/5.0","Accept":"*/*"})
    with urllib.request.urlopen(req,timeout=35) as r:
        return r.read().decode("utf-8-sig")

def absolute(base,uri):
    return urllib.parse.urljoin(base,uri.strip())

def absolute_attr(tag,base):
    return re.sub(r'URI="([^"]+)"',lambda m:'URI="'+absolute(base,m.group(1))+'"',tag)

def resolve_source():
    master=[x.strip() for x in fetch(SOURCE).splitlines() if x.strip()]
    variants=[]
    for i,line in enumerate(master):
        if line.startswith("#EXT-X-STREAM-INF:"):
            uri=next((x for x in master[i+1:] if not x.startswith("#")),None)
            if uri:
                bw=re.search(r'BANDWIDTH=(\d+)',line)
                res=re.search(r'RESOLUTION=(\d+)x(\d+)',line)
                variants.append((int(bw.group(1)) if bw else 0,int(res.group(2)) if res else 0,absolute(SOURCE,uri),line))
    if not variants: raise RuntimeError("No video variants in source master")
    chosen=next((v for v in variants if v[1]==1080),max(variants,key=lambda v:v[0]))
    audio=[]
    for line in master:
        if line.startswith("#EXT-X-MEDIA:") and "TYPE=AUDIO" in line and "URI=" in line:
            uri=re.search(r'URI="([^"]+)"',line)
            lang=re.search(r'LANGUAGE="([^"]+)"',line)
            name=re.search(r'NAME="([^"]+)"',line)
            group=re.search(r'GROUP-ID="([^"]+)"',line)
            if uri: audio.append((lang.group(1) if lang else "",name.group(1) if name else "",group.group(1) if group else "",absolute(SOURCE,uri.group(1))))
    if not audio: raise RuntimeError("Source master has no external audio rendition")
    audio_track=next((a for a in audio if a[0].lower().startswith("en")),next((a for a in audio if "english" in a[1].lower()),audio[0]))
    return chosen,audio_track

def media_playlist(url):
    lines=[x.strip() for x in fetch(url).splitlines() if x.strip()]
    if not any(x.startswith("#EXTINF:") for x in lines) or "#EXT-X-ENDLIST" not in lines:
        raise RuntimeError("Source media playlist is not finite VOD: "+url)
    media_seq=next((int(x.split(":",1)[1]) for x in lines if x.startswith("#EXT-X-MEDIA-SEQUENCE:")),0)
    disc_seq=next((int(x.split(":",1)[1]) for x in lines if x.startswith("#EXT-X-DISCONTINUITY-SEQUENCE:")),0)
    segments=[]; total=0.0; key=None; init_map=None; pending=None; byte_range=None; disc=False; range_next={}
    for line in lines:
        if line.startswith("#EXT-X-KEY:"): key=absolute_attr(line,url)
        elif line.startswith("#EXT-X-MAP:"): init_map=absolute_attr(line,url)
        elif line=="#EXT-X-DISCONTINUITY": disc=True
        elif line.startswith("#EXT-X-BYTERANGE:"): byte_range=line.split(":",1)[1]
        elif line.startswith("#EXTINF:"): pending=float(line.split(":",1)[1].split(",",1)[0])
        elif not line.startswith("#") and pending is not None:
            uri=absolute(url,line); br=None
            if byte_range:
                size,_,offset=byte_range.partition("@")
                start=int(offset) if offset else range_next.get(uri,0)
                br=f"#EXT-X-BYTERANGE:{size}@{start}"
                range_next[uri]=start+int(size)
            segments.append({"start":total,"end":total+pending,"duration":pending,"uri":uri,"key":key,"map":init_map,"disc":disc,"byterange":br})
            total+=pending; pending=None; byte_range=None; disc=False
    return media_seq,disc_seq,segments,total

def write_media(path,source,first,last):
    media_seq,disc_seq,all_segments,_=source
    if first<0 or last>len(all_segments) or first>=last:
        raise RuntimeError(f"Bad segment range {first}:{last} / {len(all_segments)}")
    chosen=all_segments[first:last]
    target=math.ceil(max(s["duration"] for s in chosen))
    lines=["#EXTM3U","#EXT-X-VERSION:6","#EXT-X-PLAYLIST-TYPE:VOD",f"#EXT-X-TARGETDURATION:{target}",f"#EXT-X-MEDIA-SEQUENCE:{media_seq+first}"]
    prior=sum(1 for s in all_segments[:first] if s["disc"])
    if disc_seq or prior: lines.append(f"#EXT-X-DISCONTINUITY-SEQUENCE:{disc_seq+prior}")
    old_key=old_map=None
    for i,seg in enumerate(chosen):
        if seg["disc"] and i: lines.append("#EXT-X-DISCONTINUITY")
        if seg["key"] and seg["key"]!=old_key: lines.append(seg["key"])
        elif not seg["key"] and old_key: lines.append("#EXT-X-KEY:METHOD=NONE")
        if seg["map"] and seg["map"]!=old_map: lines.append(seg["map"])
        old_key,old_map=seg["key"],seg["map"]
        lines.append(f"#EXTINF:{seg['duration']:.6f},")
        if seg["byterange"]: lines.append(seg["byterange"])
        lines.append(seg["uri"])
    lines.append("#EXT-X-ENDLIST")
    path.write_text("\n".join(lines)+"\n",encoding="utf-8")

def main():
    manifest=json.loads((BASE/"hls/manifest.json").read_text(encoding="utf-8"))
    chapters=manifest if isinstance(manifest,list) else manifest.get("chapters",[])
    episodes=json.loads((BASE/"episodes.json").read_text(encoding="utf-8"))
    if len(chapters)!=20 or len(episodes)!=20: raise RuntimeError("Expected 20 chapters and episodes")
    video_choice,audio_choice=resolve_source()
    video=media_playlist(video_choice[2]); audio=media_playlist(audio_choice[3])
    print("Selected video:",video_choice[2],"audio:",audio_choice[3])
    print("Source segment counts:",len(video[2]),len(audio[2]),"durations:",video[3],audio[3])
    if abs(video[3]-9437.625)>120 or abs(audio[3]-9437.625)>120:
        raise RuntimeError("Source duration no longer matches the inspected 157-minute asset")
    out=BASE/"hls";out.mkdir(parents=True,exist_ok=True)
    for ch,ep in zip(chapters,episodes):
        i=int(ch["episodeId"]);stem=f"{i:03d}"
        if int(ep["episodeId"])!=i: raise RuntimeError("Episode order mismatch")
        write_media(out/f"{stem}.video.m3u8",video,int(ch["videoSegmentStart"]),int(ch["videoSegmentEnd"]))
        write_media(out/f"{stem}.audio.m3u8",audio,int(ch["audioSegmentStart"]),int(ch["audioSegmentEnd"]))
        variant=re.sub(r',?(?:AUDIO|SUBTITLES)="[^"]+"','',video_choice[3])
        variant=variant.rstrip(",")+',AUDIO="aud1",SUBTITLES="subs1"'
        master=[
            "#EXTM3U","#EXT-X-VERSION:6",
            f'#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud1",NAME="English",LANGUAGE="en",DEFAULT=YES,AUTOSELECT=YES,URI="{stem}.audio.m3u8"',
            f'#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs1",NAME="English",LANGUAGE="en",DEFAULT=YES,AUTOSELECT=YES,FORCED=NO,URI="{stem}.en.m3u8"',
            "#EXT-X-STREAM-INF:"+variant,stem+".video.m3u8"
        ]
        (out/f"{stem}.m3u8").write_text("\n".join(master)+"\n",encoding="utf-8")
        duration=float(ch["storyDuration"])
        sub=["#EXTM3U","#EXT-X-VERSION:3","#EXT-X-PLAYLIST-TYPE:VOD",f"#EXT-X-TARGETDURATION:{math.ceil(duration)}",f"#EXTINF:{duration:.6f},",f"../subtitles/{stem}.en.vtt","#EXT-X-ENDLIST"]
        (out/f"{stem}.en.m3u8").write_text("\n".join(sub)+"\n",encoding="utf-8")
    print("Generated 20 independent HLS master/audio/video/English subtitle playlists.")

if __name__=="__main__": main()
