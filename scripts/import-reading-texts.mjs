import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const dataRoot = path.join(root, 'data');
const workers = 20;

const decode = value => value
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/\s+/g, ' ')
  .trim();

function sourceId(seriesId) {
  const match = seriesId.match(/-(fs\d+|srv\d+)$/i);
  return match ? match[1].toUpperCase() : null;
}

async function fetchText(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

function catalogEntries(html) {
  const entries = [];
  for (const match of html.matchAll(/data-contname="([^"]+)"\s+data-fcid="(C\d+)"/g)) {
    if (!entries.some(entry => entry.contentId === match[2])) entries.push({ title: decode(match[1]), contentId: match[2] });
  }
  return entries;
}

async function loadCatalog(id) {
  const section = id.startsWith('SRV') ? 'songs' : 'readers';
  return catalogEntries(await fetchText(`https://www.littlefox.com/en/${section}/contents_list_v2/${id}`));
}

function parseReadingPage(html) {
  const box = html.match(/<div class="original_cont_box">([\s\S]*?)<div class="original_cont_box2"/i)?.[1] || '';
  const title = decode(box.match(/<dt>([\s\S]*?)<\/dt>/i)?.[1] || '');
  const paragraphs = [...box.matchAll(/<div class='talk'><span>([\s\S]*?)<\/span><\/div>/gi)]
    .map(match => decode(match[1]))
    .filter(text => text);
  if (!paragraphs.length) throw new Error('No reading paragraphs found');
  return { title, paragraphs: paragraphs.map((text, index) => ({ id: `p${index + 1}`, text, translation: '' })) };
}

async function main() {
  const allSeries = JSON.parse(await fs.readFile(path.join(dataRoot, 'series-list.json'), 'utf8'))
    .filter(item => item.seriesId.startsWith('little-fox-'));
  const seriesLimit = Number(process.env.READING_SERIES_LIMIT || 0);
  const series = seriesLimit > 0 ? allSeries.slice(0, seriesLimit) : allSeries;
  const jobs = [];
  for (const item of series) {
    const id = sourceId(item.seriesId);
    const [catalog, episodeRows] = await Promise.all([
      loadCatalog(id),
      fs.readFile(path.join(dataRoot, item.seriesId, 'episodes.json'), 'utf8').then(JSON.parse),
    ]);
    for (let index = 0; index < Math.min(catalog.length, episodeRows.length); index++) {
      jobs.push({ seriesId: item.seriesId, episode: episodeRows[index], contentId: catalog[index].contentId });
    }
  }

  const grouped = new Map();
  for (const job of jobs) {
    if (!grouped.has(job.seriesId)) grouped.set(job.seriesId, []);
    grouped.get(job.seriesId).push(job);
  }
  const documents = new Map();
  for (const [seriesId, entries] of grouped) {
    const file = path.join(dataRoot, seriesId, 'reading-lessons.json');
    documents.set(seriesId, { file, data: JSON.parse(await fs.readFile(file, 'utf8')) || {}, entries, dirty: false });
  }

  let next = 0;
  const report = { imported: 0, skipped: 0, failed: 0, jobs: jobs.length };
  const pool = Array.from({ length: workers }, async () => {
    while (true) {
      const index = next++;
      if (index >= jobs.length) return;
      const job = jobs[index];
      const doc = documents.get(job.seriesId);
      const key = String(job.episode.episodeId);
      if (doc.data[key]?.paragraphs?.length) { report.skipped++; continue; }
      try {
        const page = parseReadingPage(await fetchText(`https://www.littlefox.com/hk/supplement/org/${job.contentId}`));
        doc.data[key] = {
          episodeId: job.episode.episodeId,
          title: job.episode.title || page.title,
          source: 'official-text',
          sourceId: job.contentId,
          paragraphs: page.paragraphs,
        };
        doc.dirty = true;
        report.imported++;
      } catch (error) {
        report.failed++;
        console.warn(`Failed ${job.seriesId} episode ${key}: ${error.message}`);
      }
      if ((index + 1) % 100 === 0) console.log(`Processed ${index + 1}/${jobs.length} reading pages`);
    }
  });
  await Promise.all(pool);
  await Promise.all([...documents.values()].filter(doc => doc.dirty).map(doc => fs.writeFile(doc.file, `${JSON.stringify(doc.data, null, 2)}\n`)));
  await fs.writeFile(path.join(root, 'reading-import-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report));
}

main();
