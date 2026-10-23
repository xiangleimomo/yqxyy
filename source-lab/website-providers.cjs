// SPDX-License-Identifier: AGPL-3.0-only
const core = require("./core.js");
const sites = {
  pianku: "https://4k01.pianku.online",
  lxyy: "https://tv.lxyy.club",
};
function text(raw) {
  return core
    .clean(
      String(raw || "")
        .replace(/<[^>]*>/g, " ")
        .replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|nbsp|lt|gt);/gi, (_, e) => {
          if (e[0] === "#") {
            const n =
              e[1].toLowerCase() === "x"
                ? parseInt(e.slice(2), 16)
                : parseInt(e.slice(1), 10);
            return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
          }
          return (
            { amp: "&", quot: '"', apos: "'", nbsp: " ", lt: "<", gt: ">" }[
              e.toLowerCase()
            ] || ""
          );
        }),
    )
    .replace(/\s+/g, " ")
    .trim();
}
function attr(raw, name) {
  return text(
    new RegExp(
      "(?:^|\\s)" + name + "\\s*=\\s*([\"\\'])([\\s\\S]*?)\\1",
      "i",
    ).exec(raw)?.[2] || "",
  );
}
const anchors = (html) =>
  [...html.matchAll(/<a\b([^>]*?)>([\s\S]*?)<\/a>/gi)].map((m) => ({
    href: attr(m[1], "href"),
    title: attr(m[1], "title"),
    html: m[2],
    label: text(m[2]),
  }));
function piankuSearch(html, provider, query) {
  const seen = new Set();
  return anchors(html)
    .flatMap((a) => {
      const m = /^\/voddetail\/(\d{1,15})\.html$/.exec(a.href);
      if (!m || seen.has(m[1])) return [];
      seen.add(m[1]);
      const title =
        a.title || text(/<h4\b[^>]*>([\s\S]*?)<\/h4>/i.exec(a.html)?.[1]);
      if (!title) return [];
      const year = /\b(19\d{2}|20\d{2})\b/.exec(a.label)?.[1] || "";
      return core
        .parseList(
          {
            list: [
              {
                vod_id: m[1],
                vod_name: title,
                vod_year: year,
                vod_lang: core.language(title) === "zh" ? "国语" : "",
                vod_remarks: text(
                  /class=["']remarks["'][^>]*>([\s\S]*?)<\/span>/i.exec(
                    a.html,
                  )?.[1],
                ),
              },
            ],
          },
          provider,
          query,
        )
        .map((r) => ({ ...r, websiteUrl: sites.pianku + a.href }));
    })
    .filter((r) => r.language !== "zh")
    .sort((a, b) => Number(!/4K/i.test(a.title)) - Number(!/4K/i.test(b.title)))
    .slice(0, 16);
}
function piankuDetail(html, provider, id) {
  const head = text(html.split("剧情简介")[0]);
  const title = text(
    (/<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1] || "").replace(
      /<span\b[^>]*>[\s\S]*?<\/span>/gi,
      "",
    ),
  );
  const lang =
    /语言\s*[:：]\s*(.*?)(?=\s+(?:导演|主演|更新时间|更新|备注)\s*[:：]|$)/.exec(
      head,
    )?.[1] || "";
  const year = /年份\s*[:：]\s*(\d{4})/.exec(head)?.[1] || "";
  const row = core.parseList(
    { list: [{ vod_id: id, vod_name: title, vod_year: year, vod_lang: lang }] },
    provider,
  )[0];
  if (!row) throw Error("片库影片详情不可用");
  const tabs = [
    ...html.matchAll(
      /<(?:span|div|a)\b([^>]*class=["'][^"']*source-tab-item[^"']*["'][^>]*)>([\s\S]*?)<\/(?:span|div|a)>/gi,
    ),
  ].map((m) => ({ pane: attr(m[1], "data-target"), name: text(m[2]) }));
  const pages = [];
  for (const tab of tabs) {
    const pos = html.search(
      new RegExp("id=[\"\\']" + tab.pane.replace(/[^\w-]/g, "") + "[\"\\']"),
    );
    if (pos < 0) continue;
    const next = html.indexOf('class="source-pane', pos + 5);
    const block = html.slice(pos, next < 0 ? undefined : next);
    for (const a of anchors(block)) {
      if (
        !new RegExp("^/vodplay/" + id + "-\\d+-\\d+\\.html$").test(a.href) ||
        /国语|粤语|普通话/.test(a.label)
      )
        continue;
      pages.push({
        url: sites.pianku + a.href,
        label: a.label,
        line: tab.name,
      });
    }
  }
  const seen = new Set();
  row.playPages = pages
    .filter((p) => {
      if (seen.has(p.url)) return false;
      seen.add(p.url);
      return true;
    })
    .sort(
      (a, b) =>
        Number(!/自营.*4K|4K60/i.test(a.line)) -
        Number(!/自营.*4K|4K60/i.test(b.line)),
    )
    .slice(0, 12);
  row.lookupTitle = title.replace(/\s*(?:4K|2160p|1080p|60帧)\s*$/i, "");
  row.websiteUrl = `${sites.pianku}/voddetail/${id}.html`;
  row.remarks = row.playPages
    .map((p) => p.line)
    .filter((v, i, a) => a.indexOf(v) === i)
    .join(" / ");
  return row;
}
function playerUrl(html) {
  const start = /\bvar\s+player_\w+\s*=\s*\{/.exec(html);
  if (!start) return "";
  const at = start.index + start[0].length - 1;
  let depth = 0,
    inString = false,
    escaped = false,
    end = at;
  for (; end < html.length; end++) {
    const c = html[end];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
    } else {
      if (c === '"') inString = true;
      else if (c === "{") depth++;
      else if (c === "}" && --depth === 0) break;
    }
  }
  let data;
  try {
    data = JSON.parse(html.slice(at, end + 1));
  } catch {
    return "";
  }
  let raw = data.url || "";
  try {
    if (Number(data.encrypt) === 2)
      raw = Buffer.from(raw, "base64").toString("utf8");
    if (Number(data.encrypt) === 1 || Number(data.encrypt) === 2)
      raw = decodeURIComponent(raw);
  } catch {
    return "";
  }
  return core.episodes({ vod_play_url: "播放$" + raw })[0]?.url || "";
}
function lxyyItem(raw, provider, detail = false) {
  const source = String(raw.source || "");
  const id = String(raw.id || "");
  if (!/^[a-zA-Z0-9_-]{1,40}$/.test(source) || !/^\d{1,24}$/.test(id))
    return null;
  const row = core.parseList(
    {
      list: [
        {
          vod_id: 1,
          vod_name: raw.name,
          vod_year: raw.year,
          vod_lang:
            raw.lang ||
            raw.language ||
            (/国语|粤语|普通话/.test(raw.name || "") ? "国语" : ""),
          vod_remarks: raw.remarks,
          type_name: raw.type,
        },
      ],
    },
    provider,
  )[0];
  if (!row) return null;
  row.id = source + ":" + id;
  row.providerName =
    provider.name + (raw.source_name ? " · " + text(raw.source_name) : "");
  row.websiteUrl = sites.lxyy + "/";
  if (detail) {
    row.episodes = (raw.episodes || []).flatMap((g) =>
      (g.episodes || []).flatMap((e) =>
        core.episodes({
          vod_play_from: g.group || "播放",
          vod_play_url: core.clean(e.name || "播放") + "$" + (e.url || ""),
        }),
      ),
    );
    if (!row.episodes.length && raw.play_url)
      row.episodes = core.episodes({ vod_play_url: raw.play_url });
  }
  return row;
}
function createWebsiteProviders(read, fetcher = (...args) => fetch(...args)) {
  const dulo = require("./dulo-provider.cjs").createDuloProvider(read, fetcher);
  const cache = new Map();
  async function load(url, signal, json = false) {
    const key = (json ? "j:" : "h:") + url;
    const old = cache.get(key);
    if (old && old.until > Date.now()) return old.value;
    const r = await fetcher(url, {
      signal,
      redirect: "error",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; StoryFoxSourceExplorer/1.0)",
        Accept: json ? "application/json" : "text/html",
      },
    });
    const raw = await read(r);
    const value = json ? JSON.parse(raw) : raw;
    if (cache.size >= 120) cache.delete(cache.keys().next().value);
    cache.set(key, { until: Date.now() + 600000, value });
    return value;
  }
  async function workers(rows, fn) {
    let next = 0;
    const result = new Array(rows.length);
    async function run() {
      while (next < rows.length) {
        const i = next++;
        try {
          result[i] = await fn(rows[i]);
        } catch {
          result[i] = rows[i];
        }
      }
    }
    await Promise.all([run(), run(), run(), run()]);
    return result;
  }
  async function detail(provider, id, signal, resolve = true) {
    if (provider.kind === "dulo") return dulo.detail(provider, id);
    if (provider.kind === "pianku") {
      if (!/^\d{1,15}$/.test(id)) throw Error("片库编号无效");
      const meta = piankuDetail(
        await load(`${sites.pianku}/voddetail/${id}.html`, signal),
        provider,
        id,
      );
      if (!resolve) return meta;
      const episodes = await workers(meta.playPages, async (page) => {
        const url = playerUrl(await load(page.url, signal));
        return url ? { label: page.label, line: page.line, url } : null;
      });
      meta.episodes = episodes.filter(
        (e) => e?.url && /\.(m3u8|mp4)$/i.test(new URL(e.url).pathname),
      );
      delete meta.playPages;
      return meta;
    }
    const match = /^([a-zA-Z0-9_-]{1,40}):(\d{1,24})$/.exec(id);
    if (!match) throw Error("洛雪TV编号无效");
    const u = new URL("/api/proxy.php", sites.lxyy);
    u.searchParams.set("action", "detail");
    u.searchParams.set("source", match[1]);
    u.searchParams.set("id", match[2]);
    const data = await load(u.href, signal, true);
    if (data.need_captcha) throw Error("原站要求验证，请在原站查看");
    if (!data.success || !data.details?.length)
      throw Error(data.message || "原站未返回播放详情");
    const found =
      data.details.find(
        (d) => String(d.id) === match[2] && d.source === match[1],
      ) || data.details[0];
    return lxyyItem(found, provider, true);
  }
  return {
    detail: async (provider, id) =>
      detail(provider, String(id), AbortSignal.timeout(12000)),
    search: async (provider, query) => {
      if (provider.kind === "dulo") return dulo.search(provider, query);
      const signal = AbortSignal.timeout(12000);
      let list;
      if (provider.kind === "pianku") {
        const u = new URL("/vodsearch/-------------.html", sites.pianku);
        u.searchParams.set("wd", query);
        list = piankuSearch(await load(u.href, signal), provider, query);
      } else {
        const u = new URL("/api/proxy.php", sites.lxyy);
        u.searchParams.set("action", "search");
        u.searchParams.set("wd", query);
        u.searchParams.set("page", "1");
        const data = await load(u.href, signal, true);
        if (data.need_captcha) throw Error("原站要求验证，请在原站搜索");
        if (!data.success) throw Error(data.message || "原站搜索失败");
        list = (data.results || [])
          .map((raw) => lxyyItem(raw, provider))
          .filter(Boolean)
          .filter(
            (r) =>
              core.normalize(r.title).includes(core.normalize(query)) &&
              r.language !== "zh",
          )
          .sort(
            (a, b) =>
              Number(!/自营/.test(a.providerName)) -
              Number(!/自营/.test(b.providerName)),
          )
          .slice(0, 24);
      }
      const head = list.slice(0, 12),
        tail = list.slice(12);
      const enriched = await workers(head, async (row) => {
        const found = await detail(provider, row.id, signal, false);
        if (!found) return row;
        delete found.playPages;
        return { ...row, ...found };
      });
      return [...enriched, ...tail];
    },
  };
}
module.exports = {
  createWebsiteProviders,
  piankuSearch,
  piankuDetail,
  playerUrl,
  lxyyItem,
};
