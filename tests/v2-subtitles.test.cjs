'use strict';
const assert=require('node:assert/strict');
const {parseVtt,parseSubtitlePlaylist,validateSubtitleCues}=require('../scripts/v2-subtitles.cjs');
const direct=[
 'WEBVTT','',
 '00:00:01.000 --> 00:00:02.500','Hello there.','',
 '00:00:03.000 --> 00:00:04.000','How are you?',''
].join('\n');
const directCues=parseVtt(direct);
assert.equal(directCues.length,2);
assert.equal(directCues[0].start,1);
const mapped=[
 'WEBVTT','X-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:900000','',
 '00:00:01.000 --> 00:00:02.000','Mapped cue',''
].join('\n');
assert.equal(parseVtt(mapped)[0].start,11);
const playlist=[
 '#EXTM3U','#EXT-X-TARGETDURATION:5','#EXT-X-MEDIA-SEQUENCE:10',
 '#EXTINF:5,','subs/10.vtt','#EXTINF:5,','subs/11.vtt','#EXT-X-ENDLIST'
].join('\n');
const parsed=parseSubtitlePlaylist(playlist,'https://media.example/subs/index.m3u8');
assert.equal(parsed.segments.length,2);
assert.equal(parsed.segments[1].start,5);
assert.equal(parsed.segments[0].url,'https://media.example/subs/subs/10.vtt');
assert.throws(()=>parseSubtitlePlaylist(playlist.replace('#EXT-X-ENDLIST',''),'https://media.example/subs/index.m3u8'),/Live subtitle/);
assert.throws(()=>parseSubtitlePlaylist(playlist.replace('#EXTINF:5,','#EXT-X-KEY:METHOD=AES-128,URI="key"\n#EXTINF:5,'),'https://media.example/subs/index.m3u8'),/Encrypted/);
assert.throws(()=>validateSubtitleCues([{start:3,end:2,text:'bad'},{start:4,end:5,text:'ok'}]),/Invalid subtitle cue/);
console.log('V2 subtitle parser tests passed');
