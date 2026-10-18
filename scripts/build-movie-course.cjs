/* Rebuild the reviewed pilot from the unchanged source playlist and matching SRT.
   node scripts/build-movie-course.cjs <playlist.m3u8> <extended.srt>
   Inputs are local audit files, never committed movie media or full transcripts. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {parseSrt}=require('../netlify/functions/lib/movie-study.cjs');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'data/movie-harry-potter-1');
const plan=JSON.parse(fs.readFileSync(path.join(dir,'editorial.json'),'utf8'));
const [playlistFile,srtFile]=process.argv.slice(2);
if(!playlistFile||!srtFile) throw new Error('Supply the audited original media playlist and extended English SRT.');
const text=fs.readFileSync(playlistFile,'utf8');
assert(text.startsWith('#EXTM3U')&&text.includes('#EXT-X-ENDLIST'),'A complete VOD media playlist is required');
assert(!/#EXT-X-(KEY|MAP|BYTERANGE|DISCONTINUITY|STREAM-INF)/.test(text),'Pilot builder requires plain, continuous MPEG-TS; review other formats separately');
const movies=JSON.parse(fs.readFileSync(path.join(root,'data/movies/harry-potter/movies.json')));
const movie=movies.sources.find(m=>m.id===plan.movieId);
assert(movie,'Pilot movie must exist');
const rows=[];let duration=null,total=0;
const sequence=Number(text.match(/#EXT-X-MEDIA-SEQUENCE:(\d+)/)?.[1]||0);
for(const line of text.split(/\r?\n/).map(x=>x.trim())){
  if(line.startsWith('#EXTINF:')) duration=Number(line.slice(8).split(',')[0]);
  else if(line&&!line.startsWith('#')){
    assert(duration>0);const uri=new URL(line,movie.hlsUrl).href;
    assert(uri.startsWith('https://'),'Only HTTPS media is accepted');
    rows.push({start:total,duration,uri});total+=duration;duration=null;
  }
}
const srt=fs.readFileSync(srtFile,'utf8');
const subtitleSha256=crypto.createHash('sha256').update(srt).digest('hex');
const cues=parseSrt(srt).map(c=>({...c,start:c.start*plan.subtitleScale+plan.subtitleOffsetSeconds,end:c.end*plan.subtitleScale+plan.subtitleOffsetSeconds}));
assert(cues.length>1000,'Wrong or incomplete subtitle release');
function boundary(target){
  const options=rows.map((r,index)=>({...r,index})).filter(r=>Math.abs(r.start-target)<=30 && !cues.some(c=>c.start<r.start+.08&&c.end>r.start-.08));
  assert(options.length,`No clean subtitle/TS boundary within 30s of ${target}`);
  options.sort((a,b)=>Math.abs(a.start-target)-Math.abs(b.start-target));return options[0].index;
}
const indices=[0,...plan.chapters.map(c=>boundary(c.targetEnd))];
assert(indices.every((n,i)=>!i||n>indices[i-1]),'Chapter boundaries must increase');
const round=n=>Math.round(n*1e6)/1e6,episodes=[],vocabulary={},quiz={};
const letters=['A','B','C'];
function question(q,choices,why,id,category,seed){
  const options=choices.map((text,i)=>({text,correct:i===0}));
  const shift=seed%options.length;options.push(...options.splice(0,shift));
  return {id,type:'single-choice',category,question:q,options:options.map((o,i)=>({key:letters[i],text:o.text})),answer:letters[options.findIndex(o=>o.correct)],explanation:why,source:'Original editorial learning question'};
}
fs.mkdirSync(path.join(dir,'hls'),{recursive:true});
plan.chapters.forEach((chapter,i)=>{
  const id=i+1,first=indices[i],end=indices[i+1],start=rows[first].start,finish=rows[end].start,part=rows.slice(first,end);
  const chapterCues=cues.filter(c=>c.start>=start&&c.end<=finish);
  const words=chapter.words.map((word,j)=>{
    const pattern=new RegExp(`\\b${word.word}\\b`,'i'),evidence=chapterCues.find(c=>pattern.test(c.text));
    assert(evidence,`Word ${word.word} not present in chapter ${id}`);
    assert(word.example.toLowerCase().includes(word.word.toLowerCase()),`Example must use ${word.word}`);
    return {...word,id:`hp1-${id}-${j+1}`,source:'Matched English subtitle; original example and definition',evidence:{originalStart:round(evidence.start),localStart:round(evidence.start-start)}};
  });
  vocabulary[id]=words;
  const qs=chapter.comprehension.map((q,j)=>question(q.question,q.choices,q.explanation,`q${j+1}`,'comprehension',i+j));
  words.slice(0,3).forEach((w,j)=>{
    const distractors=words.filter(x=>x.word!==w.word).slice(j,j+2);
    qs.push(question(`In this episode, what does “${w.word}” mean?`,[w.meaningZh,...distractors.map(x=>x.meaningZh)],`${w.word}：${w.meaningZh}。${w.definitionEn}`,`q${j+3}`,'vocabulary',i+j+2));
  });
  quiz[id]={episodeId:id,title:`${chapter.title} · Quiz`,questions:qs};
  episodes.push({episodeId:id,title:chapter.title,titleZh:chapter.titleZh,summaryEn:chapter.summaryEn,status:'published',sourceType:'hls',video:{source:'hls',hlsUrl:`data/${plan.seriesId}/hls/${String(id).padStart(3,'0')}.m3u8`,subtitleUrl:`/.netlify/functions/movie-study-subtitles?episode=${id}`,originalHlsUrl:movie.hlsUrl,originalStart:round(start),originalEnd:round(finish),duration:round(finish-start)},modules:{watch:true,read:false,words:true,vocabulary:true,quiz:true}});
  const clip=['#EXTM3U','#EXT-X-VERSION:3','#EXT-X-PLAYLIST-TYPE:VOD',`#EXT-X-TARGETDURATION:${Math.ceil(Math.max(...part.map(r=>r.duration)))}`,`#EXT-X-MEDIA-SEQUENCE:${sequence+first}`,...part.flatMap(r=>[`#EXTINF:${r.duration.toFixed(6)},`,r.uri]),'#EXT-X-ENDLIST',''].join('\n');
  fs.writeFileSync(path.join(dir,'hls',`${String(id).padStart(3,'0')}.m3u8`),clip);
});
const series={seriesId:plan.seriesId,seriesTitle:"Harry Potter and the Philosopher's Stone",seriesTitleZh:'哈利·波特与魔法石 · 剧情分集学习',level:5,language:'en',status:'completed',totalEpisodes:episodes.length,description:'24 个剧情章节，配有英文字幕、Words、Quiz 和 Games。按加长版片源校准；完整电影仍可独立观看。',coverImage:plan.coverImage||movie.cover,movieId:movie.id};
const alignment={seriesId:plan.seriesId,movieId:movie.id,originalHlsUrl:movie.hlsUrl,originalDuration:round(total),storyEnd:episodes.at(-1).video.originalEnd,creditsExcludedFromLessons:true,subtitleSource:plan.subtitleSource,offsetSeconds:plan.subtitleOffsetSeconds,scale:plan.subtitleScale,verification:{method:'Sampled audio transcription compared to matching extended-release English subtitle; word onsets are approximate',anchors:[{subtitle:97.848,audio:98.036},{subtitle:1796.920,audio:1797.002},{subtitle:3004.001,audio:3004.354},{subtitle:6299.460,audio:6299.746},{subtitle:8824.607,audio:8824.973}],note:'No progressive drift observed in sampled dialogue. A constant +0.30s adjustment is applied; not a frame-by-frame certification.'},chapters:episodes.map((ep,i)=>({episodeId:ep.episodeId,title:ep.title,start:ep.video.originalStart,end:ep.video.originalEnd,firstSegment:sequence+indices[i],segmentCount:indices[i+1]-indices[i]}))};
alignment.subtitleSha256=subtitleSha256;
for(const [file,data] of Object.entries({'series.json':series,'episodes.json':episodes,'vocabulary.json':vocabulary,'quiz.json':quiz,'alignment.json':alignment})) fs.writeFileSync(path.join(dir,file),JSON.stringify(data,null,2)+'\n');
console.log(`Built ${episodes.length} chapters, ${Object.values(vocabulary).flat().length} words, ${Object.values(quiz).reduce((n,q)=>n+q.questions.length,0)} questions. Story end ${alignment.storyEnd}s; original unchanged ${total}s.`);
