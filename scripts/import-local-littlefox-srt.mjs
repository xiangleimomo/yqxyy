#!/usr/bin/env node

/*
 * Imports locally stored Little Fox SRT files into the matching animation
 * folders. The original level-based library is never changed: when --organize
 * is supplied, matching files are copied to a separate by-series library.
 *
 * Usage:
 *   node scripts/import-local-littlefox-srt.mjs --source "F:\\little fox字幕" --report "C:\\temp\\subtitle-audit.json"
 *   node scripts/import-local-littlefox-srt.mjs --apply --organize --source "F:\\little fox字幕" --report "C:\\temp\\subtitle-audit.json"
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const argument = process.argv[index];
  if (!argument.startsWith('--')) continue;
  const [key, ...rest] = argument.split('=');
  if (rest.length) {
    args.set(key, rest.join('='));
  } else if (process.argv[index + 1] && !process.argv[index + 1].startsWith('--')) {
    args.set(key, process.argv[index + 1]);
    index += 1;
  } else {
    args.set(key, true);
  }
}
const SOURCE_ROOT = path.resolve(String(args.get('--source') || 'F:\\little fox字幕'));
const REPORT_PATH = path.resolve(String(args.get('--report') || path.join(process.cwd(), 'local-srt-import-report.json')));
const APPLY = args.has('--apply');
const ORGANIZE = args.has('--organize');
const DATA_ROOT = path.resolve(process.cwd(), 'data');
const ORGANIZED_ROOT = path.join(SOURCE_ROOT, '按动画整理');

const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const tidy = value => String(value || '').replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/\s+/g, ' ').trim();
const safeFolder = value => String(value || 'Unknown').replace(/[<>:"/\\|?*]/g, '_').trim();

async function walk(root) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async entry => {
    const full = path.join(root, entry.name);
    // The organized library lives under the source root. Do not import its
    // copies again when this script is run again later.
    if (entry.isDirectory()) {
      if (path.resolve(full) === path.resolve(ORGANIZED_ROOT)) return [];
      return walk(full);
    }
    return entry.isFile() && path.extname(entry.name).toLowerCase() === '.srt' ? [full] : [];
  }));
  return nested.flat();
}

function parseTime(value) {
  const match = String(value || '').trim().match(/^(\d+):(\d{2}):(\d{2})[,.](\d{1,3})$/);
  if (!match) return null;
  const [, hours, minutes, seconds, milliseconds] = match;
  return ((Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds)) * 1000) + Number(milliseconds.padEnd(3, '0'));
}

function parseSrt(text) {
  const cues = [];
  for (const block of String(text).replace(/^\uFEFF/, '').replace(/\r/g, '').split(/\n{2,}/)) {
    const lines = block.split('\n').filter(Boolean);
    const timeLineIndex = lines.findIndex(line => line.includes('-->'));
    if (timeLineIndex < 0) continue;
    const [start, end] = lines[timeLineIndex].split('-->').map(value => value.trim().split(/\s+/)[0]);
    const startMs = parseTime(start);
    const endMs = parseTime(end);
    const subtitle = tidy(lines.slice(timeLineIndex + 1).join(' '));
    if (startMs === null || endMs === null || endMs <= startMs || !subtitle) continue;
    cues.push({ startMs, endMs, text: subtitle });
  }
  return cues;
}

function formatVttTime(milliseconds) {
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const seconds = Math.floor((milliseconds % 60_000) / 1000);
  const ms = Math.floor(milliseconds % 1000);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
}

function toVtt(cues) {
  return `WEBVTT\n\n${cues.map((cue, index) => `${index + 1}\n${formatVttTime(cue.startMs)} --> ${formatVttTime(cue.endMs)}\n${cue.text}`).join('\n\n')}\n`;
}

async function loadCatalog() {
  const directoryNames = await fs.readdir(DATA_ROOT, { withFileTypes: true });
  const catalog = [];
  const standardSeriesDirectories = new Set(['journey-to-the-west']);
  for (const directory of directoryNames.filter(item => item.isDirectory() && (item.name.startsWith('little-fox-') || standardSeriesDirectories.has(item.name)))) {
    const seriesPath = path.join(DATA_ROOT, directory.name, 'series.json');
    const episodesPath = path.join(DATA_ROOT, directory.name, 'episodes.json');
    try {
      const [series, episodes] = await Promise.all([
        fs.readFile(seriesPath, 'utf8').then(JSON.parse),
        fs.readFile(episodesPath, 'utf8').then(JSON.parse),
      ]);
      catalog.push({
        seriesId: directory.name,
        dir: path.join(DATA_ROOT, directory.name),
        level: Number(series.level),
        title: series.seriesTitle,
        titleKey: normalize(series.seriesTitle),
        usesVttFiles: directory.name === 'journey-to-the-west',
        episodes: episodes.map((episode, index) => ({ ...episode, order: index + 1, titleKey: normalize(episode.title) })),
      });
    } catch {
      // A non-lesson folder without the standard series data is not a target.
    }
  }
  return catalog;
}

function sourceLevel(filePath) {
  const match = filePath.match(/[\\/]level0?(\d)(?:[\\/]|$)/i);
  return match ? Number(match[1]) : null;
}

function inferredSourceSeriesTitle(filePath) {
  const base = path.basename(filePath, '.srt').replace(/^\d{1,4}_/, '');
  const separator = base.lastIndexOf('_');
  const titleWithEpisodeNumber = separator >= 0 ? base.slice(0, separator) : base;
  return titleWithEpisodeNumber.replace(/\s+\d+$/, '').trim() || '待人工确认';
}

function matchFile(filePath, catalog) {
  const base = path.basename(filePath, '.srt');
  const key = normalize(base);
  const level = sourceLevel(filePath);
  const titleCandidates = catalog
    .filter(series => level === null || series.level === level)
    .filter(series => series.titleKey && key.includes(series.titleKey))
    .sort((a, b) => b.titleKey.length - a.titleKey.length);
  const strongestLength = titleCandidates[0]?.titleKey.length || 0;
  const strongest = titleCandidates.filter(series => series.titleKey.length === strongestLength);
  if (strongest.length !== 1) return { base, level, status: strongest.length ? 'ambiguous-series' : 'unmatched-series', candidates: strongest.map(item => item.seriesId) };
  const series = strongest[0];
  const episodeCandidates = series.episodes
    .filter(episode => episode.titleKey && key.includes(episode.titleKey))
    .sort((a, b) => b.titleKey.length - a.titleKey.length);
  const longestEpisode = episodeCandidates[0]?.titleKey.length || 0;
  const matchingEpisodes = episodeCandidates.filter(episode => episode.titleKey.length === longestEpisode);
  if (matchingEpisodes.length === 1) return { base, level, status: 'matched', series, episode: matchingEpisodes[0] };

  const numberMatch = base.match(/^(\d{1,4})_/);
  const order = Number(numberMatch?.[1]);
  const episodeByOrder = series.episodes.find(episode => Number(episode.episodeId) === order || episode.order === order);
  if (episodeByOrder) return { base, level, status: 'matched-by-number', series, episode: episodeByOrder };
  return { base, level, status: matchingEpisodes.length ? 'ambiguous-episode' : 'unmatched-episode', series, candidates: matchingEpisodes.map(item => item.title) };
}

async function main() {
  const [catalog, files] = await Promise.all([loadCatalog(), walk(SOURCE_ROOT)]);
  const mappings = files.map(file => ({ file, ...matchFile(file, catalog) }));
  const candidateMatches = mappings.filter(item => item.status === 'matched' || item.status === 'matched-by-number');
  const matched = [];
  const unreadableMatches = [];
  for (const item of candidateMatches) {
    const subtitle = parseSrt(await fs.readFile(item.file, 'utf8'));
    if (subtitle.length) {
      matched.push({ ...item, subtitle });
    } else {
      unreadableMatches.push({ ...item, status: 'empty-subtitle-file' });
    }
  }
  const grouped = new Map();
  for (const item of matched) {
    const key = `${item.series.seriesId}:${item.episode.episodeId}`;
    const existing = grouped.get(key);
    if (!existing || item.file.localeCompare(existing.file) < 0) grouped.set(key, item);
  }

  const mappedSeries = new Map();
  for (const item of grouped.values()) {
    if (!mappedSeries.has(item.series.seriesId)) mappedSeries.set(item.series.seriesId, []);
    mappedSeries.get(item.series.seriesId).push(item);
  }
  for (const entries of mappedSeries.values()) entries.sort((a, b) => a.episode.order - b.episode.order);

  const existingSubtitleSeries = [];
  for (const series of catalog) {
    try { await fs.access(path.join(series.dir, 'subtitles.json')); existingSubtitleSeries.push(series.seriesId); } catch {}
  }
  const removeExisting = existingSubtitleSeries.filter(seriesId => !mappedSeries.has(seriesId));

  const report = {
    generatedAt: new Date().toISOString(),
    sourceRoot: SOURCE_ROOT,
    mode: APPLY ? 'apply' : 'dry-run',
    sourceFileCount: files.length,
    catalogSeriesCount: catalog.length,
    matchedFileCount: matched.length,
    uniqueMatchedEpisodeCount: grouped.size,
    duplicateSourceFileCount: matched.length - grouped.size,
    mappedSeriesCount: mappedSeries.size,
    existingSubtitleSeriesToRemove: removeExisting,
    series: catalog.map(series => {
      const entries = mappedSeries.get(series.seriesId) || [];
      return {
        level: series.level,
        seriesId: series.seriesId,
        title: series.title,
        catalogEpisodes: series.episodes.length,
        replacementEpisodes: entries.length,
        status: entries.length ? 'replace' : (existingSubtitleSeries.includes(series.seriesId) ? 'remove-existing-subtitles' : 'no-local-subtitles'),
        missingEpisodeNumbers: series.episodes.filter(episode => !entries.some(item => item.episode.episodeId === episode.episodeId)).map(episode => episode.episodeId),
        files: entries.map(item => ({ episodeId: item.episode.episodeId, episodeTitle: item.episode.title, sourceFile: item.file, match: item.status })),
      };
    }),
    unmatchedFiles: [...mappings.filter(item => !['matched', 'matched-by-number'].includes(item.status)), ...unreadableMatches].map(item => ({
      level: item.level,
      sourceFile: item.file,
      status: item.status,
      candidates: item.candidates || [],
    })),
  };

  await fs.mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await fs.writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
  if (!APPLY) {
    console.log(JSON.stringify({ mode: report.mode, sourceFiles: files.length, matchedFiles: matched.length, uniqueEpisodes: grouped.size, series: mappedSeries.size, unmatched: report.unmatchedFiles.length, removeExisting }, null, 2));
    return;
  }

  for (const series of catalog) {
    const entries = mappedSeries.get(series.seriesId) || [];
    const destination = path.join(series.dir, 'subtitles.json');
    if (!entries.length) {
      if (existingSubtitleSeries.includes(series.seriesId)) await fs.rm(destination, { force: true });
      continue;
    }
    let importedAt = new Date().toISOString();
    try {
      const existing = JSON.parse(await fs.readFile(destination, 'utf8'));
      if (existing.importedAt) importedAt = existing.importedAt;
    } catch {}
    const episodes = [];
    for (const item of entries) {
      const episode = { episodeId: item.episode.episodeId, title: item.episode.title, subtitle: item.subtitle };
      if (series.usesVttFiles) {
        const vttUrl = `subtitles/${String(item.episode.order).padStart(3, '0')}.vtt`;
        await fs.mkdir(path.join(series.dir, 'subtitles'), { recursive: true });
        await fs.writeFile(path.join(series.dir, vttUrl), toVtt(item.subtitle));
        episode.vttUrl = vttUrl;
      }
      episodes.push(episode);
    }
    await fs.writeFile(destination, `${JSON.stringify({
      source: 'Local Little Fox SRT library',
      importedAt,
      level: series.level,
      title: series.title,
      episodeCount: episodes.length,
      episodes,
    }, null, 2)}\n`);
  }

  // Keep the original level folders untouched.  Copy every source subtitle
  // into a series folder, including material not present in this project yet.
  if (ORGANIZE) {
    for (const item of mappings) {
      const seriesTitle = item.series?.title || inferredSourceSeriesTitle(item.file);
      const levelFolder = `Level ${String(item.level ?? 0).padStart(2, '0')}`;
      const targetDir = path.join(ORGANIZED_ROOT, levelFolder, safeFolder(seriesTitle));
      await fs.mkdir(targetDir, { recursive: true });
      await fs.copyFile(item.file, path.join(targetDir, path.basename(item.file)));
    }
  }
  console.log(JSON.stringify({ mode: report.mode, sourceFiles: files.length, importedEpisodes: grouped.size, series: mappedSeries.size, removedSubtitleFiles: removeExisting.length, report: REPORT_PATH }, null, 2));
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
