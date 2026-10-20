/* Movie subtitles reuse the source explorer's public lookup and VTT conversion. */
window.MovieSubtitles = {
  mount(root, video, movie, getHls) {
    const panel = document.createElement('section');
    panel.className = 'movie-subtitles';
    panel.innerHTML = `<h2>英文字幕 · English subtitles</h2><form><label>片名 / Title <input name="query" maxlength="100" required></label><label>年份 / Year <input name="year" type="number" min="1900" max="2100"></label><button class="btn" type="submit">查找英文字幕</button></form><div class="movie-subtitle-controls"><label>字幕 / Track <select name="track"><option value="off">关闭字幕 / Off</option></select></label><label>导入 SRT / VTT <input name="file" type="file" accept=".srt,.vtt"></label><label>延迟 / Delay（秒）<input name="offset" type="number" step="0.1" value="0"></label></div><p role="status" aria-live="polite">按片名和年份查找，选择与当前片源匹配的字幕版本。正数使字幕延后。</p><div class="movie-subtitle-results"></div>`;
    root.querySelector('.movie-watch-actions').after(panel);
    const field = name => panel.querySelector(`[name="${name}"]`);
    const status = panel.querySelector('[role="status"]');
    const results = panel.querySelector('.movie-subtitle-results');
    field('query').value = movie.title || movie.titleZh;
    field('year').value = movie.year || '';
    const abort = new AbortController(), blobs = [], tracks = [];
    let disposed = false, request = 0, download = 0, hlsBound;
    const say = text => { if (!disposed) status.textContent = text; };
    const current = token => !disposed && token === request;
    async function api(body) {
      const response = await fetch('/.netlify/functions/source-explorer-api', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body), signal: abort.signal});
      const data = await response.json();
      if (!response.ok || data.error) throw Error(data.error || '字幕服务暂时不可用');
      return data;
    }
    function refresh() {
      if (disposed) return;
      const select = field('track'), old = select.value;
      select.replaceChildren(new Option('关闭字幕 / Off', 'off'));
      Array.from(video.textTracks).forEach((t, i) => {
        if (t.kind === 'subtitles' || t.kind === 'captions') select.add(new Option(t.label || t.language || `字幕 ${i + 1}`, `text:${i}`));
      });
      (getHls()?.subtitleTracks || []).forEach((t, i) => select.add(new Option(t.name || t.lang || `内嵌字幕 ${i + 1}`, `hls:${i}`)));
      if (Array.from(select.options).some(o => o.value === old)) select.value = old;
      else {
        const showing = Array.from(video.textTracks).findIndex(t => t.mode === 'showing');
        if (showing >= 0) select.value = `text:${showing}`;
      }
    }
    function choose() {
      const value = field('track').value, hls = getHls();
      if (hls) { hls.subtitleTrack = value.startsWith('hls:') ? Number(value.slice(4)) : -1; hls.subtitleDisplay = value.startsWith('hls:'); }
      Array.from(video.textTracks).forEach((t, i) => { t.mode = value === `text:${i}` ? 'showing' : 'disabled'; });
    }
    function offset() {
      const seconds = Number(field('offset').value) || 0;
      for (const element of tracks) for (const cue of Array.from(element.track.cues || [])) {
        cue._movieOriginal ||= [cue.startTime, cue.endTime];
        cue.startTime = Math.max(0, cue._movieOriginal[0] + seconds);
        cue.endTime = Math.max(cue.startTime + 0.001, cue._movieOriginal[1] + seconds);
      }
    }
    function add(text, label) {
      if (disposed) return;
      if (!/^\s*WEBVTT/.test(text) && !/\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->/.test(text)) throw Error('请选择有效的 SRT / VTT 字幕文件');
      // Keep only the latest imported version so a slower track load cannot
      // reselect an older download after the user has chosen a newer one.
      tracks.splice(0).forEach(t => t.remove());
      blobs.splice(0).forEach(url => URL.revokeObjectURL(url));
      const track = document.createElement('track');
      track.kind = 'subtitles'; track.srclang = 'en'; track.label = label;
      track.src = URL.createObjectURL(new Blob([window.SourceLabCore.toVtt(text)], {type: 'text/vtt'}));
      blobs.push(track.src); tracks.push(track);
      track.addEventListener('load', () => {
        if (disposed || !track.isConnected) return;
        refresh(); field('track').value = `text:${Array.from(video.textTracks).indexOf(track.track)}`;
        choose(); offset(); say(`已加载 ${label}；如不同步，可调整延迟或选择其他版本。`);
      }, {once: true});
      track.addEventListener('error', () => say('字幕无法读取，请尝试其他版本或导入 SRT / VTT。'), {once: true});
      video.append(track); track.track.mode = 'hidden';
      say('正在加载字幕…');
    }
    function button(label, action) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'btn secondary'; b.textContent = label;
      b.onclick = action; results.append(b); return b;
    }
    async function search(event) {
      event?.preventDefault();
      const token = ++request; ++download;
      results.replaceChildren(); say('正在匹配影片和英文字幕…');
      try {
        const data = await api({action: 'subtitles', query: field('query').value.trim(), year: field('year').value || undefined});
        if (!current(token)) return;
        if (data.films?.length) {
          say(data.message || '请确认影片和年份。');
          for (const film of data.films) button(`${film.name} · ${film.year}`, () => { field('query').value = film.id; field('year').value = film.year || ''; search(); });
          return;
        }
        const list = data.list || [];
        say(list.length ? `${data.film ? data.film.name + ' · ' + data.film.year + '：' : ''}找到 ${list.length} 个英文字幕版本，请按发行版本选择；可切换比较。` : data.message || '未找到字幕，可修改片名或导入本地 SRT / VTT。');
        for (const file of list) button(file.label + (file.fps ? ` · ${file.fps} fps` : ''), async event => {
          const selection = ++download, b = event.currentTarget; b.disabled = true; say('正在下载字幕…');
          try {
            const result = await api({action: 'subtitle-download', fileId: file.id, provider: file.provider, imdbId: file.imdbId});
            if (current(token) && selection === download) add(result.text, file.label);
          } catch (e) { if (current(token) && selection === download) say(e.message); }
          finally { b.disabled = false; }
        });
      } catch (e) { if (current(token)) say(e.message); }
    }
    panel.querySelector('form').onsubmit = search;
    field('track').onchange = choose;
    field('offset').oninput = offset;
    field('file').onchange = async event => {
      const file = event.target.files[0]; if (!file) return;
      const selection = ++download;
      try {
        if (file.size > 2e6) throw Error('请选择 2 MB 以内的字幕文件');
        const text = await file.text();
        if (!disposed && selection === download) add(text, file.name);
      } catch (e) { say(e.message); }
      finally { event.target.value = ''; }
    };
    video.textTracks.addEventListener('addtrack', refresh);
    video.addEventListener('loadedmetadata', refresh);
    // HLS is created after the panel, so bind when its manifest becomes available.
    const timer = setInterval(() => {
      const hls = getHls(), event = window.Hls?.Events?.SUBTITLE_TRACKS_UPDATED;
      if (hls && hls !== hlsBound && event) { hlsBound = hls; hls.on(event, refresh); refresh(); }
    }, 500);
    refresh();
    return () => {
      disposed = true; ++request; ++download; abort.abort(); clearInterval(timer);
      video.textTracks.removeEventListener('addtrack', refresh); video.removeEventListener('loadedmetadata', refresh);
      const event = window.Hls?.Events?.SUBTITLE_TRACKS_UPDATED;
      if (hlsBound && event) hlsBound.off(event, refresh);
      tracks.forEach(t => t.remove()); blobs.forEach(url => URL.revokeObjectURL(url)); panel.remove();
    };
  }
};
