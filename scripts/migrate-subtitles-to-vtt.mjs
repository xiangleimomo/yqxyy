#!/usr/bin/env node

/* Converts the legacy subtitles.json format to one VTT file per episode. */

import fs from 'node:fs/promises';
import path from 'node:path';

const DATA_ROOT = path.resolve(process.cwd(), 'data');

function formatVttTime(milliseconds) {
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const seconds = Math.floor((milliseconds % 60_000) / 1000);
  const ms = Math.floor(milliseconds % 1000);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

function toVtt(cues) {
  return `WEBVTT\n\n${cues.map((cue, index) => `${index + 1}\n${formatVttTime(cue.startMs)} --> ${formatVttTime(cue.endMs)}\n${String(cue.text || '').trim()}`).join('\n\n')}\n`;
}

function vttFilename(episode, index) {
  const fromUrl = String(episode.vttUrl || '').match(/(?:^|\/)subtitles\/(.+\.vtt)$/i)?.[1];
  if (fromUrl) return fromUrl;
  const episodeNumber = Number(episode.episodeId);
  const number = Number.isInteger(episodeNumber) && episodeNumber > 0 ? episodeNumber : index + 1;
  return `${String(number).padStart(3, '0')}.vtt`;
}

const directories = await fs.readdir(DATA_ROOT, { withFileTypes: true });
let convertedSeries = 0;
let convertedEpisodes = 0;
for (const directory of directories.filter(entry => entry.isDirectory())) {
  const seriesDirectory = path.join(DATA_ROOT, directory.name);
  const jsonPath = path.join(seriesDirectory, 'subtitles.json');
  let data;
  try {
    data = JSON.parse(await fs.readFile(jsonPath, 'utf8'));
  } catch {
    continue;
  }
  const episodes = Array.isArray(data.episodes) ? data.episodes.filter(episode => Array.isArray(episode.subtitle) && episode.subtitle.length) : [];
  const vttDirectory = path.join(seriesDirectory, 'subtitles');
  await fs.mkdir(vttDirectory, { recursive: true });
  for (const [index, episode] of episodes.entries()) {
    await fs.writeFile(path.join(vttDirectory, vttFilename(episode, index)), toVtt(episode.subtitle));
    convertedEpisodes += 1;
  }
  await fs.rm(jsonPath, { force: true });
  convertedSeries += 1;
}

console.log(JSON.stringify({ convertedSeries, convertedEpisodes }, null, 2));
