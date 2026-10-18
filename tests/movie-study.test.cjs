'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {parseSrt,episodeVtt,extractSrt}=require('../netlify/functions/lib/movie-study.cjs');
const dir=path.join(__dirname,'../data/movie-harry-potter-1');
const read=name=>JSON.parse(fs.readFileSync(path.join(dir,name+'.json')));
const episodes=read('episodes'),alignment=read('alignment'),vocab=read('vocabulary'),quiz=read('quiz');
assert.equal(episodes.length,24);
let nextSegment=0,lastEnd=0;
for(const ep of episodes){
  const n=ep.episodeId,ch=alignment.chapters[n-1];
  assert.equal(ch.start,lastEnd,'No gaps or overlaps between chapters');lastEnd=ch.end;
  assert.equal(ch.firstSegment,nextSegment);nextSegment+=ch.segmentCount;
  assert.equal(ep.video.originalStart,ch.start);assert.equal(ep.video.originalEnd,ch.end);
  assert.equal(ep.modules.read,false);assert(ep.modules.words&&ep.modules.quiz&&ep.modules.watch);
  const playlist=fs.readFileSync(path.join(dir,'hls',`${String(n).padStart(3,'0')}.m3u8`),'utf8');
  const durations=[...playlist.matchAll(/#EXTINF:([\d.]+)/g)].map(m=>Number(m[1]));
  assert.equal(durations.length,ch.segmentCount);assert(Math.abs(durations.reduce((a,b)=>a+b,0)-(ch.end-ch.start))<.001);
  assert(playlist.includes(`#EXT-X-MEDIA-SEQUENCE:${ch.firstSegment}\n`)&&playlist.endsWith('#EXT-X-ENDLIST\n'));
  assert.equal(vocab[n].length,6);
  assert.equal(new Set(vocab[n].map(w=>w.word)).size,6);
  for(const w of vocab[n]){assert(w.evidence.originalStart>=ch.start&&w.evidence.originalStart<ch.end);assert(w.example&&w.exampleZh&&w.definitionEn&&w.meaningZh);}
  assert.equal(quiz[n].questions.length,5);
  for(const q of quiz[n].questions){assert.equal(new Set(q.options.map(o=>o.text)).size,3);assert.equal(q.options.filter(o=>o.key===q.answer).length,1);}
}
assert.equal(lastEnd,alignment.storyEnd);assert(lastEnd<alignment.originalDuration);
assert(Math.abs(alignment.offsetSeconds-.3)<.001);assert.equal(alignment.scale,1);
assert(alignment.verification.anchors.every(a=>Math.abs(a.audio-a.subtitle-alignment.offsetSeconds)<.25));
const srt='1\r\n00:00:01,000 --> 00:00:03,000\r\n<i>Hello</i>\r\n\r\n2\r\n00:00:05,000 --> 00:00:06,000\r\nWorld\r\n';
const cues=parseSrt(srt);assert.equal(cues.length,2);assert.equal(cues[0].text,'Hello');
const vtt=episodeVtt(cues,{start:2,end:5.7},.3);
assert(vtt.includes('00:00:00.000 --> 00:00:01.300'));assert(vtt.includes('00:00:03.300 --> 00:00:03.700'));
assert.throws(()=>extractSrt(Buffer.from('not a zip')));
const movie=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/movies/harry-potter/movies.json'))).sources[0];
assert.equal(movie.hlsUrl,alignment.originalHlsUrl);assert.equal(movie.backupHlsUrl,'https://vip.dytt-live.com/20250325/1771_21be9a4b/index.m3u8');
assert.equal(movie.studyCourse.seriesId,read('series').seriesId);
(async()=>{
  const handler=require('../netlify/functions/movie-study-subtitles').handler;
  assert.equal((await handler({httpMethod:'POST'})).statusCode,405);
  for(const episode of ['0','25','-1','1&url=https://example.com','01'])assert.equal((await handler({httpMethod:'GET',queryStringParameters:{episode}})).statusCode,404);
  // Optional original subtitle audit: no line straddles a cut; every word occurs
  // in its actual chapter, including the release and constant timeline shift.
  if(process.argv[2]){
    const actual=parseSrt(fs.readFileSync(process.argv[2],'utf8'));
    for(const ch of alignment.chapters){
      assert(!actual.some(c=>c.start+.3<ch.end-.001&&c.end+.3>ch.end+.001));
      const text=actual.filter(c=>c.start+.3>=ch.start&&c.end+.3<=ch.end).map(c=>c.text).join(' ');
      for(const w of vocab[ch.episodeId])assert(new RegExp(`\\b${w.word}\\b`,'i').test(text));
    }
  }
  console.log('Movie study: 24 contiguous TS chapters, original sources preserved, 144 evidenced words, 120 valid questions, subtitle clipping and access validation passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
