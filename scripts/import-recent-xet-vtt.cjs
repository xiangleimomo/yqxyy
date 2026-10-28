#!/usr/bin/env node
/* Scoped subtitle audit. Credentials stay in environment; exports contain no
 * cookies or passwords. Any video candidate is a public fixed-CDN URL. Raw XET timing is never spread over Read.
 * Run: node scripts/import-recent-xet-vtt.cjs [--output-dir=subtitle-review]
 */
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),base='http://xet.bolinzhiyin.cn';
const option=process.argv.slice(2);if(option.some(a=>a!=='--apply'&&!a.startsWith('--manifest=')&&!a.startsWith('--lesson=')&&!a.startsWith('--output-dir=')))throw Error('Unknown option');
const out=path.resolve(option.find(a=>a.startsWith('--output-dir='))?.slice(13)||'subtitle-review');
const clean=s=>String(s||'').replace(/\[n@/g,' ').replace(/\[(?:i|b|u)@|@(?:i|b|u)\]/gi,'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().replace(/^\[caption_out@(?:\])?$/i,'');
const norm=s=>clean(s).toLowerCase().replace(/[‘’]/g,"'").replace(/[^\p{L}\p{N}]+/gu,'');
const stamp=n=>{const h=Math.floor(n/3600000),m=Math.floor(n%3600000/60000),s=Math.floor(n%60000/1000);return [h,m,s].map(x=>String(x).padStart(2,'0')).join(':')+'.'+String(n%1000).padStart(3,'0');};
function vtt(cues){return 'WEBVTT\n\n'+cues.map((c,i)=>`${i+1}\n${stamp(c.startMs)} --> ${stamp(c.endMs)}\n${c.text}\n`).join('\n');}
let cookie='';
async function fetchSafe(url,options){let last;for(let attempt=0;attempt<3;attempt++){try{return await fetch(url,options);}catch(e){last=e;await new Promise(r=>setTimeout(r,800*(attempt+1)));}}throw Error('Network request failed at '+new URL(url).hostname+': '+last.message);}
async function request(target,options={}){
 const url=new URL(target,base);if(url.origin!==base)throw Error('Unexpected authentication redirect origin');
 const r=await fetchSafe(url,{...options,redirect:'manual',signal:AbortSignal.timeout(30000),headers:{...options.headers,...(cookie?{cookie}:{})}});
 const cookies=new Map(cookie.split('; ').filter(Boolean).map(x=>{const at=x.indexOf('=');return [x.slice(0,at),x.slice(at+1)];}));
 for(const v of r.headers.getSetCookie()){const kv=v.split(';')[0],at=kv.indexOf('=');cookies.set(kv.slice(0,at),kv.slice(at+1));}cookie=[...cookies].map(([k,v])=>k+'='+v).join('; ');
 if(r.status>=300&&r.status<400)return request(new URL(r.headers.get('location'),url));
 if(!r.ok)throw Error('XET HTTP '+r.status+' at '+url.pathname);return r;
}
async function duration(url){
 for(let depth=0;depth<3;depth++){
  const u=new URL(url);if(u.hostname!=='cdn.littlefox.co.kr'||u.protocol!=='https:')throw Error('Unexpected video playlist host');
  const r=await fetchSafe(u,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Video playlist HTTP '+r.status);
  const text=await r.text();if(!text.startsWith('#EXTM3U'))throw Error('Video response is not HLS');
  const parts=[...text.matchAll(/#EXTINF:([\d.]+)/g)].map(x=>Number(x[1]));if(parts.length)return {durationMs:Math.round(parts.reduce((a,b)=>a+b,0)*1000),segmentCount:parts.length,segmentsMs:parts.map(x=>x*1000),timelineHash:crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex')};
  const child=text.split(/\r?\n/).find(x=>x.trim()&&!x.startsWith('#'));if(!child)throw Error('Empty HLS');url=new URL(child.trim(),u).href;
 }throw Error('Nested HLS limit');
}
async function official(contentId){
 const r=await fetchSafe('https://www.littlefox.com/hk/supplement/org/'+contentId,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Official Read HTTP '+r.status);
 const html=await r.text(),box=html.match(/<div class="original_cont_box">([\s\S]*?)<div class="original_cont_box2"/i)?.[1]||'';
 const decode=s=>clean(s.replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'"));
 const paragraphs=[...box.matchAll(/<div class='talk'><span>([\s\S]*?)<\/span><\/div>/gi)].map(x=>decode(x[1]));if(!paragraphs.length)throw Error('Official Read is empty');return paragraphs;
}
async function main(){
 if(!process.env.XET_ACCOUNT||!process.env.XET_PASSWORD)throw Error('XET environment credentials required');
 const landingResponse=await request('/login_check.php',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({account:process.env.XET_ACCOUNT,password:process.env.XET_PASSWORD}).toString()});
 const catalog=await(await request('/fox05.php')).text();if(catalog.includes('<title>登录'))throw Error('XET login failed');
 const cards=[...catalog.matchAll(/location\.href='xhl_play\.php\?fs_id=([A-Z0-9]+)'[\s\S]*?<div class="card-title">([\s\S]*?)<\/div>/g)];
 const three=cards.find(x=>clean(x[2])==='Romance of the Three Kingdoms')?.[1];if(!three)throw Error('Three Kingdoms series ID not found; catalogue title: '+(catalog.match(/<title>(.*?)<\/title>/s)?.[1]||'')+'; links: '+[...catalog.matchAll(/href=["']([^"']+)/g)].map(x=>x[1]).filter(x=>/^[a-z_0-9]+\.php/i.test(x)).slice(0,20).join(', '));
 const bank=JSON.parse(await fs.readFile(path.join(root,'scripts/quiz-revisions/2026-10-23.json'),'utf8'));
 const requested=option.filter(a=>a.startsWith('--lesson=')).map(a=>{const [seriesId,n]=a.slice(9).split(':');const episodeId=Number(n);if(!/^[a-z0-9-]+$/.test(seriesId)||!Number.isInteger(episodeId)||episodeId<1)throw Error('Invalid lesson selector');return {seriesId,episodeId};});
 const manifestArg=option.find(a=>a.startsWith('--manifest='))?.slice(11);
 const selected=manifestArg?JSON.parse(await fs.readFile(path.resolve(manifestArg),'utf8')).lessons:requested.length?requested:bank.lessons.map(({seriesId,episodeId})=>({seriesId,episodeId}));if(!manifestArg&&!requested.length)selected.push({seriesId:'little-fox-daisy-dolittle-fs0175',episodeId:35});
 for(const row of selected)if(!/^[a-z0-9-]+$/.test(row.seriesId)||!Number.isInteger(row.episodeId)||row.episodeId<1)throw Error('Invalid manifest selector');
 const playlistCache=new Map();
 const report={source:'XET timed subtitles and Little Fox official public Read',lessons:[],failures:[]};
 for(const item of selected){try{
  const dir=path.join(root,'data',item.seriesId),episodes=JSON.parse(await fs.readFile(path.join(dir,'episodes.json'),'utf8')),ep=episodes.find(e=>e.episodeId===item.episodeId);
  if(!ep?.sourceContentId)throw Error('Missing content ID');
  const fsId=item.seriesId==='three-kingdoms'?three:item.seriesId.match(/(fs\d+)$/i)[1].toUpperCase();
  if(!playlistCache.has(fsId)){const page=await(await request('/xhl_play.php?fs_id='+fsId)).text();playlistCache.set(fsId,JSON.parse(page.match(/var PLAYLIST\s*=\s*(\[[\s\S]*?\]);\s*\nvar COURSE_TITLE/)[1]));}
  const playlist=playlistCache.get(fsId);
  const remote=playlist.find(e=>e.fc_id===ep.sourceContentId);if(!remote||norm(remote.title)!==norm(ep.title))throw Error('Episode identity/title mismatch for '+item.seriesId+'/'+item.episodeId);
  const detail=await(await request('/xhl_play.php?ajax=episode&fc_id='+ep.sourceContentId+'&fs_id='+fsId)).json();
  const cues=(detail.subtitle||remote.subtitle||[]).map(c=>({startMs:Number(c.start_ms),endMs:Number(c.end_ms),text:clean(c.text)})).filter(c=>c.text);
  if(!cues.length)throw Error('No XET cues for '+ep.sourceContentId);
  for(let i=0;i<cues.length;i++){const c=cues[i];if(!Number.isInteger(c.startMs)||!Number.isInteger(c.endMs)||c.startMs<0||c.endMs<=c.startMs||!c.text||i&&c.startMs<cues[i-1].startMs)throw Error('Invalid cue '+i+' for '+ep.sourceContentId);}
  const published=ep.video.hlsUrl,remoteUrl=detail.video_url||remote.video_url||remote.url;
  const sameVideoPath=!!remoteUrl&&new URL(published).pathname===new URL(remoteUrl).pathname;
  const [videoInfo,publicParagraphs]=await Promise.all([duration(published),official(ep.sourceContentId)]);
  const videoDurationMs=videoInfo.durationMs,remoteInfo=sameVideoPath?videoInfo:await duration(remoteUrl);
  let publishedBoundary=0,remoteBoundary=0,maxBoundaryDriftMs=0;
  if(videoInfo.segmentCount===remoteInfo.segmentCount)for(let n=0;n<videoInfo.segmentCount;n++){publishedBoundary+=videoInfo.segmentsMs[n];remoteBoundary+=remoteInfo.segmentsMs[n];maxBoundaryDriftMs=Math.max(maxBoundaryDriftMs,Math.abs(publishedBoundary-remoteBoundary));}
  else maxBoundaryDriftMs=null;
  const timelineMatchesRemote=videoInfo.timelineHash===remoteInfo.timelineHash||(maxBoundaryDriftMs!==null&&maxBoundaryDriftMs<=42);
  if(!timelineMatchesRemote&&option.includes('--apply'))throw Error('Published/XET video timeline mismatch requires review: '+ep.sourceContentId);
  if(option.includes('--apply')&&cues.at(-1).endMs>videoDurationMs+250)throw Error('Subtitle exceeds published video for '+ep.sourceContentId);
  const reading=JSON.parse(await fs.readFile(path.join(dir,'reading-lessons.json'),'utf8'))[String(item.episodeId)];
  const localRead=reading?.paragraphs?.map(p=>p.text||p).join(' ')||'',sourceText=cues.map(c=>c.text).join(' '),officialText=publicParagraphs.join(' ');
  const row={...item,sourceContentId:ep.sourceContentId,title:ep.title,cueCount:cues.length,firstMs:cues[0].startMs,lastMs:cues.at(-1).endMs,endsAfterVideoMs:Math.max(0,cues.at(-1).endMs-videoDurationMs),videoDurationMs,sameVideoPath,timelineMatchesRemote,maxBoundaryDriftMs:maxBoundaryDriftMs===null?null:Math.round(maxBoundaryDriftMs*1000)/1000,remoteVideoDurationMs:remoteInfo.durationMs,remoteSegmentCount:remoteInfo.segmentCount,segmentCount:videoInfo.segmentCount,timelineHash:videoInfo.timelineHash,readMatchesOfficial:norm(localRead)===norm(officialText),subtitleMatchesRead:norm(sourceText)===norm(localRead),subtitleMatchesOfficial:norm(sourceText)===norm(officialText),overlaps:cues.flatMap((c,i)=>i&&c.startMs<cues[i-1].endMs?[i+1]:[]),fastCues:cues.flatMap((c,i)=>c.text.length/((c.endMs-c.startMs)/1000)>35?[i+1]:[]),localRead,officialParagraphs:publicParagraphs};
  if(option.includes('--apply')&&(!row.readMatchesOfficial||!row.subtitleMatchesOfficial))throw Error('Read/subtitle wording mismatch requires review: '+ep.sourceContentId);
  if(!sameVideoPath){const candidate=new URL(remoteUrl);candidate.search='';row.reviewVideoCandidate=candidate.href;}
  row.detailTimingFields=Object.fromEntries(Object.entries(detail).filter(([k,v])=>/offset|delay|intro|duration|time/i.test(k)&&typeof v==='number'));
  report.lessons.push(row);
  const target=path.join(out,'data',item.seriesId,'subtitles');await fs.mkdir(target,{recursive:true});await fs.writeFile(path.join(target,String(item.episodeId).padStart(3,'0')+'.vtt'),vtt(cues));
  console.log(JSON.stringify({...item,videoDurationMs,remoteVideoDurationMs:remoteInfo.durationMs,timelineMatchesRemote,cueCount:cues.length,sameVideoPath,readMatchesOfficial:row.readMatchesOfficial,subtitleMatchesOfficial:row.subtitleMatchesOfficial}));
 }catch(err){report.failures.push({...item,error:err.message.replace(/https?:[^ ]+/g,'[source URL]')});console.error('Review failed: '+item.seriesId+'/'+item.episodeId);}}
 if(option.includes('--apply')&&report.failures.length)throw Error('Some lessons failed validation; no VTT files published');
 if(option.includes('--apply'))for(const row of report.lessons){const file=String(row.episodeId).padStart(3,'0')+'.vtt',target=path.join(root,'data',row.seriesId,'subtitles');await fs.mkdir(target,{recursive:true});await fs.copyFile(path.join(out,'data',row.seriesId,'subtitles',file),path.join(target,file));}
 await fs.mkdir(out,{recursive:true});await fs.writeFile(path.join(out,'review.json'),JSON.stringify(report,null,2)+'\n');
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={clean,norm,stamp,vtt};
