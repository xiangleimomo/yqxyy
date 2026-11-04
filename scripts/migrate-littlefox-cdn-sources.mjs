import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dataRoot = fileURLToPath(new URL('../data/', import.meta.url));
const internationalHost = 'https://cdn.littlefox.com';
const koreaHost = 'https://cdn.littlefox.co.kr';
let files = 0, episodes = 0;

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
  let changed = false;
  for (const episode of payload) {
    const video = episode.video;
    if (!video?.hlsUrl || !video.hlsUrl.startsWith(koreaHost + '/')) continue;
    const koreaUrl = video.hlsUrl;
    const internationalUrl = video.backupHlsUrl?.startsWith(internationalHost + '/')
      ? video.backupHlsUrl
      : koreaUrl.replace(koreaHost, internationalHost);
    if (video.hlsUrl !== internationalUrl || video.backupHlsUrl !== koreaUrl) {
      video.hlsUrl = internationalUrl;
      video.backupHlsUrl = koreaUrl;
      changed = true;
      episodes++;
    }
  }
  if (changed) { await writeWithRetry(path, JSON.stringify(payload, null, 2) + '\n'); files++; }
}

console.log(`Set ${episodes} Little Fox episodes to .com primary and .co.kr backup in ${files} catalogues.`);
