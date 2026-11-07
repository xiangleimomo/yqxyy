'use strict';

function parseVttTime(value){
  const s=String(value||'').trim().replace(',','.');
  const parts=s.split(':');
  if(parts.length!==2&&parts.length!==3)throw new Error('Invalid WebVTT timestamp: '+s);
  const seconds=Number(parts.pop());
  const minutes=Number(parts.pop());
  const hours=parts.length?Number(parts.pop()):0;
  if(!Number.isFinite(hours)||!Number.isFinite(minutes)||!Number.isFinite(seconds)||hours<0||minutes<0||minutes>=60||seconds<0||seconds>=60)throw new Error('Invalid WebVTT timestamp: '+s);
  return hours*3600+minutes*60+seconds;
}
function formatText(raw){return String(raw||'').replace(/\r/g,'').trim();}
function parseVtt(text,{fallbackOffset=0}={}){
  const raw=String(text||'').replace(/^\uFEFF/,'').replace(/\r\n/g,'\n').replace(/\r/g,'\n');
  if(!raw.trimStart().startsWith('WEBVTT'))throw new Error('Invalid WebVTT document');
  const map=raw.match(/X-TIMESTAMP-MAP\s*=\s*LOCAL:([^,\s]+)\s*,\s*MPEGTS:(\d+)/i);
  let offset=fallbackOffset;
  if(map){
    const local=parseVttTime(map[1]),mpegts=Number(map[2]);
    if(!Number.isFinite(mpegts)||mpegts<0)throw new Error('Invalid WebVTT MPEGTS timestamp map');
    offset=mpegts/90000-local;
    // MPEGTS is a 33-bit clock. Normalize a wrapped timestamp to the nearest
    // expected segment timeline when the segment offset is known.
    const wrap=(2**33)/90000;
    while(offset-fallbackOffset>wrap/2)offset-=wrap;
    while(fallbackOffset-offset>wrap/2)offset+=wrap;
  }
  const blocks=raw.split(/\n{2,}/);
  const cues=[];
  for(const block of blocks){
    const lines=block.split('\n').map(x=>x.trim()).filter(Boolean);
    if(!lines.length||/^WEBVTT\b/.test(lines[0])||/^(NOTE|STYLE|REGION)\b/.test(lines[0]))continue;
    const at=lines.findIndex(line=>line.includes('-->'));
    if(at<0)continue;
    const halves=lines[at].split('-->');
    if(halves.length!==2)throw new Error('Invalid WebVTT cue timing');
    const startToken=halves[0].trim().split(/\s+/)[0];
    const endToken=halves[1].trim().split(/\s+/)[0];
    const start=parseVttTime(startToken)+offset;
    const end=parseVttTime(endToken)+offset;
    const cue=lines.slice(at+1).join('\n').trim();
    if(!cue||end<=start)continue;
    cues.push({start,end,text:cue});
  }
  return cues;
}
function parseSubtitlePlaylist(text,baseUrl){
  const raw=String(text||'').replace(/^\uFEFF/,'');
  if(!raw.trimStart().startsWith('#EXTM3U'))throw new Error('Invalid subtitle media playlist');
  if(!raw.includes('#EXT-X-ENDLIST'))throw new Error('Live subtitle playlists are not accepted');
  if(/#EXT-X-(?:KEY|MAP|BYTERANGE|PART|SKIP|DEFINE)(?::|$)/m.test(raw))throw new Error('Encrypted, mapped, ranged, or low-latency subtitle playlists require a dedicated parser');
  const rows=[];let duration=null,at=0;
  for(const line0 of raw.split(/\r?\n/)){
    const line=line0.trim();if(!line)continue;
    if(line.startsWith('#EXTINF:')){
      duration=Number(line.slice(8).split(',')[0]);
      if(!Number.isFinite(duration)||duration<=0)throw new Error('Invalid subtitle segment duration');
    }else if(line&&!line.startsWith('#')){
      if(duration===null)throw new Error('Subtitle segment URI without EXTINF');
      const url=new URL(line,baseUrl);
      if(url.protocol!=='https:'||url.username||url.password)throw new Error('Unsafe subtitle segment URI');
      rows.push({url:url.href,start:at,duration});
      at+=duration;duration=null;
    }
  }
  if(duration!==null||!rows.length)throw new Error('Incomplete or empty subtitle playlist');
  return {segments:rows,duration:at};
}
async function fetchText(url,fetcher=fetch){
  const u=new URL(url);
  if(u.protocol!=='https:'||u.username||u.password)throw new Error('Subtitle URL must be HTTPS without credentials');
  const response=await fetcher(u.href,{headers:{Accept:'text/vtt,application/vnd.apple.mpegurl,*/*','User-Agent':'yqxyy-v2-course-engine/1.0'},redirect:'error',signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error('Subtitle fetch failed: HTTP '+response.status);
  const text=await response.text();
  if(text.length>20_000_000)throw new Error('Subtitle resource exceeds the safe size limit');
  return text;
}
async function acquireSubtitleTrack({url,fetcher=fetch,maxSegments=5000}){
  const first=await fetchText(url,fetcher);
  if(first.trimStart().startsWith('WEBVTT')){
    const cues=parseVtt(first);
    return validateSubtitleCues(cues,{sourceKind:'single-vtt',playlistDuration:null});
  }
  const playlist=parseSubtitlePlaylist(first,url);
  if(playlist.segments.length>maxSegments)throw new Error('Subtitle playlist exceeds the configured segment limit');
  const cues=[];
  // Sequential fetch is intentional: it preserves order and avoids burst
  // requests against public subtitle hosts.
  for(const segment of playlist.segments){
    const body=await fetchText(segment.url,fetcher);
    const rows=parseVtt(body,{fallbackOffset:segment.start});
    cues.push(...rows);
  }
  cues.sort((a,b)=>a.start-b.start||a.end-b.end);
  const unique=[];const seen=new Set();
  for(const cue of cues){
    const key=[cue.start.toFixed(3),cue.end.toFixed(3),cue.text].join('|');
    if(!seen.has(key)){seen.add(key);unique.push(cue);}
  }
  return validateSubtitleCues(unique,{sourceKind:'segmented-vtt',playlistDuration:playlist.duration});
}
function validateSubtitleCues(cues,meta={}){
  if(!Array.isArray(cues)||cues.length<2)throw new Error('English subtitle track is empty or incomplete');
  let last=-1;
  for(const [i,cue] of cues.entries()){
    if(!Number.isFinite(cue.start)||!Number.isFinite(cue.end)||cue.start<0||cue.end<=cue.start||cue.start+0.001<last||!formatText(cue.text))throw new Error('Invalid subtitle cue timeline at cue '+(i+1));
    last=cue.start;
  }
  if(meta.playlistDuration&&cues[cues.length-1].start>meta.playlistDuration+120)throw new Error('Subtitle timestamps exceed the subtitle playlist duration');
  return {cues,sourceKind:meta.sourceKind||'unknown',cueCount:cues.length,firstCueAt:cues[0].start,lastCueAt:cues[cues.length-1].end,playlistDuration:meta.playlistDuration||null};
}
module.exports={parseVttTime,parseVtt,parseSubtitlePlaylist,acquireSubtitleTrack,validateSubtitleCues};
