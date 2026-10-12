#!/usr/bin/env node

/*
 * Creates one reviewable subtitle-only sample from the local resumable import
 * checkpoint. It intentionally excludes video URLs, cookies, and credentials.
 *
 * Usage: node scripts/export-xet-subtitle-sample.js FS0011
 */

const fs = require('node:fs/promises');
const path = require('node:path');

const seriesId = process.argv[2];
if (!seriesId) throw new Error('Usage: node scripts/export-xet-subtitle-sample.js <FS_ID>');

const dataRoot = path.resolve(__dirname, '..', 'data');
const checkpointPath = path.join(dataRoot, 'little-fox', 'import-progress.json');
const seriesListPath = path.join(dataRoot, 'series-list.json');

async function main() {
  let checkpoint;
  let lastError;
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    try {
      checkpoint = JSON.parse(await fs.readFile(checkpointPath, 'utf8'));
      break;
    } catch (error) {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }
  if (!checkpoint) throw lastError;
  const source = checkpoint.subtitles[seriesId];
  if (!source?.episodes?.length) throw new Error(`No completed series found for ${seriesId}.`);

  const output = {
    source: 'Licensed XET subtitle import',
    exportedAt: new Date().toISOString(),
    seriesId: source.fsId,
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

  const suffix = `-${seriesId.toLowerCase()}`;
  const seriesList = JSON.parse(await fs.readFile(seriesListPath, 'utf8'));
  const target = seriesList.find(item => item.seriesId?.endsWith(suffix));
  if (!target) throw new Error(`No application series folder is registered for ${seriesId}.`);
  const outputPath = path.join(dataRoot, target.seriesId, 'subtitles.json');
  await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  process.stderr.write(`Exported ${seriesId} to ${path.relative(path.resolve(__dirname, '..'), outputPath)} (${output.episodeCount} episodes).\n`);
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
