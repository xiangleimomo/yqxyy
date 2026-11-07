#!/usr/bin/env node
'use strict';

// V2 catalog scanner: discovers work only. It never slices media or publishes courses.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const CATALOG_PATH = path.join(ROOT, 'data/movie-hub-catalog.json');
const STATE_PATH = path.join(ROOT, 'data/v2-engine-state.json');
const CONFIG_PATH = path.join(ROOT, 'js/supabase-config.js');
const now = () => new Date().toISOString();

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}
function readSupabaseConfig() {
  const text = fs.readFileSync(CONFIG_PATH, 'utf8');
  const url = text.match(/\burl:\s*['"]([^'"]+)['"]/);
  const key = text.match(/\bpublishableKey:\s*['"]([^'"]+)['"]/);
  if (!url || !key) throw new Error('Cannot read public Supabase URL/publishable key from js/supabase-config.js');
  return { url: url[1].replace(/\/$/, ''), key: key[1] };
}
function assertFilm(film) {
  if (!film || !Number.isSafeInteger(Number(film.tmdbId)) || Number(film.tmdbId) < 1) return false;
  if (!film.id || !film.title || !Number.isInteger(Number(film.year))) return false;
  return true;
}
async function fetchTvLibrary(config) {
  const url = new URL('/rest/v1/movie_library', config.url);
  url.searchParams.set('select', 'id,category,media_type,tmdb_id,title,title_zh,year,season_number,episode_number,published,updated_at');
  url.searchParams.set('published', 'eq.true');
  url.searchParams.set('media_type', 'eq.tv');
  url.searchParams.set('order', 'sort_order.asc,title.asc');
  const response = await fetch(url, {
    headers: { apikey: config.key, Authorization: 'Bearer ' + config.key, Accept: 'application/json' },
    signal: AbortSignal.timeout(20000),
    redirect: 'error'
  });
  if (!response.ok) throw new Error('Supabase movie_library read failed: HTTP ' + response.status);
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error('Supabase movie_library returned a non-array payload');
  return rows;
}
function makeFilmJob(film) {
  return {
    key: 'movie:' + film.id,
    mediaType: 'movie',
    scope: 'feature',
    catalogId: film.id,
    tmdbId: Number(film.tmdbId),
    title: film.title,
    titleZh: film.titleZh || '',
    year: Number(film.year),
    seriesId: film.seriesId || '',
    status: 'queued',
    stage: 'discovered',
    qualityStatus: 'not_started',
    attempts: 0,
    createdAt: now(),
    updatedAt: now(),
    history: [{ at: now(), event: 'discovered', detail: 'Found in data/movie-hub-catalog.json' }]
  };
}
function makeTvJob(row) {
  return {
    key: 'tv:' + Number(row.tmdb_id) + ':series',
    mediaType: 'tv',
    scope: 'series',
    catalogId: row.id,
    tmdbId: Number(row.tmdb_id),
    title: row.title,
    titleZh: row.title_zh || '',
    year: row.year ? Number(row.year) : null,
    category: row.category || '',
    status: 'queued',
    stage: 'discovered',
    qualityStatus: 'not_started',
    attempts: 0,
    createdAt: now(),
    updatedAt: now(),
    history: [{ at: now(), event: 'discovered', detail: 'Found in public movie_library catalogue' }]
  };
}
function main() {
  const catalog = readJson(CATALOG_PATH, null);
  if (!catalog || !Array.isArray(catalog.films)) throw new Error('Invalid movie-hub-catalog.json');
  const validFilms = catalog.films.filter(assertFilm);
  const invalidFilms = catalog.films.filter(film => !assertFilm(film));
  const config = readSupabaseConfig();
  return fetchTvLibrary(config).then(tvRows => {
    const state = readJson(STATE_PATH, { schemaVersion: 1, updatedAt: now(), lastScanAt: null, jobs: {} });
    if (state.schemaVersion !== 1 || !state.jobs || typeof state.jobs !== 'object') throw new Error('Unsupported V2 state schema');
    const discovered = [...validFilms.map(makeFilmJob), ...tvRows.filter(row => Number(row.tmdb_id) > 0 && row.title).map(makeTvJob)];
    const added = [], refreshed = [];
    let stateChanged = false;
    for (const candidate of discovered) {
      const previous = state.jobs[candidate.key];
      if (!previous) {
        state.jobs[candidate.key] = candidate;
        added.push(candidate.key);
        stateChanged = true;
      } else {
        // Preserve production status and all completed work. Refresh metadata only.
        const protectedFields = ['status', 'stage', 'qualityStatus', 'attempts', 'history', 'source', 'production', 'publishedAt', 'lastError'];
        const next = { ...previous };
        let changed = false;
        for (const [key, value] of Object.entries(candidate)) {
          if (!protectedFields.includes(key) && key !== 'createdAt' && JSON.stringify(next[key]) !== JSON.stringify(value)) {
            next[key] = value;
            changed = true;
          }
        }
        if (changed) {
          next.updatedAt = now();
          state.jobs[candidate.key] = next;
          refreshed.push(candidate.key);
          stateChanged = true;
        }
      }
    }
    const summary = {
      filmRecords: catalog.films.length,
      validFilms: validFilms.length,
      invalidFilms: invalidFilms.length,
      publishedTvSeries: tvRows.length,
      discoveredItems: discovered.length,
      queuedItems: Object.values(state.jobs).filter(job => job.status === 'queued').length
    };
    if (JSON.stringify(state.catalogSummary) !== JSON.stringify(summary)) stateChanged = true;
    state.catalogSummary = summary;
    if (stateChanged) {
      state.updatedAt = now();
      fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + '\n');
    }
    const outputSummary = { added: added.length, refreshed: refreshed.length, invalidFilms: invalidFilms.length, tvSeries: tvRows.length, totalJobs: Object.keys(state.jobs).length, queued: state.catalogSummary.queuedItems, stateChanged };
    console.log('V2_SCAN_SUMMARY ' + JSON.stringify(outputSummary));
    if (invalidFilms.length) console.warn('Skipped film records without valid TMDB/title/year: ' + invalidFilms.length);
    if (process.env.GITHUB_STEP_SUMMARY) {
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
        '## V2 catalog discovery\n\n' +
        '- New jobs: ' + outputSummary.added + '\n' +
        '- Existing jobs refreshed: ' + outputSummary.refreshed + '\n' +
        '- Published TV series discovered: ' + outputSummary.tvSeries + '\n' +
        '- Invalid film records skipped: ' + outputSummary.invalidFilms + '\n' +
        '- Total tracked jobs: ' + outputSummary.totalJobs + '\n\n' +
        '**Discovery only:** no source extraction, story segmentation, course generation, or publishing occurs in this workflow.\n');
    }
  });
}
main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
