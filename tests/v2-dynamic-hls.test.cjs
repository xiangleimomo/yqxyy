'use strict';
const assert=require('node:assert/strict');
const {dynamicPlaylistUrl,assertEpisodeSource,renderDynamicEpisodePlaylist}=require('../scripts/v2-dynamic-hls.cjs');
const url=dynamicPlaylistUrl('https://yqxyy.netlify.app','tv-74313',7,'video');
assert.equal(url,'/.netlify/functions/v2-episode-hls?course=tv-74313&episode=7&kind=video');
assert.equal(assertEpisodeSource({video:{sourceDescriptor:{provider:'dulo',tmdbId:74313,mediaType:'tv',season:2,episode:7}}}).episode,7);
assert.throws(()=>assertEpisodeSource({video:{sourceDescriptor:{provider:'dulo',tmdbId:74313,mediaType:'tv',season:2}}}),/season\\/episode/);
assert.throws(()=>assertEpisodeSource({video:{sourceDescriptor:{provider:'other',tmdbId:74313,mediaType:'tv',season:2,episode:7}}}),/approved Dulo/);
console.log('V2 dynamic HLS descriptor tests passed');



const master=[
 '#EXTM3U',
 '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="English",LANGUAGE="en",DEFAULT=YES,URI="audio.m3u8"',
 '#EXT-X-STREAM-INF:BANDWIDTH=1200000,RESOLUTION=1280x720,AUDIO="aud"',
 'video.m3u8'
].join('\n');
const media=['#EXTM3U','#EXT-X-TARGETDURATION:5','#EXT-X-MEDIA-SEQUENCE:10',
 '#EXTINF:5,','segment-10.ts','#EXTINF:5,','segment-11.ts','#EXT-X-ENDLIST'].join('\n');
const handoff='short-lived-token';
const sourceUrl='https://zcdn1.6azt0hwr-cf9.workers.dev/play/test-token/master.m3u8?_rb='+handoff;
const fetcher=async raw=>{
 const u=new URL(raw);
 if(u.pathname==='/cdn')return new Response(JSON.stringify({ready:true,url:'https://zcdn1.6azt0hwr-cf9.workers.dev/play/test-token/master.m3u8',rb:handoff}),{status:200});
 if(u.pathname.endsWith('/master.m3u8'))return new Response(master,{status:200});
 if(u.pathname.endsWith('/video.m3u8')||u.pathname.endsWith('/audio.m3u8'))return new Response(media,{status:200});
 return new Response('not found',{status:404});
};
(async()=>{
 const episode={episodeId:1,video:{
   sourceDescriptor:{provider:'dulo',tmdbId:123,mediaType:'movie'},
   originalStart:0,originalEnd:10,timelineOrigin:0,hlsVersion:7
 }};
 const masterResult=await renderDynamicEpisodePlaylist({episode,courseId:'movie-test',siteOrigin:'https://yqxyy.netlify.app',kind:'master',fetcher});
 assert.match(masterResult.body,/kind=video/);
 assert.match(masterResult.body,/kind=audio/);
 assert.doesNotMatch(masterResult.body,/_rb=/);
 const videoResult=await renderDynamicEpisodePlaylist({episode,courseId:'movie-test',siteOrigin:'https://yqxyy.netlify.app',kind:'video',fetcher});
 assert.match(videoResult.body,/segment-10\.ts\?_rb=short-lived-token/);
 assert.match(videoResult.body,/segment-11\.ts\?_rb=short-lived-token/);
 assert.equal(videoResult.segmentCount,2);
 console.log('V2 dynamic HLS handoff tests passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
