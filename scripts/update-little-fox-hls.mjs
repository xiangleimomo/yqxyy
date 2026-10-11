import fs from 'node:fs/promises';
import path from 'node:path';

// Read the locally collected catalogue (not committed; it can include other providers).
// Usage: node scripts/update-little-fox-hls.mjs --catalog /path/to/data.json [--apply]
// Each catalogue row has the original HLS URL in column 4, source page in column 5,
// and Little Fox series ID in column 15. Never manufacture a URL by changing resolution.
const args = process.argv.slice(2);
const catalogIndex = args.indexOf('--catalog');
if (catalogIndex < 0 || !args[catalogIndex + 1]) {
  throw new Error('Pass --catalog /path/to/data.json; add --apply to write changes.');
}
const apply = args.includes('--apply');
const catalog = JSON.parse(await fs.readFile(path.resolve(args[catalogIndex + 1]), 'utf8'));
if (!Array.isArray(catalog.rows)) throw new Error('Expected a catalogue with a rows array.');
const assetId = value => {
  if (!value) return null;
  const url = new URL(value);
  if (url.hostname !== 'cdn.littlefox.co.kr') return null;
  return url.pathname.match(/^\/contents_5\/hls\/\d+\/([^/]+)\//)?.[1] || null;
};
const updates = new Map();
for (const row of catalog.rows) {
  const source = new URL(row[4]);
  if (source.hostname !== 'xets.bolinzhiyin.cn' || !source.pathname.startsWith('/xhl_')) continue;
  const asset = assetId(row[3]);
  if (!asset) throw new Error(`Invalid HLS URL for ${row[14]} / ${row[2]}`);
  const key = `${row[14]}:${asset}`;
  const previous = updates.get(key);
  if (previous && previous !== row[3]) throw new Error(`Conflicting catalogue URLs for ${key}`);
  updates.set(key, row[3]);
}
const specialIds = { 'journey-to-the-west': 'FS0078', 'three-kingdoms': 'FS0182' };
const dataDir = path.join(process.cwd(), 'data');
const planned = [];
let series = 0;
let matched = 0;
let changed = 0;
for (const entry of await fs.readdir(dataDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const seriesId = entry.name.match(/-(fs\d+|srv\d+)$/i)?.[1].toUpperCase() || specialIds[entry.name];
  if (!seriesId) continue;
  const file = path.join(dataDir, entry.name, 'episodes.json');
  const original = await fs.readFile(file, 'utf8');
  const episodes = JSON.parse(original);
  const replacements = new Map();
  for (const episode of episodes) {
    const oldUrl = episode.video?.hlsUrl;
    const asset = assetId(oldUrl);
    const nextUrl = updates.get(`${seriesId}:${asset}`);
    if (!asset || !nextUrl) {
      throw new Error(`No unique asset match for ${entry.name}, episode ${episode.episodeId}`);
    }
    matched++;
    if (oldUrl !== nextUrl) {
      replacements.set(oldUrl, nextUrl);
      changed++;
    }
  }
  // Replace only URL string tokens, preserving whitespace and all learning data.
  let replacementCount = 0;
  const updated = original.replace(/("hlsUrl"\s*:\s*)("(?:[^"\\]|\\.)*")/g, (match, prefix, quoted) => {
    const nextUrl = replacements.get(JSON.parse(quoted));
    if (!nextUrl) return match;
    replacementCount++;
    return prefix + JSON.stringify(nextUrl);
  });
  const expected = episodes.filter(ep => replacements.has(ep.video?.hlsUrl)).length;
  if (replacementCount !== expected) throw new Error(`Incomplete replacement in ${file}`);
  if (updated !== original) planned.push({ file, updated });
  series++;
}
// Validate the entire catalogue before writing any files.
if (apply) for (const item of planned) await fs.writeFile(item.file, item.updated);
console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', series, matched, changed, files: planned.length }));
