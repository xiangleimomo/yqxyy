// SPDX-License-Identifier: AGPL-3.0-only
// Optional live-browser smoke test. Requires Playwright, Chrome, and public source access.
const { chromium } = require("playwright");
const assert = require("assert/strict");
(async () => {
  const b = await chromium.launch({ channel: "chrome", headless: true });
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  const source =
    "https://vip.dytt-live.com/20250408/3736_3e195b07/3000k/hls/mixed.m3u8";
  const item = {
    id: "1",
    providerId: "test",
    providerName: "测试来源",
    title: "Integration Test",
    year: "2003",
    language: "en",
    languageLabel: "英语",
    episodes: [{ label: "正片", line: "HLS", url: source }],
  };
  if (process.env.HLS_TEST_SCRIPT)
    await p.route(
      "https://cdn.jsdelivr.net/npm/hls.js@1.5.20/dist/hls.min.js",
      (r) =>
        r.fulfill({
          path: process.env.HLS_TEST_SCRIPT,
          contentType: "text/javascript",
        }),
    );
  await p.route("**/.netlify/functions/source-explorer-api", async (route) => {
    const body = route.request().postDataJSON();
    let data;
    if (body.action === "providers")
      data = { providers: [{ id: "test", name: "测试来源" }] };
    else if (body.action === "search")
      data = {
        outcomes: [
          {
            name: "测试来源",
            ok: true,
            list: [
              item,
              { ...item, id: "2", language: "zh", languageLabel: "国语" },
            ],
          },
          { name: "失效来源", ok: false, error: "超时", list: [] },
        ],
      };
    else if (body.action === "subtitles")
      data = { configured: false, list: [], message: "外部字幕未配置" };
    else data = { item };
    await route.fulfill({ json: data });
  });
  await p.goto(
    process.env.SOURCE_LAB_TEST_URL || "http://127.0.0.1:8000/source-lab/",
  );
  await p.locator("#query").fill("Integration Test");
  await p.locator("#searchButton").click();
  await p.waitForFunction(
    () => !document.querySelector("#searchButton").disabled,
  );
  assert.equal(await p.locator(".card").count(), 1);
  assert((await p.locator("#searchStatus").innerText()).includes("失效来源"));
  await p.locator(".card button").click();
  await p.waitForFunction(
    () =>
      document.querySelector("video").videoWidth > 0 &&
      document.querySelector("video").currentTime > 0.1,
    {},
    { timeout: 35000 },
  );
  await p.locator("video").evaluate((v) => v.pause());
  await p.waitForFunction(
    () => document.querySelectorAll(".ad-row").length === 4,
  );
  await p.locator("video").evaluate((v) => (v.currentTime = 300));
  await p.waitForFunction(
    () => document.querySelector("video").currentTime >= 315.94,
  );
  assert(
    Math.abs(
      (await p.locator("video").evaluate((v) => v.currentTime)) - 315.941678,
    ) < 0.01,
  );
  await p.locator("#subtitleFile").setInputFiles({
    name: "English.srt",
    mimeType: "application/x-subrip",
    buffer: Buffer.from(
      "1\n00:00:01,000 --> 00:00:03,000\nHello world\n\n2\n00:06:00,000 --> 00:06:02,000\nAfter first ad\n",
    ),
  });
  await p
    .waitForFunction(
      () =>
        Array.from(document.querySelector("video").textTracks).some(
          (t) => t.cues?.length,
        ),
      {},
      { timeout: 5000 },
    )
    .catch(async (e) => {
      console.log(
        "SUB-DIAG",
        await p.evaluate(() => ({
          status: document.querySelector("#subtitleStatus").textContent,
          tracks: Array.from(document.querySelector("video").textTracks).map(
            (t) => ({ label: t.label, mode: t.mode, cues: t.cues?.length }),
          ),
          elements: Array.from(document.querySelectorAll("track")).map((t) => ({
            src: t.src,
            ready: t.readyState,
          })),
          options: document.querySelector("#subtitleTracks").innerHTML,
        })),
      );
      throw e;
    });
  await p.locator("#subtitleOffset").fill("2");
  await p.locator("#subtitleOffset").dispatchEvent("change");
  assert.equal(
    await p
      .locator("video")
      .evaluate(
        (v) =>
          Array.from(v.textTracks).find((t) => t.cues?.length).cues[0]
            .startTime,
      ),
    3,
  );
  const subtitleTime = () =>
    p
      .locator("video")
      .evaluate(
        (v) =>
          Array.from(v.textTracks).find((t) => t.cues?.length).cues[1]
            .startTime,
      );
  assert(Math.abs((await subtitleTime()) - 381.066666) < 0.01);
  await p.locator("#subtitleAdSync").uncheck();
  assert.equal(await subtitleTime(), 362);
  await p.locator("#subtitleAdSync").check();
  assert(Math.abs((await subtitleTime()) - 381.066666) < 0.01);
  await p.locator("video").evaluate((v) => (v.currentTime = 40));
  await p.locator("#markStart").click();
  await p.locator("video").evaluate((v) => (v.currentTime = 45));
  await p.locator("#markEnd").click();
  assert.equal(await p.locator(".ad-row").count(), 5);
  await p.locator("video").evaluate((v) => (v.currentTime = 42));
  await p.waitForFunction(
    () => document.querySelector("video").currentTime >= 45,
  );
  await p.locator("#clearMarks").click();
  assert.equal(await p.locator(".ad-row").count(), 4);
  await p.locator("#sourceImport").setInputFiles({
    name: "libretv-sources.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        sources: [{ name: "Imported", url: "https://custom.test/api" }],
      }),
    ),
  });
  await p.waitForFunction(() =>
    document.querySelector("#sourceNotice").textContent.includes("已导入 1"),
  );
  assert.equal(
    await p.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
  );
  await p.locator("#closePlayer").click();
  assert.equal(await p.locator("#watch").isVisible(), false);
  assert.equal(await p.locator("video").getAttribute("src"), null);
  assert.equal(errors.length, 0, errors.join(","));
  console.log(
    "PASS: browser English filter, failed-source isolation, real HLS playback and ad seek, SRT/offset, manual marks, LibreTV import, mobile fit and cleanup",
  );
  await b.close();
})();
