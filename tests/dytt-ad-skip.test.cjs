const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('js/dytt-ad-skip.js','utf8');
const fingerprint=[5.566667,2.933333,5.7,3.333333,1.533333];
const url='https://vip.dytt-live.com/20250430/5290_6e7d5d25/index.m3u8';
let fetches=0;
const ctx={window:{Hls:{Events:{LEVEL_LOADED:'levelLoaded'}}},URL,AbortController,setTimeout,clearTimeout,fetch:async()=>{fetches++;throw Error('blocked');}};
vm.runInNewContext(source,ctx);const api=ctx.window.DyttAdSkip;
assert(api.enabled(url));
assert(api.enabled('https://vip.dytt-live.com/20250408/3711_aba18772/index.m3u8'));
assert(api.enabled('https://vip.dytt-live.com/20250325/1771_21be9a4b/index.m3u8'));
assert(!api.enabled('https://vip.dytt-live.com/unknown/index.m3u8'));
for(const u of ['http://vip.dytt-live.com/a','https://vip.dytt-hot.com/a','https://vip.dytt-cine.com/a','https://vip.dytt-live.com.evil.test/a','https://example.com/?url='+url])assert(!api.enabled(u));
let start=0;
const fragments=[4,...fingerprint,4].map((duration,i)=>{const f={duration,start,cc:i===0?0:i===6?2:1};start+=duration;return f;});
const details={live:false,fragments};
assert.equal(api.fromDetails(details).length,1);
assert.equal(api.fromDetails({...details,live:true}).length,0);
const bad={live:false,fragments:fragments.map(f=>({...f,cc:0}))};assert.equal(api.fromDetails(bad).length,0);
const altered={live:false,fragments:fragments.map(f=>({...f}))};altered.fragments[2].duration+=0.01;assert.equal(api.fromDetails(altered).length,0);
function player(){const listeners=new Map();return {src:url,currentTime:0,readyState:1,paused:true,playbackRate:1,listeners,addEventListener(e,f){if(!listeners.has(e))listeners.set(e,new Set());listeners.get(e).add(f);},removeEventListener(e,f){listeners.get(e)?.delete(f);},emit(e){for(const f of listeners.get(e)||[])f();}};}
const p=player();let callback;
const hls={on(e,f){callback=f;},off(e,f){assert.equal(f,callback);callback=null;}};
const dispose=api.attach(p,url,hls);callback('levelLoaded',{details});
p.currentTime=5;p.emit('seeking');assert(Math.abs(p.currentTime-23.066666)<1e-6);assert.equal(p.src,url);assert.equal(fetches,0);
p.currentTime=24;p.emit('timeupdate');assert.equal(p.currentTime,24);
Object.defineProperty(p,'currentTime',{get:()=>5,set:()=>{throw Error('not seekable');}});assert.doesNotThrow(()=>p.emit('timeupdate'));
dispose();assert.equal(callback,null);assert([...p.listeners.values()].every(s=>s.size===0));
const other=player();api.attach(other,'https://example.com/video.m3u8',hls)();assert.equal(other.listeners.size,0);
const native=player();native.readyState=0;const cleanup=api.attach(native,url);assert.equal(fetches,0);native.readyState=1;native.emit('loadedmetadata');assert.equal(native.src,url);cleanup();
const shortPattern=[6.666667,2.133333,3.233333,3.733333];
let shortStart=0;
const shortFragments=[4,...shortPattern,4].map((duration,i)=>{const f={duration,start:shortStart,cc:i===0?0:i===5?2:1};shortStart+=duration;return f;});
assert.equal(api.fromDetails({live:false,fragments:shortFragments}).length,1);
assert.equal(api.fromDetails({live:false,fragments:shortFragments.map(f=>({...f,cc:0}))}).length,0);
if(process.argv[2]){
 const path=require('node:path');const folder=process.argv[2];
 const audit=JSON.parse(fs.readFileSync(path.join(folder,'analysis.json'),'utf8'));
 let total=0;
 for(const film of audit.films){
  assert(api.enabled(film.url),film.id);
  const text=fs.readFileSync(path.join(folder,film.id+'-0.m3u8'),'utf8');
  const expected=audit.candidates.filter(c=>c.movieId===film.id).sort((a,b)=>a.start-b.start);
  const actual=api.fromText(text);
  assert.equal(actual.length,4,film.id);
  assert.equal(actual.length,expected.length);
  actual.forEach((r,i)=>{assert(Math.abs(r.start-expected[i].start)<0.001);assert(Math.abs(r.end-expected[i].end)<0.001);});
  const fragments=film.rows.map((r,i)=>({start:r.start,duration:r.duration,cc:film.rows.slice(0,i+1).filter(x=>x.boundary).length}));
  const hlsRanges=api.fromDetails({live:false,fragments});
  assert.equal(hlsRanges.length,4,film.id+' HLS');
  hlsRanges.forEach((r,i)=>{assert(Math.abs(r.start-expected[i].start)<0.001);assert(Math.abs(r.end-expected[i].end)<0.001);});
  const playerForFilm=player();playerForFilm.src=film.url;let levelHandler;
  const hlsForFilm={on(e,f){levelHandler=f;},off(){}};
  const stop=api.attach(playerForFilm,film.url,hlsForFilm);
  levelHandler('levelLoaded',{details:{live:false,fragments}});
  for(const range of expected){playerForFilm.currentTime=range.start+0.05;playerForFilm.emit('seeking');assert(Math.abs(playerForFilm.currentTime-range.end)<0.001);}
  assert.equal(playerForFilm.src,film.url);stop();total+=actual.length;
 }
 assert.equal(total,32);console.log('PASS: all 32 Excel-reviewed ranges across eight films match in native and HLS parsing and seek past each ad');
}
console.log('PASS: source URLs retained, host/path scope, both fingerprints, boundaries, seek failure isolation and cleanup');
