#!/usr/bin/env node
'use strict';
/**
 * 111Movies passive HLS discovery.
 * Usage: npm install --no-save playwright && npx playwright install chromium
 *        node scripts/111movies-observe.cjs 671
 * Requires permission to inspect and reuse the requested media.
 * Does not decrypt player payloads, bypass DRM, proxy media or replay protected APIs.
 */
const { moviePageUrl } = require('../source-lab/111movies-lookup.cjs');
const { attachHlsObserver } = require('../source-lab/hls-network-observer.cjs');

async function main({ chromium, tmdbId, timeoutMs = 20000 }) {
  const url = moviePageUrl(tmdbId);
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    const observer = attachHlsObserver(context);
    const page = await context.newPage();
    const result = { provider: '111movies', tmdbId: String(tmdbId), pageUrl: url, candidates: [], errors: [] };
    page.on('pageerror', error => result.errors.push(String(error.message).slice(0, 300)));
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
      await page.waitForTimeout(Math.min(15000, timeoutMs));
    } catch (error) {
      result.errors.push(String(error.message).slice(0, 300));
    } finally {
      result.candidates = observer.candidates();
      observer.stop();
    }
    return result;
  } finally {
    await browser.close();
  }
}

if (require.main === module) {
  const id = process.argv[2];
  if (!id) { console.error('Usage: node scripts/111movies-observe.cjs <tmdbId>'); process.exitCode = 2; }
  else {
    try {
      const { chromium } = require('playwright');
      main({ chromium, tmdbId: id })
        .then(result => console.log(JSON.stringify(result, null, 2)))
        .catch(error => { console.error(error.message); process.exitCode = 1; });
    } catch {
      console.error('Install Playwright: npm install --no-save playwright && npx playwright install chromium');
      process.exitCode = 1;
    }
  }
}
module.exports = { main };
