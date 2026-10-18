'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const catalog=require('../netlify/functions/lib/movie-study-catalog.cjs');
const {parseSrt,episodeVtt}=require('../netlify/functions/lib/movie-study.cjs');
let chapters=0,words=0,questions=0;
for(const [id,manifest]of Object.entries(catalog)){
 const dir=path.join(__dirname,'../data',id),read=f=>JSON.parse(fs.readFileSync(path.join(dir,f+'.json')));
 const eps=read('episodes'),vocab=read('vocabulary'),quiz=read('quiz'),plan=read('editorial');
 const movie=JSON.parse(fs.readFileSync(path.join(__dirname,`../data/movies/${plan.collectionId||'harry-potter'}/movies.json`))).sources.find(m=>m.id===manifest.movieId);
 assert.equal(movie.hlsUrl,manifest.originalHlsUrl);assert.equal(movie.studyCourse.seriesId,id);assert.equal(movie.studyCourse.episodeCount,eps.length);
 let last=0,seq=manifest.chapters[0].firstSegment;
 for(const ep of eps){
  const ch=manifest.chapters[ep.episodeId-1];assert.equal(ch.start,last);last=ch.end;assert.equal(ch.firstSegment,seq);seq+=ch.segmentCount;
  assert.equal(ep.modules.read,false);assert(ep.modules.watch&&ep.modules.words&&ep.modules.quiz);
  assert.equal(ep.video.originalHlsUrl,movie.hlsUrl);assert.equal(ep.video.originalStart,ch.start);assert.equal(ep.video.originalEnd,ch.end);
  const playlist=fs.readFileSync(path.join(dir,'hls',`${String(ep.episodeId).padStart(3,'0')}.m3u8`),'utf8');
  const ds=[...playlist.matchAll(/#EXTINF:([\d.]+)/g)].map(m=>Number(m[1]));assert.equal(ds.length,ch.segmentCount);assert(Math.abs(ds.reduce((a,b)=>a+b,0)-(ch.end-ch.start))<.001);assert(playlist.endsWith('#EXT-X-ENDLIST\n'));
  const vv=vocab[ep.episodeId];assert.equal(vv.length,6);assert.equal(new Set(vv.map(w=>w.word.toLowerCase())).size,6);
  for(const w of vv){assert(w.evidence.originalStart>=ch.start&&w.evidence.originalStart<ch.end);assert(w.meaningZh&&w.definitionEn&&w.exampleZh&&w.example);}
  const qs=quiz[ep.episodeId].questions;assert.equal(qs.length,5);
  for(const q of qs){assert.equal(new Set(q.options.map(o=>o.text)).size,q.options.length);assert.equal(q.options.filter(o=>o.key===q.answer).length,1);}
  chapters++;words+=vv.length;questions+=qs.length;
 }
 assert.equal(last,manifest.storyEnd);assert(last<=manifest.originalDuration);
 if(process.argv[2]===id){
  const cues=parseSrt(fs.readFileSync(process.argv[3],'utf8'));
  for(const ch of manifest.chapters){
   const aligned=cues.map(c=>({...c,start:c.start*manifest.scale+manifest.offsetSeconds,end:c.end*manifest.scale+manifest.offsetSeconds}));
   assert(!aligned.some(c=>c.start<ch.end-.001&&c.end>ch.end+.001));
   const text=aligned.filter(c=>c.start>=ch.start&&c.end<=ch.end).map(c=>c.text).join(' ');
   for(const w of vocab[ch.episodeId])assert(new RegExp(`\\b${w.word}\\b`,'i').test(text));
   const vtt=episodeVtt(cues,ch,manifest.offsetSeconds,manifest.scale);assert(vtt.startsWith('WEBVTT\n\n'));
  }
 }
}
(async()=>{
 const h=require('../netlify/functions/movie-study-subtitles').handler;
 for(const course of ['__proto__','constructor','../../etc','movie-unknown'])assert.equal((await h({httpMethod:'GET',queryStringParameters:{course,episode:'1'}})).statusCode,404);
 console.log(`PASS: ${Object.keys(catalog).length} courses, ${chapters} chapters, ${words} evidenced words, ${questions} questions; source preservation, contiguous TS cuts, local subtitles, course isolation.`);
})().catch(e=>{console.error(e);process.exitCode=1;});
