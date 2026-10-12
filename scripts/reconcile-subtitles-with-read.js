#!/usr/bin/env node

/*
 * Makes subtitle wording match the published Read lesson while preserving every
 * cue's startMs and endMs. When cue segmentation differs, Read words are
 * redistributed across the existing cue durations in proportion to the
 * original cue word counts.
 *
 * Usage:
 *   node scripts/reconcile-subtitles-with-read.js --apply <data-directory> [...]
 */

const fs = require('node:fs/promises');
const path = require('node:path');

const apply = process.argv.includes('--apply');
const directories = process.argv.slice(2).filter(value => value !== '--apply');
if (!directories.length) throw new Error('Usage: node scripts/reconcile-subtitles-with-read.js [--apply] <data-directory> [...]');

const root = path.resolve(__dirname, '..', 'data');

function normalize(value) {
  return String(value || '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function lessonText(lesson) {
  return (lesson?.paragraphs || []).map(item => String(item.text || item || '').trim()).filter(Boolean).join(' ');
}

function reflowText(text, cues) {
  const tokens = String(text || '').match(/\S+/g) || [];
  if (!tokens.length) return cues;
  const weights = cues.map(cue => Math.max(1, (String(cue.text || '').match(/\S+/g) || []).length));
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  let usedWeight = 0;
  let cursor = 0;
  return cues.map((cue, index) => {
    usedWeight += weights[index];
    const end = index === cues.length - 1 ? tokens.length : Math.max(cursor + 1, Math.min(tokens.length, Math.round((usedWeight / totalWeight) * tokens.length)));
    const next = { ...cue, text: tokens.slice(cursor, end).join(' ') };
    cursor = end;
    return next;
  });
}

async function main() {
  const summary = { directories: 0, episodesWithRead: 0, changedEpisodes: 0, skippedEpisodes: 0 };
  for (const directory of directories) {
    const dataDir = path.join(root, directory);
    const subtitlePath = path.join(dataDir, 'subtitles.json');
    const readPath = path.join(dataDir, 'reading-lessons.json');
    try {
      const [subtitleData, reading] = await Promise.all([
        fs.readFile(subtitlePath, 'utf8').then(JSON.parse),
        fs.readFile(readPath, 'utf8').then(JSON.parse),
      ]);
      const readByTitle = new Map(Object.values(reading).filter(Boolean).map(lesson => [normalize(lesson.title), lesson]));
      let changed = false;
      subtitleData.episodes = subtitleData.episodes.map((episode, index) => {
        const lesson = readByTitle.get(normalize(episode.title)) || reading[String(index + 1)];
        const text = lessonText(lesson);
        if (!text || !episode.subtitle?.length) { summary.skippedEpisodes += 1; return episode; }
        summary.episodesWithRead += 1;
        const current = episode.subtitle.map(cue => cue.text).join(' ');
        if (normalize(current) === normalize(text)) return episode;
        summary.changedEpisodes += 1;
        changed = true;
        return { ...episode, subtitle: reflowText(text, episode.subtitle) };
      });
      if (changed && apply) await fs.writeFile(subtitlePath, `${JSON.stringify(subtitleData, null, 2)}\n`);
      summary.directories += 1;
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
  }
  process.stdout.write(`${JSON.stringify(summary)}\n`);
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
