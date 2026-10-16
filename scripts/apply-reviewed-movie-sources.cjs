// Apply an explicitly reviewed ID/URL manifest without changing backups or other metadata.
// Usage: node scripts/apply-reviewed-movie-sources.cjs <review.json> [--write]
const fs = require('node:fs');
const path = require('node:path');
function apply(file, write = false) {
  const review = JSON.parse(fs.readFileSync(file, 'utf8'));
  const entries = new Map();
  for (const row of review) {
    const u = new URL(row.hlsUrl);
    if (u.protocol !== 'https:' || !u.pathname.endsWith('.m3u8') || row.language !== 'en') throw Error('Unverified media entry: ' + row.id);
    if (entries.has(row.id)) throw Error('Duplicate reviewed ID: ' + row.id);
    entries.set(row.id, row);
  }
  const root = path.join(__dirname, '../data/movies'), plans = [], found = new Set();
  for (const series of fs.readdirSync(root)) {
    const p = path.join(root, series, 'movies.json');
    if (!fs.existsSync(p)) continue;
    const original = fs.readFileSync(p, 'utf8');
    const text = original.replace(/\{[^{}]*\}/g, block => {
      let movie; try { movie = JSON.parse(block); } catch (_) { return block; }
      if (!entries.has(movie.id) || !Object.hasOwn(movie, 'hlsUrl')) return block;
      found.add(movie.id); const row = entries.get(movie.id);
      let next = block.replace(/("hlsUrl"\s*:\s*)"[^"\r\n]*"/, (_, prefix) => prefix + JSON.stringify(row.hlsUrl));
      next = next.replace(/("sourceLabel"\s*:\s*)"[^"\r\n]*"/, (_, prefix) => prefix + JSON.stringify('英语原声'));
      if (row.sourcePage) {
        if (Object.hasOwn(movie, 'sourcePage')) next = next.replace(/("sourcePage"\s*:\s*)"[^"\r\n]*"/, (_, prefix) => prefix + JSON.stringify(row.sourcePage));
        else next = next.replace(/^([ \t]*)"sourceLabel"[^\r\n]*([\r\n]+)/m, (line, indent, newline) => line + indent + '"sourcePage": ' + JSON.stringify(row.sourcePage) + ',' + newline);
      }
      return next;
    });
    JSON.parse(text);
    if (text !== original) plans.push({p, text});
  }
  for (const id of entries.keys()) if (!found.has(id)) throw Error('Movie missing: ' + id);
  if (write) for (const {p, text} of plans) fs.writeFileSync(p, text);
  return {matched: found.size, changedFiles: plans.length, write};
}
if (require.main === module) console.log(JSON.stringify(apply(process.argv[2], process.argv.includes('--write'))));
module.exports = {apply};
