'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const dir=path.join(__dirname,'../data/movie-harry-potter-1');
const read=name=>JSON.parse(fs.readFileSync(path.join(dir,name+'.json'),'utf8'));
const series=read('series'),episodes=read('episodes');
assert.equal(episodes.length,34);assert.equal(series.totalEpisodes,34);assert.equal(series.quizStatus,'pending');
const source=episodes[0].video.hlsUrl;
assert(/^https:\/\//.test(source)&&source.endsWith('.m3u8'));
let end=0;
for(const [i,ep] of episodes.entries()){
  const video=ep.video;
  assert.equal(ep.episodeId,i+1);
  assert.equal(ep.status,'published');
  assert.equal(video.hlsUrl,source,'Every episode must use the one full-length source');
  assert(Math.abs(video.clipStart-end)<.002,'No gap or overlap between episodes');
  assert(video.clipEnd>video.clipStart,'Positive clip length');
  assert(Math.abs(video.duration-(video.clipEnd-video.clipStart))<.005,'Episode duration must be relative');
  assert(ep.modules.watch===true&&ep.modules.quiz===false&&ep.modules.words===false,'Unaligned legacy learning data must not be published');
  assert(!/\/hls\/\d+\.m3u8/.test(video.hlsUrl),'Do not return to split playlists');
  end=video.clipEnd;
}
assert(end>8000&&end<10000);
assert(!fs.existsSync(path.join(dir,'hls')),'Legacy HLS clips must be removed');
const app=fs.readFileSync(path.join(__dirname,'../js/app.js'),'utf8');
assert(app.includes('data-clip-start=')&&app.includes('data-clip-end='));
assert(app.includes("player.addEventListener('seeking',enforce)"));
assert(!app.includes('movie-hp1-hls-test.html'));
const {parseSrt,episodeVtt,extractSrt}=require('../netlify/functions/lib/movie-study.cjs');
const sample='1\r\n00:00:01,000 --> 00:00:03,000\r\n<i>Hello</i>\r\n\r\n2\r\n00:00:05,000 --> 00:00:06,000\r\nWorld\r\n';
const cues=parseSrt(sample);assert.equal(cues.length,2);
assert(episodeVtt(cues,{start:2,end:5.7},.3).includes('00:00:00.000 --> 00:00:01.300'));
assert.throws(()=>extractSrt(Buffer.from('not a zip')));
(async()=>{
  const handler=require('../netlify/functions/movie-study-subtitles').handler;
  assert.equal((await handler({httpMethod:'GET',queryStringParameters:{episode:'1'}})).statusCode,404,'Retired 24-chapter subtitles must not be served as 34 chapters');
  console.log('PASS: 34 time-bounded lessons, single VOD URL, no split HLS, obsolete quizzes disabled, subtitles API isolated.');
})().catch(e=>{console.error(e);process.exitCode=1});
