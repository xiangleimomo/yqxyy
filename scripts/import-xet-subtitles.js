#!/usr/bin/env node

/*
 * Imports Little Fox subtitle data from the licensed XET account.
 *
 * Required environment variables:
 *   XET_ACCOUNT
 *   XET_PASSWORD
 *
 * Output:
 *   data/little-fox-*/subtitles.json
 *   data/little-fox/import-progress.json (checkpoint, safe to delete after success)
 */

const fs = require('node:fs/promises');
const path = require('node:path');

const BASE_URL = 'http://xet.bolinzhiyin.cn';
const DATA_ROOT = path.resolve(__dirname, '..', 'data');
const OUTPUT_DIR = path.join(DATA_ROOT, 'little-fox');
const PROGRESS_PATH = path.join(OUTPUT_DIR, 'import-progress.json');
const EPISODE_CONCURRENCY = 12;

const account = process.env.XET_ACCOUNT;
const password = process.env.XET_PASSWORD;
if (!account || !password) {
  throw new Error('Set XET_ACCOUNT and XET_PASSWORD before running this importer.');
}

let cookie = '';

function cleanText(value) {
  return String(value || '')
    .replace(/\[n@/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getSetCookies(headers) {
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie();
  const value = headers.get('set-cookie');
  return value ? [value] : [];
}

function updateCookie(headers) {
  const parts = getSetCookies(headers)
    .map(item => item.split(';', 1)[0])
    .filter(Boolean);
  if (!parts.length) return;
  const current = new Map(cookie.split(';').filter(Boolean).map(item => {
    const [key, ...rest] = item.trim().split('=');
    return [key, rest.join('=')];
  }));
  for (const part of parts) {
    const [key, ...rest] = part.trim().split('=');
    current.set(key, rest.join('='));
  }
  cookie = [...current.entries()].map(([key, value]) => `${key}=${value}`).join('; ');
}

async function request(target, options = {}) {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(new URL(target, BASE_URL), {
        redirect: 'manual',
        ...options,
        headers: {
          ...(cookie ? { cookie } : {}),
          ...(options.headers || {}),
        },
      });
      updateCookie(response.headers);
      if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
        return request(response.headers.get('location'));
      }
      if (response.ok) return response;
      lastError = new Error(`${target} returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, attempt * 700));
  }
  throw lastError;
}

async function login() {
  const body = new URLSearchParams({ account, password }).toString();
  await request('/login_check.php', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const confirmation = await (await request('/huiben01.php')).text();
  if (!confirmation.includes("Mrs. Kelly's Class")) {
    throw new Error('Authentication failed: Little Fox catalog is not available.');
  }
}

function parseCatalogPage(html, level) {
  const results = [];
  const cardPattern = /<div class="card"[^>]*onclick="location\.href='xhl_play\.php\?fs_id=([A-Z0-9]+)'"[\s\S]*?<div class="card-title">([\s\S]*?)<\/div>/g;
  for (const match of html.matchAll(cardPattern)) {
    results.push({ level, fsId: match[1], title: cleanText(match[2]) });
  }
  return results;
}

function parsePlaylist(html) {
  const match = html.match(/var PLAYLIST\s*=\s*(\[[\s\S]*?\]);\s*\nvar COURSE_TITLE/);
  if (!match) throw new Error('Could not find playlist data in a series page.');
  return JSON.parse(match[1]);
}

async function loadProgress() {
  try {
    return JSON.parse(await fs.readFile(PROGRESS_PATH, 'utf8'));
  } catch {
    return { subtitles: {} };
  }
}

async function saveProgress(progress) {
  await fs.writeFile(PROGRESS_PATH, `${JSON.stringify(progress, null, 2)}\n`);
}

async function mapWithConcurrency(items, worker, limit = EPISODE_CONCURRENCY) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function runWorker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, runWorker));
  return results;
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await login();

  const series = [];
  for (let level = 1; level <= 9; level += 1) {
    const html = await (await request(`/huiben${String(level).padStart(2, '0')}.php`)).text();
    series.push(...parseCatalogPage(html, level));
  }

  const progress = await loadProgress();
  let importedEpisodes = 0;
  for (let index = 0; index < series.length; index += 1) {
    const item = series[index];
    if (progress.subtitles[item.fsId]?.episodes?.length) {
      process.stderr.write(`Skipped ${index + 1}/${series.length}: ${item.title} (already imported)\n`);
      continue;
    }
    const page = await (await request(`/xhl_play.php?fs_id=${encodeURIComponent(item.fsId)}`)).text();
    const playlist = parsePlaylist(page);
    const episodes = await mapWithConcurrency(playlist, async episode => {
      const key = `${item.fsId}:${episode.fc_id}`;
      let source = episode;
      if (!source.subtitle?.length) {
        if (progress.subtitles[key]) {
          source = { ...source, ...progress.subtitles[key] };
        } else {
          const endpoint = `/xhl_play.php?ajax=episode&fc_id=${encodeURIComponent(episode.fc_id)}&fs_id=${encodeURIComponent(item.fsId)}`;
          const response = await request(endpoint);
          const extra = await response.json();
          source = { ...source, ...extra };
          progress.subtitles[key] = { video_url: extra.video_url || '', subtitle: extra.subtitle || [] };
        }
      }

      const subtitle = (source.subtitle || []).map(cue => ({
        startMs: Number(cue.start_ms) || 0,
        endMs: Number(cue.end_ms) || 0,
        text: cleanText(cue.text),
        highlight: cue.highlight || [],
      })).filter(cue => cue.text);
      return {
        episodeId: source.fc_id,
        title: cleanText(source.title),
        subtitle,
      };
    });
    importedEpisodes += episodes.length;

    progress.subtitles[item.fsId] = { fsId: item.fsId, level: item.level, title: item.title, episodes };
    await saveProgress(progress);
    process.stderr.write(`Imported ${index + 1}/${series.length}: ${item.title} (${episodes.length} episodes)\n`);
  }

  const seriesList = JSON.parse(await fs.readFile(path.join(DATA_ROOT, 'series-list.json'), 'utf8'));
  const orderedSeries = series.map(item => progress.subtitles[item.fsId]).filter(Boolean);
  for (const seriesItem of orderedSeries) {
    const fsId = seriesItem.fsId || series.find(item => item.title === seriesItem.title && item.level === seriesItem.level)?.fsId;
    const target = seriesList.find(item => item.seriesId?.endsWith(`-${String(fsId).toLowerCase()}`));
    if (!target) continue;
    await fs.writeFile(
      path.join(DATA_ROOT, target.seriesId, 'subtitles.json'),
      `${JSON.stringify({
        source: 'XET Little Fox licensed subtitle import',
        importedAt: new Date().toISOString(),
        seriesId: fsId,
        level: seriesItem.level,
        title: seriesItem.title,
        episodeCount: seriesItem.episodes.length,
        episodes: seriesItem.episodes.map(episode => ({
          episodeId: episode.episodeId,
          title: episode.title,
          subtitle: episode.subtitle,
        })),
      }, null, 2)}\n`,
    );
  }
  await fs.rm(PROGRESS_PATH, { force: true });
  process.stderr.write(`Completed ${orderedSeries.length} series and ${importedEpisodes} episodes.\n`);
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
