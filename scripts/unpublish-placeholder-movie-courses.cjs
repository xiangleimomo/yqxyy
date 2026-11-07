'use strict';
// Dry run by default. Retain source files as drafts, remove published bindings.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {namedCourse}=require('./lib/movie-course-quality.cjs');
const root=path.resolve(__dirname,'..'),data=path.join(root,'data'),write=process.argv.includes('--write');
const changes=[],removed=[],retained=[];
for(const name of fs.readdirSync(data).filter(name=>name.startsWith('movie-'))){
 const dir=path.join(data,name),episodesFile=path.join(dir,'episodes.json');
 if(!fs.existsSync(episodesFile))continue;
 const episodes=JSON.parse(fs.readFileSync(episodesFile,'utf8'));
 if(namedCourse(episodes)){retained.push(name);continue;}
 // Only retire fully generic courses. Mixed courses need an editorial decision.
 assert(!episodes.some(require('./lib/movie-course-quality.cjs').namedEpisode),`Mixed chapter names require review: ${name}`);
 removed.push(name);
 const file=path.join(dir,'series.json'),original=fs.readFileSync(file,'utf8');
 const next=original.replace(/("status"\s*:\s*)"[^"]+"/,'$1"draft"');
 assert.equal(JSON.parse(next).status,'draft');
 if(next!==original)changes.push({file,next});
}
const removedSet=new Set(removed);
for(const group of fs.readdirSync(path.join(data,'movies'))){
 const file=path.join(data,'movies',group,'movies.json');if(!fs.existsSync(file))continue;
 const original=fs.readFileSync(file,'utf8'),before=JSON.parse(original);
 const next=original.replace(/,?\r?\n[ \t]*"studyCourse"\s*:\s*\{[^{}]*\}(,?)/g,(block,trailing)=>{
  const seriesId=block.match(/"seriesId"\s*:\s*"([^"]+)"/)?.[1];
  if(!removedSet.has(seriesId))return block;
  // The object is either between properties or is the last property.
  return block.startsWith(',')&&trailing?',':'';
 });
 const after=JSON.parse(next),expected=JSON.parse(JSON.stringify(before));
 for(const movie of expected.sources||[])if(removedSet.has(movie.studyCourse?.seriesId))delete movie.studyCourse;
 assert.deepEqual(after,expected,'Only studyCourse bindings may change');
 if(next!==original)changes.push({file,next});
}
// All files and JSON shapes are validated before any write.
if(write)for(const {file,next} of changes)fs.writeFileSync(file,next);
console.log(JSON.stringify({mode:write?'write':'dry-run',unpublished:removed.length,retained,changedFiles:changes.length},null,2));
