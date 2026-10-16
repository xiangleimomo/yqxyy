const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {parse, run, reviewedBackups} = require('../scripts/import-movie-sources.cjs');
const movies = new Map();
for (const series of fs.readdirSync(path.join(__dirname, '../data/movies'))) {
  const file = path.join(__dirname, '../data/movies', series, 'movies.json');
  if (!fs.existsSync(file)) continue;
  for (const movie of JSON.parse(fs.readFileSync(file, 'utf8')).sources || []) {
    assert(!movies.has(movie.id), 'Duplicate catalogue ID'); movies.set(movie.id, movie);
  }
}
assert.equal(Object.keys(reviewedBackups).length, 8);
for (const [id, pathname] of Object.entries(reviewedBackups)) {
  const movie = movies.get(id);
  assert.equal(movie.backupHlsUrl, 'https://vip.dytt-live.com' + pathname, id);
  assert(require('../js/dytt-ad-skip.js').enabled(movie.backupHlsUrl), id);
}
assert.throws(() => parse('Unknown\nhttps://example.com/a.m3u8'), /Unmatched/);
assert.throws(() => parse('功夫熊猫1\nhttps://example.com/a.m3u8\n功夫熊猫1\nhttps://example.com/b.m3u8'), /Duplicate/);
assert.throws(() => parse('功夫熊猫1\nhttp://example.com/a.m3u8'), /Invalid/);
assert.equal(parse('无敌破坏王\nhttps://mujizybf.com/m3u8/?url=https://mujizybf08.com/movie/auto/test.m3u8').get('wreck-it-ralph-1'), 'https://mujizybf08.com/movie/auto/test.m3u8');
assert.deepEqual(parse('超人总动员\n\n功夫熊猫1\nhttps://example.com/a.m3u8').missing, ['超人总动员']);
if (process.argv[2]) {
  const requested = parse(fs.readFileSync(process.argv[2], 'utf8'));
  assert(requested.size >= 33);
  for (const [id, url] of requested) {
    assert.equal(movies.get(id).hlsUrl, url, id);
    assert(!require('../js/dytt-ad-skip.js').enabled(url), 'New main sources do not use old ad rules');
  }
  assert.equal(run(process.argv[2]).files.length, 0, 'Import is idempotent');
}
console.log('PASS: catalogue IDs, eight reviewed backups, requested URLs, player-page URL extraction, missing-URL preservation and idempotent import');
