#!/usr/bin/env node

/*
 * Discovers Little Fox video releases from the authorised XET catalogue.
 * This program deliberately never reads or writes subtitles/VTT files.
 * Public Read text and generated study material are added by
 * enrich-new-lessons.mjs, which fetches Little Fox's supplement/org/Cxxxx page.
 */
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const BASE_URL = 'http://xet.bolinzhiyin.cn';
const DATA_ROOT = path.resolve(__dirname, '..', 'data');
const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const fsIdFilter = [...args].find(value => value.startsWith('--fs-id='))?.slice('--fs-id='.length).toUpperCase();
const titleFilter = [...args].find(value => value.startsWith('--title='))?.slice('--title='.length);
if ([...args].some(value => !['--apply', '--dry-run'].includes(value) && !value.startsWith('--fs-id=') && !value.startsWith('--title='))) throw new Error('Usage: node scripts/sync-xet-catalog.js [--apply|--dry-run] [--fs-id=FS0000|--title=Title]');

const overrides = { 'Journey to the West': 'journey-to-the-west', 'Romance of the Three Kingdoms': 'three-kingdoms' };
const account = process.env.XET_ACCOUNT;
const password = process.env.XET_PASSWORD;
if (!account || !password) throw new Error('Set XET_ACCOUNT and XET_PASSWORD before running this collector.');
let cookie = '';

const clean = value => String(value || '').replace(/\[n@/g, ' ').replace(/\s+/g, ' ').trim();
const normalized = value => clean(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
const slug = value => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'series';
function updateCookie(headers) {
  const values = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [headers.get('set-cookie')].filter(Boolean);
  const current = new Map(cookie.split(';').filter(Boolean).map(part => { const [key, ...rest] = part.trim().split('='); return [key, rest.join('=')]; }));
  for (const value of values) { const [key, ...rest] = value.split(';', 1)[0].trim().split('='); current.set(key, rest.join('=')); }
  cookie = [...current.entries()].map(([key, value]) => `${key}=${value}`).join('; ');
}
async function request(target, options = {}) {
  let error;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(new URL(target, BASE_URL), { redirect: 'manual', ...options, headers: { ...(cookie ? { cookie } : {}), ...(options.headers || {}) } });
      updateCookie(response.headers);
      if (response.status >= 300 && response.status < 400 && response.headers.get('location')) return request(response.headers.get('location'));
      if (response.ok) return response;
      error = new Error(`${target} returned HTTP ${response.status}`);
    } catch (caught) { error = caught; }
    await new Promise(resolve => setTimeout(resolve, attempt * 500));
  }
  throw error;
}
async function login() {
  await request('/login_check.php', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ account, password }).toString() });
  if (!(await (await request('/huiben01.php')).text()).includes("Mrs. Kelly's Class")) throw new Error('XET authentication failed: Little Fox catalogue is unavailable.');
}
function parseCatalog(html, level) {
  const output = [];
  const pattern = /<div class="card"[^>]*onclick="location\.href='xhl_play\.php\?fs_id=([A-Z0-9]+)'"[\s\S]*?<div class="card-title">([\s\S]*?)<\/div>/g;
  for (const match of html.matchAll(pattern)) output.push({ fsId: match[1], title: clean(match[2]), level });
  return output;
}
function parsePlaylist(html) {
  const match = html.match(/var PLAYLIST\s*=\s*(\[[\s\S]*?\]);\s*\nvar COURSE_TITLE/);
  if (!match) throw new Error('Could not find playlist data in the XET series page.');
  return JSON.parse(match[1]);
}
async function concurrent(items, worker, limit = 8) {
  const results = new Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => { while (next < items.length) { const index = next++; results[index] = await worker(items[index]); } }));
  return results;
}
function targetId(seriesList, item) {
  return seriesList.find(entry => entry.seriesId?.endsWith(`-${item.fsId.toLowerCase()}`))?.seriesId || overrides[item.title] || null;
}
async function readJson(file, fallback) { try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return fallback; throw error; } }
async function createCourse(seriesList, item) {
  const seriesId = `little-fox-${slug(item.title)}-${item.fsId.toLowerCase()}`;
  const directory = path.join(DATA_ROOT, seriesId);
  await fs.mkdir(directory, { recursive: true });
  const blank = value => fs.writeFile(path.join(directory, value), value === 'episodes.json' ? '[]\n' : '{}\n');
  await Promise.all(['episodes.json', 'reading-lessons.json', 'vocabulary.json', 'quiz.json'].map(blank));
  await fs.writeFile(path.join(directory, 'series.json'), `${JSON.stringify({ seriesId, seriesTitle: item.title, seriesTitleZh: '', level: item.level, language: 'en', source: 'Little Fox', status: 'serializing', totalEpisodes: 0, description: 'Video releases are discovered from the authorised catalogue. Read comes from Little Fox public pages.', coverImage: '', updateNote: 'Read, Words, Quiz and Games are generated only after a public Little Fox Read is available.' }, null, 2)}\n`);
  seriesList.push({ seriesId, title: item.title, titleZh: '', level: item.level, episodeCount: 0, status: 'serializing', cover: '', description: 'Video lessons with public Read-based learning material.', readyEpisodes: 0, tagline: 'Serializing' });
  return seriesId;
}
async function detail(item, episode) {
  const response = await request(`/xhl_play.php?ajax=episode&fc_id=${encodeURIComponent(episode.fc_id)}&fs_id=${encodeURIComponent(item.fsId)}`);
  return response.json();
}
async function main() {
  await login();
  const catalogue = [];
  for (let level = 1; level <= 9; level += 1) catalogue.push(...parseCatalog(await (await request(`/huiben${String(level).padStart(2, '0')}.php`)).text(), level));
  const selectedCatalogue = fsIdFilter ? catalogue.filter(item => item.fsId === fsIdFilter) : titleFilter ? catalogue.filter(item => item.title === titleFilter) : catalogue;
  if ((fsIdFilter || titleFilter) && !selectedCatalogue.length) throw new Error(`Requested series was not found in the XET catalogue.`);
  const seriesListPath = path.join(DATA_ROOT, 'series-list.json');
  const seriesList = await readJson(seriesListPath, []);
  const plans = await concurrent(selectedCatalogue, async item => ({ item, playlist: parsePlaylist(await (await request(`/xhl_play.php?fs_id=${encodeURIComponent(item.fsId)}`)).text()) }));
  const discovered = {}; const changed = []; const seriesReport = [];
  for (const { item, playlist } of plans) {
    let seriesId = targetId(seriesList, item);
    if (!seriesId) {
      if (!apply) { discovered[`new:${item.fsId}`] = playlist.length; continue; }
      seriesId = await createCourse(seriesList, item);
    }
    const directory = path.join(DATA_ROOT, seriesId);
    const episodesPath = path.join(directory, 'episodes.json');
    const episodes = await readJson(episodesPath, []);
    const localBefore = episodes.length;
    let nextId = Math.max(0, ...episodes.map(row => Number(row.episodeId) || 0)) + 1;
    const newRows = [];
    for (const remote of playlist) {
      const existing = episodes.find(row => row.sourceContentId === remote.fc_id) || episodes.find(row => normalized(row.title) === normalized(remote.title));
      if (existing) { if (!existing.sourceContentId) { existing.sourceContentId = remote.fc_id; changed.push(seriesId); } continue; }
      if (!apply) { newRows.push({ sourceContentId: remote.fc_id }); continue; }
      const remoteDetail = await detail(item, remote);
      const hlsUrl = remoteDetail.video_url || remote.url || '';
      if (!hlsUrl) throw new Error(`No video URL returned for ${item.fsId}/${remote.fc_id}.`);
      const row = { episodeId: nextId++, sourceContentId: remote.fc_id, title: clean(remote.title), titleZh: '', releaseDate: '', status: 'published', sourceType: 'xet-catalog', unlockRequiresQuiz: false, video: { source: 'hls', hlsUrl }, modules: { watch: true, read: false, words: false, vocabulary: false, phrases: false, grammar: false, quiz: false, review: false } };
      episodes.push(row); newRows.push(row);
    }
    discovered[seriesId] = newRows.length;
    seriesReport.push({ title: item.title, fsId: item.fsId, remoteEpisodes: playlist.length, localEpisodes: localBefore, newEpisodes: newRows.length });
    if (!apply) continue;
    if (newRows.length || changed.includes(seriesId)) await fs.writeFile(episodesPath, `${JSON.stringify(episodes, null, 2)}\n`);
    if (newRows.length) {
      const listing = seriesList.find(row => row.seriesId === seriesId);
      if (listing) { listing.readyEpisodes = episodes.length; if (!listing.episodeCount) listing.episodeCount = episodes.length; listing.tagline = `${listing.readyEpisodes} video lessons · Content in progress`; }
      changed.push(seriesId);
      execFileSync(process.execPath, [path.join(__dirname, 'enrich-new-lessons.mjs'), seriesId, ...newRows.map(row => String(row.episodeId))], { stdio: 'inherit' });
    }
  }
  if (apply && changed.length) await fs.writeFile(seriesListPath, `${JSON.stringify(seriesList, null, 2)}\n`);
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', catalogueSeries: selectedCatalogue.length, discovered, seriesReport, changedSeries: [...new Set(changed)], subtitlesChanged: false, vttChanged: false }, null, 2));
}
main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
