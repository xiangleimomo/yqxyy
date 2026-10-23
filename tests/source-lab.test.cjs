// SPDX-License-Identifier: AGPL-3.0-only
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm"),
  C = require("../source-lab/core.js");
// Lambda resolves its handler by basename. Keep the deployable .js entry
// distinct from included static directories (the former .cjs entry caused 502).
assert(fs.existsSync("netlify/functions/source-explorer-api.js"));
assert(!fs.existsSync("source-explorer-api"));
assert(!fs.existsSync("netlify/functions/source-lab.cjs"));
assert(
  fs
    .readFileSync("source-lab/app.js", "utf8")
    .includes('fetch("/.netlify/functions/source-explorer-api"'),
);
assert.equal(C.safeUrl("javascript:alert(1)"), "");
assert.equal(C.safeUrl("https://user:pass@example.com/a"), "");
assert.equal(C.language("英语"), "en");
assert.equal(C.language("粤语"), "zh");
assert.equal(C.language("英语 / 国语"), "unknown");
const p = { id: "test", name: "测试源" },
  movie = {
    vod_id: 1,
    vod_name: "冰雪奇缘",
    vod_year: 2013,
    vod_pic: "https://images.example/frozen.jpg",
    vod_lang: "英语",
    vod_play_from: "HLS$$$MP4",
    vod_play_url:
      "正片$https://cdn.example/a.m3u8?token=a$$$正片$https://cdn.example/a.mp4",
  };
assert.equal(C.parseList({ list: [movie] }, p, "冰雪").length, 1);
assert.equal(C.parseList({ list: [movie] }, p, "海底").length, 0);
assert.equal(
  C.parseList(
    { list: [{ ...movie, vod_name: "冰雪奇缘[电影解说]" }] },
    p,
    "冰雪",
  ).length,
  0,
);
assert.equal(C.episodes(movie).length, 2);
assert.equal(C.parseList({list:[movie]},p)[0].poster, movie.vod_pic);
assert.equal(C.posterUrl("/cover.jpg", "https://images.example/api"), "https://images.example/cover.jpg");
assert.equal(C.posterUrl("http://images.example/a.jpg"), "https://images.example/a.jpg");
assert.equal(C.posterUrl("javascript:alert(1)"), "");
assert.equal(C.posterUrl("https://user:pass@images.example/a.jpg"), "");

for (const url of [
  "https://example.com/?url=javascript:alert(1)",
  "https://example.com/?suffix=.m3u8",
])
  assert.equal(C.episodes({ ...movie, vod_play_url: "x$" + url }).length, 0);
assert.equal(
  C.episodes({
    ...movie,
    vod_play_url:
      "x$https://example.com/player?url=https%3A%2F%2Fcdn.example%2Fa.m3u8",
  })[0].url,
  "https://cdn.example/a.m3u8",
);
assert.equal(
  C.sourceList({
    sources: [
      { url: "https://a.test/api", name: "A" },
      { url: "https://a.test/api" },
      { url: "http://b.test/api" },
      { url: "https://c.test/api", isAdult: true },
    ],
  }).length,
  1,
);
assert(
  C.toVtt("1\r\n00:00:01,000 --> 00:00:02,500\r\nHi").includes(
    "00:00:01.000 --> 00:00:02.500",
  ),
);
const fp = [5.566667, 2.933333, 5.7, 3.333333, 1.533333];
let t = 0;
const rows = [4, ...fp, 4].map((duration, i) => {
  const r = {
    start: t,
    duration,
    cc: i === 0 ? 0 : i === 6 ? 3 : i < 3 ? 1 : 2,
    url: "https://cdn.test/" + i + ".ts",
  };
  t += duration;
  return r;
});
assert.equal(C.adRanges(rows).length, 1);
assert.equal(C.adRanges(rows.map((r) => ({ ...r, cc: 0 }))).length, 0);
assert.equal(
  C.adRanges(rows.map((r, i) => ({ ...r, duration: i === 2 ? 9 : r.duration })))
    .length,
  0,
);
const marked = [
  { start: 0, duration: 4, cc: 0, url: "https://cdn.test/movie.ts" },
  { start: 4, duration: 10, cc: 1, url: "https://cdn.test/adjump/a.ts" },
  { start: 14, duration: 4, cc: 2, url: "https://cdn.test/movie2.ts" },
];
assert.equal(C.adRanges(marked).length, 1);
const ctx = {};
vm.runInNewContext(
  fs.readFileSync("source-lab/vendor/libretv-m3u8.js", "utf8"),
  ctx,
);
assert.equal(typeof ctx.LibreTVM3u8.stripAdGroups, "function");
assert(C.adRanges(marked, true, ctx.LibreTVM3u8.stripAdGroups).length);
const handler = require("../netlify/functions/source-explorer-api.js").handler,
  originalFetch = global.fetch;
(async () => {
  try {
    let calls = 0;
    global.fetch = async (url) => {
      calls++;
      const u = new URL(url);
      assert(u.searchParams.has("wd") || u.searchParams.has("ids"));
      assert.equal(u.searchParams.get("ac"), "videolist");
      if (u.hostname.includes("wujin")) throw Error("unavailable");
      return new Response(JSON.stringify({ list: [movie] }), {
        headers: { "Content-Type": "application/json" },
      });
    };
    const request = (body) =>
      handler({ httpMethod: "POST", body: JSON.stringify(body) });
    const search = JSON.parse(
      (await request({ action: "search", query: "冰雪奇缘" })).body,
    );
    assert.equal(search.outcomes.length, 6);
    assert(search.outcomes.some((x) => !x.ok));
    assert(
      search.outcomes
        .filter((x) => x.ok)
        .every((x) => x.list[0].title === movie.vod_name),
    );
    const originalProviders = process.env.SOURCE_LAB_PROVIDERS;
    try {
      process.env.SOURCE_LAB_PROVIDERS = JSON.stringify([{id:"custom",name:"Custom",url:"https://example.test/api"}]);
      const configured = JSON.parse((await request({action:"providers"})).body).providers;
      assert.equal(configured[0].id, "dulo");
      assert.equal(configured[1].id, "custom");
    } finally {
      if (originalProviders === undefined) delete process.env.SOURCE_LAB_PROVIDERS;
      else process.env.SOURCE_LAB_PROVIDERS = originalProviders;
    }
    const before = calls;
    assert.equal(
      (
        await request({
          action: "detail",
          providerId: "https://localhost",
          id: "1",
        })
      ).statusCode,
      400,
    );
    assert.equal(calls, before);
    assert.equal(
      (await request({ action: "search", query: "" })).statusCode,
      400,
    );
    assert.equal((await handler({ httpMethod: "GET" })).statusCode, 405);
    const saved = process.env.OPENSUBTITLES_API_KEY;
    delete process.env.OPENSUBTITLES_API_KEY;
    global.fetch = async () =>
      new Response(JSON.stringify({ metas: [] }), {
        headers: { "Content-Type": "application/json" },
      });
    assert.equal(
      JSON.parse(
        (await request({ action: "subtitles", query: "NoSuchFilm" })).body,
      ).configured,
      true,
    );
    if (saved) process.env.OPENSUBTITLES_API_KEY = saved;
    console.log(
      "PASS: CMS parsing, exact direct URLs, English/mixed language, ad boundaries, upstream module, VTT, server allowlist, partial failures and subtitle fallback",
    );
  } finally {
    global.fetch = originalFetch;
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
