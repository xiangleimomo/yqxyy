// SPDX-License-Identifier: AGPL-3.0-only
const core = require('./core.js');
const aliases = require('./subtitle-films.json');
const ORIGIN = 'https://dulo.mov';
const META = 'https://v3-cinemeta.strem.io';
const CDN = core.duloCdnOrigin;
const imdb = id => /^tt\d{5,12}$/.test(String(id || ''));
function mediaUrl(raw) {
  const safe = core.safeUrl(raw);
  if (!safe) return '';
  const u = new URL(safe);
  // The public lookup now also returns opaque HLS filenames prefixed with ~.
  // Use the supplied URL as-is; do not decode it or copy session rebind values.
  return /^\/play\/[A-Za-z0-9._-]{1,160}\/(?:master\.m3u8|~[A-Za-z0-9._-]{1,160})$/.test(u.pathname) && !u.search && !u.hash ? core.duloMediaUrl(safe) : '';
}
function createDuloProvider(read, fetcher = (...args) => fetch(...args)) {
  const cache = new Map();
  async function json(url, signal, cacheable = true) {
    const old = cache.get(url);
    if (cacheable && old?.until > Date.now()) return old.data;
    const r = await fetcher(url, {signal, redirect: 'error', headers: {Accept: 'application/json'}});
    const data = JSON.parse(await read(r));
    if (cacheable) {
      if (cache.size >= 100) cache.delete(cache.keys().next().value);
      cache.set(url, {until: Date.now() + 600000, data});
    }
    return data;
  }
  async function meta(type, id, signal) {
    return (await json(`${META}/meta/${type === 'tv' ? 'series' : 'movie'}/${id}.json`, signal)).meta;
  }
  async function stream(type, id, signal) {
    const u = new URL('/cdn', CDN);
    u.searchParams.set('tmdb', id); u.searchParams.set('type', type);
    if (type === 'tv') { u.searchParams.set('season', '1'); u.searchParams.set('episode', '1'); }
    // The same public lookup used by the site's watch page. Never store signed
    // stream URLs in the catalogue or imitate its protected bridge transports.
    const data = await json(u.href, signal, false);
    return data.ready === true ? mediaUrl(data.url) : '';
  }
  function item(provider, type, m, id) {
    const row = core.parseList({list: [{vod_id: id, vod_name: m.name, vod_pic: m.poster, vod_year: String(m.year || m.releaseInfo || '').slice(0, 4), vod_lang: m.language || '', type_name: type === 'tv' ? 'TV' : 'Movie'}]}, provider)[0];
    if (!row) return null;
    row.id = `${type}:${id}:${m.imdb_id || m.id}`;
    row.lookupTitle = row.title;
    row.websiteUrl = `${ORIGIN}/watch/${type}/${id}${type === 'tv' ? '?s=1&e=1' : ''}`;
    row.remarks = type === 'tv' ? '剧集 · 第1季第1集；更多集数在原站选择' : '电影 · 原站直连线路';
    return row;
  }
  return {
    async search(provider, query) {
      // Catalogue and per-title metadata have separate budgets. A slow TV
      // search must not consume the movie metadata request's entire timeout.
      const alias = aliases.find(row => [row.title, row.titleZh].some(t => core.normalize(t) === core.normalize(query)));
      let title = alias?.title || query;
      if (!alias && /[\u3400-\u9fff]/.test(query)) {
        // Chinese catalogue searches can return loosely related recommendations.
        // Resolve the localized title first when a public English label exists.
        try {
          const u = new URL('https://www.wikidata.org/w/api.php');
          for (const [key, value] of Object.entries({action:'wbsearchentities',search:query,language:'zh',uselang:'en',format:'json',limit:'5'})) u.searchParams.set(key,value);
          const data = await json(u.href, AbortSignal.timeout(6000));
          const found = (data.search || []).find(row => /film|television|series|franchise/i.test(row.description || row.display?.description?.value || '') && /[a-z]/i.test(row.display?.label?.value || row.label || ''));
          if (found) title = found.display?.label?.value || found.label;
        } catch { /* Keep the original query when translation is unavailable. */ }
      }
      const signal = AbortSignal.timeout(15000);
      const types = imdb(query) ? ['movie', 'tv'] : ['movie', 'series'];
      const outcomes = await Promise.allSettled(types.map(async type => {
        if (imdb(query)) { const m = await meta(type, query, signal); return m ? [{...m, type: type === 'tv' ? 'series' : type}] : []; }
        const data = await json(`${META}/catalog/${type}/top/search=${encodeURIComponent(title)}.json`, signal);
        return (data.metas || []).filter(m => imdb(m.id)).slice(0, 8);
      }));
      if (outcomes.every(x => x.status === 'rejected')) throw Error('Dulo 影片匹配暂不可用，请在原站搜索');
      const candidates = outcomes.flatMap(x => x.status === 'fulfilled' ? x.value : []);
      const rows = await Promise.all(candidates.map(async candidate => {
        try {
          const type = candidate.type === 'series' ? 'tv' : 'movie';
          const m = await meta(type, candidate.imdb_id || candidate.id, AbortSignal.timeout(10000));
          const id = String(m?.moviedb_id || '');
          if (!/^\d{1,9}$/.test(id) || !m.name) return null;
          const row = item(provider, type, m, id);
          if (!row || row.language === 'zh') return null;
          // Cinemeta searches across localized titles and aliases. Its returned
          // English title need not contain the original (often Chinese) query.
          // Availability is checked on selection, never used to hide a match.
          row.remarks = type === 'tv' ? '剧集匹配 · 试播时查询第1季第1集；更多集数在原站选择' : '影片匹配 · 点击试播查询线路';
          return row;
        } catch { return null; }
      }));
      const seen = new Set();
      return rows.filter(row => row && !seen.has(row.id) && seen.add(row.id));
    },
    async detail(provider, raw) {
      const match = /^(movie|tv):(\d{1,9}):(tt\d{5,12})$/.exec(String(raw));
      if (!match) throw Error('Dulo 影片编号无效');
      const [, type, id, imdbId] = match, signal = AbortSignal.timeout(10000);
      const m = await meta(type, imdbId, signal);
      if (String(m?.moviedb_id) !== id) throw Error('Dulo 影片信息不匹配，请重新搜索');
      const row = item(provider, type, m, id);
      if (!row) throw Error('Dulo 影片信息不可用');
      const url = await stream(type, id, signal);
      row.episodes = url ? [{label: type === 'tv' ? 'S01E01' : '正片', line: 'Dulo · 原站直连', url}] : [];
      return row;
    }
  };
}
module.exports = {createDuloProvider, mediaUrl};
