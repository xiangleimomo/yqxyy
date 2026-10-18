// SPDX-License-Identifier: AGPL-3.0-only
const core = require("../../source-lab/core.js");
const defaultProviders = require("../../source-lab/providers.json");
function providers() {
  const rows = process.env.SOURCE_LAB_PROVIDERS
    ? JSON.parse(process.env.SOURCE_LAB_PROVIDERS)
    : defaultProviders;
  if (!Array.isArray(rows)) throw Error("片源配置无效");
  return rows.slice(0, 12).map((r, i) => {
    const url = core.safeUrl(r.url);
    if (!url) throw Error("片源配置必须使用 HTTPS");
    return {
      id: String(r.id || "source_" + i),
      name: String(r.name || "资源 " + (i + 1)),
      url,
    };
  });
}
async function read(response) {
  if (!response.ok) throw Error("上游返回 " + response.status);
  if (Number(response.headers.get("content-length")) > 2e6)
    throw Error("响应过大");
  const reader = response.body.getReader();
  let size = 0;
  const chunks = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 2e6) {
      await reader.cancel();
      throw Error("响应过大");
    }
    chunks.push(value);
  }
  const charset =
    /charset=([^; ]+)/i.exec(response.headers.get("content-type") || "")?.[1] ||
    "utf-8";
  return new TextDecoder(charset).decode(Buffer.concat(chunks));
}
async function cms(provider, query, id) {
  const u = new URL(provider.url);
  u.searchParams.set("ac", "videolist");
  if (id) u.searchParams.set("ids", id);
  else u.searchParams.set("wd", query);
  const r = await fetch(u, {
    signal: AbortSignal.timeout(8000),
    headers: {
      Accept: "application/json",
      "User-Agent": "StoryFox-SourceLab/1.0",
    },
    redirect: "error",
  });
  return JSON.parse((await read(r)).replace(/^\uFEFF/, ""));
}
async function accountSubtitles(body) {
  const key = process.env.OPENSUBTITLES_API_KEY;
  if (!key)
    return {
      configured: false,
      list: [],
      message: "外部字幕服务尚未配置；可使用内嵌字幕、站内字幕或导入 SRT/VTT。",
    };
  const headers = {
    "Api-Key": key,
    "User-Agent": "StoryFox SourceLab v1.0",
    Accept: "application/json",
  };
  if (process.env.OPENSUBTITLES_TOKEN)
    headers.Authorization = "Bearer " + process.env.OPENSUBTITLES_TOKEN;
  if (body.action === "subtitle-download") {
    if (!/^\d+$/.test(String(body.fileId))) throw Error("字幕文件编号无效");
    const r = await fetch("https://api.opensubtitles.com/api/v1/download", {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        file_id: Number(body.fileId),
        sub_format: "webvtt",
      }),
      signal: AbortSignal.timeout(8000),
      redirect: "error",
    });
    const data = JSON.parse(await read(r));
    const u = new URL(data.link);
    if (
      u.protocol !== "https:" ||
      !/(^|\.)opensubtitles\.(com|org)$/.test(u.hostname)
    )
      throw Error("字幕下载地址无效");
    const file = await fetch(u, {
      signal: AbortSignal.timeout(8000),
      redirect: "error",
    });
    return { text: core.toVtt(await read(file)) };
  }
  const u = new URL("https://api.opensubtitles.com/api/v1/subtitles");
  u.searchParams.set("query", body.query);
  u.searchParams.set("languages", "en");
  if (body.year) u.searchParams.set("year", String(body.year));
  const data = JSON.parse(
    await read(
      await fetch(u, {
        headers,
        signal: AbortSignal.timeout(8000),
        redirect: "error",
      }),
    ),
  );
  return {
    configured: true,
    list: (data.data || [])
      .slice(0, 12)
      .flatMap((item) =>
        (item.attributes?.files || []).map((f) => ({
          id: f.file_id,
          label: f.file_name || item.attributes?.release || "English",
          downloads: item.attributes?.download_count || 0,
        })),
      )
      .slice(0, 12),
  };
}
const publicSubtitles =
  require("../../source-lab/subtitle-service.cjs").createPublicSubtitles(read);
async function subtitles(body) {
  if (body.action === "subtitle-download") {
    if (body.provider === "stremio") return publicSubtitles(body);
    if (!process.env.OPENSUBTITLES_API_KEY)
      throw Error("请重新查找字幕并选择版本。");
    return accountSubtitles(body);
  }
  if (process.env.OPENSUBTITLES_API_KEY) {
    try {
      const data = await accountSubtitles(body);
      if (data.list.length)
        return { ...data, providerName: "OpenSubtitles 账号服务" };
    } catch (_) {
      /* Public lookup remains available if the account service fails. */
    }
  }
  return publicSubtitles(body);
}
exports.handler = async (event) => {
  const reply = (statusCode, data) => ({
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(data),
  });
  if (event.httpMethod !== "POST") return reply(405, { error: "请使用 POST" });
  if ((event.body || "").length > 12000)
    return reply(413, { error: "请求过大" });
  try {
    const body = JSON.parse(event.body || "{}");
    const all = providers();
    if (body.action === "providers")
      return reply(200, {
        providers: all.map(({ id, name }) => ({ id, name })),
      });
    if (body.action === "subtitles" || body.action === "subtitle-download") {
      if (
        body.action === "subtitles" &&
        (!body.query || String(body.query).length > 100)
      )
        throw Error("请输入影片名称");
      return reply(200, await subtitles(body));
    }
    if (body.action === "search") {
      const query = String(body.query || "").trim();
      if (!query || query.length > 80) throw Error("请输入 1–80 字的影片名称");
      const outcomes = await Promise.all(
        all.map(async (p) => {
          const start = Date.now();
          try {
            const list = core.parseList(await cms(p, query), p, query);
            return {
              id: p.id,
              name: p.name,
              ok: true,
              ms: Date.now() - start,
              list,
            };
          } catch (e) {
            return {
              id: p.id,
              name: p.name,
              ok: false,
              error: e.name === "TimeoutError" ? "请求超时" : e.message,
              list: [],
            };
          }
        }),
      );
      return reply(200, { outcomes });
    }
    if (body.action === "detail") {
      const p = all.find((p) => p.id === body.providerId);
      if (!p || !/^\d{1,15}$/.test(String(body.id)))
        throw Error("片源编号无效");
      const items = core.parseList(await cms(p, "", String(body.id)), p);
      return reply(200, {
        item: items.find((x) => x.id === String(body.id)) || null,
      });
    }
    return reply(400, { error: "未知操作" });
  } catch (e) {
    return reply(400, { error: e.message || "请求失败" });
  }
};
