#!/usr/bin/env node

/*
 * One repeatable Little Fox sync entry point.
 *
 * --dry-run (default): checks the authorised video catalogue and reports
 *                       new courses or episodes without changing the repository.
 * --apply:              adds video releases from XET, then fetches each new
 *                       Read from Little Fox's public supplement page.
 *
 * Required only for catalogue discovery: XET_ACCOUNT and XET_PASSWORD.
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

// XET is used only to discover videos/content IDs. Read is fetched separately
// from Little Fox public supplement/org/Cxxxx pages. New episodes also receive
// timed VTT after a fail-closed comparison with official Read and the video timeline.
if (!apply) process.stderr.write('Dry run: no files will be written.\n');
run('sync-xet-catalog.js', [apply ? '--apply' : '--dry-run']);
