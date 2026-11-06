#!/usr/bin/env python3
"""Split a source HLS VOD playlist into independently playable episode playlists."""
import json, pathlib, urllib.parse, urllib.request, re, math
ROOT=pathlib.Path(__file__).resolve().parents[1]
DATA=ROOT/'data/movie-harry-potter-1'
SOURCE='https://api.obj2.top/hls/movie/671/master.m3u8'
def read(url):
    req=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0','Accept':'*/*'})
    with urllib.request.urlopen(req,timeout=35) as resp:return resp.read().decode('utf-8-sig')
def absolute(base,uri):return urllib.parse.urljoin(base,uri.strip())
def get_media(url,depth=0):
    if depth>4:raise RuntimeError('Nested HLS master playlist too deep')
    body=read(url); lines=[x.strip() for x in body.splitlines() if x.strip()]
    if any(x.startswith('#EXT-X-STREAM-INF:') for x in lines):
        variants=[]
        for i,line in enumerate(lines):
            if line.startswith('#EXT-X-STREAM-INF:'):
                attrs=dict(re.findall(r'([A-Z-]+)=("[^"]*"|[^,]+)',line))
                nxt=next((x for x in lines[i+1:] if not x.startswith('#')),None)
                if nxt:variants.append((int(attrs.get('BANDWIDTH','0')),absolute(url,nxt)))
        if not variants:raise RuntimeError('Master playlist contains no playable variants')
        return get_media(max(variants)[1],depth+1)
    if not any(x.startswith('#EXTINF:') for x in lines):raise RuntimeError('No media segments in HLS playlist')
    return url,lines
def main():
    url,lines=get_media(SOURCE)
    if '#EXT-X-ENDLIST' not in lines:raise RuntimeError('Expected a finite VOD playlist')
    segs=[];dur=0.;prefix=[];pending=None;seq=0;disc=False
    for line in lines:
        if line.startswith('#EXT-X-MEDIA-SEQUENCE:'):seq=int(line.split(':',1)[1])
        elif line.startswith('#EXT-X-MAP:') or line.startswith('#EXT-X-KEY:'):
            # Encrypted or fMP4 sources require extra handling; never publish broken playlists.
            raise RuntimeError('Source uses EXT-X-KEY or EXT-X-MAP; cannot safely repackage as TS playlists')
        elif line.startswith('#EXT-X-BYTERANGE:'):raise RuntimeError('Byte-range source unsupported')
        elif line.startswith('#EXT-X-DISCONTINUITY'):disc=True
        elif line.startswith('#EXTINF:'):pending=float(line.split(':',1)[1].split(',')[0])
        elif not line.startswith('#') and pending is not None:
            if disc:raise RuntimeError('Source has discontinuity; manual repackaging required')
            segs.append((dur,dur+pending,pending,absolute(url,line)));dur+=pending;pending=None
    chapters=json.loads((ROOT/'data/movie-hp1-independent/course.json').read_text(encoding='utf-8'))['chapters']
    if len(chapters)!=34 or not segs:raise RuntimeError('Expected 34 chapters and nonempty media')
    if dur < chapters[-1]['end']-30:raise RuntimeError(f'Source too short: {dur:.1f}s')
    out=DATA/'hls';out.mkdir(parents=True,exist_ok=True)
    episodes=[]
    for c in chapters:
        start,end=float(c['start']),float(c['end'])
        first=next((i for i,x in enumerate(segs) if x[1]>start),None)
        last=next((i for i in range(len(segs)-1,-1,-1) if segs[i][0]<end),None)
        if first is None or last is None or last<first:raise RuntimeError(f'Invalid segment range: {c}')
        selected=segs[first:last+1]
        lines_out=['#EXTM3U','#EXT-X-VERSION:3','#EXT-X-PLAYLIST-TYPE:VOD',f'#EXT-X-TARGETDURATION:{math.ceil(max(x[2] for x in selected))}',f'#EXT-X-MEDIA-SEQUENCE:{seq+first}']
        for _,_,length,uri in selected:lines_out.extend([f'#EXTINF:{length:.6f},',uri])
        lines_out.append('#EXT-X-ENDLIST')
        name=f"{c['episodeId']:03d}.m3u8"
        (out/name).write_text('\n'.join(lines_out)+'\n',encoding='utf-8')
        episodes.append({'episodeId':c['episodeId'],'title':c['titleZh'],'titleZh':c['titleZh'],'summaryEn':c.get('summaryZh',''),'status':'published','sourceType':'hls','video':{'source':'hls','hlsUrl':f'data/movie-harry-potter-1/hls/{name}','duration':round(sum(x[2] for x in selected),3)},'modules':{'watch':True,'read':False,'words':False,'vocabulary':False,'quiz':False}})
    (DATA/'episodes.json').write_text(json.dumps(episodes,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(f'Generated {len(episodes)} independent HLS episodes from {len(segs)} TS segments ({dur:.1f}s)')
if __name__=='__main__':main()
