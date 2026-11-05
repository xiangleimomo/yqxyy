#!/usr/bin/env node

/*
 * One repeatable Little Fox sync entry point.
 *
 * --dry-run (default): checks the authorised video catalogue and reports
 *                       new courses or episodes without changing the repository.
 * --apply:              adds video releases from the ABC catalogue, then fetches each new
 *                       Read from Little Fox's public supplement page.
 *
 * Required only for catalogue discovery: LITTLEFOX_SYNC_ACCOUNT and
 * LITTLEFOX_SYNC_PASSWORD. The base URL defaults to abc.bolinzhiyin.cn and
 * can be overridden locally with LITTLEFOX_SYNC_BASE_URL.
 * Keep those values in local environment variables or GitHub Actions secrets;
 * never place them in this repository.
 */

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const args = process.argv.slice(2);
if (args.some(value => !['--apply', '--dry-run'].includes(value))) {
  throw new Error('Usage: node scripts/sync-little-fox.js [--dry-run|--apply]');
}
const apply = args.includes('--apply');
const run = (script, scriptArgs) => {
  const result = spawnSync(process.execPath, [path.join(__dirname, script), ...scriptArgs], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status) throw new Error(`${script} failed with exit code ${result.status}.`);
};

// The authorised ABC catalogue is used only to discover videos/content IDs. Read is fetched separately
// from Little Fox public supplement/org/Cxxxx pages. New episodes also receive
// timed VTT after a fail-closed comparison with official Read and the video timeline.
if (!apply) process.stderr.write('Dry run: no files will be written.\n');
run('sync-xet-catalog.js', [apply ? '--apply' : '--dry-run']);
if (apply) {
  // Build/refresh official episode PDF mappings after Read source IDs are present.
  const python = process.platform === 'win32' ? 'python' : 'python3';
  const result = spawnSync(python, [path.join(__dirname, 'import-episode-pdfs.py'), '--apply'], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status) throw new Error(`import-episode-pdfs.py failed with exit code ${result.status}.`);
  // New episodes: import official XML by verified sourceContentId.
  // Preserve existing speech-calibrated timing, and leave VTT unchanged when
  // official XML is unavailable or its transcript cannot be verified.
  const captionResult = spawnSync(python, [path.join(__dirname, 'import-official-captions.py'), '--manifest', 'subtitle-review/new-lessons.json', '--apply'], { stdio: 'inherit' });
  if (captionResult.error) throw captionResult.error;
  if (captionResult.status) throw new Error(`import-official-captions.py failed with exit code ${captionResult.status}.`);
}
