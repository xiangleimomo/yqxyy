// Inspect the eight film pages using normal browser playback. No decryption or
// access-control bypass. Requires Playwright and an installed Google Chrome.
// Run: node scripts/inspect-harry-potter-sources.cjs
const { chromium } = require('playwright');
const filmIds = process.argv.slice(2).length ? process.argv.slice(2).map(Number) : [16069, 16068, 77851, 16106, 16105, 233228, 16102, 16103];
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: false });
  const context = await browser.newContext({ viewport: null });
  try {
    for (const id of filmIds) {
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      const manifests = new Set();
      const listener = request => {
        if (/\.m3u8(?:[?#]|$)/i.test(request.url())) manifests.add(request.url());
      };
      try {
        await page.goto(`https://www.ncat23.com/detail/${id}.html`, { waitUntil: 'domcontentloaded', timeout: 25000 });
        await page.waitForLoadState('load', {timeout:10000}).catch(()=>{});
        await page.waitForTimeout(1500);
        const title = await page.title();
        if (!/哈利/.test(title)) throw new Error('Unexpected film page: '+title);
        const source = page.locator('.source-item').filter({ hasText: /^\s*蓝光\s+高清\s+\d+\s*$/ }).first();
        await source.click();
        await page.waitForTimeout(300);
        const episodes = await page.locator('a.episode-item:visible').evaluateAll(nodes => nodes.map(node => ({ title: node.textContent.trim(), url: node.href })));
        if (!episodes.length) throw new Error('No visible episode on selected 蓝光 line');
        const playPage = episodes[0].url;
        page.on('request', listener);
        await page.goto(playPage, { waitUntil: 'domcontentloaded', timeout: 25000 });
        const deadline = Date.now() + 15000;
        while (!manifests.size && Date.now() < deadline) {
          for (const frame of page.frames()) {
            await frame.locator('video').evaluateAll(nodes => nodes.forEach(video => { video.muted=true; video.play().catch(()=>{}); })).catch(()=>{});
          }
          await page.waitForTimeout(500);
        }
        console.log(JSON.stringify({ id, title, sourceLabel: '蓝光', playPage, manifests: [...manifests] }));
      } catch (error) {
        console.log(JSON.stringify({ id, error: error.message }));
      } finally { page.off('request', listener); await page.close(); }
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
