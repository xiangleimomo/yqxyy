const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(require('node:path').join(__dirname, '../js/movies.js'), 'utf8');
const url = 'https://example.test/movie/index.m3u8';
async function render({ua = 'Chrome/155 Safari/537.36', native = 'maybe', supported = true} = {}) {
  const instances = [], attachments = [];
  class Hls {
    static Events = {ERROR: 'error'};
    static isSupported() { return supported; }
    constructor() { instances.push(this); }
    on() {}
    loadSource(value) { this.source = value; }
    attachMedia(value) { this.media = value; }
    destroy() { this.destroyed = true; }
  }
  const player = {isConnected: true, canPlayType: () => native, addEventListener() {}, pause() {}, removeAttribute() {}, load() {}};
  const status = {textContent: '', classList: {toggle() {}}};
  const root = {innerHTML: '', querySelector: () => player};
  const ctx = {window: {Hls, DyttAdSkip: {attach: (...args) => { attachments.push(args); return () => { player.skipDisposed = true; }; }}}, navigator: {userAgent: ua}, document: {getElementById: id => id === 'moviePlayerStatus' ? status : {}}};
  vm.runInNewContext(source, ctx);
  const movie = {id: 'test', title: 'Test', titleZh: '测试', hlsUrl: url};
  const classroom = ctx.window.MovieClassroom;
  classroom.getLibrary = async () => ({series: [{films: [['test']], titleZh: '系列'}], playableById: new Map([['test', movie]])});
  await classroom.renderWatch({el: () => root, escapeHtml: value => String(value)}, 'test');
  return {classroom, player, status, instances, attachments};
}
(async () => {
  for (const native of ['maybe', 'probably', '']) {
    for (const ua of ['Chrome/155 Safari/537.36', 'Chrome/155 Safari/537.36 Edg/155']) {
      const r = await render({native, ua});
      assert.equal(r.instances.length, 1, 'Chromium must use HLS.js, including when native reports maybe');
      assert.equal(r.instances[0].source, url);
      assert.equal(r.instances[0].media, r.player);
      assert.equal(r.player.src, undefined, 'No direct native HLS source on Chromium with MSE');
      assert.equal(r.attachments[0][2], r.instances[0], 'Ad skipping remains attached to HLS.js');
      r.classroom.cleanup(); assert(r.instances[0].destroyed); assert(r.player.skipDisposed);
    }
  }
  const safari = await render({ua: 'Version/18.0 Mobile/15E148 Safari/604.1'});
  assert.equal(safari.instances.length, 0); assert.equal(safari.player.src, url);
  const legacy = await render({supported: false});
  assert.equal(legacy.player.src, url, 'Retain native-only mobile fallback');
  const unsupported = await render({supported: false, native: ''});
  assert.match(unsupported.status.textContent, /不支持 HLS/);
  console.log('PASS: Chrome/Edge maybe/probably, Safari native, native-only fallback, unsupported browser and ad-filter lifecycle');
})().catch(error => {console.error(error); process.exitCode = 1;});
