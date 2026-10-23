// SPDX-License-Identifier: AGPL-3.0-only
const assert = require("node:assert/strict");
const {
  piankuSearch,
  piankuDetail,
  playerUrl,
  lxyyItem,
  createWebsiteProviders,
} = require("../source-lab/website-providers.cjs");
const p = { id: "pianku", name: "片库", kind: "pianku" },
  l = { id: "lxyy", name: "洛雪TV", kind: "lxyy" };
const search =
  '<a href="/voddetail/123.html" title="Ice4K"><img data-original="/covers/ice.jpg"><h4>Ice4K</h4><p>2013 / 美国</p></a><a href="/voddetail/123.html">duplicate</a><a href="https://evil.test/voddetail/789.html">Ice</a><a href="/voddetail/2.html" title="Ice国语">国语</a>';
assert.equal(piankuSearch(search, p, "Ice").length, 1);
assert.equal(piankuSearch(search,p,"Ice")[0].poster,"https://4k01.pianku.online/covers/ice.jpg");
const detail =
  '<h1>Ice4K<span>4K</span></h1><span>年份：2013</span><span>语言：英语</span><div>导演：Someone</div><h3>剧情简介</h3><span class="source-tab-item" data-target="playlist-1">自营4K60帧</span><span class="source-tab-item" data-target="playlist-2">备用</span><div class="source-pane" id="playlist-1"><a href="/vodplay/123-1-1.html">英语</a><a href="/vodplay/123-1-2.html">国语</a></div><div class="source-pane" id="playlist-2"><a href="/vodplay/123-2-1.html">HD</a></div>';
const d = piankuDetail(detail, p, "123");
assert.equal(d.title, "Ice4K");
assert.equal(d.lookupTitle, "Ice");
assert.equal(d.languageLabel, "英语");
assert.equal(d.year, "2013");
assert.equal(d.playPages.length, 2);
assert.equal(d.playPages[0].line, "自营4K60帧");
const raw = "https://cdn.test/movie.m3u8?sign=x";
for (const encrypt of [0, 1, 2]) {
  const url =
    encrypt === 2
      ? Buffer.from(encodeURIComponent(raw)).toString("base64")
      : encrypt === 1
        ? encodeURIComponent(raw)
        : raw;
  assert.equal(
    playerUrl(
      "var player_abc=" +
        JSON.stringify({ encrypt, url, extra: { brace: "}" } }) +
        ";</script>",
    ),
    raw,
  );
}
assert.equal(playerUrl("var player_x={url:alert(1)}"), "");
assert.equal(playerUrl('var player_x={"url":"javascript:alert(1)"}'), "");
assert.equal(playerUrl('var player_x={"url":"https://parser.test/html"}'), "");
const item = lxyyItem(
  {
    source: "jl",
    id: "629107140044259332",
    name: "Ice",
    pic: "https://images.test/ice.jpg",
    lang: "英语",
    year: "2013",
    source_name: "自营",
    episodes: [
      { group: "hls", episodes: [{ name: "正片", url: raw }] },
      {
        group: "parser",
        episodes: [{ name: "正片", url: "https://parser.test/play" }],
      },
    ],
  },
  l,
  true,
);
assert.equal(item.id, "jl:629107140044259332");
assert.equal(item.language, "en");
assert.equal(item.poster,"https://images.test/ice.jpg");
assert.equal(item.episodes.length, 1);
assert.equal(
  lxyyItem({ source: "https://evil.test", id: "1", name: "Ice" }, l),
  null,
);
(async () => {
  let count = 0;
  const read = async (r) => r.text();
  const adapter = createWebsiteProviders(read, async (url) => {
    count++;
    const u = new URL(url);
    assert.equal(u.origin, "https://tv.lxyy.club");
    return new Response(JSON.stringify({ need_captcha: true }));
  });
  await assert.rejects(adapter.search(l, "Ice"), /原站要求验证/);
  assert.equal(count, 1, "do not solve or bypass a site challenge");
  await assert.rejects(adapter.detail(l, "jl:1:2"));
  console.log(
    "PASS: website-specific parsing, language/quality metadata, original-site links, long IDs, direct URLs, JSON-only player extraction, English lines and challenge handling",
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
