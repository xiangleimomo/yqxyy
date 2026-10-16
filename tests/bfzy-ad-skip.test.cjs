const assert=require('node:assert/strict');
const api=require('../js/dytt-ad-skip.js');
const url='https://s3.bfzycdn.com/video/chaorenzongdongyuan/HD%E4%B8%AD%E5%AD%97/index.m3u8';
const pattern=[3,3,3,3,3,3,3,3,2.04];
let time=300.633659;
const fragments=[{start:296.633659,duration:4,cc:0,url:'https://s3.bfzycdn.com/video/film.ts'},...pattern.map((duration,i)=>{const f={start:time,duration,cc:1,url:`https://s3.bfzycdn.com/video/adjump/time/${1787320104669n+BigInt(i)}.ts`};time+=duration;return f;}),{start:time,duration:4,cc:2,url:'https://s3.bfzycdn.com/video/film2.ts'}];
assert(api.enabled(url));assert(!api.enabled(url.replace('chaorenzongdongyuan','other-film')));
const ranges=api.fromDetails({live:false,fragments},url);assert.equal(ranges.length,1);assert(Math.abs(ranges[0].end-326.673659)<1e-6);
assert.equal(api.fromDetails({live:false,fragments:fragments.map(f=>({...f,url:f.url.replace('/adjump/','/normal/')}))},url).length,0);
assert.equal(api.fromDetails({live:false,fragments:fragments.map(f=>({...f,cc:0}))},url).length,0);
assert.equal(api.fromDetails({live:true,fragments},url).length,0);
const text=['#EXTM3U','#EXTINF:4,',fragments[0].url,'#EXT-X-DISCONTINUITY',...fragments.slice(1,-1).flatMap(f=>[`#EXTINF:${f.duration},`,f.url]),'#EXT-X-DISCONTINUITY','#EXTINF:4,',fragments.at(-1).url,'#EXT-X-ENDLIST'].join('\n');
assert.equal(api.fromText(text,url).length,1);
if(process.argv[2]){const actual=api.fromText(require('node:fs').readFileSync(process.argv[2],'utf8'),url);assert.equal(actual.length,2);assert(Math.abs(actual[0].start-300.633659)<.001);assert(Math.abs(actual[1].end-2454.396515)<.001);}
console.log('PASS: reviewed BFZY fingerprint, URI and source scope, boundaries, native/HLS parity');
