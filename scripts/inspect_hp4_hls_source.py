#!/usr/bin/env python3
import json, os, pathlib, re, urllib.parse, urllib.request, zipfile, hashlib

SOURCE = "https://api.obj2.top/hls/movie/674/master.m3u8"
OUT = pathlib.Path("hp4-source-inspection")
OUT.mkdir(exist_ok=True)

def fetch(url, limit=12*1024*1024):
    req=urllib.request.Request(url, headers={"User-Agent":"Mozilla/5.0","Accept":"*/*"})
    with urllib.request.urlopen(req, timeout=35) as r:
        data=r.read(limit+1)
        if len(data)>limit: raise RuntimeError(f"Response too large: {url}")
        return data, dict(r.headers.items()), r.status

def text(url):
    b,h,s=fetch(url)
    return b.decode("utf-8-sig", "replace"), h, s

def absurl(base, uri):
    return urllib.parse.urljoin(base, uri.strip())

def attrs(s):
    out={}; token=""; parts=[]; quoted=False
    for ch in s:
        if ch=='"': quoted=not quoted
        if ch==',' and not quoted: parts.append(token); token=""
        else: token+=ch
    if token: parts.append(token)
    for p in parts:
        if '=' in p:
            k,v=p.split('=',1); out[k.strip()]=v.strip().strip('"')
    return out

def parse_master(url, body):
    lines=[x.strip() for x in body.splitlines() if x.strip()]
    variants=[]; media=[]
    for i,line in enumerate(lines):
        if line.startswith("#EXT-X-STREAM-INF:"):
            a=attrs(line.split(':',1)[1])
            uri=next((x for x in lines[i+1:] if not x.startswith('#')),None)
            if uri: variants.append({"attrs":a,"url":absurl(url,uri)})
        elif line.startswith("#EXT-X-MEDIA:"):
            a=attrs(line.split(':',1)[1])
            if a.get("TYPE") in ("AUDIO","SUBTITLES"):
                a["resolvedUri"]=absurl(url,a["URI"]) if a.get("URI") else None
                media.append(a)
    return variants,media,lines

def inspect_media(url):
    body,headers,status=text(url)
    if not body.lstrip().startswith("#EXTM3U"):
        return {"url":url,"status":status,"contentType":headers.get("Content-Type"),"kind":"not-m3u8","preview":body[:160]}
    lines=[x.strip() for x in body.splitlines() if x.strip()]
    if any(x.startswith("#EXT-X-STREAM-INF:") for x in lines):
        variants,media,_=parse_master(url,body)
        return {"url":url,"kind":"master","variants":variants,"media":media}
    segs=[]; total=0.0; pending=None
    for line in lines:
        if line.startswith("#EXTINF:"):
            try: pending=float(line.split(':',1)[1].split(',',1)[0])
            except: pending=None
        elif line.startswith("#EXT-X-KEY:"):
            pass
        elif line.startswith("#EXT-X-MAP:"):
            pass
        elif line.startswith("#EXT-X-DISCONTINUITY"):
            pass
        elif not line.startswith('#') and pending is not None:
            segs.append({"url":absurl(url,line),"duration":pending,"start":total,"end":total+pending})
            total+=pending; pending=None
    return {"url":url,"kind":"media","contentType":headers.get("Content-Type"),"status":status,
            "duration":round(total,3),"segmentCount":len(segs),"endList":"#EXT-X-ENDLIST" in lines,
            "encrypted":any(x.startswith("#EXT-X-KEY:") for x in lines),
            "fmp4":any(x.startswith("#EXT-X-MAP:") for x in lines),
            "discontinuity":any(x.startswith("#EXT-X-DISCONTINUITY") for x in lines),
            "mediaSequence":next((int(x.split(':',1)[1]) for x in lines if x.startswith("#EXT-X-MEDIA-SEQUENCE:")),0),
            "segments":segs,"raw":body}

def parse_vtt_count(s):
    return len(re.findall(r"(?m)^\d{2}:\d{2}(?::\d{2})?[.,]\d{3}\s+-->",s))

def inspect_subtitle_track(track, idx):
    uri=track.get("resolvedUri")
    result={"name":track.get("NAME"),"language":track.get("LANGUAGE"),"default":track.get("DEFAULT"),
            "forced":track.get("FORCED"),"groupId":track.get("GROUP-ID"),"uri":uri}
    if not uri:
        result.update({"status":"no-external-uri","note":"Subtitle rendition has no URI in master playlist"})
        return result
    body,headers,status=text(uri)
    d=OUT/f"subtitle-track-{idx:02d}";d.mkdir(exist_ok=True)
    if not body.lstrip().startswith("#EXTM3U"):
        (d/"track.vtt").write_text(body,encoding="utf-8")
        result.update({"status":"fetched","format":"vtt-or-text","contentType":headers.get("Content-Type"),
                       "httpStatus":status,"cueCount":parse_vtt_count(body),"bytes":len(body.encode())})
        result["files"]=[str(d/"track.vtt")]
        return result
    (d/"playlist.m3u8").write_text(body,encoding="utf-8")
    lines=[x.strip() for x in body.splitlines() if x.strip()]
    segments=[];dur=0.;pending=None
    for line in lines:
        if line.startswith("#EXTINF:"):
            try: pending=float(line.split(':',1)[1].split(',',1)[0])
            except: pending=None
        elif not line.startswith('#') and pending is not None:
            segments.append({"url":absurl(uri,line),"duration":pending,"start":dur,"end":dur+pending})
            dur+=pending;pending=None
    files=[];cue_total=0;sample=[]
    for n,seg in enumerate(segments,1):
        b,h,s=fetch(seg["url"])
        val=b.decode("utf-8-sig","replace")
        fp=d/f"{n:04d}.vtt";fp.write_text(val,encoding="utf-8")
        files.append(str(fp));cue_total+=parse_vtt_count(val)
        if len(sample)<2: sample.append({"segment":n,"duration":seg["duration"],"preview":val[:250]})
    result.update({"status":"fetched","format":"webvtt-segment-playlist","httpStatus":status,
                   "contentType":headers.get("Content-Type"),"segmentCount":len(segments),
                   "duration":round(dur,3),"cueCount":cue_total,"files":files,"samples":sample,
                   "hasTimestampMap":any("X-TIMESTAMP-MAP" in pathlib.Path(x).read_text(encoding="utf-8",errors="ignore") for x in files)})
    return result

def main():
    master_body,master_headers,status=text(SOURCE)
    if not master_body.lstrip().startswith("#EXTM3U"):
        raise RuntimeError(f"Source did not return an HLS playlist: HTTP {status}, {master_headers.get('Content-Type')}, {master_body[:180]}")
    (OUT/"master.m3u8").write_text(master_body,encoding="utf-8")
    variants,tracks,lines=parse_master(SOURCE,master_body)
    if not variants:
        variants=[{"attrs":{},"url":SOURCE}]
    variants.sort(key=lambda v:int(v["attrs"].get("BANDWIDTH","0")),reverse=True)
    selected=variants[0]
    variant_reports=[]
    media_by_variant={}
    for variant in variants:
        media_info=inspect_media(variant["url"])
        if media_info["kind"]=="master":
            nested=media_info["variants"]
            nested.sort(key=lambda v:int(v["attrs"].get("BANDWIDTH","0")),reverse=True)
            variant["nestedVariant"]=nested[0]
            media_info=inspect_media(nested[0]["url"])
        if media_info["kind"]!="media":
            raise RuntimeError("A video variant did not resolve to a media playlist")
        label=variant["attrs"].get("RESOLUTION","unknown").replace("x","-")
        filename=f"video-media-{label}.m3u8"
        (OUT/filename).write_text(media_info["raw"],encoding="utf-8")
        variant_reports.append({"attrs":variant["attrs"],"url":variant["url"],"mediaPlaylist":filename,
                                "duration":media_info["duration"],"segmentCount":media_info["segmentCount"],
                                "encrypted":media_info["encrypted"],"mediaSequence":media_info["mediaSequence"]})
        media_by_variant[variant["url"]]=media_info
    video=media_by_variant[selected["url"]]
    (OUT/"video-media.m3u8").write_text(video["raw"],encoding="utf-8")
    variant_attrs=selected["attrs"]
    audio_group=variant_attrs.get("AUDIO")
    subtitle_group=variant_attrs.get("SUBTITLES")
    relevant=[t for t in tracks if (t.get("TYPE")=="AUDIO" and (not audio_group or t.get("GROUP-ID")==audio_group)) or
              (t.get("TYPE")=="SUBTITLES" and (not subtitle_group or t.get("GROUP-ID")==subtitle_group))]
    audio_tracks=[t for t in relevant if t.get("TYPE")=="AUDIO"]
    audio_track=next((t for t in audio_tracks if (t.get("LANGUAGE") or "").lower().startswith("en")),None) or next((t for t in audio_tracks if t.get("DEFAULT")=="YES"),None) or (audio_tracks[0] if audio_tracks else None)
    audio=None
    if audio_track and audio_track.get("resolvedUri"):
        audio=inspect_media(audio_track["resolvedUri"])
        if audio.get("kind")=="media": (OUT/"audio-media.m3u8").write_text(audio["raw"],encoding="utf-8")
    subtitle_tracks=[t for t in relevant if t.get("TYPE")=="SUBTITLES"]
    results=[]
    for i,t in enumerate(subtitle_tracks,1):
        try: results.append(inspect_subtitle_track(t,i))
        except Exception as e: results.append({"name":t.get("NAME"),"language":t.get("LANGUAGE"),"uri":t.get("resolvedUri"),"status":"fetch-failed","error":str(e)})
    report={
      "title":"Harry Potter and the Goblet of Fire",
      "titleZh":"哈利波特与火焰杯",
      "sourceUrl":SOURCE,
      "masterHttpStatus":status,
      "masterContentType":master_headers.get("Content-Type"),
      "masterBytes":len(master_body.encode()),
      "variantCount":len(variants),
      "variants":variant_reports,
      "selectedVariant":selected,
      "video":{"url":video["url"],"duration":video["duration"],"segmentCount":video["segmentCount"],
               "endList":video["endList"],"encrypted":video["encrypted"],"fmp4":video["fmp4"],
               "discontinuity":video["discontinuity"],"mediaSequence":video["mediaSequence"]},
      "audio":{"available":bool(audio),"track":audio_track,"duration":audio.get("duration") if audio else None,
               "segmentCount":audio.get("segmentCount") if audio else None,"encrypted":audio.get("encrypted") if audio else None},
      "subtitleTrackCount":len(subtitle_tracks),
      "subtitleTracks":results,
      "selectedGroups":{"audio":audio_group,"subtitles":subtitle_group},
      "sourceChecksum":hashlib.sha256(master_body.encode()).hexdigest()
    }
    (OUT/"source-report.json").write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(report,ensure_ascii=False,indent=2))
    with zipfile.ZipFile("hp4-source-inspection.zip","w",zipfile.ZIP_DEFLATED) as z:
        for p in OUT.rglob("*"):
            if p.is_file(): z.write(p,p.relative_to(OUT.parent))
if __name__=="__main__": main()
