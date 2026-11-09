'use strict';
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { isHlsCandidate, attachHlsObserver } = require('../source-lab/hls-network-observer.cjs');
assert.equal(isHlsCandidate('https://cdn.example.test/film-a/master.m3u8'), true);
assert.equal(isHlsCandidate('https://cdn.example.test/film-b/playlist.m3u8?quality=1080'), true);
assert.equal(isHlsCandidate('javascript:alert(1)'), false);
assert.equal(isHlsCandidate('https://cdn.example.test/segment.ts'), false);
const context = new EventEmitter();
const observer = attachHlsObserver(context);
for (const [url, status] of [
  ['https://cdn.example.test/film-a/master.m3u8', 200],
  ['https://cdn.example.test/film-b/playlist.m3u8?quality=1080', 200]
]) {
  context.emit('request', { url: () => url });
  context.emit('response', { url: () => url, status: () => status, headers: () => ({ 'content-type': 'application/vnd.apple.mpegurl' }) });
}
assert.equal(observer.candidates().length, 2);
assert.deepEqual(observer.candidates().map(c => c.status), [200, 200]);
observer.stop();
context.emit('request', { url: () => 'https://cdn.example.test/film-c/index.m3u8' });
assert.equal(observer.candidates().length, 2);
console.log('PASS: two synthetic film sources captured, response status recorded, observer stopped');
