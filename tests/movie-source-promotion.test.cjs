const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const root = path.join(__dirname,'..');
const movies = new Map();
for(const series of fs.readdirSync(path.join(root,'data/movies'))) {
 const file=path.join(root,'data/movies',series,'movies.json');
 if(!fs.existsSync(file))continue;
 const data=JSON.parse(fs.readFileSync(file,'utf8'));
 let old;try{old=JSON.parse(cp.execFileSync('git',['show','fccdc706b5e866cb77084dc58db85ae1cc52082c:'+path.relative(root,file).replaceAll('\\','/')],{cwd:root,stdio:['ignore','pipe','ignore']}));}catch{}
 for(const m of data.sources){assert(!movies.has(m.id));movies.set(m.id,m);const previous=old?.sources.find(x=>x.id===m.id);if(!previous)continue;
  if(m.hlsUrl!==previous.hlsUrl){
   const retained=new Set((m.backupSources||[]).map(x=>x.url));
   for(const url of [previous.hlsUrl,previous.backupHlsUrl,previous.embedUrl,...(previous.backupSources||[]).map(x=>x.url)].filter(Boolean))assert(retained.has(url),m.id+' lost '+url);
  }
 }
}
const supplied=fs.readFileSync(process.argv[2],'utf8').trim().split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
assert.equal(supplied.length,158);
for(let i=1;i<supplied.length;i+=2)assert.equal([...movies.values()].filter(m=>m.hlsUrl===supplied[i]).length,1);
for(const {movie} of require('../docs/movie-additions-2026-10-20.json')){assert(movies.has(movie.id));assert(movie.cover.startsWith('https://'));assert(movie.descriptionZh);assert(movie.description);}
assert.equal(require('../scripts/promote-movie-sources.cjs').run(process.argv[2]).files.length,0);
console.log('PASS: all 79 primary URLs, all previous media/embed backups, four additions and idempotent import');
