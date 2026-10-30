// SPDX-License-Identifier: AGPL-3.0-only
(() => {
  "use strict";
  const C = window.SourceLabCore,
    $ = (id) => document.getElementById(id),
    video = $("video");
  const state = {
    providers: [],
    custom: [],
    results: [],
    current: null,
    episode: null,
    hls: null,
    generation: 0,
    searchGeneration: 0,
    subtitleRequest: 0,
    blocks: [],
    manual: [],
    ignored: new Set(),
    timer: null,
    mark: null,
    subtitleBlobs: [],
    abort: null,
    resume: 0,
  };
  const storage = {
    get(key, fallback) {
      try {
        return (
          JSON.parse(localStorage.getItem("sf_source_lab_" + key)) ?? fallback
        );
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem("sf_source_lab_" + key, JSON.stringify(value));
      } catch {}
    },
  };
  try {
    state.custom = C.sourceList(storage.get("providers", []));
  } catch {}
  const message = (id, text, error = false) => {
    $(id).textContent = text;
    $(id).classList.toggle("error", error);
  };
  async function api(body, signal) {
    const r = await fetch("/.netlify/functions/source-explorer-api", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    let data;
    try {
      data = await r.json();
    } catch {
      throw Error("搜索服务未启动，请在部署完成后重试。");
    }
    if (!r.ok || data.error)
      throw Error(
        data.error || `搜索服务暂不可用（HTTP ${r.status}），请稍后重试。`,
      );
    return data;
  }
  async function direct(provider, query, id, signal) {
    const u = new URL(provider.url);
    u.searchParams.set("ac", "videolist");
    u.searchParams.set(id ? "ids" : "wd", id || query);
    const response = await fetch(u, { signal });
    if (!response.ok) throw Error("接口返回 " + response.status);
    return C.parseList(await response.json(), provider, id ? "" : query);
  }
  function showProviders() {
    const box = $("providerList");
    box.replaceChildren();
    for (const p of [...state.providers, ...state.custom]) {
      const line = document.createElement("p");
      line.textContent =
        p.name +
        (p.custom
          ? " · 本机导入"
          : p.kind && p.kind !== "cms"
            ? " · 预置网站源"
            : " · 预置搜索源");
      if (C.safeUrl(p.websiteUrl)) {
        const link = document.createElement("a");
        link.href = p.websiteUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = " · 查看原站";
        line.append(link);
      }
      box.append(line);
    }
  }
  function filtered() {
    return state.results.filter(
      (r) =>
        !$("englishOnly").checked ||
        r.language === "en" ||
        ($("includeUnknown").checked && r.language === "unknown"),
    );
  }
  function renderResults() {
    const box = $("results");
    box.replaceChildren();
    const results = filtered();
    for (const item of results) {
      const card = document.createElement("article");
      card.className = "card";
      const cover = document.createElement("div");
      cover.className = "result-poster";
      const fallback = document.createElement("span");
      fallback.className = "poster-fallback";
      fallback.setAttribute("aria-hidden", "true");
      fallback.textContent = "🎬\n封面暂缺";
      cover.append(fallback);
      const poster = C.posterUrl(item.poster);
      if (poster) {
        const img = document.createElement("img");
        img.alt = item.title + " 封面";
        img.loading = "lazy";
        img.decoding = "async";
        img.referrerPolicy = "no-referrer";
        img.addEventListener("error", () => img.remove(), {once: true});
        img.src = poster;
        cover.append(img);
      }
      const content = document.createElement("div");
      content.className = "result-content";
      const title = document.createElement("h3");
      title.textContent = item.title;
      const meta = document.createElement("p");
      meta.className = "meta";
      meta.textContent = [
        item.providerName,
        item.year,
        item.languageLabel,
        item.remarks,
      ]
        .filter(Boolean)
        .join(" · ");
      const button = document.createElement("button");
      button.textContent = "试播 / 查看线路";
      if (item.providerId === "dulo") card.classList.add("primary-source");
      button.onclick = () => select(item);
      content.append(title, meta, button);
      card.append(cover, content);
      if (C.safeUrl(item.websiteUrl)) {
        const link = document.createElement("a");
        link.className = "original-site";
        link.href = item.websiteUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "在原站查看";
        content.append(link);
      }
      box.append(card);
    }
    if (state.results.length && !results.length) {
      const p = document.createElement("p");
      p.textContent =
        "未找到标注为英语的片源。可勾选“语言待核对”查看未标注语言的结果。";
      box.append(p);
    }
  }
  async function search(event) {
    event?.preventDefault();
    const query = $("query").value.trim();
    if (!query) return;
    const generation = ++state.searchGeneration;
    $("searchButton").disabled = true;
    message("searchStatus", "正在并行搜索…");
    state.results = [];
    renderResults();
    try {
      const outcomes = await Promise.all([
        api({ action: "search", query })
          .then((d) => d.outcomes)
          .catch((e) => [
            { name: "预置搜索源", ok: false, error: e.message, list: [] },
          ]),
        ...state.custom.map(async (p) => {
          try {
            return [
              {
                name: p.name,
                ok: true,
                list: await direct(p, query, null, AbortSignal.timeout(8500)),
              },
            ];
          } catch (e) {
            return [
              {
                name: p.name,
                ok: false,
                error:
                  e.name === "TimeoutError"
                    ? "超时"
                    : "接口不可访问或不支持跨域",
                list: [],
              },
            ];
          }
        }),
      ]);
      if (generation !== state.searchGeneration) return;
      const all = outcomes.flat();
      const seen = new Set();
      state.results = all
        .flatMap((x) => x.list || [])
        .filter((x) => {
          const key = x.providerId + ":" + x.id;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .sort((a, b) => Number(b.providerId === "dulo") - Number(a.providerId === "dulo"));
      renderResults();
      const failed = all.filter((x) => !x.ok);
      message(
        "searchStatus",
        `找到 ${state.results.length} 个结果，当前显示 ${filtered().length} 个。` +
          (failed.length
            ? " 未响应：" +
              failed.map((x) => x.name + "（" + x.error + "）").join("、")
            : "") +
          (state.results.length ? "" : " 可以尝试中文片名或导入其他搜索源。"),
      );
    } catch (e) {
      if (generation === state.searchGeneration)
        message("searchStatus", e.message, true);
    } finally {
      if (generation === state.searchGeneration)
        $("searchButton").disabled = false;
    }
  }
  function cleanup() {
    state.generation++;
    state.subtitleRequest++;
    clearTimeout(state.timer);
    clearTimeout(state.nativeTimer);
    state.abort?.abort();
    state.abort = null;
    state.hls?.destroy();
    state.hls = null;
    video.pause();
    video.removeAttribute("src");
    video.querySelectorAll("track").forEach((t) => t.remove());
    video.load();
    state.subtitleBlobs.forEach(URL.revokeObjectURL);
    state.subtitleBlobs = [];
    state.blocks = [];
    state.manual = [];
    state.ignored.clear();
    state.mark = null;
    $("subtitleOffset").value = 0;
    $("subtitleTracks").replaceChildren(new Option("关闭字幕", "off"));
    $("externalSubtitles").replaceChildren();
    message("subtitleStatus", "");
    message("playerStatus", "");
  }
  async function select(item, resume = 0) {
    cleanup();
    state.current = item;
    const generation = state.generation;
    $("watch").hidden = false;
    $("watchTitle").textContent = item.title;
    message("watchSource", item.providerName + " · " + item.languageLabel);
    message("playerStatus", "正在获取播放线路…");
    $("watch").scrollIntoView({ behavior: "smooth", block: "start" });
    try {
      if (!item.episodes.length) {
        const provider = state.custom.find((p) => p.id === item.providerId);
        const detail = provider
          ? (
              await direct(provider, "", item.id, AbortSignal.timeout(8500))
            ).find((r) => r.id === item.id)
          : (
              await api({
                action: "detail",
                providerId: item.providerId,
                id: item.id,
              })
            ).item;
        if (generation !== state.generation) return;
        if (!detail?.episodes?.length)
          throw Error(
            item.websiteUrl
              ? "此线路需要原站解析，请点击结果卡片的“在原站查看”，或选择其他来源。"
              : "此来源未提供可直接播放的 M3U8 / MP4，可尝试其他来源。",
          );
        Object.assign(item, detail);
      }
      if (generation !== state.generation) return;
      const options = item.episodes.map(
        (e, i) => new Option(e.line + " · " + e.label, String(i)),
      );
      $("episodes").replaceChildren(...options);
      startEpisode(0, resume);
    } catch (e) {
      if (generation === state.generation)
        message("playerStatus", e.message, true);
    }
  }
  function marksKey() {
    return "marks_" + state.episode?.url;
  }
  function blockList() {
    return [
      ...state.blocks.filter((r) => !state.ignored.has(r.start.toFixed(3))),
      ...state.manual,
    ].sort((a, b) => a.start - b.start);
  }
  const clock = (t) =>
    `${Math.floor(t / 3600)
      .toString()
      .padStart(2, "0")}:${Math.floor((t % 3600) / 60)
      .toString()
      .padStart(2, "0")}:${(t % 60).toFixed(2).padStart(5, "0")}`;
  function showBlocks() {
    offsetTracks();
    const box = $("adRanges");
    box.replaceChildren();
    const ranges = blockList();
    if (!ranges.length) {
      box.textContent = "暂未识别到广告片段。";
      return;
    }
    for (const r of ranges) {
      const line = document.createElement("div");
      line.className = "ad-row";
      const text = document.createElement("span");
      text.textContent = clock(r.start) + "–" + clock(r.end) + " · " + r.reason;
      const remove = document.createElement("button");
      remove.className = "quiet";
      remove.textContent = "取消";
      remove.onclick = () => {
        if (r.manual) {
          state.manual = state.manual.filter((v) => v !== r);
          storage.set(marksKey(), state.manual);
        } else state.ignored.add(r.start.toFixed(3));
        showBlocks();
        checkAds();
      };
      line.append(text, remove);
      box.append(line);
    }
  }
  function checkAds() {
    clearTimeout(state.timer);
    if (!$("adFilter").checked || video.readyState < 1) return;
    const t = video.currentTime;
    const range = blockList().find((r) => t >= r.start && t < r.end - 0.0001);
    if (range) {
      video.currentTime = range.end;
      return;
    }
    const next = blockList().find((r) => r.start > t);
    if (next && !video.paused && !video.seeking && video.playbackRate > 0)
      state.timer = setTimeout(
        checkAds,
        Math.min(
          30000,
          Math.max(20, ((next.start - t) / video.playbackRate) * 1000),
        ),
      );
  }
  let lastRows = [];
  function detect(rows) {
    lastRows = rows;
    state.blocks = C.adRanges(
      rows,
      $("extendedAds").checked,
      window.LibreTVM3u8?.stripAdGroups,
    );
    showBlocks();
    checkAds();
  }
  async function nativePlaylist(url, signal, depth = 0) {
    if (depth > 3) throw Error("播放列表嵌套过深");
    const r = await fetch(url, { signal });
    if (!r.ok) throw Error("播放列表不可读取");
    const text = await r.text();
    const lines = text.split(/\r?\n/);
    const at = lines.findIndex((l) => l.startsWith("#EXT-X-STREAM-INF:"));
    if (at >= 0) {
      const child = lines
        .slice(at + 1)
        .find((l) => l.trim() && !l.startsWith("#"));
      if (!child) throw Error("没有播放线路");
      return nativePlaylist(
        new URL(child, r.url || url).href,
        signal,
        depth + 1,
      );
    }
    return C.rowsFromText(text, r.url || url);
  }
  function startEpisode(index, resume = 0, transport = "auto") {
    const item = state.current;
    cleanup();
    state.current = item;
    const episode = item.episodes[index];
    if (!episode) return;
    state.episode = episode;
    const duloUrl = item.providerId === "dulo" && C.duloMediaUrl(episode.url);
    if(duloUrl) episode.url=duloUrl;
    const directDulo = Boolean(duloUrl);
    const nativeDulo = directDulo && transport !== "relay" && video.canPlayType("application/vnd.apple.mpegurl");
    if (nativeDulo) video.removeAttribute("crossorigin");
    else video.setAttribute("crossorigin", "anonymous");
    $("subtitleQuery").value = item.lookupTitle || item.title;
    $("subtitleYear").value = /^\d{4}$/.test(item.year || "") ? item.year : "";
    const generation = state.generation;
    state.resume = resume;
    lastRows = [];
    state.manual = storage
      .get(marksKey(), [])
      .filter(
        (r) => Number.isFinite(r.start) && r.end > r.start && r.manual === true,
      );
    showBlocks();
    $("episodes").value = String(index);
    message("playerStatus", "正在加载试播…");
    state.abort = new AbortController();
    const fallback = () => {
      if (generation === state.generation) startEpisode(index, video.currentTime || resume, "relay");
    };
    const ready = () => {
      if (generation !== state.generation) return;
      clearTimeout(state.nativeTimer);
      if (resume > 0 && resume < video.duration) video.currentTime = resume;
      video
        .play()
        .catch(() => message("playerStatus", "已加载，点击播放按钮开始。"));
      findSubtitles(false);
    };
    video.addEventListener("loadedmetadata", ready, {
      once: true,
      signal: state.abort.signal,
    });
    video.addEventListener(
      "playing",
      () => {
        if (generation === state.generation)
          message(
            "playerStatus",
            "正在播放 · " + episode.line + " · " + episode.label,
          );
      },
      { signal: state.abort.signal },
    );
    video.addEventListener(
      "error",
      () => {
        if (generation !== state.generation) return;
        if (nativeDulo) { fallback(); return; }
        message("playerStatus", "试播失败，可重试或选择其他来源。", true);
      },
      { signal: state.abort.signal },
    );
    if (nativeDulo) {
      state.nativeTimer = setTimeout(fallback, 15000);
      video.src = episode.url;
      return;
    }
    const duloTarget=directDulo?new URL(episode.url):null;
    const playbackUrl = duloTarget ? "/_movie-media/bluevelvet/" + duloTarget.pathname.slice("/play/".length) + duloTarget.search : episode.url;
    if (directDulo || /\.m3u8(?:[?#]|$)/i.test(episode.url)) {
      const safari =
        /Safari/i.test(navigator.userAgent) &&
        !/Chrome|Chromium|CriOS|Edg|Android/i.test(navigator.userAgent);
      if (window.Hls?.isSupported() && !safari) {
        const hls = (state.hls = new Hls({
          maxBufferLength: 30,
          backBufferLength: 30,
          xhrSetup: directDulo ? (xhr,url)=>{
            const next=C.duloHlsRequestUrl(url,episode.url,location.href);
            if(next!==url)xhr.open('GET',next,true);
          } : undefined,
        }));
        let recovered = false;
        hls.on(Hls.Events.LEVEL_LOADED, (_, data) => {
          if (generation === state.generation && !data.details.live)
            detect(
              data.details.fragments.map((f) => ({
                start: f.start,
                duration: f.duration,
                cc: f.cc,
                url: f.url,
              })),
            );
        });
        hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, () => updateTracks());
        hls.on(Hls.Events.ERROR, (_, e) => {
          if (generation !== state.generation || !e.fatal) return;
          if (e.type === Hls.ErrorTypes.MEDIA_ERROR && !recovered) {
            recovered = true;
            hls.recoverMediaError();
          } else
            message(
              "playerStatus",
              "当前来源加载失败，可重试或寻找其他来源。",
              true,
            );
        });
        hls.loadSource(playbackUrl);
        hls.attachMedia(video);
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = playbackUrl;
        nativePlaylist(episode.url, state.abort.signal)
          .then((rows) => {
            if (generation === state.generation) detect(rows);
          })
          .catch(() => {
            if (generation === state.generation)
              message("adRanges", "无法读取广告信息，保留原始播放。");
          });
      } else
        message(
          "playerStatus",
          "当前浏览器不支持此播放格式，请更换浏览器。",
          true,
        );
    } else video.src = playbackUrl;
  }
  function updateTracks() {
    const select = $("subtitleTracks"),
      old = select.value;
    select.replaceChildren(new Option("关闭字幕", "off"));
    for (const [i, t] of Array.from(video.textTracks).entries())
      if (t.kind === "subtitles" || t.kind === "captions")
        select.add(
          new Option(t.label || t.language || "字幕 " + (i + 1), "text:" + i),
        );
    for (const [i, t] of (state.hls?.subtitleTracks || []).entries())
      select.add(
        new Option(t.name || t.lang || "内嵌字幕 " + (i + 1), "hls:" + i),
      );
    if ([...select.options].some((o) => o.value === old)) select.value = old;
  }
  function chooseTrack() {
    const value = $("subtitleTracks").value;
    Array.from(video.textTracks).forEach((t, i) => {
      t.mode = value === "text:" + i ? "showing" : "disabled";
    });
    if (state.hls) {
      state.hls.subtitleTrack = value.startsWith("hls:")
        ? Number(value.slice(4))
        : -1;
      state.hls.subtitleDisplay = value.startsWith("hls:");
    }
    // Disabling an HLS subtitle also disables native text tracks. Restore the
    // separately imported/local track after the HLS controller has finished.
    if (value.startsWith("text:")) {
      const track = video.textTracks[Number(value.slice(5))];
      if (track) track.mode = "showing";
    }
  }
  function offsetTracks() {
    const offset = Number($("subtitleOffset").value) || 0;
    const externalTracks = new Set(
      Array.from(video.querySelectorAll("track[data-clean-timeline]")).map(
        (el) => el.track,
      ),
    );
    const mapTime = (time, track) =>
      $("subtitleAdSync").checked && externalTracks.has(track)
        ? C.subtitlePlaybackTime(time, blockList())
        : time;
    for (const t of Array.from(video.textTracks))
      for (const cue of Array.from(t.cues || [])) {
        if (!Object.hasOwn(cue, "_sfOriginal"))
          cue._sfOriginal = [cue.startTime, cue.endTime];
        cue.startTime = Math.max(0, mapTime(cue._sfOriginal[0] + offset, t));
        cue.endTime = Math.max(
          cue.startTime + 0.001,
          mapTime(cue._sfOriginal[1] + offset, t),
        );
      }
  }
  async function addSubtitle(text, label, generation = state.generation) {
    if (generation !== state.generation) return;
    const url = URL.createObjectURL(
      new Blob([C.toVtt(text)], { type: "text/vtt" }),
    );
    state.subtitleBlobs.push(url);
    const track = document.createElement("track");
    track.kind = "subtitles";
    track.srclang = "en";
    track.label = label;
    track.src = url;
    track.default = true;
    track.dataset.cleanTimeline = "true";
    track.addEventListener(
      "load",
      () => {
        if (generation !== state.generation) return;
        updateTracks();
        const i = Array.from(video.textTracks).indexOf(track.track);
        $("subtitleTracks").value = "text:" + i;
        chooseTrack();
        offsetTracks();
        message(
          "subtitleStatus",
          "已加载 " + label + "；不同版本可调整字幕延迟。",
        );
      },
      { once: true },
    );
    track.addEventListener(
      "error",
      () =>
        message("subtitleStatus", "字幕格式无法读取，请尝试其他文件。", true),
      { once: true },
    );
    video.append(track);
    track.track.mode = "showing";
  }
  let cataloguePromise;
  async function localSubtitle(item) {
    cataloguePromise ||= fetch("../data/movie-series.json")
      .then((r) => r.json())
      .then((series) =>
        Promise.all(
          series.map((s) =>
            fetch("../data/movies/" + encodeURIComponent(s.id) + "/movies.json")
              .then((r) => r.json())
              .then((j) => j.sources || [])
              .catch(() => []),
          ),
        ),
      )
      .then((rows) => rows.flat());
    const movies = await cataloguePromise;
    const matches = movies.filter((m) =>
      [m.title, m.titleZh].some(
        (t) => C.normalize(t) === C.normalize(item.lookupTitle || item.title),
      ),
    );
    return (
      matches.find((m) => String(m.year) === String(item.year)) ||
      (matches.length === 1 ? matches[0] : null)
    );
  }
  async function findSubtitles(explicit = true) {
    const item = state.current;
    if (!item) return;
    const generation = state.generation;
    const subtitleRequest = ++state.subtitleRequest;
    message("subtitleStatus", "正在查找英文字幕…");
    $("externalSubtitles").replaceChildren();
    try {
      updateTracks();
      const embedded =
        state.hls?.subtitleTracks.findIndex(
          (t) =>
            /^en(g)?$/i.test(t.lang || "") ||
            /english|英文|英语/i.test(t.name || ""),
        ) ?? -1;
      if (embedded >= 0) {
        $("subtitleTracks").value = "hls:" + embedded;
        chooseTrack();
        message("subtitleStatus", "已选择片源内嵌英文字幕。");
        if (!explicit) return;
      }
      const nativeEnglish = Array.from(video.textTracks).findIndex((t) =>
        /^en(g)?$/i.test(t.language || ""),
      );
      if (nativeEnglish >= 0 && embedded < 0) {
        $("subtitleTracks").value = "text:" + nativeEnglish;
        chooseTrack();
        message("subtitleStatus", "已选择英文字幕。");
        if (!explicit) return;
      }
      const local = await localSubtitle(item);
      if (
        generation !== state.generation ||
        subtitleRequest !== state.subtitleRequest
      )
        return;
      if (
        local &&
        $("subtitleQuery").value === (item.lookupTitle || item.title)
      ) {
        $("subtitleQuery").value = local.title;
        $("subtitleYear").value = local.year || item.year || "";
      }
      const subtitleUrl = item.subtitleUrl || local?.subtitleUrl;
      if (subtitleUrl && !video.querySelector("track[data-auto]")) {
        const response = await fetch(subtitleUrl);
        if (!response.ok) throw Error("字幕文件暂时无法读取");
        await addSubtitle(
          await response.text(),
          local?.subtitleLabel || "英文字幕",
          generation,
        );
        const t = video.querySelector("track:last-of-type");
        if (t) t.dataset.auto = "true";
        if (!explicit) return;
      }
      const data = await api(
        {
          action: "subtitles",
          query: $("subtitleQuery").value.trim() || local?.title || item.title,
          year: $("subtitleYear").value || undefined,
        },
        state.abort?.signal,
      );
      if (
        generation !== state.generation ||
        subtitleRequest !== state.subtitleRequest
      )
        return;
      if (!data.configured) {
        if (embedded < 0 && nativeEnglish < 0 && !subtitleUrl)
          message("subtitleStatus", data.message);
        return;
      }
      if (data.films?.length) {
        message("subtitleStatus", data.message);
        for (const film of data.films) {
          const button = document.createElement("button");
          button.className = "quiet";
          button.textContent = film.name + " · " + film.year;
          button.onclick = () => {
            $("subtitleQuery").value = film.id;
            $("subtitleYear").value = film.year;
            findSubtitles(true);
          };
          $("externalSubtitles").append(button);
        }
        return;
      }
      if (!data.list.length) {
        message(
          "subtitleStatus",
          data.message || "未找到外部英文字幕，可导入本地 SRT / VTT。",
        );
        return;
      }
      message(
        "subtitleStatus",
        (data.film ? data.film.name + "（" + data.film.year + "） · " : "") +
          "找到 " +
          data.list.length +
          " 个英文字幕版本，请选择与影片匹配的版本。",
      );
      for (const file of data.list) {
        const button = document.createElement("button");
        button.className = "quiet";
        button.textContent =
          file.label + (file.fps ? " · " + file.fps + " fps" : "");
        button.onclick = async () => {
          button.disabled = true;
          try {
            const result = await api(
              {
                action: "subtitle-download",
                fileId: file.id,
                provider: file.provider,
                imdbId: file.imdbId,
              },
              state.abort?.signal,
            );
            if (
              subtitleRequest !== state.subtitleRequest ||
              generation !== state.generation
            )
              return;
            await addSubtitle(result.text, file.label, generation);
          } catch (e) {
            if (
              generation === state.generation &&
              subtitleRequest === state.subtitleRequest
            )
              message("subtitleStatus", e.message, true);
          } finally {
            button.disabled = false;
          }
        };
        $("externalSubtitles").append(button);
      }
    } catch (e) {
      if (
        generation === state.generation &&
        subtitleRequest === state.subtitleRequest &&
        e.name !== "AbortError"
      )
        message("subtitleStatus", e.message, true);
    }
  }
  $("searchForm").onsubmit = search;
  for (const id of ["englishOnly", "includeUnknown"])
    $(id).onchange = () => {
      renderResults();
      message(
        "searchStatus",
        `找到 ${state.results.length} 个结果，当前显示 ${filtered().length} 个。`,
      );
    };
  $("manageSources").onclick = () => {
    $("sourceSettings").open = !$("sourceSettings").open;
  };
  $("sourceImport").onchange = async (event) => {
    try {
      const file = event.target.files[0];
      if (!file) return;
      if (file.size > 1e6) throw Error("文件过大，请选择 1 MB 以内的 JSON");
      state.custom = C.sourceList(
        JSON.parse((await file.text()).replace(/^\uFEFF/, "")),
      );
      storage.set("providers", state.custom);
      showProviders();
      message(
        "sourceNotice",
        "已导入 " + state.custom.length + " 个点播源，仅保存在本机。",
      );
    } catch (e) {
      message("sourceNotice", e.message, true);
    } finally {
      event.target.value = "";
    }
  };
  $("resetSources").onclick = () => {
    state.custom = [];
    storage.set("providers", []);
    showProviders();
    message("sourceNotice", "已清除本机导入源。");
  };
  $("episodes").onchange = () => startEpisode(Number($("episodes").value));
  $("retry").onclick = () =>
    startEpisode(Number($("episodes").value), video.currentTime);
  $("nextSource").onclick = () => {
    if (state.current) {
      $("query").value = state.current.title;
      search();
      $("searchForm").scrollIntoView({ behavior: "smooth" });
    }
  };
  $("closePlayer").onclick = () => {
    cleanup();
    state.current = null;
    $("watch").hidden = true;
  };
  for (const event of [
    "timeupdate",
    "seeking",
    "seeked",
    "playing",
    "pause",
    "ratechange",
    "loadedmetadata",
  ])
    video.addEventListener(event, checkAds);
  $("adFilter").onchange = checkAds;
  $("extendedAds").onchange = () => detect(lastRows);
  $("markStart").onclick = () => {
    state.mark = video.currentTime;
    message(
      "adRanges",
      "已标记开始 " +
        clock(state.mark) +
        "，到广告结束处点击“标记结束并跳过”。",
    );
  };
  $("markEnd").onclick = () => {
    if (state.mark === null || video.currentTime <= state.mark) {
      message("adRanges", "请先标记开始，再移动到广告结束处。", true);
      return;
    }
    state.manual.push({
      start: state.mark,
      end: video.currentTime,
      reason: "手动标记",
      manual: true,
    });
    state.mark = null;
    storage.set(marksKey(), state.manual);
    showBlocks();
    checkAds();
  };
  $("clearMarks").onclick = () => {
    state.manual = [];
    state.mark = null;
    storage.set(marksKey(), []);
    showBlocks();
  };
  $("subtitleTracks").onchange = chooseTrack;
  $("subtitleOffset").onchange = offsetTracks;
  $("subtitleAdSync").onchange = offsetTracks;
  $("findSubtitles").onclick = () => findSubtitles(true);
  $("subtitleFile").onchange = async (event) => {
    const generation = state.generation;
    try {
      const file = event.target.files[0];
      if (!file) return;
      if (file.size > 2e6) throw Error("字幕文件不能大于 2 MB");
      if (!state.current) throw Error("请先选择试播影片");
      await addSubtitle(await file.text(), file.name, generation);
    } catch (e) {
      message("subtitleStatus", e.message, true);
    } finally {
      event.target.value = "";
    }
  };
  video.textTracks.addEventListener("addtrack", updateTracks);
  window.addEventListener("pagehide", cleanup);
  api({ action: "providers" })
    .then((d) => {
      state.providers = d.providers;
      showProviders();
    })
    .catch(() =>
      message(
        "sourceNotice",
        "预置搜索服务将在 Netlify 部署后启用；已导入的源仍可直连。",
      ),
    );
})();
