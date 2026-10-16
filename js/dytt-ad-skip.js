/* Skip a known ad fingerprint without replacing media URLs or editing playlists. */
(function(root) {
  const fingerprint = [5.566667, 2.933333, 5.7, 3.333333, 1.533333];
  function enabled(source) {
    try { const u = new URL(source); return u.protocol === 'https:' && u.hostname === 'vip.dytt-live.com'; } catch (_) { return false; }
  }
  function find(rows) {
    const result = [];
    for (let i = 0; i + 5 < rows.length; i++) {
      if (!rows[i].boundary || !rows[i+5].boundary) continue;
      if (fingerprint.every((d,j) => Number.isFinite(rows[i+j].duration) && Math.abs(d-rows[i+j].duration) <= 0.001)) {
        result.push({start: rows[i].start, end: rows[i+4].start + rows[i+4].duration}); i += 4;
      }
    }
    return result;
  }
  function fromText(text) {
    if (!text.includes('#EXT-X-ENDLIST')) return [];
    const rows = []; let time = 0, duration = NaN, boundary = false;
    for (const line of text.split(/\r?\n/).map(l => l.trim())) {
      if (line === '#EXT-X-DISCONTINUITY') boundary = true;
      else if (line.startsWith('#EXTINF:')) duration = Number(line.slice(8).split(',')[0]);
      else if (line && !line.startsWith('#')) {
        if (!Number.isFinite(duration) || duration <= 0) return [];
        rows.push({start:time, duration, boundary}); time += duration; duration = NaN; boundary = false;
      }
    }
    return find(rows);
  }
  function fromDetails(details) {
    if (!details || details.live || !Array.isArray(details.fragments)) return [];
    const fragments = details.fragments;
    return find(fragments.map((f,i) => ({start:f.start, duration:f.duration, boundary:i > 0 && f.cc !== fragments[i-1].cc})));
  }
  function attach(player, source, hls) {
    if (!enabled(source)) return () => {};
    let disposed = false, blocks = [], timer, controller, started = false;
    const events = ['timeupdate','seeking','seeked','playing','pause','ratechange','loadedmetadata'];
    function check() {
      clearTimeout(timer);
      if (disposed || player.readyState < 1) return;
      try {
        const t = player.currentTime;
        const block = blocks.find(b => t >= b.start && t < b.end);
        if (block) { player.currentTime = block.end; return; }
        const next = blocks.find(b => b.start > t);
        if (next && !player.paused && !player.seeking && player.playbackRate > 0) {
          timer = setTimeout(check, Math.min(30000, Math.max(20,(next.start-t)/player.playbackRate*1000)));
        }
      } catch (_) { /* Detection/seek failure must never break the original player. */ }
    }
    async function read(url, depth=0) {
      if (depth > 3) throw Error('Playlist nesting limit');
      const response = await fetch(url,{signal:controller.signal});
      if (!response.ok) throw Error('Playlist unavailable');
      const text = await response.text();
      const lines = text.split(/\r?\n/).map(l=>l.trim());
      const master = lines.findIndex(l=>l.startsWith('#EXT-X-STREAM-INF:'));
      if (master >= 0) {
        const child = lines.slice(master+1).find(l=>l && !l.startsWith('#'));
        if (!child) throw Error('Missing variant');
        return read(new URL(child,response.url || url).href,depth+1);
      }
      return fromText(text);
    }
    function nativeReady() {
      if (started || disposed) return; started = true;
      try {
        controller = new AbortController();
        read(source).then(result=>{if(!disposed){blocks=result;check();}}).catch(()=>{});
      } catch (_) { /* Native playback remains unchanged if detection is unavailable. */ }
    }
    const event = root.Hls?.Events?.LEVEL_LOADED;
    const onLevel = (_event,data) => { try { blocks = fromDetails(data?.details); check(); } catch (_) {} };
    try {
      events.forEach(e=>player.addEventListener(e,check));
      if (hls && event) hls.on(event,onLevel);
      else { player.addEventListener('loadedmetadata',nativeReady); if(player.readyState >= 1) nativeReady(); }
    } catch (_) {}
    return () => {
      disposed=true;clearTimeout(timer);controller?.abort();
      events.forEach(e=>player.removeEventListener(e,check));
      player.removeEventListener('loadedmetadata',nativeReady);
      if(hls && event) hls.off(event,onLevel);
    };
  }
  function safeAttach(player,source,hls) {
    try { return attach(player,source,hls); } catch (_) { return () => {}; }
  }
  const api = { enabled, fromText, fromDetails, attach:safeAttach };
  if(typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DyttAdSkip = api;
})(typeof window !== 'undefined' ? window : globalThis);
