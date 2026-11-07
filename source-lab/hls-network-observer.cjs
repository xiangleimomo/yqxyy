'use strict';
/**
 * Passive HLS candidate collector for browser-based source checks.
 * Use only on playback pages/media for which monitoring and reuse are authorized.
 * Never captures cookies, authorization headers, or media segments.
 */
const HLS_RE = /\.m3u8(?:$|[?#])/i;
function isHlsCandidate(url, contentType = '') {
  if (typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    return HLS_RE.test(parsed.pathname) || /(?:application\/(?:vnd\.apple\.mpegurl|x-mpegurl)|audio\/mpegurl)/i.test(contentType);
  } catch { return false; }
}
function attachHlsObserver(context, options = {}) {
  if (!context || typeof context.on !== 'function') throw new TypeError('Browser context required');
  const maxCandidates = Math.min(100, Math.max(1, Number(options.maxCandidates) || 20));
  const candidates = new Map();
  const record = (url, status, type) => {
    if (!isHlsCandidate(url, type) || candidates.has(url) || candidates.size >= maxCandidates) return;
    candidates.set(url, { url, status: status ?? null, contentType: type || '' });
  };
  const onRequest = request => record(request.url(), null, '');
  const onResponse = response => {
    const headers = response.headers();
    record(response.url(), response.status(), headers['content-type'] || '');
    const item = candidates.get(response.url());
    if (item) { item.status = response.status(); item.contentType = headers['content-type'] || ''; }
  };
  context.on('request', onRequest);
  context.on('response', onResponse);
  return {
    candidates: () => [...candidates.values()],
    stop: () => { context.off('request', onRequest); context.off('response', onResponse); }
  };
}
module.exports = { isHlsCandidate, attachHlsObserver };
