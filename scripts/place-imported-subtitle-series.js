#!/usr/bin/env node

/*
 * Places a named series from a completed XET aggregate import into the
 * matching application data directory. Published output remains subtitle-only.
 *
 * Usage:
 *   node scripts/place-imported-subtitle-series.js "Journey to the West" journey-to-the-west
 */

const fs = require('node:fs/promises');
const path = require('node:path');

const [title, destination] = process.argv.slice(2);
if (!title || !destination) {
  throw new Error('Usage: node scripts/place-imported-subtitle-series.js <series title> <data directory>');
}

const root = path.resolve(__dirname, '..');
const aggregatePath = path.join(root, 'data', 'little-fox', 'subtitles.json');
const outputPath = path.join(root, 'data', destination, 'subtitles.json');

async function main() {
  const aggregate = JSON.parse(await fs.readFile(aggregatePath, 'utf8'));
  const source = (aggregate.series || []).find(item => item.title === title);
  if (!source?.episodes?.length) throw new Error(`No completed subtitle series found for ${title}.`);
  const output = {
    source: 'Licensed XET subtitle import',
    importedAt: new Date().toISOString(),
    level: source.level,
    title: source.title,
    episodeCount: source.episodes.length,
    episodes: source.episodes.map(episode => ({
      episodeId: episode.episodeId,
      title: episode.title,
      subtitle: (episode.subtitle || []).map(cue => ({
        startMs: cue.startMs,
        endMs: cue.endMs,
        text: cue.text,
      })),
    })),
  };
  await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  process.stderr.write(`Placed ${output.episodeCount} episodes in ${path.relative(root, outputPath)}.\n`);
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
