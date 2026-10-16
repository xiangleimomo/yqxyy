/* Known DYTT ad fingerprint. Keep source time so captions/progress stay aligned. */
(function (root) {
  const pattern = [5.566667, 2.933333, 5.7, 3.333333, 1.533333];
  function enabled(source) {
    try { const u = new URL(source); return u.protocol === 'https:' && u.hostname === 'vip.dytt-live.com'; }
    catch (_) { return false; }
  }
  function ranges(text) {
    if (!text.includes('#EXT-X-ENDLIST') || text.includes('#EXT-X-STREAM-INF:')) return [];
    const rows = []; let time = 0, duration = null, boundary = false;
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (line === '#EXT-X-DISCONTINUITY') boundary = true;
      else if (line.startsWith('#EXTINF:')) duration = Number(line.slice(8).split(',')[0]);
      else if (line && !line.startsWith('#')) {
        if (!Number.isFinite(duration) || duration <= 0) return [];
        rows.push({ start: time, duration, boundary }); time += duration;
        duration = null; boundary = false;
      }
    }
    const found = [];
    for (let i = 0; i + 5 < rows.length; i++) {
      if (!rows[i].boundary || !rows[i + 5].boundary) continue;
      if (pattern.every((d, j) => Math.abs(d - rows[i + j].duration) <= 0.001)) {
        found.push({ start: rows[i].start, end: rows[i + 5].start }); i += 4;
      }
    }
    return found;
  }
  function attach(player, source) {
    if (!enabled(source)) return () => {};
    const controller = new AbortController(); let disposed = false, blocks = [], timer;
    function check() {
      clearTimeout(timer);
      if (disposed) return;
      const t = player.currentTime;
      const block = blocks.find(b => t >= b.start && t < b.end);
      if (block) { player.currentTime = block.end; return; }
      const next = blocks.find(b => b.start > t);
      if (next && !player.paused && !player.seeking && player.playbackRate > 0) {
        timer = setTimeout(check, Math.max(10, (next.start - t) / player.playbackRate * 1000));
      }
    }
    async function read(url, depth = 0) {
      if (depth > 3) throw new Error('Playlist nesting limit');
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error('Playlist unavailable');
      const text = await response.text();
      const lines = text.split(/\r?\n/).map(l => l.trim());
      const master = lines.findIndex(l => l.startsWith('#EXT-X-STREAM-INF:'));
      if (master >= 0) {
        const child = lines.slice(master + 1).find(l => l && !l.startsWith('#'));
        if (!child) throw new Error('Missing variant');
        return read(new URL(child, response.url || url).href, depth + 1);
      }
      return ranges(text);
    }
    const events = ['timeupdate', 'seeking', 'seeked', 'play', 'pause', 'ratechange', 'loadedmetadata'];
    events.forEach(e => player.addEventListener(e, check));
    read(source).then(result => { if (!disposed) { blocks = result; check(); } }).catch(error => {
      if (!disposed) console.warn('DYTT ad detection unavailable; original playback retained.', error);
    });
    return () => { disposed = true; controller.abort(); clearTimeout(timer); events.forEach(e => player.removeEventListener(e, check)); };
  }
  const api = { enabled, ranges, attach };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DyttAdFilter = api;
})(typeof window !== 'undefined' ? window : globalThis);
