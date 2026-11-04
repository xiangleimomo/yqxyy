import { readdir, readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dataRoot = fileURLToPath(new URL('../data/', import.meta.url));
const primaryHost = 'https://cdn.littlefox.co.kr';
const legacyHost = 'https://cdn.littlefox.com';
let files = 0, episodes = 0;
const execFileAsync = promisify(execFile);

async function writeWithRetry(path, contents) {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      await writeFile(path, contents);
      return;
    } catch (error) {
      if (attempt === 5) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
}

for (const entry of await readdir(dataRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const path = join(dataRoot, entry.name, 'episodes.json');
  let payload;
  try { payload = JSON.parse(await readFile(path, 'utf8')); } catch { continue; }
  // Read the tracked catalogue as the source of truth for the former URL.
  // This keeps the legacy query string intact and makes the migration repeatable.
  let trackedEpisodes;
  try {
    const { stdout } = await execFileAsync('git', ['show', `HEAD:data/${entry.name}/episodes.json`], {
      maxBuffer: 64 * 1024 * 1024,
    });
    trackedEpisodes = JSON.parse(stdout);
  } catch {
    continue;
  }
  const trackedByEpisode = new Map(trackedEpisodes.map((episode) => [String(episode.episodeId), episode]));
  let changed = false;
  for (const episode of payload) {
    const video = episode.video;
    if (!video?.hlsUrl || !video.hlsUrl.startsWith(primaryHost + '/')) continue;
    const tracked = trackedByEpisode.get(String(episode.episodeId));
    const original = tracked?.video?.hlsUrl?.startsWith(primaryHost + '/')
      ? tracked.video.hlsUrl
      : video.hlsUrl;
    const primary = original.split('?')[0];
    const legacy = original.replace(primaryHost, legacyHost);
    if (video.hlsUrl !== primary || video.backupHlsUrl !== legacy) {
      video.hlsUrl = primary;
      video.backupHlsUrl = legacy;
      changed = true;
      episodes++;
    }
  }
  if (changed) { await writeWithRetry(path, JSON.stringify(payload, null, 2) + '\n'); files++; }
}

console.log(`Updated ${episodes} Little Fox episodes in ${files} catalogues.`);
