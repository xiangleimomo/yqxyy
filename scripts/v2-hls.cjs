'use strict';

// Story-first HLS primitives. These functions only prepare playlists after story
// boundaries have been approved; HLS segment boundaries never decide episodes.

function attrs(line) {
  const out = {};
  const body = line.slice(line.indexOf(':') + 1);
  for (const match of body.matchAll(/([A-Z0-9-]+)=("[^"]*"|[^,]*)/g)) {
    out[match[1]] = match[2].replace(/^"|"$/g, '');
  }
  return out;
}
function safeResolve(uri, base) {
  const value = new URL(uri, base);
  if (!['https:', 'http:'].includes(value.protocol) || value.username || value.password) {
    throw new Error('Unsafe HLS URI');
  }
  return value.href;
}
function parseMaster(text, baseUrl) {
  if (!String(text).trimStart().startsWith('#EXTM3U')) throw new Error('Invalid HLS master');
  const lines = String(text).replace(/^\uFEFF/, '').split(/\r?\n/).map(x => x.trim());
  if (lines.some(line => line.startsWith('#EXT-X-SESSION-KEY:'))) throw new Error('Session-level encryption is not supported by this worker');
  const media = [], variants = [];
  let pending = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('#EXT-X-MEDIA:')) {
      const a = attrs(line);
      if (!['AUDIO', 'SUBTITLES', 'VIDEO', 'CLOSED-CAPTIONS'].includes(a.TYPE)) continue;
      media.push({ ...a, uri: a.URI ? safeResolve(a.URI, baseUrl) : null, raw: line });
    } else if (line.startsWith('#EXT-X-STREAM-INF:')) {
      pending = { ...attrs(line), raw: line };
    } else if (pending && line && !line.startsWith('#')) {
      variants.push({ ...pending, uri: safeResolve(line, baseUrl) });
      pending = null;
    } else if (line.startsWith('#EXT-X-I-FRAME-STREAM-INF:')) {
      // I-frame playlists are preview-only, never selected as the main video.
      continue;
    }
  }
  if (!variants.length) {
    if (lines.some(x => x.startsWith('#EXTINF:'))) {
      return { kind: 'media', variants: [{ uri: baseUrl, raw: null }], media, sourceUrl: baseUrl };
    }
    throw new Error('Master has no playable video variants');
  }
  return { kind: 'master', variants, media, sourceUrl: baseUrl };
}
function rankVariant(v) {
  const [w, h] = String(v.RESOLUTION || '0x0').split('x').map(Number);
  const bandwidth = Number(v['AVERAGE-BANDWIDTH'] || v.BANDWIDTH || 0);
  return [Number.isFinite(h) ? h : 0, Number.isFinite(w) ? w : 0, bandwidth];
}
function chooseVariant(master) {
  if (!master.variants?.length) throw new Error('No video variants');
  return [...master.variants].sort((a, b) => {
    const x = rankVariant(a), y = rankVariant(b);
    return y[0] - x[0] || y[1] - x[1] || y[2] - x[2];
  })[0];
}
function chooseTrack(master, type, preferred = 'en', groupId = null) {
  const rows = (master.media || []).filter(x => x.TYPE === type && x.uri && (!groupId || x['GROUP-ID'] === groupId));
  if (!rows.length) return null;
  const lang = row => String(row.LANGUAGE || '').toLowerCase();
  const english = row => /^(en|eng)(-|$)/.test(lang(row)) || /^english/i.test(row.NAME || '');
  const regular = rows.filter(row => !/forced|commentary|descriptive/i.test(row.NAME || ''));
  const pool = regular.length ? regular : rows;
  if (preferred === 'en') {
    const hit = pool.find(english);
    if (hit) return hit;
  }
  return pool.find(x => x.DEFAULT === 'YES') || pool.find(x => x.AUTOSELECT === 'YES') || pool[0];
}
function parseMediaPlaylist(text, baseUrl) {
  const raw = String(text).replace(/^\uFEFF/, '');
  if (!raw.trimStart().startsWith('#EXTM3U')) throw new Error('Invalid HLS media playlist');
  if (/#EXT-X-(?:PART|PRELOAD-HINT|RENDITION-REPORT|SKIP|DEFINE|SESSION-KEY)(?::|$)/m.test(raw)) {
    throw new Error('Low-latency HLS requires a dedicated parser');
  }
  const lines = raw.split(/\r?\n/).map(x => x.trim());
  const globalTags = [];
  const segments = [];
  let mediaSequence = 0, discontinuitySequence = 0, duration = null, at = 0;
  let prefix = [], currentKey = null, currentMap = null, targetDuration = null, pendingRange = null;
  const previousRangeEnd = new Map();
  let endList = false, playlistType = null, version = null;
  for (const line of lines) {
    if (!line) continue;
    if (line.startsWith('#EXT-X-MEDIA-SEQUENCE:')) mediaSequence = Number(line.split(':')[1]);
    else if (line.startsWith('#EXT-X-DISCONTINUITY-SEQUENCE:')) discontinuitySequence = Number(line.split(':')[1]);
    else if (line.startsWith('#EXT-X-TARGETDURATION:')) targetDuration = Number(line.split(':')[1]);
    else if (line.startsWith('#EXT-X-VERSION:')) version = Number(line.split(':')[1]);
    else if (line.startsWith('#EXT-X-PLAYLIST-TYPE:')) playlistType = line.split(':')[1];
    else if (line === '#EXT-X-ENDLIST') endList = true;
    else if (line.startsWith('#EXTINF:')) {
      if (duration !== null) throw new Error('Nested EXTINF');
      duration = Number(line.slice(8).split(',')[0]);
      if (!Number.isFinite(duration) || duration <= 0) throw new Error('Invalid EXTINF duration');
      prefix.push(line);
    } else if (line && !line.startsWith('#')) {
      if (duration === null) throw new Error('Media URI without EXTINF');
      const uri = safeResolve(line, baseUrl);
      let normalizedRange = null;
      if (pendingRange) {
        const offset = pendingRange.offset === null ? previousRangeEnd.get(uri) : pendingRange.offset;
        if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('Implicit byte range has no preceding range for this resource');
        normalizedRange = '#EXT-X-BYTERANGE:' + pendingRange.length + '@' + offset;
        previousRangeEnd.set(uri, offset + pendingRange.length);
        prefix.push(normalizedRange);
        pendingRange = null;
      }
      segments.push({
        index: segments.length,
        sequence: mediaSequence + segments.length,
        start: at,
        end: at + duration,
        duration,
        uri,
        tags: prefix,
        key: currentKey,
        map: currentMap,
        byteRange: normalizedRange
      });
      at += duration;
      duration = null;
      prefix = [];
    } else if (line.startsWith('#EXT-X-DATERANGE:')) {
      throw new Error('EXT-X-DATERANGE needs event-aware trimming before course cutting');
    } else if (line.startsWith('#EXT-X-KEY:')) {
      const a = attrs(line);
      if (!['AES-128', 'NONE'].includes(a.METHOD)) {
        throw new Error('Unsupported or DRM encryption method: ' + a.METHOD);
      }
      if (a.METHOD === 'AES-128') {
        if (!a.URI) throw new Error('AES-128 key URI missing');
        const keyUri = safeResolve(a.URI, baseUrl);
        currentKey = line.replace(/URI="([^"]+)"/, 'URI="' + keyUri + '"');
      } else currentKey = '#EXT-X-KEY:METHOD=NONE';
      prefix.push(currentKey);
    } else if (line.startsWith('#EXT-X-MAP:')) {
      const a = attrs(line);
      if (!a.URI) throw new Error('EXT-X-MAP URI missing');
      const mapUri = safeResolve(a.URI, baseUrl);
      currentMap = line.replace(/URI="([^"]+)"/, 'URI="' + mapUri + '"');
      prefix.push(currentMap);
    } else if (line === '#EXT-X-DISCONTINUITY') {
      prefix.push(line);
    } else if (line.startsWith('#EXT-X-BYTERANGE:')) {
      const m = line.match(/^#EXT-X-BYTERANGE:(\d+)(?:@(\d+))?$/);
      if (!m || pendingRange) throw new Error('Invalid or duplicate byte range');
      pendingRange = { length: Number(m[1]), offset: m[2] === undefined ? null : Number(m[2]) };
    } else if (line.startsWith('#EXT-X-PROGRAM-DATE-TIME:') ||
               line === '#EXT-X-GAP' ||
               line.startsWith('#EXT-X-INDEPENDENT-SEGMENTS')) {
      prefix.push(line);
    } else if (line.startsWith('#EXT-X-') && !/^#EXT-X-(?:ALLOW-CACHE|SERVER-CONTROL|SKIP|RENDITION-REPORT|I-FRAME-STREAM-INF|SESSION-DATA|SESSION-KEY)(?::|$)/.test(line)) {
      // Keep unclassified tags attached to the next segment rather than silently dropping them.
      prefix.push(line);
    } else if (line.startsWith('#')) {
      globalTags.push(line);
    }
  }
  if (duration !== null) throw new Error('Playlist ended before segment URI');
  if (pendingRange) throw new Error('Playlist ended before byte-range segment URI');
  if (!segments.length) throw new Error('Media playlist contains no segments');
  if (!endList) throw new Error('Live playlists are not accepted for course production');
  const discontinuitiesBefore = [];
  let count = 0;
  for (const segment of segments) {
    discontinuitiesBefore.push(count);
    if (segment.tags.includes('#EXT-X-DISCONTINUITY')) count++;
  }
  return {
    kind: 'media', sourceUrl: baseUrl, segments, duration: at,
    mediaSequence, discontinuitySequence, targetDuration, version,
    playlistType, globalTags, discontinuitiesBefore, endList
  };
}
function selectSegments(media, start, end) {
  if (!(Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start && end <= media.duration + 0.001)) {
    throw new Error('Story boundary is outside the source media timeline');
  }
  const selected = media.segments.filter(s => s.end > start && s.start < end);
  if (!selected.length) throw new Error('No HLS segments overlap the story boundary');
  const origin = selected[0].start;
  return {
    segments: selected,
    timelineOrigin: origin,
    clipStart: Math.max(0, start - origin),
    clipEnd: end - origin,
    duration: end - start,
    originalStart: start,
    originalEnd: end,
    mediaSequence: selected[0].sequence,
    discontinuitySequence: media.discontinuitySequence + media.discontinuitiesBefore[selected[0].index]
  };
}
function buildMediaPlaylist(media, selection) {
  const rows = selection.segments;
  if (!rows?.length) throw new Error('Empty segment selection');
  const target = Math.max(media.targetDuration || 0, ...rows.map(s => Math.ceil(s.duration)));
  const out = ['#EXTM3U', '#EXT-X-VERSION:' + (media.version || 3), '#EXT-X-PLAYLIST-TYPE:VOD',
    '#EXT-X-TARGETDURATION:' + target,
    '#EXT-X-MEDIA-SEQUENCE:' + rows[0].sequence];
  if (selection.discontinuitySequence) out.push('#EXT-X-DISCONTINUITY-SEQUENCE:' + selection.discontinuitySequence);
  for (const tag of media.globalTags || []) {
    if (tag.startsWith('#EXT-X-INDEPENDENT-SEGMENTS')) out.push(tag);
  }
  let emittedKey = null, emittedMap = null;
  for (const segment of rows) {
    const hasKeyTag = segment.tags.some(tag => tag.startsWith('#EXT-X-KEY:'));
    const hasMapTag = segment.tags.some(tag => tag.startsWith('#EXT-X-MAP:'));
    if (!hasKeyTag && segment.key && segment.key !== emittedKey) {
      out.push(segment.key);
      emittedKey = segment.key;
    }
    if (!hasKeyTag && !segment.key && emittedKey) {
      out.push('#EXT-X-KEY:METHOD=NONE');
      emittedKey = '#EXT-X-KEY:METHOD=NONE';
    }
    if (!hasMapTag && segment.map && segment.map !== emittedMap) {
      out.push(segment.map);
      emittedMap = segment.map;
    }
    for (const tag of segment.tags) {
      out.push(tag);
      if (tag.startsWith('#EXT-X-KEY:')) emittedKey = tag;
      if (tag.startsWith('#EXT-X-MAP:')) emittedMap = tag;
    }
    out.push(segment.uri);
  }
  out.push('#EXT-X-ENDLIST', '');
  return out.join('\n');
}
function buildEpisodeMaster({ videoPlaylist, audioPlaylist, audioTrack, videoVariant }) {
  const out = ['#EXTM3U', '#EXT-X-VERSION:3'];
  if (audioPlaylist && audioTrack) {
    const language = audioTrack.LANGUAGE || 'und';
    const name = audioTrack.NAME || language;
    out.push('#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="v2audio",NAME="' + name.replace(/"/g, '') +
      '",LANGUAGE="' + language + '",DEFAULT=YES,AUTOSELECT=YES,URI="' + audioPlaylist + '"');
    const bandwidth = Number(videoVariant?.BANDWIDTH || 0);
    const codecs = videoVariant?.CODECS ? ',CODECS="' + videoVariant.CODECS.replace(/"/g, '') + '"' : '';
    const resolution = videoVariant?.RESOLUTION ? ',RESOLUTION=' + videoVariant.RESOLUTION : '';
    out.push('#EXT-X-STREAM-INF:BANDWIDTH=' + (bandwidth || 1000000) + ',AUDIO="v2audio"' + resolution + codecs);
  } else {
    out.push('#EXT-X-STREAM-INF:BANDWIDTH=' + Number(videoVariant?.BANDWIDTH || 1000000));
  }
  out.push(videoPlaylist, '');
  return out.join('\n');
}
module.exports = {
  attrs, parseMaster, chooseVariant, chooseTrack, parseMediaPlaylist,
  selectSegments, buildMediaPlaylist, buildEpisodeMaster
};
