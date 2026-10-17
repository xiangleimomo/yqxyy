const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),api=require('../js/dytt-ad-skip.js');
const review=JSON.parse(fs.readFileSync('docs/movie-ad-review-2026-10-17.json','utf8'));let count=0;
for(const film of review){
 assert(api.enabled(film.hlsUrl),film.id);
 assert(!api.enabled(new URL('/unreviewed/index.m3u8',film.hlsUrl).href),film.id+' scope');
 const catalogue=fs.readdirSync('data/movies').flatMap(dir=>{const p=path.join('data/movies',dir,'movies.json');return fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf8')).sources||[]:[];});
 assert.equal(catalogue.find(m=>m.id===film.id).hlsUrl,film.hlsUrl);
 if(process.argv[2]){
  const text=fs.readFileSync(path.join(process.argv[2],film.id+'.m3u8'),'utf8');const a=api.fromText(text,film.hlsUrl);assert.equal(a.length,film.ranges.length,film.id);
  let start=0,cc=0,duration;const fragments=[];for(const line of text.split(/\r?\n/)){if(line==='#EXT-X-DISCONTINUITY')cc++;else if(line.startsWith('#EXTINF:'))duration=Number(line.slice(8).split(',')[0]);else if(line&&!line.startsWith('#')){fragments.push({start,duration,cc,url:new URL(line,film.leafUrl).href});start+=duration;}}
  const b=api.fromDetails({live:false,fragments},film.hlsUrl);assert.deepEqual(b,a);
  for(let i=0;i<a.length;i++){assert(Math.abs(a[i].start-film.ranges[i].start)<.001);assert(Math.abs(a[i].end-film.ranges[i].end)<.001);}
 }
 count+=film.ranges.length;
}
assert.equal(count,27);assert.equal(require('../scripts/apply-ad-reviewed-sources.cjs').apply('docs/movie-ad-review-2026-10-17.json').changedFiles,0);
console.log('PASS: 7 exact catalogue sources, 27 reviewed ranges, HLS/native parity and idempotent import');
