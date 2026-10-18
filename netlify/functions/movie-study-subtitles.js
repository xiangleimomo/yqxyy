'use strict';
const catalog=require('./lib/movie-study-catalog.cjs');
const crypto=require('node:crypto');
const {parseSrt,extractSrt,episodeVtt}=require('./lib/movie-study.cjs');
const cached=new Map(),pending=new Map();
const approved=new Set(['subf2m.co','isubcdn.com']);
async function download(alignment){
  let url=alignment.subtitleSource.download;
  for(let n=0;n<5;n++){
    const parsed=new URL(url);
    if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.port||!(approved.has(parsed.hostname)||/^subs\d*\.strem\.io$/.test(parsed.hostname)))throw new Error('Unexpected subtitle host');
    const response=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(12000),headers:{'User-Agent':'StoryFoxEnglish/1.0','Accept':'application/zip'}});
    if([301,302,303,307,308].includes(response.status)){await response.body?.cancel();url=new URL(response.headers.get('location'),url).href;continue;}
    if(!response.ok)throw new Error(`Subtitle upstream ${response.status}`);
    if(Number(response.headers.get('content-length'))>2*1024*1024)throw new Error('Subtitle archive too large');
    const reader=response.body.getReader(),parts=[];let size=0;
    try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2*1024*1024)throw new Error('Subtitle archive too large');parts.push(Buffer.from(value));}}finally{await reader.cancel().catch(()=>{});}
    const bytes=Buffer.concat(parts);
    const srt=alignment.subtitleSource.format==='srt'?bytes.toString('utf8'):extractSrt(bytes);
    const canonical=srt.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').trimEnd()+'\n';
    if(![srt,canonical].some(text=>crypto.createHash('sha256').update(text).digest('hex')===alignment.subtitleSha256))throw new Error('Subtitle release changed; review alignment');
    const cues=parseSrt(srt);
    if(cues.length<200||(alignment.subtitleCueCount&&cues.length!==alignment.subtitleCueCount))throw new Error('Subtitle release changed; review alignment');
    return cues;
  }
  throw new Error('Too many subtitle redirects');
}
async function getCues(alignment){
  const key=alignment.seriesId,old=cached.get(key);
  if(old&&old.expires>Date.now())return old.cues;
  if(!pending.has(key))pending.set(key,download(alignment).then(cues=>{
    if(cached.size>=8)cached.delete(cached.keys().next().value);
    cached.set(key,{cues,expires:Date.now()+3600000});return cues;
  }).finally(()=>{pending.delete(key);}));
  return pending.get(key);
}
exports.handler=async event=>{
  const headers={'Content-Type':'text/vtt; charset=utf-8','X-Content-Type-Options':'nosniff'};
  if(event.httpMethod!=='GET')return {statusCode:405,headers:{...headers,Allow:'GET'},body:''};
  const course=event.queryStringParameters?.course||'movie-harry-potter-1';
  const alignment=Object.hasOwn(catalog,course)?catalog[course]:null;
  const raw=event.queryStringParameters?.episode||'';
  const chapter=alignment&&/^[1-9]\d?$/.test(raw)&&alignment.chapters.find(c=>c.episodeId===Number(raw));
  if(!chapter)return {statusCode:404,headers,body:'WEBVTT\n\nNOTE Unknown episode\n'};
  try{
    const body=episodeVtt(await getCues(alignment),chapter,alignment.offsetSeconds,alignment.scale);
    return {statusCode:200,headers:{...headers,'Cache-Control':'public, max-age=3600, s-maxage=86400'},body};
  }catch(error){
    console.error('Movie subtitle service:',error.message);
    return {statusCode:503,headers:{...headers,'Cache-Control':'no-store','Retry-After':'60'},body:'WEBVTT\n\nNOTE Subtitles temporarily unavailable; retry later.\n'};
  }
};
