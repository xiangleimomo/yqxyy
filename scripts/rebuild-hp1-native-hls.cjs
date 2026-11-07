'use strict';
// Rebuild the 34 reviewed lessons without copying upstream movie media or keys.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const dir = path.resolve(__dirname, '../data/movie-harry-potter-1');
const round = n => Math.round(n * 1000000) / 1000000;
async function load(url) {
  const response = await fetch(url, {signal: AbortSignal.timeout(30000)});
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  const text = await response.text();
  assert(text.startsWith('#EXTM3U'), `Not HLS: ${url}`);
  return text;
}
function parse(text, url) {
  assert(text.includes('#EXT-X-ENDLIST'), 'Only complete VOD playlists are supported');
  assert(!/#EXT-X-(MAP|BYTERANGE|DISCONTINUITY)/.test(text), 'Review unsupported stream layout');
  let time = 0, duration, key;
  const sequence = Number(text.match(/#EXT-X-MEDIA-SEQUENCE:(\d+)/)?.[1] || 0);
  const rows = [];
  for (const line of text.split(/\r?\n/).map(s => s.trim())) {
    if (line.startsWith('#EXT-X-KEY:')) key = line.replace(/URI="([^"]+)"/, (_, uri) => `URI="${new URL(uri, url).href}"`);
    else if (line.startsWith('#EXTINF:')) duration = Number(line.slice(8).split(',')[0]);
    else if (line && !line.startsWith('#')) {
      assert(duration > 0, 'Missing segment duration');
      rows.push({start: time, end: time + duration, duration, key, uri: new URL(line, url).href, sequence: sequence + rows.length});
      time += duration;
      duration = undefined;
    }
  }
  return rows;
}
function playlist(rows, startOffset) {
  assert(rows.length, 'Empty lesson');
  const out = ['#EXTM3U', '#EXT-X-VERSION:3', '#EXT-X-PLAYLIST-TYPE:VOD',
    `#EXT-X-TARGETDURATION:${Math.ceil(Math.max(...rows.map(r => r.duration)))}`,
    `#EXT-X-MEDIA-SEQUENCE:${rows[0].sequence}`,
    `#EXT-X-START:TIME-OFFSET=${round(startOffset)},PRECISE=YES`];
  let key;
  for (const row of rows) {
    if (row.key !== key) {
      if (row.key) out.push(row.key);
      key = row.key;
    }
    out.push(`#EXTINF:${round(row.duration)},`, row.uri);
  }
  return out.concat('#EXT-X-ENDLIST', '').join('\n');
}
const seconds = value => value.split(':').reduce((a, b) => a * 60 + Number(b), 0);
function timestamp(value) {
  const ms = Math.max(0, Math.round(value * 1000));
  return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}.${String(ms % 1000).padStart(3, '0')}`;
}
async function main() {
  const file = path.join(dir, 'episodes.json');
  const episodes = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(episodes.length, 34);
  const source = episodes[0].video.originalHlsUrl || episodes[0].video.hlsUrl;
  const master = await load(source);
  const videoLine = master.split(/\r?\n/).find(line => line && !line.startsWith('#'));
  const audioLine = master.split(/\r?\n/).find(line => line.startsWith('#EXT-X-MEDIA:TYPE=AUDIO') && line.includes('DEFAULT=YES'));
  assert(videoLine && audioLine, 'Expected separate default audio and video');
  const videoUrl = new URL(videoLine, source).href;
  const audioUrl = new URL(audioLine.match(/URI="([^"]+)"/)[1], source).href;
  const [videoText, audioText] = await Promise.all([load(videoUrl), load(audioUrl)]);
  const video = parse(videoText, videoUrl), audio = parse(audioText, audioUrl);
  const stream = master.split(/\r?\n/).find(line => line.startsWith('#EXT-X-STREAM-INF:')).replace(/,SUBTITLES="[^"]+"/, '');
  // Read captions from THIS movie's own master.m3u8, not downloaded subtitle files.
  const subtitleLines=master.split(/\r?\n/).filter(line=>line.startsWith('#EXT-X-MEDIA:TYPE=SUBTITLES'));
  assert(subtitleLines.length,'Source master has no subtitles');
  const getAttr=(line,key)=>line.match(new RegExp('(?:^|,)'+key+'="([^"]*)"'))?.[1]||
    line.match(new RegExp('(?:^|,)'+key+'=([^,]+)'))?.[1]||'';
  const subtitles=subtitleLines.map(line=>({line,name:getAttr(line,'NAME'),language:getAttr(line,'LANGUAGE'),uri:getAttr(line,'URI')}));
  const english=subtitles.filter(t=>/^(en|eng)(-|$)/i.test(t.language)||/^English/i.test(t.name));
  assert(english.length,'No English subtitles in source M3U8');
  const englishTrack=english.find(t=>/\bCC\b/i.test(t.name))||english[0];
  const chineseTrack=subtitles.filter(t=>/^(zh|zho|chi)(-|$)/i.test(t.language)||/chinese|中文/i.test(t.name))
    .sort((a,b)=>Number(/simplified|简体|zh-cn|zh-hans/i.test(b.name+' '+b.language))-Number(/simplified|简体|zh-cn|zh-hans/i.test(a.name+' '+a.language)))[0]||null;
  const parseVtt=(text,shift=0)=>text.replace(/^\uFEFF/,'').split(/\r?\n\s*\r?\n/).flatMap(block=>{
    const lines=block.split(/\r?\n/),index=lines.findIndex(line=>line.includes(' --> '));
    if(index<0)return [];
    const m=lines[index].match(/^\s*((?:\d+:)?\d{1,2}:\d{2}\.\d{1,3})\s+-->\s+((?:\d+:)?\d{1,2}:\d{2}\.\d{1,3})(.*)$/);
    if(!m)return [];
    const start=seconds(m[1])+shift,end=seconds(m[2])+shift,text=lines.slice(index+1).join('\n').trim();
    return end>start&&text?[{start,end,settings:m[3],text}]:[];
  });
  const sourceSub=async track=>{
    if(!track?.uri)return null;
    const u=new URL(track.uri,source).href;
    const response=await fetch(u,{signal:AbortSignal.timeout(45000)});
    assert(response.ok,'Subtitle source HTTP '+response.status+' '+u);
    const body=await response.text();
    let cues=[];
    if(body.trimStart().startsWith('WEBVTT'))cues=parseVtt(body);
    else if(body.trimStart().startsWith('#EXTM3U')){
      let elapsed=0,duration=null;
      for(const line of body.split(/\r?\n/).map(v=>v.trim())){
        if(line.startsWith('#EXTINF:'))duration=Number(line.slice(8).split(',')[0]);
        else if(line&&!line.startsWith('#')){
          const vttUrl=new URL(line,u).href,partRes=await fetch(vttUrl,{signal:AbortSignal.timeout(45000)});
          assert(partRes.ok,'Subtitle segment HTTP '+partRes.status+' '+vttUrl);
          const partText=await partRes.text();
          const part=parseVtt(partText);
          const maxEnd=Math.max(0,...part.map(c=>c.end));
          const local=elapsed>0&&duration>0&&maxEnd<duration+5;
          cues.push(...part.map(c=>local?{...c,start:c.start+elapsed,end:c.end+elapsed}:c));
          elapsed+=duration||0;duration=null;
        }
      }
    }else throw Error('Source track is not WebVTT or HLS: '+u);
    const seen=new Set();
    cues=cues.sort((a,b)=>a.start-b.start).filter(c=>{
      const k=[Math.round(c.start*1000),Math.round(c.end*1000),c.text].join('|');
      if(seen.has(k))return false;seen.add(k);return true;
    });
    assert(cues.length,'Empty source subtitle '+u);
    return {url:u,cues,track};
  };
  const [englishSource,chineseSource]=await Promise.all([sourceSub(englishTrack),chineseTrack?sourceSub(chineseTrack):Promise.resolve(null)]);
  const cues=englishSource.cues,chineseCues=chineseSource?.cues||[];
  assert(cues[0].start>=0&&cues.at(-1).end>episodes.at(-1).video.originalStart-100,'Subtitle timeline not matching source movie');
  const fullPath=path.join(dir,'subtitles/full-film.en.vtt');
  const old=fs.readFileSync(fullPath,'utf8');
  assert(!cues[0].text.includes('Downloaded from RARBG'),'Unexpected nonnative subtitle');
  const encodeVtt=rows=>'WEBVTT\n\n'+rows.map(c=>timestamp(c.start)+' --> '+timestamp(c.end)+(c.settings||'')+'\n'+c.text+'\n').join('\n');
  fs.writeFileSync(fullPath,encodeVtt(cues));
  if(chineseCues.length)fs.writeFileSync(path.join(dir,'subtitles/full-film.zh.vtt'),encodeVtt(chineseCues));
  const matchingChinese=c=>{
    let winner=null,max=0;
    for(const z of chineseCues){
      if(z.end<c.start-2)continue;
      if(z.start>c.end+2)break;
      const overlap=Math.max(0,Math.min(c.end,z.end)-Math.max(c.start,z.start));
      const delta=Math.abs((z.start+z.end-c.start-c.end)/2);
      const score=overlap>0?overlap+0.1/(1+delta):delta<1.1?0.03/(1+delta):0;
      if(score>max){winner=z;max=score;}
    }
    return max>=0.12?winner:null;
  };
  fs.mkdirSync(path.join(dir, 'hls'), {recursive: true});
  const chapters = [];
  for (const episode of episodes) {
    const v = episode.video;
    const start = v.originalStart ?? v.clipStart, end = v.originalEnd ?? v.clipEnd;
    assert(end > start && end <= video.at(-1).end, 'Invalid chapter bounds');
    const videoRows = video.filter(r => r.end > start + 0.000001 && r.start < end - 0.000001);
    const base = videoRows[0].start;
    // Both renditions retain their original sequence numbers and MPEG-TS PTS.
    // Include the audio covering the complete selected video segment range.
    const audioRows = audio.filter(r => r.end > base + 0.000001 && r.start < videoRows.at(-1).end - 0.000001);
    const id = String(episode.episodeId).padStart(3, '0');
    fs.writeFileSync(path.join(dir, `hls/${id}.video.m3u8`), playlist(videoRows, start - base));
    fs.writeFileSync(path.join(dir, `hls/${id}.audio.m3u8`), playlist(audioRows, start - audioRows[0].start));
    fs.writeFileSync(path.join(dir, `hls/${id}.m3u8`), ['#EXTM3U', '#EXT-X-VERSION:3',
      `#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="English",LANGUAGE="eng",DEFAULT=YES,AUTOSELECT=YES,URI="${id}.audio.m3u8"`,
      stream, `${id}.video.m3u8`, ''].join('\n'));
    const selected = cues.filter(c => c.end > start && c.start < end);
    assert(selected.length, `No subtitles for chapter ${id}`);
    fs.writeFileSync(path.join(dir, `subtitles/${id}.vtt`), 'WEBVTT\n\n' + selected.map(c =>
      `${timestamp(Math.max(c.start, start) - base)} --> ${timestamp(Math.min(c.end, end) - base)}${c.settings}\n${c.text}\n`).join('\n'));
    if(chineseCues.length) {
      fs.writeFileSync(path.join(dir,'subtitles/'+id+'.en-zh.vtt'),'WEBVTT\n\n'+selected.map(c=>{
        const z=matchingChinese(c);
        const bilingualText=c.text+(z?.text&&!c.text.includes(z.text)?'\n'+z.text:'');
        return timestamp(Math.max(c.start,start)-base)+' --> '+timestamp(Math.min(c.end,end)-base)+(c.settings||'')+'\n'+bilingualText+'\n';
      }).join('\n'));
    }
    episode.subtitleTracks={english:'/data/movie-harry-potter-1/subtitles/'+id+'.vtt',englishChinese:chineseCues.length?'/data/movie-harry-potter-1/subtitles/'+id+'.en-zh.vtt':null,status:chineseCues.length?'native-english-cc-and-chinese':'native-english-cc'};
    Object.assign(v, {hlsUrl: `/data/movie-harry-potter-1/hls/${id}.m3u8`, originalHlsUrl: source,
      originalStart: start, originalEnd: end, timelineOrigin: round(base),
      clipStart: round(start - base), clipEnd: round(end - base), duration: round(end - start)});
    chapters.push({episodeId: episode.episodeId, start, end, timelineOrigin: round(base), firstVideoSegment: videoRows[0].sequence, videoSegments: videoRows.length, firstAudioSegment: audioRows[0].sequence, audioSegments: audioRows.length});
  }
  fs.writeFileSync(file, JSON.stringify(episodes, null, 2) + '\n');
  fs.writeFileSync(path.join(dir, 'hls/manifest.json'), JSON.stringify({source, chapters}, null, 2) + '\n');
  console.log('HP1_NATIVE_SOURCE_OK '+JSON.stringify({master:source,englishTrack:englishTrack.name,englishUrl:englishSource.url,englishCues:cues.length,englishFirst:cues[0].start,englishLast:cues.at(-1).end,chineseTrack:chineseTrack?.name||null,chineseCues:chineseCues.length,chapters:chapters.length,hadThirdPartyRARBG:old.includes('Downloaded from RARBG')}));
}
main().catch(error => {console.error(error); process.exitCode = 1;});
