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

const dataDir = path.resolve(__dirname, '..', 'data', 'little-fox');
const checkpointPath = path.join(dataDir, 'import-progress.json');
const seriesDir = path.join(dataDir, 'series');

async function main() {
  const checkpoint = JSON.parse(await fs.readFile(checkpointPath, 'utf8'));
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

  await fs.mkdir(seriesDir, { recursive: true });
  await fs.writeFile(path.join(seriesDir, `${seriesId}.json`), `${JSON.stringify(output, null, 2)}\n`);
  await fs.writeFile(path.join(dataDir, 'catalog.json'), `${JSON.stringify([{
    seriesId: output.seriesId,
    level: output.level,
    title: output.title,
    episodeCount: output.episodeCount,
    subtitleEpisodeCount: output.episodes.filter(episode => episode.subtitle.length).length,
    dataFile: `series/${seriesId}.json`,
  }], null, 2)}\n`);
  process.stderr.write(`Exported ${seriesId} (${output.episodeCount} episodes).\n`);
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
