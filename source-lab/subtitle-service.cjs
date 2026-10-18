// SPDX-License-Identifier: AGPL-3.0-only
const core = require("./core.js");
const aliases = require("./subtitle-films.json");
function createPublicSubtitles(read, fetcher = (...args) => fetch(...args)) {
  const cache = new Map();
  async function json(url) {
    const old = cache.get(url);
    if (old && old.until > Date.now()) return old.value;
    const r = await fetcher(url, {
      signal: AbortSignal.timeout(8000),
      redirect: "error",
      headers: { Accept: "application/json" },
    });
    const value = JSON.parse(await read(r));
    if (cache.size >= 100) cache.delete(cache.keys().next().value);
    cache.set(url, { until: Date.now() + 3600000, value });
    return value;
  }
  const filmId = (id) => /^tt\d{5,12}$/.test(String(id || ""));
  async function filmSearch(body) {
    const query = String(body.query || "").trim();
    if (filmId(body.imdbId) || filmId(query)) {
      const id = filmId(body.imdbId) ? body.imdbId : query;
      const result = await json(
        `https://v3-cinemeta.strem.io/meta/movie/${id}.json`,
      );
      if (!result.meta) throw Error("未找到该 IMDb 影片");
      return {
        film: {
          id,
          name: core.clean(result.meta.name),
          year: String(result.meta.releaseInfo || "").slice(0, 4),
        },
      };
    }
    const alias = aliases.find((m) =>
      [m.title, m.titleZh].some(
        (t) => core.normalize(t) === core.normalize(query),
      ),
    );
    const title = alias?.title || query;
    const supplied = Number(body.year) || 0;
    const year =
      alias && (!supplied || Math.abs(supplied - alias.year) <= 1)
        ? alias.year
        : supplied;
    const result = await json(
      `https://v3-cinemeta.strem.io/catalog/movie/top/search=${encodeURIComponent(title)}.json`,
    );
    const films = (result.metas || [])
      .filter((m) => filmId(m.id) && m.type === "movie")
      .map((m) => ({
        id: m.id,
        name: core.clean(m.name),
        year: String(m.releaseInfo || "").slice(0, 4),
      }));
    const exact = films.filter(
      (m) => core.normalize(m.name) === core.normalize(title),
    );
    const sameYear = exact.filter((m) => !year || Number(m.year) === year);
    if (sameYear.length === 1) return { film: sameYear[0] };
    return { films: (exact.length ? exact : films).slice(0, 12) };
  }
  async function listFor(id) {
    if (!filmId(id)) throw Error("影片编号无效");
    const data = await json(
      `https://opensubtitles-v3.strem.io/subtitles/movie/${id}.json`,
    );
    return (data.subtitles || []).filter(
      (s) =>
        ["eng", "en"].includes(String(s.lang).toLowerCase()) &&
        /^\d{1,20}$/.test(String(s.id)) &&
        validUrl(s.url),
    );
  }
  function validUrl(raw) {
    try {
      const u = new URL(raw);
      return (
        u.protocol === "https:" &&
        !u.username &&
        !u.password &&
        !u.port &&
        /^subs\d*\.strem\.io$/.test(u.hostname) &&
        u.pathname.startsWith("/en/download/")
      );
    } catch {
      return false;
    }
  }
  return async (body) => {
    if (body.action === "subtitle-download") {
      if (body.provider !== "stremio") throw Error("请重新查找字幕并选择版本");
      const list = await listFor(body.imdbId);
      const file = list.find((s) => String(s.id) === String(body.fileId));
      if (!file) throw Error("字幕版本已不可用，请重新搜索");
      const response = await fetcher(file.url, {
        signal: AbortSignal.timeout(8000),
        redirect: "error",
      });
      const raw = await read(response);
      if (
        !/\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->/.test(raw) &&
        !raw.trimStart().startsWith("WEBVTT")
      )
        throw Error("字幕服务返回的文件格式无效");
      return {
        text: core.toVtt(raw),
        label: core.clean(
          file.subtitleFileName || file.movieReleaseName || "English",
        ),
        provider: "stremio",
      };
    }
    const match = await filmSearch(body);
    if (!match.film)
      return {
        configured: true,
        provider: "stremio",
        providerName: "公共英文字幕",
        list: [],
        films: match.films,
        message: match.films.length
          ? "找到同名或相近影片，请先确认影片和年份。"
          : "未找到影片，请输入英文片名或 IMDb 编号（tt 开头）。",
      };
    const subtitles = await listFor(match.film.id);
    const seen = new Set();
    const list = subtitles
      .filter((s) => {
        if (seen.has(String(s.id))) return false;
        seen.add(String(s.id));
        return true;
      })
      .sort(
        (a, b) =>
          Number(/[-.]HI\b/i.test(a.subtitleFileName || "")) -
          Number(/[-.]HI\b/i.test(b.subtitleFileName || "")),
      )
      .slice(0, 30)
      .map((s) => ({
        id: String(s.id),
        provider: "stremio",
        imdbId: match.film.id,
        label: core.clean(
          s.subtitleFileName || s.movieReleaseName || "English",
        ),
        format: core.clean(s.releaseFormat || ""),
        fps: s.fpsMilli ? Number(s.fpsMilli) / 1000 : null,
      }));
    return {
      configured: true,
      provider: "stremio",
      providerName: "公共英文字幕",
      film: match.film,
      list,
      message: list.length
        ? ""
        : "该影片暂未找到英文字幕，可更换影片匹配或导入文件。",
    };
  };
}
module.exports = { createPublicSubtitles };
