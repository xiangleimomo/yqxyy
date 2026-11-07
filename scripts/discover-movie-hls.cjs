'use strict';
// Generate source candidates from the movie catalog's TMDB IDs, without altering Watch sources.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),catalog=JSON.parse(fs.readFileSync(path.join(root,'data/movie-hub-catalog.json'),'utf8'));
const movies=new Map();
for(const group of fs.readdirSync(path.join(root,'data/movies'))){
 const file=path.join(root,'data/movies',group,'movies.json');
 if(!fs.existsSync(file))continue;
 const contents=JSON.parse(fs.readFileSync(file,'utf8'));
 for(const movie of contents.sources||[])movies.set(movie.id,{...movie,group});
}
function attr(s,k){const m=s.match(new RegExp('(?:^|,)'+k+'=(?:"([^"]*)"|([^,]*))'));return m?.[1]??m?.[2]??'';}
function subs(master){return master.split(/\r?\n/).filter(x=>x.startsWith('#EXT-X-MEDIA:TYPE=SUBTITLES')).map(s=>({name:attr(s,'NAME'),language:attr(s,'LANGUAGE'),uri:attr(s,'URI')}));}
async function fetchHls(url){
 const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0','Accept':'*/*'},signal:AbortSignal.timeout(14000)});
 if(!r.ok)throw Error('HTTP '+r.status);
 const t=await r.text();
 if(!t.trimStart().startsWith('#EXTM3U')&&!t.trimStart().startsWith('WEBVTT'))throw Error('Invalid HLS/VTT content');
 return t;
}
const rows=catalog.films.map(f=>{
 const movie=movies.get(f.id),tmdbId=Number(f.tmdbId),sourceUrl=Number.isSafeInteger(tmdbId)&&tmdbId>0?'https://api.obj2.top/hls/movie/'+tmdbId+'/master.m3u8':null;
 const courseId=movie?.studyCourse?.seriesId||null;
 let native=false,episodeCount=0;
 if(courseId){
  const ep=path.join(root,'data',courseId,'episodes.json');
  if(fs.existsSync(ep)){try{
    const episodes=JSON.parse(fs.readFileSync(ep,'utf8'));
    episodeCount=episodes.length;
    native=episodes[0]?.video?.originalHlsUrl===sourceUrl&&/native/i.test(episodes[0]?.subtitleTracks?.status||'');
   }catch{}}
 }
 return {id:f.id,title:f.title,titleZh:f.titleZh,year:f.year,group:f.seriesId,tmdbId:f.tmdbId,
  sourceUrl,published:Boolean(movie?.hlsUrl),courseId,episodeCount,native};
});
const published=rows.filter(r=>r.published);
let index=0;
async function worker(){
 while(index<published.length){
  const row=published[index++];
  if(!row.sourceUrl){row.status='invalid_tmdb_id';continue;}
  try{
   const master=await fetchHls(row.sourceUrl);
   if(!master.includes('#EXT-X-STREAM-INF:')){row.status='invalid_hls';continue;}
   const tracks=subs(master);
   row.subtitleTracks=tracks.length;
   const en=tracks.find(t=>/^(en|eng)(-|$)/i.test(t.language)||/^English/i.test(t.name));
   const zh=tracks.find(t=>/^(zh|zho|chi)(-|$)/i.test(t.language)||/chinese|中文/i.test(t.name));
   row.englishTrack=en?.name||null;row.chineseTrack=zh?.name||null;
   if(!en?.uri){row.status='no_english_subtitles';continue;}
   const vtt=await fetchHls(new URL(en.uri,row.sourceUrl).href);
   row.subtitleFormat=vtt.startsWith('WEBVTT')?'vtt':'hls_vtt';
   row.status=row.native?'existing_native_course':row.courseId?'existing_course_needs_native_refresh':'ready_for_course';
  }catch(e){row.status=/HTTP 404/.test(e.message)?'source_not_found':'source_error';row.reason=String(e.message).slice(0,100);}
 }
}
(async()=>{
 await Promise.all([worker(),worker(),worker()]);
 for(const r of rows.filter(x=>!x.published))r.status='not_published';
 const counts={};for(const r of rows)counts[r.status]=(counts[r.status]||0)+1;
 const next=rows.filter(x=>x.status==='ready_for_course'||x.status==='existing_course_needs_native_refresh').map(x=>({id:x.id,titleZh:x.titleZh,tmdbId:x.tmdbId,url:x.sourceUrl,type:x.status,existingCourse:x.courseId}));
 const output={date:new Date().toISOString(),total:rows.length,published:published.length,counts,next,films:rows};
 fs.writeFileSync('movie-course-discovery-report.json',JSON.stringify(output,null,2)+'\n');
 console.log('DISCOVERY_SUMMARY '+JSON.stringify({catalog:rows.length,published:published.length,counts,next:next.slice(0,12)}));
 if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,'## yqxyy TMDB HLS scan\n\nMovies: '+rows.length+'\n\nPublished: '+published.length+'\n\nCounts: '+JSON.stringify(counts)+'\n\nNext: '+next.slice(0,20).map(x=>x.titleZh+' #'+x.tmdbId).join(', ')+'\n\nSources are candidates until checked; a subtitle track does not prove movie identity, full playback, or rights.\n');
})().catch(e=>{console.error(e);process.exitCode=1});
