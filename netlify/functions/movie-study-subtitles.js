'use strict';
const alignment=require('../../data/movie-harry-potter-1/alignment.json');
const crypto=require('node:crypto');
const {parseSrt,extractSrt,episodeVtt}=require('./lib/movie-study.cjs');
let cached=null,pending=null;
const approved=new Set(['subf2m.co','isubcdn.com']);
async function download(){
  let url=alignment.subtitleSource.download;
  for(let n=0;n<5;n++){
    const parsed=new URL(url);
    if(parsed.protocol!=='https:'||!approved.has(parsed.hostname))throw new Error('Unexpected subtitle host');
    const response=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(12000),headers:{'User-Agent':'StoryFoxEnglish/1.0','Accept':'application/zip'}});
    if([301,302,303,307,308].includes(response.status)){await response.body?.cancel();url=new URL(response.headers.get('location'),url).href;continue;}
    if(!response.ok)throw new Error(`Subtitle upstream ${response.status}`);
    if(Number(response.headers.get('content-length'))>2*1024*1024)throw new Error('Subtitle archive too large');
    const reader=response.body.getReader(),parts=[];let size=0;
    try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2*1024*1024)throw new Error('Subtitle archive too large');parts.push(Buffer.from(value));}}finally{await reader.cancel().catch(()=>{});}
    const srt=extractSrt(Buffer.concat(parts));
    if(crypto.createHash('sha256').update(srt).digest('hex')!==alignment.subtitleSha256)throw new Error('Subtitle release changed; review alignment');
    const cues=parseSrt(srt);
    if(cues.length<1000||Math.abs(cues.at(-1).end-8993.773)>2)throw new Error('Subtitle release changed; review alignment');
    return cues;
  }
  throw new Error('Too many subtitle redirects');
}
async function getCues(){
  if(cached&&cached.expires>Date.now())return cached.cues;
  if(!pending)pending=download().then(cues=>{cached={cues,expires:Date.now()+3600000};return cues;}).finally(()=>{pending=null;});
  return pending;
}
exports.handler=async event=>{
  const headers={'Content-Type':'text/vtt; charset=utf-8','X-Content-Type-Options':'nosniff'};
  if(event.httpMethod!=='GET')return {statusCode:405,headers:{...headers,Allow:'GET'},body:''};
  const raw=event.queryStringParameters?.episode||'';
  const chapter=/^[1-9]\d?$/.test(raw)&&alignment.chapters.find(c=>c.episodeId===Number(raw));
  if(!chapter)return {statusCode:404,headers,body:'WEBVTT\n\nNOTE Unknown episode\n'};
  try{
    const body=episodeVtt(await getCues(),chapter,alignment.offsetSeconds,alignment.scale);
    return {statusCode:200,headers:{...headers,'Cache-Control':'public, max-age=3600, s-maxage=86400'},body};
  }catch(error){
    console.error('Movie subtitle service:',error.message);
    return {statusCode:503,headers:{...headers,'Cache-Control':'no-store','Retry-After':'60'},body:'WEBVTT\n\nNOTE Subtitles temporarily unavailable; retry later.\n'};
  }
};
