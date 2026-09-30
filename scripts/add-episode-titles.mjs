import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const dataRoot = path.join(root, 'data');

function sourceId(seriesId) {
  const match = seriesId.match(/-(fs\d+|srv\d+)$/i);
  return match ? match[1].toUpperCase() : null;
}

function titlesFromHtml(html) {
  const values = [...html.matchAll(/data-contname="([^"]+)"/g)].map(match => match[1].trim());
  const seen = new Set();
  return values.filter(title => title && !seen.has(title) && seen.add(title));
}

async function fetchTitles(id) {
  const section = id.startsWith('SRV') ? 'songs' : 'readers';
  const url = `https://www.littlefox.com/en/${section}/contents_list_v2/${id}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return titlesFromHtml(await response.text());
}

const series = JSON.parse(await fs.readFile(path.join(dataRoot, 'series-list.json'), 'utf8'))
  .filter(item => item.seriesId.startsWith('little-fox-'));
let next = 0;
const results = [];

const workers = Array.from({ length: 5 }, async () => {
  while (true) {
    const index = next++;
    if (index >= series.length) return;
    const item = series[index];
    const id = sourceId(item.seriesId);
    const episodeFile = path.join(dataRoot, item.seriesId, 'episodes.json');
    try {
      const [titles, episodes] = await Promise.all([fetchTitles(id), fs.readFile(episodeFile, 'utf8').then(JSON.parse)]);
      episodes.forEach((episode, episodeIndex) => {
        episode.title = titles[episodeIndex] || `Episode ${episodeIndex + 1}`;
      });
      await fs.writeFile(episodeFile, `${JSON.stringify(episodes, null, 2)}\n`);
      results.push({ seriesId: item.seriesId, status: titles.length === episodes.length ? 'updated' : 'partially-updated', episodeCount: episodes.length, titleCount: titles.length });
    } catch (error) {
      results.push({ seriesId: item.seriesId, status: 'failed', message: error.message });
    }
    if ((index + 1) % 20 === 0) console.log(`Processed ${index + 1}/${series.length} series`);
  }
});

await Promise.all(workers);
await fs.writeFile(path.join(root, 'title-import-report.json'), `${JSON.stringify(results, null, 2)}\n`);
const summary = results.reduce((acc, item) => { acc[item.status] = (acc[item.status] || 0) + 1; return acc; }, {});
console.log(JSON.stringify(summary));
