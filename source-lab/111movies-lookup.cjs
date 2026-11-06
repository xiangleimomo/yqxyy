'use strict';
/** 111Movies-only metadata mapping. Does not bypass player access controls. */
const ORIGIN = 'https://111movies.net';
function moviePageUrl(tmdbId) {
  const id = String(tmdbId ?? '').trim();
  if (!/^[1-9]\d{0,11}$/.test(id)) throw new Error('Invalid TMDB movie ID');
  return ORIGIN + '/movie/' + id;
}
function tvPageUrl(tmdbId, season, episode) {
  const id = String(tmdbId ?? '').trim();
  const s = String(season ?? '').trim();
  const e = String(episode ?? '').trim();
  if (!/^[1-9]\d{0,11}$/.test(id) || !/^[1-9]\d{0,3}$/.test(s) || !/^[1-9]\d{0,3}$/.test(e)) throw new Error('Invalid TMDB episode identifiers');
  return ORIGIN + '/tv/' + id + '/' + s + '/' + e;
}
module.exports = { moviePageUrl, tvPageUrl };
