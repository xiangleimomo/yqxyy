'use strict';
const assert=require('node:assert/strict');
const {inspectHlsSource,assertPublicHttps}=require('../scripts/v2-source-resolver.cjs');
const master=[
 '#EXTM3U',
 '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="English",LANGUAGE="en",DEFAULT=YES,URI="audio.m3u8"',
 '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English",LANGUAGE="en",URI="subs.vtt"',
 '#EXT-X-STREAM-INF:BANDWIDTH=1200000,RESOLUTION=1280x720,AUDIO="aud",SUBTITLES="subs"',
 'video.m3u8'
].join('\n');
const media=['#EXTM3U','#EXT-X-TARGETDURATION:5','#EXT-X-MEDIA-SEQUENCE:1',
 '#EXTINF:5,','1.ts','#EXTINF:5,','2.ts','#EXTINF:5,','3.ts','#EXT-X-ENDLIST'].join('\n');
const vtt=['WEBVTT','','00:00:01.000 --> 00:00:02.000','First subtitle cue','','00:00:03.000 --> 00:00:04.000','Second subtitle cue','','00:00:06.000 --> 00:00:07.000','Third subtitle cue','','00:00:08.000 --> 00:00:09.000','Fourth subtitle cue','','00:00:10.000 --> 00:00:11.000','Fifth subtitle cue',''].join('\n');
const responses=new Map([
 ['https://media.example/master.m3u8',master],
 ['https://media.example/video.m3u8',media],
 ['https://media.example/audio.m3u8',media],
 ['https://media.example/subs.vtt',vtt]
]);
const fetcher=async url=>new Response(responses.get(url)||'not found',{status:responses.has(url)?200:404});
(async()=>{
 const result=await inspectHlsSource({sourceUrl:'https://media.example/master.m3u8',provider:'test',fetcher});
 assert.equal(result.report.resolution,'1280x720');
 assert.equal(result.report.videoSegments,3);
 assert.equal(result.report.audioSegments,3);
 assert.equal(result.report.subtitleCueCount,5);
 assert.equal(result.report.audioLanguage,'en');
 assert.equal(result.report.sourceUrlStored,true);
 assert.throws(()=>assertPublicHttps('http://127.0.0.1/private'),/public HTTPS/);
 console.log('V2 source resolver tests passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
