'use strict';
const assert = require('node:assert/strict');
const hls = require('./v2-hls.cjs');

const master = [
  '#EXTM3U',
  '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="English",LANGUAGE="en",DEFAULT=YES,AUTOSELECT=YES,URI="audio/en.m3u8"',
  '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English",LANGUAGE="en",URI="subs/en.m3u8"',
  '#EXT-X-STREAM-INF:BANDWIDTH=1200000,RESOLUTION=1280x720,CODECS="avc1.4d401f,mp4a.40.2",AUDIO="aud",SUBTITLES="subs"',
  'video/720.m3u8',
  '#EXT-X-STREAM-INF:BANDWIDTH=500000,RESOLUTION=640x360,AUDIO="aud"',
  'video/360.m3u8'
].join('\n');
const parsedMaster = hls.parseMaster(master, 'https://media.example/movie/master.m3u8');
assert.equal(hls.chooseVariant(parsedMaster).RESOLUTION, '1280x720');
assert.equal(hls.chooseTrack(parsedMaster, 'AUDIO').LANGUAGE, 'en');
assert.equal(hls.chooseTrack(parsedMaster, 'SUBTITLES').NAME, 'English');
assert.equal(hls.chooseVariant(parsedMaster).uri, 'https://media.example/movie/video/720.m3u8');

const video = [
  '#EXTM3U', '#EXT-X-VERSION:6', '#EXT-X-TARGETDURATION:6',
  '#EXT-X-MEDIA-SEQUENCE:900', '#EXT-X-DISCONTINUITY-SEQUENCE:3',
  '#EXT-X-KEY:METHOD=AES-128,URI="../keys/key.bin",IV=0x1234',
  '#EXTINF:4.0,', 'seg/900.ts',
  '#EXTINF:4.0,', 'seg/901.ts',
  '#EXT-X-DISCONTINUITY',
  '#EXT-X-KEY:METHOD=AES-128,URI="../keys/key2.bin"',
  '#EXTINF:4.0,', 'seg/902.ts',
  '#EXTINF:4.0,', 'seg/903.ts',
  '#EXT-X-ENDLIST'
].join('\n');
const parsedVideo = hls.parseMediaPlaylist(video, 'https://media.example/movie/video/index.m3u8');
assert.equal(parsedVideo.duration, 16);
assert.equal(parsedVideo.segments[2].key.includes('key2.bin'), true);
const selectedVideo = hls.selectSegments(parsedVideo, 5, 13);
assert.equal(selectedVideo.mediaSequence, 901);
assert.equal(selectedVideo.timelineOrigin, 4);
assert.equal(selectedVideo.clipStart, 1);
assert.equal(selectedVideo.clipEnd, 9);
const videoOut = hls.buildMediaPlaylist(parsedVideo, selectedVideo);
assert.match(videoOut, /#EXT-X-MEDIA-SEQUENCE:901/);
assert.match(videoOut, /#EXT-X-DISCONTINUITY-SEQUENCE:3/);
assert.match(videoOut, /URI="https:\/\/media\.example\/movie\/keys\/key\.bin"/);
assert.match(videoOut, /URI="https:\/\/media\.example\/movie\/keys\/key2\.bin"/);
assert.match(videoOut, /#EXT-X-DISCONTINUITY/);
assert.match(videoOut, /seg\/901\.ts/);
assert.match(videoOut, /seg\/902\.ts/);
assert.doesNotMatch(videoOut, /seg\/900\.ts/);

const audio = [
  '#EXTM3U', '#EXT-X-TARGETDURATION:5', '#EXT-X-MEDIA-SEQUENCE:120',
  '#EXTINF:5,', 'a/120.aac',
  '#EXTINF:5,', 'a/121.aac',
  '#EXTINF:5,', 'a/122.aac',
  '#EXTINF:5,', 'a/123.aac',
  '#EXT-X-ENDLIST'
].join('\n');
const parsedAudio = hls.parseMediaPlaylist(audio, 'https://media.example/movie/audio/index.m3u8');
const selectedAudio = hls.selectSegments(parsedAudio, 5, 13);
assert.equal(selectedAudio.mediaSequence, 121);
assert.equal(selectedAudio.timelineOrigin, 5);
assert.notEqual(selectedAudio.mediaSequence, selectedVideo.mediaSequence);
const audioOut = hls.buildMediaPlaylist(parsedAudio, selectedAudio);
assert.match(audioOut, /a\/121\.aac/);
assert.match(audioOut, /a\/122\.aac/);

const fmp4 = [
  '#EXTM3U', '#EXT-X-VERSION:7', '#EXT-X-TARGETDURATION:4',
  '#EXT-X-MEDIA-SEQUENCE:1', '#EXT-X-MAP:URI="init.mp4",BYTERANGE="720@0"',
  '#EXT-X-BYTERANGE:1000@0', '#EXTINF:4,', 'media.mp4',
  '#EXT-X-BYTERANGE:1000@1000', '#EXTINF:4,', 'media.mp4',
  '#EXT-X-ENDLIST'
].join('\n');
const parsedFmp4 = hls.parseMediaPlaylist(fmp4, 'https://media.example/fmp4/index.m3u8');
const fmp4Out = hls.buildMediaPlaylist(parsedFmp4, hls.selectSegments(parsedFmp4, 0, 8));
assert.match(fmp4Out, /#EXT-X-MAP:URI="https:\/\/media\.example\/fmp4\/init\.mp4"/);
assert.match(fmp4Out, /#EXT-X-BYTERANGE:1000@1000/);

// A cut beginning in the middle of a key/map/byte-range run must carry the
// effective initialization and encryption state into the new playlist.
const midFmp4 = hls.buildMediaPlaylist(parsedFmp4, hls.selectSegments(parsedFmp4, 4, 8));
assert.match(midFmp4, /#EXT-X-MAP:URI="https:\/\/media\.example\/fmp4\/init\.mp4"/);
assert.match(midFmp4, /#EXT-X-BYTERANGE:1000@1000/);
assert.doesNotMatch(midFmp4, /#EXT-X-BYTERANGE:1000@0/);

const implicitRange = [
  '#EXTM3U', '#EXT-X-TARGETDURATION:4', '#EXT-X-MEDIA-SEQUENCE:7',
  '#EXT-X-BYTERANGE:1000@0', '#EXTINF:4,', 'single.mp4',
  '#EXT-X-BYTERANGE:1000', '#EXTINF:4,', 'single.mp4',
  '#EXT-X-ENDLIST'
].join('\\n');
const implicitParsed = hls.parseMediaPlaylist(implicitRange, 'https://media.example/range/index.m3u8');
const implicitCut = hls.buildMediaPlaylist(implicitParsed, hls.selectSegments(implicitParsed, 4, 8));
assert.match(implicitCut, /#EXT-X-BYTERANGE:1000@1000/);
assert.ok(implicitCut.indexOf('#EXT-X-BYTERANGE:1000@1000') < implicitCut.indexOf('#EXTINF:4,'));
assert.doesNotMatch(implicitCut, /#EXT-X-BYTERANGE:1000@0/);

assert.throws(() => hls.parseMediaPlaylist(video.replace('#EXT-X-ENDLIST', ''), 'https://media.example/live.m3u8'), /Live playlists/);
assert.throws(() => hls.parseMediaPlaylist(video.replace('AES-128', 'SAMPLE-AES'), 'https://media.example/drm.m3u8'), /Unsupported or DRM/);
assert.throws(() => hls.parseMediaPlaylist('#EXTM3U\n#EXT-X-PART:DURATION=0.3,URI="part.m4s"', 'https://media.example/ll.m3u8'), /Low-latency/);

console.log('V2 HLS parser tests passed');
