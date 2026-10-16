const assert = require('node:assert/strict');
const fs = require('node:fs');
const filter = require('../js/dytt-ad-filter.js');
const source = 'https://vip.dytt-live.com/movie/index.m3u8';
assert(filter.enabled(source));
for (const url of ['http://vip.dytt-live.com/a.m3u8','https://vip.dytt-hot.com/a.m3u8','https://vip.dytt-cine.com/a.m3u8','https://vip.dytt-live.com.evil.test/a','https://example.com/?url='+source,'invalid']) assert(!filter.enabled(url));
const ad = ['#EXT-X-DISCONTINUITY', ...[5.567,2.933,5.7,3.333,1.533].flatMap((d,i)=>[`#EXTINF:${d},`,`${i}.ts`]), '#EXT-X-DISCONTINUITY','#EXTINF:4,','film.ts'].join('\n');
const text = '#EXTM3U\n#EXTINF:4,\nintro.ts\n'+ad+'\n#EXT-X-ENDLIST';
assert.equal(filter.ranges(text)[0].start,4);
assert(Math.abs(filter.ranges(text)[0].end-23.066)<1e-8);
assert.equal(filter.ranges(text.replace('5.567','5.6')).length,0);
assert.equal(filter.ranges(text.replace('#EXT-X-DISCONTINUITY\n','')).length,0);
assert.equal(filter.ranges(text.replace('#EXT-X-ENDLIST','')).length,0);
if (process.argv[2]) {
  const path = require('node:path');
  for (const name of ['mixed.m3u8','mixed (1).m3u8','mixed (2).m3u8','mixed (3).m3u8','mixed (4).m3u8']) {
    const matches=filter.ranges(fs.readFileSync(path.join(process.argv[2],name),'utf8'));
    assert.equal(matches.length,2,name); console.log(name, matches);
  }
}
(async () => {
 const listeners=new Map();let requests=0, aborted=false;
 global.fetch=async (url,{signal})=>{requests++;signal.addEventListener('abort',()=>aborted=true);return {ok:true,url,text:async()=> requests===1?'#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nhls/mixed.m3u8':text};};
 const player={currentTime:0,paused:true,playbackRate:1,addEventListener:(e,f)=>listeners.set(e,f),removeEventListener:e=>listeners.delete(e)};
 const dispose=filter.attach(player,source);
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(requests,2);player.currentTime=5;listeners.get('seeking')();assert(Math.abs(player.currentTime-23.066)<1e-8);
 player.currentTime=24;listeners.get('timeupdate')();assert.equal(player.currentTime,24);
 dispose();assert(aborted);assert.equal(listeners.size,0);
 filter.attach(player,'https://example.com/video.m3u8')();assert.equal(requests,2);
 console.log('PASS: host scope, duration fingerprint, boundaries, nested playlists, seek skipping and cleanup');
})().catch(e=>{console.error(e);process.exitCode=1;});
