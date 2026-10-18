// SPDX-License-Identifier: AGPL-3.0-only
const assert = require("node:assert/strict");
const { createPublicSubtitles } = require("../source-lab/subtitle-service.cjs");
const calls = [];
const read = async (r) => {
  if (!r.ok) throw Error("HTTP " + r.status);
  return r.text();
};
const response = (data) =>
  new Response(typeof data === "string" ? data : JSON.stringify(data));
const fetcher = async (raw) => {
  const u = new URL(raw);
  calls.push(u.href);
  assert.equal(u.protocol, "https:");
  if (u.hostname === "v3-cinemeta.strem.io") {
    if (u.pathname.includes("/meta/"))
      return response({
        meta: { id: "tt2294629", name: "Frozen", releaseInfo: "2013" },
      });
    if (u.pathname.includes("Ambiguous"))
      return response({
        metas: [
          {
            id: "tt1111111",
            name: "Ambiguous",
            type: "movie",
            releaseInfo: "2000",
          },
          {
            id: "tt2222222",
            name: "Ambiguous",
            type: "movie",
            releaseInfo: "2020",
          },
        ],
      });
    return response({
      metas: [
        { id: "tt2294629", name: "Frozen", type: "movie", releaseInfo: "2013" },
        { id: "tt1323045", name: "Frozen", type: "movie", releaseInfo: "2010" },
        {
          id: "tt4520988",
          name: "Frozen II",
          type: "movie",
          releaseInfo: "2019",
        },
      ],
    });
  }
  if (u.hostname === "opensubtitles-v3.strem.io")
    return response({
      subtitles: [
        {
          id: "100",
          lang: "eng",
          url: "https://subs5.strem.io/en/download/subencoding-stremio-utf8/src-api/file/100",
          subtitleFileName: "Frozen.2013.srt",
        },
        {
          id: "100",
          lang: "eng",
          url: "https://subs5.strem.io/en/download/subencoding-stremio-utf8/src-api/file/100",
        },
        {
          id: "101",
          lang: "chi",
          url: "https://subs5.strem.io/en/download/file/101",
        },
        { id: "102", lang: "eng", url: "https://localhost/en/download/102" },
        {
          id: "103",
          lang: "eng",
          url: "https://subs5.strem.io.evil.test/en/download/103",
        },
        {
          id: "104",
          lang: "eng",
          url: "http://subs5.strem.io/en/download/104",
        },
      ],
    });
  if (u.hostname === "subs5.strem.io")
    return response("1\n00:00:01,000 --> 00:00:03,000\nSubtitle test\n");
  throw Error("Unexpected upstream " + u.hostname);
};
(async () => {
  const service = createPublicSubtitles(read, fetcher);
  const a = await service({
    action: "subtitles",
    query: "冰雪奇缘",
    year: "2014",
  });
  assert.equal(a.configured, true);
  assert.equal(a.film.id, "tt2294629");
  assert.equal(a.film.year, "2013");
  assert.equal(a.list.length, 1);
  assert.equal(a.list[0].provider, "stremio");
  assert(calls[0].includes("search=Frozen.json"));
  const before = calls.length;
  await service({ action: "subtitles", query: "冰雪奇缘", year: "2013" });
  assert.equal(calls.length, before, "cached metadata and subtitle list");
  const file = a.list[0];
  const d = await service({
    action: "subtitle-download",
    provider: "stremio",
    imdbId: file.imdbId,
    fileId: file.id,
    url: "https://localhost/private",
  });
  assert(d.text.startsWith("WEBVTT"));
  assert(d.text.includes("00:00:01.000"));
  assert(!calls.some((u) => u.includes("localhost")));
  await assert.rejects(
    service({
      action: "subtitle-download",
      provider: "stremio",
      imdbId: "http://127.0.0.1",
      fileId: "100",
    }),
  );
  await assert.rejects(
    service({
      action: "subtitle-download",
      provider: "stremio",
      imdbId: "tt2294629",
      fileId: "102",
    }),
  );
  const b = await service({ action: "subtitles", query: "Ambiguous" });
  assert.equal(b.film, undefined);
  assert.equal(b.films.length, 2);
  assert.equal(b.list.length, 0);
  const c = await service({
    action: "subtitles",
    query: "Frozen",
    year: "2010",
  });
  assert.equal(c.film.id, "tt1323045");
  const id = await service({ action: "subtitles", query: "tt2294629" });
  assert.equal(id.film.name, "Frozen");
  console.log(
    "PASS: no-key subtitle search, Chinese/English title aliases, corrected year, exact IMDb selection, ambiguity, English filtering, cache, controlled download hosts and VTT conversion",
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

const mapTime = require("../source-lab/core.js").subtitlePlaybackTime;
const ads = [
  { start: 10, end: 15 },
  { start: 20, end: 23 },
];
assert.equal(mapTime(9, ads), 9);
assert.equal(mapTime(10, ads), 15);
assert.equal(mapTime(16, ads), 24);
assert.equal(mapTime(16, [...ads, { start: 11, end: 14 }]), 24);
assert.equal(mapTime(16, []), 16);
