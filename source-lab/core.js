// SPDX-License-Identifier: AGPL-3.0-only
(function (root) {
  const safeUrl = (raw) => {
    try {
      const u = new URL(raw);
      return u.protocol === "https:" && !u.username && !u.password
        ? u.href
        : "";
    } catch {
      return "";
    }
  };
  const clean = (raw) =>
    String(raw || "")
      .replace(/<[^>]*>/g, "")
      .trim();
  const normalize = (raw) =>
    clean(raw)
      .toLowerCase()
      .replace(/[\s\p{P}\p{S}]/gu, "");
  function language(raw) {
    const s = clean(raw);
    if (
      /英语|英文|english|\beng?\b/i.test(s) &&
      /国语|普通话|粤语|汉语|中文|mandarin|cantonese/i.test(s)
    )
      return "unknown";
    if (/英语|英文|english|\beng?\b/i.test(s)) return "en";
    if (/国语|普通话|粤语|汉语|中文|mandarin|cantonese/i.test(s)) return "zh";
    return "unknown";
  }
  function episodes(vod) {
    const labels = String(vod.vod_play_from || "").split("$$$");
    return String(vod.vod_play_url || "")
      .split("$$$")
      .flatMap((group, i) =>
        group.split("#").flatMap((item, j) => {
          const at = item.indexOf("$");
          const raw = at < 0 ? item : item.slice(at + 1);
          let url = safeUrl(raw);
          if (!url) return [];
          const parsed = new URL(url);
          const wrapped = parsed.searchParams.get("url");
          if (wrapped && safeUrl(wrapped)) url = safeUrl(wrapped);
          if (!/\.(m3u8|mp4)$/i.test(new URL(url).pathname)) return [];
          return [
            {
              label: clean(at < 0 ? "播放 " + (j + 1) : item.slice(0, at)),
              line: clean(labels[i] || "线路 " + (i + 1)),
              url,
            },
          ];
        }),
      );
  }
  function parseList(json, provider, query = "") {
    const list = Array.isArray(json?.list) ? json.list : [];
    const q = normalize(query);
    return list
      .filter((v) => v && v.vod_id != null)
      .filter(
        (v) =>
          !/(伦理|福利|伦理片|里番|无码|成人|情色|解说|预告|花絮)/i.test(
            String(v.type_name || "") + " " + String(v.vod_name || ""),
          ),
      )
      .filter(
        (v) =>
          !q ||
          normalize(v.vod_name).includes(q) ||
          normalize(v.vod_en).includes(q),
      )
      .slice(0, 80)
      .map((v) => ({
        id: String(v.vod_id),
        providerId: provider.id,
        providerName: provider.name,
        title: clean(v.vod_name),
        year: clean(v.vod_year),
        language: language(v.vod_lang),
        languageLabel: clean(v.vod_lang) || "语言待核对",
        remarks: clean(v.vod_remarks),
        episodes: episodes(v),
        subtitleUrl: safeUrl(v.vod_subtitle || ""),
        subtitleLabel: "片源字幕",
      }));
  }
  function toVtt(text) {
    text = String(text)
      .replace(/^\uFEFF/, "")
      .replace(/\r\n/g, "\n");
    if (text.trimStart().startsWith("WEBVTT")) return text;
    return "WEBVTT\n\n" + text.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
  }
  function rowsFromText(text, base) {
    if (!text.includes("#EXT-X-ENDLIST")) return [];
    const rows = [];
    let start = 0,
      duration,
      cc = 0;
    for (const l of text.split(/\r?\n/).map((l) => l.trim())) {
      if (l === "#EXT-X-DISCONTINUITY") cc++;
      else if (l.startsWith("#EXTINF:"))
        duration = Number(l.slice(8).split(",")[0]);
      else if (l && !l.startsWith("#")) {
        if (!Number.isFinite(duration) || duration <= 0) return [];
        rows.push({ start, duration, cc, url: new URL(l, base).href });
        start += duration;
        duration = undefined;
      }
    }
    return rows;
  }
  function adRanges(rows, extended = false, strip) {
    const patterns = [
      [5.566667, 2.933333, 5.7, 3.333333, 1.533333],
      [6.666667, 2.133333, 3.233333, 3.733333],
    ];
    const matches = [];
    const add = (a, b, reason) =>
      matches.push({
        start: rows[a].start,
        end: rows[b - 1].start + rows[b - 1].duration,
        reason,
      });
    for (let i = 0; i < rows.length; i++) {
      const boundary = i === 0 || rows[i].cc !== rows[i - 1].cc;
      if (!boundary) continue;
      for (const p of patterns) {
        const end = i + p.length;
        if (
          end < rows.length &&
          rows[end].cc !== rows[end - 1].cc &&
          p.every((d, j) => Math.abs(rows[i + j].duration - d) <= 0.001)
        )
          add(i, end, "已核对的广告时长特征");
      }
      let end = i + 1;
      while (end < rows.length && rows[end].cc === rows[i].cc) end++;
      if (
        end < rows.length &&
        rows.slice(i, end).every((r) => {
          try {
            return /\/(adjump|ads?|advertisement)\//i.test(
              new URL(r.url).pathname,
            );
          } catch {
            return false;
          }
        })
      )
        add(i, end, "明确广告路径");
    }
    if (extended && strip && rows.length) {
      const text = [
        "#EXTM3U",
        ...rows.flatMap((r, i) => [
          ...(i === 0 || r.cc !== rows[i - 1].cc
            ? ["#EXT-X-DISCONTINUITY"]
            : []),
          `#EXTINF:${r.duration},`,
          r.url,
        ]),
        "#EXT-X-ENDLIST",
      ].join("\n");
      const kept = new Set(
        strip(text)
          .split(/\r?\n/)
          .filter((l) => l && !l.startsWith("#")),
      );
      for (let i = 0; i < rows.length;) {
        if (kept.has(rows[i].url)) {
          i++;
          continue;
        }
        let end = i + 1;
        while (end < rows.length && !kept.has(rows[end].url)) end++;
        add(i, end, "LibreTV 扩展识别");
        i = end;
      }
    }
    return matches
      .sort((a, b) => a.start - b.start)
      .reduce((all, r) => {
        const last = all.at(-1);
        if (last && r.start <= last.end + 0.001)
          last.end = Math.max(last.end, r.end);
        else all.push({ ...r });
        return all;
      }, []);
  }
  function sourceList(json) {
    const rows = Array.isArray(json) ? json : json?.sources;
    if (!Array.isArray(rows))
      throw Error("请选择 LibreTV 点播源 JSON（sources 数组）");
    const seen = new Set();
    return rows
      .flatMap((r, i) => {
        const url = safeUrl(r.url);
        if (!url || r.isAdult || seen.has(url)) return [];
        seen.add(url);
        return [
          {
            id: "custom_" + i,
            name: clean(r.name) || new URL(url).hostname,
            url,
            custom: true,
          },
        ];
      })
      .slice(0, 12);
  }
  function subtitlePlaybackTime(time, ranges) {
    const merged = [];
    for (const r of [...ranges].sort((a, b) => a.start - b.start)) {
      if (
        !Number.isFinite(r.start) ||
        !Number.isFinite(r.end) ||
        r.end <= r.start
      )
        continue;
      const previous = merged.at(-1);
      if (previous && r.start <= previous.end)
        previous.end = Math.max(previous.end, r.end);
      else merged.push({ start: r.start, end: r.end });
    }
    let skipped = 0;
    for (const r of merged) {
      if (time < r.start - skipped) break;
      skipped += r.end - r.start;
    }
    return time + skipped;
  }
  const api = {
    safeUrl,
    clean,
    normalize,
    language,
    episodes,
    parseList,
    toVtt,
    rowsFromText,
    adRanges,
    sourceList,
    subtitlePlaybackTime,
  };
  if (typeof module !== "undefined") module.exports = api;
  else root.SourceLabCore = api;
})(typeof window === "undefined" ? globalThis : window);
