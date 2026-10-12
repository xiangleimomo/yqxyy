#!/usr/bin/env node

/*
 * Adds WebVTT sidecar files without replacing the source subtitles.json.
 * Usage: node scripts/generate-vtt-subtitles.js journey-to-the-west three-kingdoms
 */

const fs = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname, '..', 'data');
const directories = process.argv.slice(2);
if (!directories.length) throw new Error('Usage: node scripts/generate-vtt-subtitles.js <data-directory> [...]');

function timestamp(milliseconds) {
  const total = Math.max(0, Number(milliseconds) || 0);
  const hours = Math.floor(total / 3600000);
  const minutes = Math.floor((total % 3600000) / 60000);
  const seconds = Math.floor((total % 60000) / 1000);
  const ms = Math.floor(total % 1000);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

function toVtt(cues) {
  const lines = ['WEBVTT', ''];
  for (const [index, cue] of cues.entries()) {
    lines.push(String(index + 1));
    lines.push(`${timestamp(cue.startMs)} --> ${timestamp(cue.endMs)}`);
    lines.push(String(cue.text || '').replace(/\r?\n/g, ' ').trim());
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

async function main() {
  for (const directory of directories) {
    const dataDir = path.join(root, directory);
    const subtitlePath = path.join(dataDir, 'subtitles.json');
    const outputDir = path.join(dataDir, 'subtitles');
    const data = JSON.parse(await fs.readFile(subtitlePath, 'utf8'));
    await fs.mkdir(outputDir, { recursive: true });
    for (const [index, episode] of data.episodes.entries()) {
      const fileName = `${String(index + 1).padStart(3, '0')}.vtt`;
      await fs.writeFile(path.join(outputDir, fileName), toVtt(episode.subtitle || []));
      episode.vttUrl = `subtitles/${fileName}`;
    }
    await fs.writeFile(subtitlePath, `${JSON.stringify(data, null, 2)}\n`);
    process.stderr.write(`Generated ${data.episodes.length} VTT files for ${directory}.\n`);
  }
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
