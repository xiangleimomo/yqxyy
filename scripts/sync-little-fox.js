#!/usr/bin/env node

/*
 * One repeatable Little Fox sync entry point.
 *
 * --dry-run (default): checks the authorised subtitle catalogue and reports
 *                       changed courses without changing the repository.
 * --apply:              refreshes the public video catalogue, then imports
 *                       changed authorised subtitles and generates VTT files.
 *
 * Required only for the subtitle part: XET_ACCOUNT and XET_PASSWORD.
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

if (apply) run('import-hls-catalog.mjs', []);
else process.stderr.write('Dry run: video catalogue is not written.\n');
run('import-xet-subtitles.js', [apply ? '--apply' : '--dry-run']);
