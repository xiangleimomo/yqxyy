#!/usr/bin/env node

/* Build the lightweight title index used by the header's instant search. */
const fs = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const dataRoot = path.join(root, 'data');
async function json(file, fallback) { try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return fallback; throw error; } }
async function main() {
  const series = await json(path.join(dataRoot, 'series-list.json'), []);
  const items = [];
  for (const row of series) {
    items.push({ type: 'series', seriesId: row.seriesId, title: row.title, titleZh: row.titleZh || '', status: row.status });
    const episodes = await json(path.join(dataRoot, row.seriesId, 'episodes.json'), []);
    for (const episode of episodes.filter(item => item.status === 'published')) items.push({ type: 'episode', seriesId: row.seriesId, seriesTitle: row.title, seriesTitleZh: row.titleZh || '', episodeId: episode.episodeId, title: episode.title, titleZh: episode.titleZh || '' });
  }
  await fs.writeFile(path.join(dataRoot, 'search-index.json'), `${JSON.stringify({ version: 1, items }, null, 2)}\n`);
  console.log(`Search index: ${items.length} entries.`);
}
main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
