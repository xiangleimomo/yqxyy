'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ROOT = process.cwd();
const DIR = path.join(ROOT, 'data/movie-harry-potter-4');
const SOURCE = 'https://api.obj2.top/hls/movie/674/master.m3u8';
const round = n => Math.round(n * 1000000) / 1000000;
const lines = s => s.replace(/^\uFEFF/, '').split(/\r?\n/).map(x => x.trim());
async function fetchText(url) {
  const r = await fetch(url, {headers:{'user-agent':'Mozilla/5.0 (compatible; yqxyy-course-builder/1.0)','accept':'*/*'},signal:AbortSignal.timeout(45000)});
  if (!r.ok) throw new Error('HTTP ' + r.status + ' while fetching ' + url);
  const body = await r.text();
  if (/^\s*<!doctype html|^\s*<html/i.test(body)) throw new Error('HTML response instead of media text: ' + url);
  return body;
}
async function fetchM3u8(url) {
  const body = await fetchText(url);
  assert(body.trimStart().startsWith('#EXTM3U'), 'Not an HLS playlist: ' + url);
  return body;
}
function attributes(line) {
  const out = {};
  const body = line.slice(line.indexOf(':') + 1);
  for (const m of body.matchAll(/([A-Z0-9-]+)=("[^"]*"|[^,]*)/g)) out[m[1]] = m[2].replace(/^"|"$/g, '');
  return out;
}
function parseMedia(text, url) {
  assert(text.includes('#EXT-X-ENDLIST'), 'Only complete VOD playlists are supported: ' + url);
  assert(!/#EXT-X-(MAP|BYTERANGE|DISCONTINUITY)(:|$)/.test(text), 'Unsupported HLS layout in ' + url);
  let time = 0, duration, key;
  const sequence = Number(text.match(/#EXT-X-MEDIA-SEQUENCE:(\d+)/)?.[1] || 0);
  const rows = [];
  for (const line of lines(text)) {
    if (line.startsWith('#EXT-X-KEY:')) {
      key = line.replace(/URI="([^"]+)"/, (_, uri) => 'URI="' + new URL(uri, url).href + '"');
    } else if (line.startsWith('#EXTINF:')) {
      duration = Number(line.slice(8).split(',')[0]);
    } else if (line && !line.startsWith('#')) {
      assert(Number.isFinite(duration) && duration > 0, 'Missing EXTINF before segment in ' + url);
      rows.push({start:time,end:time+duration,duration,key,uri:new URL(line,url).href,sequence:sequence+rows.length});
      time += duration;
      duration = undefined;
    }
  }
  assert(rows.length, 'No media segments found in ' + url);
  return rows;
}
function parseIndex(text, url) {
  const rows=[]; let duration;
  for (const line of lines(text)) {
    if (line.startsWith('#EXTINF:')) duration=Number(line.slice(8).split(',')[0]);
    else if (line && !line.startsWith('#')) {
      rows.push({duration:Number.isFinite(duration)?duration:0,uri:new URL(line,url).href});
      duration=undefined;
    }
  }
  return rows;
}
function parseTime(value) {
  const p=value.split(':').map(Number);
  const sec=p.pop();
  if (p.length===1) return p[0]*60+sec;
  if (p.length===2) return p[0]*3600+p[1]*60+sec;
  throw new Error('Unsupported VTT time: '+value);
}
function parseVtt(text, fallbackOffset=0) {
  const clean=text.replace(/^\uFEFF/,'');
  const map=clean.match(/X-TIMESTAMP-MAP=.*?LOCAL:([^,\s]+).*?MPEGTS:(\d+)/i);
  let offset=fallbackOffset;
  if(map) offset=Number(map[2])/90000-parseTime(map[1]);
  const blocks=clean.split(/\r?\n\s*\r?\n/);
  const cues=[];
  for(const block of blocks){
    const ls=block.split(/\r?\n/);
    const i=ls.findIndex(x=>x.includes(' --> '));
    if(i<0) continue;
    const m=ls[i].match(/^((?:\d{1,2}:)?\d{1,2}:\d{2}(?:\.\d{1,3})?)\s+-->\s+((?:\d{1,2}:)?\d{1,2}:\d{2}(?:\.\d{1,3})?)(.*)$/);
    if(!m) continue;
    const start=parseTime(m[1])+offset,end=parseTime(m[2])+offset;
    const cueText=ls.slice(i+1).join('\n').trim();
    if(end>start&&cueText) cues.push({start,end,settings:m[3]||'',text:cueText});
  }
  return cues;
}
function formatTime(value) {
  const ms=Math.max(0,Math.round(value*1000));
  return String(Math.floor(ms/3600000)).padStart(2,'0')+':'+
    String(Math.floor(ms/60000)%60).padStart(2,'0')+':'+
    String(Math.floor(ms/1000)%60).padStart(2,'0')+'.'+
    String(ms%1000).padStart(3,'0');
}
async function getEnglishCues(masterText) {
  const subLines=lines(masterText).filter(x=>x.startsWith('#EXT-X-MEDIA:TYPE=SUBTITLES'));
  assert(subLines.length,'No subtitle tracks in source master');
  const parsed=subLines.map(line=>({line,attr:attributes(line)}));
  const english=parsed.filter(x=>/^(en|eng)(-|$)/i.test(x.attr.LANGUAGE||'')||/^english/i.test(x.attr.NAME||''));
  assert(english.length,'No English subtitle track in source master');
  const selected=english.find(x=>!/cc/i.test(x.attr.NAME||''))||english[0];
  assert(selected.attr.URI,'English subtitle track has no URI');
  const subUrl=new URL(selected.attr.URI,SOURCE).href;
  const subBody=await fetchText(subUrl);
  let cues=[];
  if(subBody.trimStart().startsWith('WEBVTT')){
    cues=parseVtt(subBody,0);
  }else{
    assert(subBody.trimStart().startsWith('#EXTM3U'),'English subtitle URI is neither VTT nor M3U8');
    const vttRows=parseIndex(subBody,subUrl);
    assert(vttRows.length,'English subtitle playlist contains no VTT segments');
    let offset=0;
    for(const row of vttRows){
      const vtt=await fetchText(row.uri);
      const part=parseVtt(vtt,offset);
      cues.push(...part);
      const maxEnd=part.reduce((m,c)=>Math.max(m,c.end-offset),0);
      if(row.duration>0 && maxEnd<=row.duration+5) offset+=row.duration;
      else if(row.duration>0 && vttRows.length>1 && !/X-TIMESTAMP-MAP/i.test(vtt)) offset+=row.duration;
    }
  }
  const soundOnly=text=>{const parts=text.split(/\\r?\\n/).map(x=>x.trim()).filter(Boolean);return parts.length>0&&parts.every(x=>/^\\[[^\\]]+\\]$/.test(x));};
  const seen=new Set();
  cues=cues.filter(c=>!soundOnly(c.text)).sort((a,b)=>a.start-b.start).filter(c=>{
    const key=[round(c.start),round(c.end),c.text].join('|');
    if(seen.has(key))return false;seen.add(key);return true;
  });
  assert(cues.length>0,'English subtitle track yielded no cues');
  return {cues,track:selected.attr,playlistUrl:subUrl};
}
function playlist(rows,startOffset) {
  assert(rows.length,'Empty lesson playlist');
  const out=['#EXTM3U','#EXT-X-VERSION:3','#EXT-X-PLAYLIST-TYPE:VOD',
    '#EXT-X-TARGETDURATION:'+Math.ceil(Math.max(...rows.map(r=>r.duration))),
    '#EXT-X-MEDIA-SEQUENCE:'+rows[0].sequence,
    '#EXT-X-START:TIME-OFFSET='+round(startOffset)+',PRECISE=YES'];
  let key;
  for(const row of rows){
    if(row.key!==key){if(row.key)out.push(row.key);key=row.key;}
    out.push('#EXTINF:'+round(row.duration)+',',row.uri);
  }
  return out.concat('#EXT-X-ENDLIST','').join('\n');
}
async function main(){
  const episodesPath=path.join(DIR,'episodes.json');
  const episodes=JSON.parse(fs.readFileSync(episodesPath,'utf8'));
  assert.equal(episodes.length,20,'Expected 20 reviewed story episodes');
  const masterText=await fetchM3u8(SOURCE), masterLines=lines(masterText);
  const streamIndex=masterLines.findIndex(x=>x.startsWith('#EXT-X-STREAM-INF:'));
  assert(streamIndex>=0,'No video variant in master');
  const streamAttrs=attributes(masterLines[streamIndex]);
  const videoLine=masterLines.slice(streamIndex+1).find(x=>x&&!x.startsWith('#'));
  assert(videoLine,'No video media URI in master');
  const audioLines=masterLines.filter(x=>x.startsWith('#EXT-X-MEDIA:TYPE=AUDIO'));
  assert(audioLines.length,'No separate audio track in master');
  const audioParsed=audioLines.map(line=>({line,attr:attributes(line)}));
  const audio=audioParsed.find(x=>(x.attr.DEFAULT||'').toUpperCase()==='YES'&&/^(en|eng)(-|$)/i.test(x.attr.LANGUAGE||''))||
    audioParsed.find(x=>(x.attr.DEFAULT||'').toUpperCase()==='YES')||audioParsed[0];
  assert(audio.attr.URI,'Selected audio track has no URI');
  const videoUrl=new URL(videoLine,SOURCE).href,audioUrl=new URL(audio.attr.URI,SOURCE).href;
  const [videoText,audioText,subtitleData]=await Promise.all([
    fetchM3u8(videoUrl),fetchM3u8(audioUrl),getEnglishCues(masterText)
  ]);
  const video=parseMedia(videoText,videoUrl),audioRows=parseMedia(audioText,audioUrl);
  const fullVtt='WEBVTT\n\n'+subtitleData.cues.map(c=>formatTime(c.start)+' --> '+formatTime(c.end)+c.settings+'\n'+c.text+'\n').join('\n');
  const subtitleDir=path.join(DIR,'subtitles'),hlsDir=path.join(DIR,'hls');
  fs.mkdirSync(subtitleDir,{recursive:true});fs.mkdirSync(hlsDir,{recursive:true});
  fs.writeFileSync(path.join(subtitleDir,'full-film.en.vtt'),fullVtt);
  const chapters=[];
  for(const ep of episodes){
    const v=ep.video,start=Number(v.originalStart),end=Number(v.originalEnd);
    assert(Number.isFinite(start)&&Number.isFinite(end)&&end>start,'Invalid original chapter boundary for '+ep.episodeId);
    const videoRows=video.filter(r=>r.end>start+0.000001&&r.start<end-0.000001);
    assert(videoRows.length,'No video segments overlap episode '+ep.episodeId);
    const base=videoRows[0].start,videoEnd=videoRows[videoRows.length-1].end;
    const selectedAudio=audioRows.filter(r=>r.end>base+0.000001&&r.start<videoEnd-0.000001);
    assert(selectedAudio.length,'No audio segments overlap episode '+ep.episodeId);
    const id=String(ep.episodeId).padStart(3,'0');
    const audioGroup=streamAttrs.AUDIO||'aud';
    const streamLine=masterLines[streamIndex].replace(/,SUBTITLES="[^"]+"/,'').replace(/AUDIO="[^"]+"/,'AUDIO="'+audioGroup+'"');
    fs.writeFileSync(path.join(hlsDir,id+'.video.m3u8'),playlist(videoRows,start-base));
    fs.writeFileSync(path.join(hlsDir,id+'.audio.m3u8'),playlist(selectedAudio,start-selectedAudio[0].start));
    fs.writeFileSync(path.join(hlsDir,id+'.m3u8'),[
      '#EXTM3U','#EXT-X-VERSION:3',
      '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="'+audioGroup+'",NAME="English",LANGUAGE="eng",DEFAULT=YES,AUTOSELECT=YES,URI="'+id+'.audio.m3u8"',
      streamLine,id+'.video.m3u8',''
    ].join('\n'));
    const selectedCues=subtitleData.cues.filter(c=>c.end>start&&c.start<end);
    const localCues=selectedCues.map(c=>({
      start:Math.max(c.start,start)-base,
      end:Math.min(c.end,end)-base,
      settings:c.settings,text:c.text
    })).filter(c=>c.end>c.start);
    fs.writeFileSync(path.join(subtitleDir,id+'.en.vtt'),'WEBVTT\n\n'+localCues.map(c=>formatTime(c.start)+' --> '+formatTime(c.end)+c.settings+'\n'+c.text+'\n').join('\n'));
    v.source='hls';v.hlsUrl='/data/movie-harry-potter-4/hls/'+id+'.m3u8';
    v.subtitleUrl='/data/movie-harry-potter-4/subtitles/'+id+'.en.vtt';
    v.originalHlsUrl=SOURCE;v.timelineOrigin=round(base);v.clipStart=round(start-base);v.clipEnd=round(end-base);v.duration=round(end-start);
    ep.status='published';ep.sourceType='hls';
    ep.subtitleTracks={english:v.subtitleUrl,englishChinese:null,status:'english-ready; chinese-translation-pending'};
    ep.modules=Object.assign({watch:true,read:false,words:true,vocabulary:true,quiz:true},ep.modules||{});
    chapters.push({episodeId:ep.episodeId,start,end,timelineOrigin:round(base),clipStart:round(start-base),clipEnd:round(end-base),videoSegments:videoRows.length,audioSegments:selectedAudio.length,subtitleCues:localCues.length});
  }
  fs.writeFileSync(episodesPath,JSON.stringify(episodes,null,2)+'\n');
  const seriesPath=path.join(DIR,'series.json');
  const series=JSON.parse(fs.readFileSync(seriesPath,'utf8'));
  series.status='completed';series.totalEpisodes=episodes.length;series.quizStatus='ready';
  series.description='20 个剧情章节，配有英文字幕、Words 和剧情理解 Quiz；中英双语字幕后续补充。';
  fs.writeFileSync(seriesPath,JSON.stringify(series,null,2)+'\n');
  const moviesPath=path.join(ROOT,'data/movies/harry-potter/movies.json');
  const movieData=JSON.parse(fs.readFileSync(moviesPath,'utf8'));
  const hp4=movieData.sources.find(x=>x.id==='harry-potter-goblet-of-fire');
  assert(hp4,'Harry Potter 4 movie metadata not found');
  hp4.studyCourse={seriesId:'movie-harry-potter-4',episodeCount:episodes.length};
  fs.writeFileSync(moviesPath,JSON.stringify(movieData,null,2)+'\n');
  fs.writeFileSync(path.join(hlsDir,'manifest.json'),JSON.stringify({source:SOURCE,videoUrl,audioUrl,subtitle:subtitleData.track,subtitlePlaylistUrl:subtitleData.playlistUrl,sourceVideoDuration:video[video.length-1].end,chapters},null,2)+'\n');
  console.log('Generated 20 episode masters, 40 media playlists, 20 English VTTs; published course metadata and movie-series mapping.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
