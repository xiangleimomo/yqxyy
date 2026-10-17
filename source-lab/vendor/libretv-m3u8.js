var LibreTVM3u8 = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // source-lab/vendor/libretv-m3u8.ts
  var libretv_m3u8_exports = {};
  __export(libretv_m3u8_exports, {
    LIVE_STREAM_BASE: () => LIVE_STREAM_BASE,
    PROXY_BASE: () => PROXY_BASE,
    documentBaseURI: () => documentBaseURI,
    isProxiedUri: () => isProxiedUri,
    makeAbsolute: () => makeAbsolute,
    rewriteM3u8: () => rewriteM3u8,
    stripAdGroups: () => stripAdGroups,
    stripLeadAdGroup: () => stripLeadAdGroup
  });
  var PROXY_BASE = "/api/proxy?url=";
  var LIVE_STREAM_BASE = "/api/live/stream?url=";
  function isProxiedUri(uri) {
    return uri.startsWith("/api/proxy") || uri.startsWith("/api/live/stream");
  }
  function documentBaseURI() {
    return typeof document === "undefined" ? void 0 : document.baseURI;
  }
  function makeAbsolute(url, base) {
    try {
      return new URL(url, base).href;
    } catch {
      return url;
    }
  }
  function rewriteM3u8(content, baseUrl, depth = 0, prefix = PROXY_BASE) {
    if (depth > 5) return content;
    const lines = content.split("\n");
    const out = lines.map((line) => {
      if (line.startsWith("#EXT-X-KEY") || line.startsWith("#EXT-X-MAP")) {
        return line.replace(/(URI=")([^"]+)(")/g, (m, p1, uri, p2) => {
          if (isProxiedUri(uri)) return m;
          return p1 + prefix + encodeURIComponent(makeAbsolute(uri, baseUrl)) + p2;
        });
      }
      if (line.startsWith("#") || line.trim() === "") return line;
      if (isProxiedUri(line)) return line;
      return prefix + encodeURIComponent(makeAbsolute(line, baseUrl));
    });
    return out.join("\n");
  }
  var LEAD_AD_MAX_SECONDS = 90;
  var LEAD_AD_MAX_SEGMENTS = 20;
  function stripLeadAdGroup(m3u8Content) {
    if (!m3u8Content) return "";
    const lines = m3u8Content.split("\n");
    const isDisc = (l) => l.trim() === "#EXT-X-DISCONTINUITY";
    const isSegment = (l) => {
      const t = l.trim();
      return t !== "" && !t.startsWith("#");
    };
    const discIdx = [];
    for (let i = 0; i < lines.length; i++) if (isDisc(lines[i])) discIdx.push(i);
    if (discIdx.length >= 4) {
      const groupSize = (from, to) => {
        let seg = 0;
        for (let k = from; k < to; k++) if (isSegment(lines[k])) seg += 1;
        return seg;
      };
      const leadSize = groupSize(discIdx[0] + 1, discIdx[1]);
      const others = [];
      for (let g = 1; g < discIdx.length; g++) {
        others.push(groupSize(discIdx[g] + 1, g + 1 < discIdx.length ? discIdx[g + 1] : lines.length));
      }
      const sorted = [...others].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      const typical = Math.abs(leadSize - median) <= Math.max(3, median * 0.5);
      if (typical) return m3u8Content;
    }
    const firstDisc = discIdx[0];
    if (firstDisc === void 0) return m3u8Content;
    if (lines.slice(0, firstDisc).some(isSegment)) return m3u8Content;
    const nextDisc = discIdx.slice(1).find((i) => i > firstDisc);
    if (nextDisc === void 0) return m3u8Content;
    let seconds = 0;
    let count = 0;
    for (let i = firstDisc + 1; i < nextDisc; i++) {
      const m = lines[i].trim().match(/^#EXTINF:([\d.]+)/);
      if (m) seconds += parseFloat(m[1]) || 0;
      else if (isSegment(lines[i])) count += 1;
    }
    if (count === 0 || count > LEAD_AD_MAX_SEGMENTS) return m3u8Content;
    if (seconds <= 0 || seconds > LEAD_AD_MAX_SECONDS) return m3u8Content;
    const kept = lines.filter((l, i) => {
      if (i < firstDisc || i >= nextDisc) return true;
      const t = l.trim();
      return t.startsWith("#EXT-X-KEY") || t.startsWith("#EXT-X-MAP");
    });
    const out = [];
    let seenSegment = false;
    for (const l of kept) {
      if (!seenSegment && isDisc(l)) continue;
      if (isSegment(l)) seenSegment = true;
      out.push(l);
    }
    return out.join("\n");
  }
  var AD_URL_PATTERN = /adjump|advert|\/ads?\//i;
  function looksLikeAdUrl(line) {
    return AD_URL_PATTERN.test(line.trim());
  }
  function stripMarkedAdGroups(m3u8Content) {
    if (!m3u8Content) return "";
    const lines = m3u8Content.split("\n");
    const isDisc = (l) => l.trim() === "#EXT-X-DISCONTINUITY";
    const isSegment = (l) => {
      const t = l.trim();
      return t !== "" && !t.startsWith("#");
    };
    const drop = new Array(lines.length).fill(false);
    let i = 0;
    while (i < lines.length) {
      if (!isDisc(lines[i])) {
        i += 1;
        continue;
      }
      let j = i + 1;
      let count = 0;
      let allAd = true;
      while (j < lines.length && !isDisc(lines[j])) {
        if (isSegment(lines[j])) {
          count += 1;
          if (!looksLikeAdUrl(lines[j])) allAd = false;
        }
        j += 1;
      }
      if (count > 0 && allAd) {
        drop[i] = true;
        for (let k = i + 1; k < j; k++) {
          const t = lines[k].trim();
          if (t.startsWith("#EXT-X-KEY") || t.startsWith("#EXT-X-MAP")) continue;
          drop[k] = true;
        }
      }
      i = j;
    }
    if (!drop.some(Boolean)) return m3u8Content;
    return lines.filter((_, idx) => !drop[idx]).join("\n");
  }
  var INTERSTITIAL_MAX_SECONDS = 30;
  var INTERSTITIAL_NEIGHBOR_MIN_SECONDS = 120;
  function scanGroups(lines, isDisc, isSegment) {
    const discIdx = [];
    for (let i = 0; i < lines.length; i++) if (isDisc(lines[i])) discIdx.push(i);
    const groups = [];
    const bounds = [0, ...discIdx, lines.length];
    for (let k = 0; k < bounds.length - 1; k++) {
      const start = k === 0 ? 0 : bounds[k] + 1;
      const end = bounds[k + 1];
      let seconds = 0;
      let count = 0;
      for (let i = start; i < end; i++) {
        const m = lines[i].trim().match(/^#EXTINF:([\d.]+)/);
        if (m) seconds += parseFloat(m[1]) || 0;
        else if (isSegment(lines[i])) count += 1;
      }
      groups.push({ start, end, discLine: k === 0 ? -1 : bounds[k], seconds, count });
    }
    return groups;
  }
  function stripInterstitialAdGroups(m3u8Content) {
    if (!m3u8Content) return "";
    const lines = m3u8Content.split("\n");
    const isDisc = (l) => l.trim() === "#EXT-X-DISCONTINUITY";
    const isSegment = (l) => {
      const t = l.trim();
      return t !== "" && !t.startsWith("#");
    };
    const groups = scanGroups(lines, isDisc, isSegment);
    const drop = new Array(lines.length).fill(false);
    for (let k = 1; k < groups.length; k++) {
      const g = groups[k];
      const prev = groups[k - 1];
      const next = groups[k + 1];
      if (g.count === 0 || g.discLine < 0) continue;
      if (g.seconds <= 0 || g.seconds > INTERSTITIAL_MAX_SECONDS) continue;
      if (!prev || prev.seconds < INTERSTITIAL_NEIGHBOR_MIN_SECONDS) continue;
      if (!next || next.seconds < INTERSTITIAL_NEIGHBOR_MIN_SECONDS) continue;
      drop[g.discLine] = true;
      for (let i = g.start; i < g.end; i++) {
        const t = lines[i].trim();
        if (t.startsWith("#EXT-X-KEY") || t.startsWith("#EXT-X-MAP")) continue;
        drop[i] = true;
      }
    }
    if (!drop.some(Boolean)) return m3u8Content;
    return lines.filter((_, idx) => !drop[idx]).join("\n");
  }
  function stripLeadingDisc(content) {
    const lines = content.split("\n");
    const firstSeg = lines.findIndex((l) => {
      const t = l.trim();
      return t !== "" && !t.startsWith("#");
    });
    if (firstSeg <= 0) return content;
    const kept = lines.filter((l, i) => !(i < firstSeg && l.trim() === "#EXT-X-DISCONTINUITY"));
    return kept.length === lines.length ? content : kept.join("\n");
  }
  function stripAdGroups(m3u8Content) {
    if (!m3u8Content) return "";
    return stripLeadingDisc(stripLeadAdGroup(stripInterstitialAdGroups(stripMarkedAdGroups(m3u8Content))));
  }
  return __toCommonJS(libretv_m3u8_exports);
})();
