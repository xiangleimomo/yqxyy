const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(require('node:path').join(__dirname, '../js/movies.js'), 'utf8');
const url = 'https://example.test/movie/index.m3u8';
async function render({ua = 'Chrome/155 Safari/537.36', native = 'maybe', supported = true, backupHlsUrl, choice} = {}) {
  const instances = [], attachments = [];
  class Hls {
    static Events = {ERROR: 'error'};
    static isSupported() { return supported; }
    constructor() { instances.push(this); }
    on(event, callback) { this.onError = callback; }
    loadSource(value) { this.source = value; }
    attachMedia(value) { this.media = value; }
    destroy() { this.destroyed = true; }
    stopLoad() { this.stopped = true; }
  }
  const player = {isConnected: true, canPlayType: () => native, addEventListener() {}, pause() {}, removeAttribute() {}, load() {}};
  const status = {textContent: '', classList: {toggle() {}}};
  const root = {innerHTML: '', querySelector: () => player};
  const elements = {moviePlayerStatus: status, movieRetry: {}, movieSource: {}};
  const ctx = {window: {Hls, DyttAdSkip: {attach: (...args) => { attachments.push(args); return () => { player.skipDisposed = true; }; }}}, navigator: {userAgent: ua}, document: {getElementById: id => elements[id]}};
  vm.runInNewContext(source, ctx);
  const movie = {id: 'test', title: 'Test', titleZh: '测试', hlsUrl: url, backupHlsUrl};
  const classroom = ctx.window.MovieClassroom;
  classroom.getLibrary = async () => ({series: [{films: [['test']], titleZh: '系列'}], playableById: new Map([['test', movie]])});
  await classroom.renderWatch({el: () => root, escapeHtml: value => String(value)}, 'test', choice);
  return {classroom, player, status, instances, attachments, elements, root};
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
  const backup = 'https://vip.dytt-live.com/20250325/1771_21be9a4b/index.m3u8';
  const primary = await render({backupHlsUrl: backup});
  assert.equal(primary.instances[0].source, url);
  assert.match(primary.root.innerHTML, /id="movieSource"/);
  primary.instances[0].onError('error', {fatal: true});
  assert.match(primary.status.textContent, /请选择备用/);
  primary.elements.movieSource.onchange({target: {value: 'backup'}});
  await new Promise(resolve => setImmediate(resolve));
  assert(primary.instances[0].destroyed);
  assert.equal(primary.instances[1].source, backup);
  assert.equal(primary.attachments.at(-1)[1], backup, 'Use approved backup URL for ad detection');
  primary.elements.movieRetry.onclick();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(primary.instances[2].source, backup, 'Retry preserves selected backup');
  primary.elements.movieSource.onchange({target: {value: 'primary'}});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(primary.instances[3].source, url);
  const duplicate = await render({backupHlsUrl: url});
  assert(!duplicate.root.innerHTML.includes('id="movieSource"'), 'No duplicate option when original remains primary');
  const nativeBackup = await render({ua: 'Version/18.0 Safari/604.1', backupHlsUrl: backup, choice: 'backup'});
  assert.equal(nativeBackup.player.src, backup);
  console.log('PASS: Chrome/Edge maybe/probably, Safari native, native-only fallback, unsupported browser and ad-filter lifecycle');
  console.log('PASS: main/backup switching, error prompt, selected-source retry, duplicate deduplication and native backup');
})().catch(error => {console.error(error); process.exitCode = 1;});
