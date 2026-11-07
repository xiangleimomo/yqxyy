'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {namedEpisode,namedCourse}=require('../scripts/lib/movie-course-quality.cjs');
const root=path.resolve(__dirname,'..'),read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
for(const title of ['', '第01集 · 剧情场景','第2集','剧情片段','Episode 1','Scene 02','Part 3'])assert.equal(namedEpisode({title}),false,title);
for(const title of ['大难不死的男孩','阿宝的功夫梦与面馆','Episode 1 · The Monkey'])assert.equal(namedEpisode({title}),true,title);
assert.equal(namedCourse([]),false);assert.equal(namedCourse([{title:'有剧情名称'},{title:'第01集 · 剧情场景'}]),false);
const expected=['movie-harry-potter-1','movie-harry-potter-2','movie-harry-potter-3','movie-harry-potter-4','movie-kung-fu-panda-1','movie-kung-fu-panda-2'];
const bound=[];let retired=0;
for(const group of fs.readdirSync(path.join(root,'data/movies'))){
 const file=`data/movies/${group}/movies.json`;if(!fs.existsSync(path.join(root,file)))continue;
 for(const movie of read(file).sources||[]){
  if(!movie.studyCourse)continue;
  const id=movie.studyCourse.seriesId,episodes=read(`data/${id}/episodes.json`),series=read(`data/${id}/series.json`);
  assert(namedCourse(episodes),id);assert.equal(series.status,'completed');assert.equal(movie.studyCourse.episodeCount,episodes.length);bound.push(id);
 }
}
assert.deepEqual(bound.sort(),expected.sort());
for(const id of fs.readdirSync(path.join(root,'data')).filter(id=>id.startsWith('movie-')&&fs.existsSync(path.join(root,'data',id,'episodes.json')))){
 const episodes=read(`data/${id}/episodes.json`),series=read(`data/${id}/series.json`);
 if(!namedCourse(episodes)){assert.equal(series.status,'draft',id);retired++;}
}
assert.equal(retired,67);
console.log('PASS: 67 generic-title courses are unpublished drafts; only 6 fully named courses remain registered; title validation covers empty, numbered and mixed chapters.');
