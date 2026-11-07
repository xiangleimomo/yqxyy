'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const id='movie-harry-potter-4';
const dir=path.join(root,'data',id);
const read=p=>JSON.parse(fs.readFileSync(path.join(dir,p),'utf8'));
const episodes=read('episodes.json');
const vocabulary=read('vocabulary.json');
const quizzes=read('quiz.json');
const alignment=read('alignment.json');
assert.equal(episodes.length,21);
assert.equal(alignment.chapters.length,21);
assert.equal(alignment.subtitleCueCount,1808);
assert.equal(alignment.subtitleSource.format,'vtt');
assert.equal(alignment.verification.sourceTrackAligned,true);
let previous=0;
for(let i=0;i<episodes.length;i++){
  const ep=episodes[i],n=String(i+1).padStart(3,'0');
  assert.equal(ep.episodeId,i+1);
  assert.equal(ep.status,'published');
  assert.equal(ep.video.originalHlsUrl,alignment.originalHlsUrl);
  assert(Math.abs(ep.video.originalStart-previous)<0.002,'No source timeline gap/overlap');
  assert(ep.video.originalEnd>ep.video.originalStart);
  assert(Math.abs(ep.video.duration-(ep.video.originalEnd-ep.video.originalStart))<0.01);
  assert(ep.video.subtitleUrl.includes('course='+id+'&episode='+(i+1)));
  assert(ep.modules.watch&&ep.modules.words&&ep.modules.quiz);
  assert.equal(vocabulary[String(i+1)].length,6);
  assert.equal(quizzes[String(i+1)].questions.length,5);
  assert(quizzes[String(i+1)].questions.every(q=>q.answer==='A'||q.answer==='B'||q.answer==='C'));
  const master=fs.readFileSync(path.join(dir,'hls',n+'.m3u8'),'utf8');
  assert(master.includes('#EXT-X-MEDIA:TYPE=AUDIO'));
  assert.equal((master.match(/#EXT-X-STREAM-INF:/g)||[]).length,2);
  for(const quality of ['720','1080']){
    const pl=fs.readFileSync(path.join(dir,'hls',n+'.video-'+quality+'.m3u8'),'utf8');
    assert(pl.includes('#EXT-X-ENDLIST')&&pl.includes('#EXT-X-KEY:METHOD=AES-128'));
    assert(pl.includes('https://')&&/\.js(?:\?|$)/m.test(pl));
    const durations=[...pl.matchAll(/#EXTINF:([\d.]+),/g)].map(x=>Number(x[1]));
    assert(durations.length>0);
    const sum=durations.reduce((a,b)=>a+b,0);
    assert(Math.abs(sum-ep.video.duration)<0.01,n+' '+quality+' playlist duration mismatch');
  }
  const audio=fs.readFileSync(path.join(dir,'hls',n+'.audio.m3u8'),'utf8');
  const ad=[...audio.matchAll(/#EXTINF:([\d.]+),/g)].map(x=>Number(x[1]));
  assert(audio.includes('#EXT-X-ENDLIST')&&audio.includes('#EXT-X-KEY:METHOD=AES-128'));
  assert(Math.abs(ad.reduce((a,b)=>a+b,0)-ep.video.duration)<0.5,n+' audio/video duration mismatch');
  previous=ep.video.originalEnd;
}
assert(Math.abs(previous-alignment.storyEnd)<0.002);
const sourceVtt=fs.readFileSync(path.join(root,'hp4-source-inspection/subtitle-track-01/0001.vtt'),'utf8');
const {parseVtt,episodeVtt}=require('../netlify/functions/lib/movie-study.cjs');
const cues=parseVtt(sourceVtt);
assert.equal(cues.length,1808);
const first=episodeVtt(cues,alignment.chapters[0],alignment.offsetSeconds,alignment.scale);
assert(first.startsWith('WEBVTT')&&first.includes('WEBVTT'));
(async()=>{
  const originalFetch=global.fetch;
  global.fetch=async()=>new Response(sourceVtt,{status:200,headers:{'Content-Type':'text/vtt','Content-Length':String(Buffer.byteLength(sourceVtt))}});
  try{
    const handler=require('../netlify/functions/movie-study-subtitles').handler;
    for(const episode of ['1','21']){
      const response=await handler({httpMethod:'GET',queryStringParameters:{course:id,episode}});
      assert.equal(response.statusCode,200,'subtitle endpoint failed for episode '+episode);
      assert(response.body.startsWith('WEBVTT'));
    }
  }finally{global.fetch=originalFetch;}
  console.log('PASS: HP4 21 episodes, 126 vocabulary items, 105 quiz questions, 720p/1080p+audio HLS, encrypted .js segments, embedded VTT endpoint.');
})().catch(e=>{console.error(e);process.exitCode=1});
