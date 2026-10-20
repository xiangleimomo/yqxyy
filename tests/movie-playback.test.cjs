const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync(require('node:path').join(__dirname, '../js/movies.js'), 'utf8');
const url = 'https://example.test/movie/index.m3u8';
async function render({ua = 'Chrome/155 Safari/537.36', native = 'maybe', supported = true, backupHlsUrl, backupSources, choice, embedUrl, hlsUrl = url} = {}) {
  const instances = [], attachments = [], timers = new Map();
  let timerId = 0;
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
  const player = {isConnected: true, canPlayType: () => native, events: {}, addEventListener(name, callback) { this.events[name] = callback; }, pause() {}, removeAttribute() {}, load() {}};
  const status = {textContent: '', classList: {toggle() {}}};
  const frames = [], links = [];
  const root = {innerHTML: '', querySelector: selector => selector === '.movie-watch-frame' ? {replaceChildren(frame) {frames.push(frame);}} : selector === '.movie-watch-actions' ? {append(link) {links.push(link);}} : player};
  const elements = {moviePlayerStatus: status, movieRetry: {}, movieSource: {}};
  const ctx = {URL, setTimeout: fn => { timers.set(++timerId, fn); return timerId; }, clearTimeout: id => timers.delete(id), window: {Hls, DyttAdSkip: {attach: (...args) => { attachments.push(args); return () => { player.skipDisposed = true; }; }}}, navigator: {userAgent: ua}, document: {getElementById: id => elements[id], createElement: () => ({events: {}, setAttribute(key, value) {this[key] = value;}, addEventListener(key, callback) {this.events[key] = callback;}, remove() {this.removed = true;}})}};
  vm.runInNewContext(source, ctx);
  const movie = {id: 'test', title: 'Test', titleZh: '测试', hlsUrl, embedUrl, backupHlsUrl, backupSources};
  const classroom = ctx.window.MovieClassroom;
  classroom.getLibrary = async () => ({series: [{films: [['test']], titleZh: '系列'}], playableById: new Map([['test', movie]])});
  await classroom.renderWatch({el: () => root, escapeHtml: value => String(value)}, 'test', choice);
  return {classroom, player, status, instances, attachments, elements, root, frames, links, timers};
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
  const second = 'https://example.test/older.m3u8';
  const multiple = await render({backupSources: [{url: backup}, {url: second}], choice: 'backup-1'});
  assert.equal(multiple.instances[0].source, second);
  multiple.elements.movieRetry.onclick();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(multiple.instances[1].source, second, 'Retry preserves second backup');
  const oldEmbed = await render({backupSources: [{url: 'https://example.test/parse?url=movie', embedded: true}], choice: 'backup'});
  assert.equal(oldEmbed.frames[0].src, 'https://example.test/parse?url=movie');
  const invalidChoice = await render({backupSources: [{url: backup}], choice: 'backup-99'});
  assert.equal(invalidChoice.instances[0].source, url);
  const bluevelvet = 'https://zcdn.bluevelvet.space/play/film-token/master.m3u8?version=1';
  const proxied = '/_movie-media/bluevelvet/film-token/master.m3u8?version=1';
  const cors = await render({hlsUrl: bluevelvet, backupHlsUrl: backup, native: ''});
  assert.equal(cors.instances[0].source, proxied, 'HLS.js requests same-origin manifests');
  assert.equal(cors.attachments[0][1], bluevelvet, 'Ad matching uses original upstream identity');
  cors.elements.movieSource.onchange({target: {value: 'backup'}});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(cors.instances[1].source, backup, 'Old backups keep direct URLs');
  const corsNative = await render({hlsUrl: bluevelvet, ua: 'Version/18.0 Safari/604.1'});
  assert.equal(corsNative.player.src, bluevelvet, 'Safari keeps native media direct');
  const direct = await render({hlsUrl: bluevelvet});
  assert.equal(direct.player.src, bluevelvet, 'Chromium native HLS avoids relay');
  assert.equal(direct.instances.length, 0);
  assert.match(direct.root.innerHTML, /直接打开播放/);
  assert.equal(direct.timers.size, 1);
  direct.player.events.loadedmetadata();
  assert.equal(direct.timers.size, 0, 'Metadata clears startup deadline');
  direct.player.events.error();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(direct.instances[0].source, proxied, 'Failed native support falls back once to relay');
  const timeout = await render({hlsUrl: bluevelvet});
  const deadline = [...timeout.timers.values()][0];
  deadline();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(timeout.instances[0].source, proxied, 'No metadata falls back to compatible playback');
  deadline();
  assert.equal(timeout.instances.length, 1, 'Stale deadlines do not restart playback');
  const cancelled = await render({hlsUrl: bluevelvet});
  const staleError = cancelled.player.events.error;
  cancelled.classroom.cleanup();
  assert.equal(cancelled.timers.size, 0);
  staleError();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(cancelled.instances.length, 0, 'Cleanup cancels native fallback');
  for (const unchanged of ['https://zcdn.bluevelvet.space.evil.test/play/a/master.m3u8', 'https://other.test/play/a/master.m3u8', 'https://zcdn.bluevelvet.space/other/a.m3u8', 'https://zcdn.bluevelvet.space:8443/play/a.m3u8']) assert.equal(cors.classroom.mediaUrl(unchanged), unchanged);
  const toml = fs.readFileSync(require('node:path').join(__dirname, '../netlify.toml'), 'utf8');
  assert(toml.indexOf('from = "/_movie-media/bluevelvet/*"') < toml.indexOf('from = "/*"'), 'Relay must precede SPA fallback');
  assert(toml.includes('to = "https://zcdn.bluevelvet.space/play/:splat"'));
  const duplicate = await render({backupHlsUrl: url});
  assert(!duplicate.root.innerHTML.includes('id="movieSource"'), 'No duplicate option when original remains primary');
  const nativeBackup = await render({ua: 'Version/18.0 Safari/604.1', backupHlsUrl: backup, choice: 'backup'});
  assert.equal(nativeBackup.player.src, backup);
  const parser = 'https://jimaoys99.com/parse?url=' + encodeURIComponent(url);
  for (const config of [{embedUrl: parser, hlsUrl: ''}, {hlsUrl: parser}]) {
    const r = await render(config);
    assert.equal(r.instances.length, 0, 'Parser HTML must never be passed to HLS.js');
    assert.equal(r.attachments.length, 0);
    assert.equal(r.classroom.player, null);
    const frame = r.frames[0];
    assert.equal(frame.src, parser);
    assert.equal(frame.referrerPolicy, 'no-referrer');
    assert(!frame.sandbox.includes('allow-top-navigation'));
    assert.equal(r.links[0].href, parser);
    frame.events.load(); assert.match(r.status.textContent, /页面已加载/);
    assert(!r.status.textContent.includes('正在播放'), 'Iframe load is not playback confirmation');
    r.elements.movieRetry.onclick();
    await new Promise(resolve => setImmediate(resolve));
    assert(frame.removed); assert.equal(frame.src, 'about:blank');
    assert.equal(r.frames[1].src, parser);
    r.classroom.cleanup();
    frame.events.error(); assert(!r.status.textContent.includes('加载失败'), 'Ignore stale iframe events');
    assert.equal(r.classroom.playbackSource({embedUrl: 'javascript:alert(1)'}).url, '');
  }
  const catalog = await render();
  const catalogueMethod = vm.runInNewContext(source + '; window.MovieClassroom.getLibrary', {window: {}, URL});
  const library = await catalogueMethod.call(catalog.classroom, {getJSON: async file => file === 'data/movie-series.json' ? [{id: 'test'}] : {sources: [{id: 'embed', embedUrl: parser}, {id: 'media', hlsUrl: url}, {id: 'invalid', embedUrl: 'javascript:alert(1)'}]}});
  assert.equal(library.playable.length, 2, 'Both media and embedded sources appear in catalogue');
  assert(library.playableById.has('embed'));
  console.log('PASS: embed catalogue, legacy parser URLs, iframe isolation, retry/cleanup and stale events');
  console.log('PASS: Chrome/Edge maybe/probably, Safari native, native-only fallback, unsupported browser and ad-filter lifecycle');
  console.log('PASS: main/backup switching, error prompt, selected-source retry, duplicate deduplication and native backup');
  console.log('PASS: direct native HLS, compatible relay fallback, startup timeout, timer disposal and stale-event isolation');
})().catch(error => {console.error(error); process.exitCode = 1;});
