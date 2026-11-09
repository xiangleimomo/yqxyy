'use strict';
/**
 * Remote Chromium connectivity diagnostic.
 * Environment:
 *   BROWSER_CDP_ENDPOINT=wss://... (provider-issued endpoint)
 *   BROWSER_DIAGNOSTIC_TOKEN=... (long random token, not in frontend)
 * Does not browse third-party movie sites or return media URLs.
 */
exports.handler = async (event) => {
  const reply = (code, body) => ({
    statusCode: code,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    body: JSON.stringify(body)
  });
  if (event.httpMethod !== 'POST') return reply(405, { error: 'POST required' });
  const expected = process.env.BROWSER_DIAGNOSTIC_TOKEN;
  if (!expected || event.headers?.authorization !== 'Bearer ' + expected) return reply(401, { error: 'Unauthorized' });
  const endpoint = process.env.BROWSER_CDP_ENDPOINT;
  if (!endpoint) return reply(503, { ok: false, stage: 'configuration', error: 'BROWSER_CDP_ENDPOINT not configured' });
  let parsed;
  try { parsed = new URL(endpoint); } catch { return reply(503, { ok: false, stage: 'configuration', error: 'Invalid endpoint' }); }
  if (parsed.protocol !== 'wss:' || parsed.username || parsed.password) return reply(503, { ok: false, stage: 'configuration', error: 'Expected secure WebSocket endpoint' });
  let browser;
  try {
    const { chromium } = require('playwright-core');
    browser = await chromium.connectOverCDP(endpoint, { timeout: 12000 });
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto('https://example.com/', { waitUntil: 'domcontentloaded', timeout: 10000 });
    const title = await page.title();
    await context.close();
    return reply(200, { ok: true, browser: 'remote-chromium', title });
  } catch (error) {
    return reply(502, { ok: false, stage: 'browser', error: String(error?.message || error).slice(0, 180) });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
};
