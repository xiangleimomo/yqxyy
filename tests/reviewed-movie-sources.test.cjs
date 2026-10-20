const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '..');
const manifest = path.join(root, 'docs/movie-source-review-2026-10-16.json');
const review = JSON.parse(fs.readFileSync(manifest, 'utf8'));
assert.equal(review.length, 29);
const movies = new Map();
for (const series of fs.readdirSync(path.join(root, 'data/movies'))) {
  const f = path.join(root, 'data/movies', series, 'movies.json');
  if (fs.existsSync(f)) for (const movie of JSON.parse(fs.readFileSync(f, 'utf8')).sources) movies.set(movie.id, movie);
}
const seen = new Set();
for (const row of review) {
  assert(!seen.has(row.id)); seen.add(row.id);
  assert.equal(row.language, 'en');
  assert(row.chromePlaybackChecked);
  assert(row.durationSeconds > 3600, 'Do not substitute shorts for feature films');
  assert(row.videoWidth > 0 && row.videoHeight > 0);
  assert(movies.get(row.id).hlsUrl === row.hlsUrl || movies.get(row.id).backupSources?.some(source => source.url === row.hlsUrl), 'Reviewed source remains primary or selectable backup');
  assert.equal(movies.get(row.id).sourcePage, row.sourcePage);
  assert(['英语原声', '主片源'].includes(movies.get(row.id).sourceLabel));
  const u = new URL(row.hlsUrl);
  assert.equal(u.protocol, 'https:'); assert(u.pathname.endsWith('.m3u8'));
}
for (const id of ['frozen-1', 'frozen-2', 'finding-nemo', 'pets-2', 'sing-1']) assert(!seen.has(id));
assert(!review.some(r => r.hlsUrl.includes('6a13ff249918572296801773')), 'Reject the eleven-minute Sing short');
const {apply} = require('../scripts/apply-reviewed-movie-sources.cjs');
if (!review.some(row => movies.get(row.id).hlsUrl !== row.hlsUrl)) assert.equal(apply(manifest).changedFiles, 0, 'Reviewed import must be idempotent');
console.log('PASS: 29 reviewed English feature sources, exact URLs, source provenance, rejected shorts/wrong films and idempotent import');
