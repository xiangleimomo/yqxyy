'use strict';
const fs=require('node:fs'),path=require('node:path');
const SOURCE='https://api.obj2.top/hls/movie/9502/master.m3u8';
const ROOT=path.join('data','movie-kung-fu-panda-1','.inspect');
fs.mkdirSync(ROOT,{recursive:true});
const url=(relative,parent)=>new URL(relative,parent).href;
async function get(u){
 const r=await fetch(u,{headers:{'user-agent':'Mozilla/5.0','accept':'*/*'},signal:AbortSignal.timeout(40000)});
 if(!r.ok)throw Error('HTTP '+r.status+' '+u);
 return r.text();
}
function attr(line){
 const o={},body=line.slice(line.indexOf(':')+1);
 for(const m of body.matchAll(/([A-Z0-9-]+)=("[^"]*"|[^,]*)/g))o[m[1]]=m[2].replace(/^"|"$/g,'');
 return o;
}
function medias(text,base){
 const ls=text.split(/\r?\n/),segs=[];let sec=0,n=null,seq=0,key='',sizes={};
 for(const line of ls){
 if(line.startsWith('#EXT-X-MEDIA-SEQUENCE:'))seq=Number(line.split(':')[1]);
 if(line.startsWith('#EXT-X-KEY:'))key=line;
 if(line.startsWith('#EXTINF:'))n=Number(line.slice(8).split(',')[0]);
 if(line&&!line.startsWith('#')&&n!==null){segs.push({seq:seq+segs.length,dur:n,at:sec,uri:url(line,base),key});sec+=n;n=null;}
 }
 return {total:sec,seq,segmentCount:segs.length,first:segs[0],last:segs[segs.length-1],version:text.match(/#EXT-X-VERSION:(\d+)/)?.[1],hasMap:text.includes('#EXT-X-MAP'),hasByteRange:text.includes('#EXT-X-BYTERANGE'),hasDiscontinuity:text.includes('#EXT-X-DISCONTINUITY'),raw:text};
}
async function subtitles(track){
 let u=url(track.URI,SOURCE),content=await get(u),files=[],offset=0;
 if(content.trimStart().startsWith('WEBVTT'))files=[{url:u,body:content,start:0}];
 else if(content.trimStart().startsWith('#EXTM3U')){
   let d=null;
   for(const line of content.split(/\r?\n/)){
     if(line.startsWith('#EXTINF:'))d=Number(line.slice(8).split(',')[0]);
     else if(line&&!line.startsWith('#')){
       const v=url(line,u),body=await get(v);
       files.push({url:v,body,start:offset});
       if(d!==null)offset+=d;d=null;
     }
   }
 }else throw Error('Unknown subtitle format '+u);
 return {indexUrl:u,index:content,files};
}
function write(name,txt){fs.writeFileSync(path.join(ROOT,name),txt);}
async function run(){
 const master=await get(SOURCE);if(!master.trimStart().startsWith('#EXTM3U'))throw Error('Invalid master');
 write('source-master.m3u8',master);
 const ls=master.split(/\r?\n/);
 const streams=[];
 for(let i=0;i<ls.length;i++)if(ls[i].startsWith('#EXT-X-STREAM-INF:')){
 const variant=ls.slice(i+1).find(x=>x.trim()&&!x.startsWith('#'));
 if(variant)streams.push({...attr(ls[i]),url:url(variant,SOURCE)});
 }
 const audio=ls.filter(x=>x.startsWith('#EXT-X-MEDIA:TYPE=AUDIO')).map(attr);
 const subtitlesTracks=ls.filter(x=>x.startsWith('#EXT-X-MEDIA:TYPE=SUBTITLES')).map(attr);
 const selected=streams.filter(x=>x.url).sort((a,b)=>Number(b.BANDWIDTH||0)-Number(a.BANDWIDTH||0))[0];
 if(!selected)throw Error('No video variant');
 const videoUrl=selected.url;
 const audioTrack=audio.find(a=>a['GROUP-ID']===selected.AUDIO&&a.DEFAULT==='YES')||audio.find(a=>a['GROUP-ID']===selected.AUDIO)||audio[0];
 const audioUrl=audioTrack?.URI?url(audioTrack.URI,SOURCE):null;
 const [vText,aText]=await Promise.all([get(videoUrl),audioUrl?get(audioUrl):Promise.resolve('')]);
 const vm=medias(vText,videoUrl),am=aText?medias(aText,audioUrl):null;
 write('video.m3u8',vText);
 if(aText)write('audio.m3u8',aText);
 const english=subtitlesTracks.filter(t=>/^(en|eng)(-|$)/i.test(t.LANGUAGE||'')||/^english/i.test(t.NAME||''));
 const chinese=subtitlesTracks.filter(t=>/^(zh|chi|zho)(-|$)/i.test(t.LANGUAGE||'')||/chinese|中文|简体|繁體/i.test(t.NAME||''));
 let englishTrack=english.find(t=>!/\bCC\b/i.test(t.NAME||''))||english[0];
 let chineseTrack=chinese.find(t=>/simplified|简体|zh-cn|zh-hans/i.test(t.NAME+' '+t.LANGUAGE))||chinese[0];
 let en=null,zh=null;
 if(englishTrack){en=await subtitles(englishTrack);write('english-index.txt',en.index);for(let i=0;i<en.files.length;i++)write('english-'+String(i+1).padStart(3,'0')+'.vtt',en.files[i].body);}
 if(chineseTrack){zh=await subtitles(chineseTrack);write('chinese-index.txt',zh.index);for(let i=0;i<zh.files.length;i++)write('chinese-'+String(i+1).padStart(3,'0')+'.vtt',zh.files[i].body);}
 const report={
 source:SOURCE,videoVariants:streams,selectedVideo:videoUrl,selectedAudio:audioUrl,
 selectedAudioTrack:audioTrack||null,selectedEnglishTrack:englishTrack||null,selectedChineseTrack:chineseTrack||null,
 allSubtitles:subtitlesTracks,video:{...vm,raw:undefined},audio:am?{...am,raw:undefined}:null,
 enFiles:en?.files.map(x=>({url:x.url,start:x.start,bytes:x.body.length}))||[],
 zhFiles:zh?.files.map(x=>({url:x.url,start:x.start,bytes:x.body.length}))||[],
 target:'Kung Fu Panda (2008)',inspected:new Date().toISOString()
 };
 write('report.json',JSON.stringify(report,null,2)+'\n');
 console.log('INSPECTION '+JSON.stringify({videoSeconds:vm.total,videoSegments:vm.segmentCount,audioSeconds:am?.total,subtitleTracks:subtitlesTracks.length,enFiles:en?.files.length||0,zhFiles:zh?.files.length||0,videoUrl}));
}
run().catch(e=>{console.error(e);process.exitCode=1});
