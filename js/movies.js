/* Movie catalogue: a title becomes Watch-enabled only after its authorized hlsUrl is added. */
window.MovieClassroom = {
  player: null, hls: null, libraryPromise: null, generation: 0,
  seriesCovers: {
    'harry-potter':'https://media.themoviedb.org/t/p/w500/wuMc08IPKEatf9rnMNXvIDxqP4W.jpg',
    'fantastic-beasts':'https://media.themoviedb.org/t/p/w500/h6NYfVUyM6CDURtZSnBpz647Ldd.jpg',
    'narnia':'https://media.themoviedb.org/t/p/w500/iREd0rNCjYdf5Ar0vfaW32yrkm.jpg',
    'paddington':'https://media.themoviedb.org/t/p/w500/wpchRGhRhvhtU083PfX2yixXtiw.jpg',
    'toy-story':'https://media.themoviedb.org/t/p/w500/sfQtVlIHljToOwYjhe21KPGzZWK.jpg',
    'how-to-train-your-dragon':'https://media.themoviedb.org/t/p/w500/53dsJ3oEnBhTBVMigWJ9tkA5bzJ.jpg',
    'kung-fu-panda':'https://media.themoviedb.org/t/p/w500/wWt4JYXTg5Wr3xBW2phBrMKgp3x.jpg',
    'zootopia':'https://media.themoviedb.org/t/p/w500/hlK0e0wAQ3VLuJcsfIYPvb4JVud.jpg',
    'inside-out':'https://media.themoviedb.org/t/p/w500/2H1TmgdfNtsKlU9jKdeNyYL5y8T.jpg',
    'finding-nemo':'https://media.themoviedb.org/t/p/w500/eHuGQ10FUzK1mdOY69wF5pGgEf5.jpg',
    'the-incredibles':'https://media.themoviedb.org/t/p/w500/2LqaLgk4Z226KkgPJuiOQ58wvrm.jpg',
    'monsters':'https://media.themoviedb.org/t/p/w500/wFSpyMsp7H0ttERbxY7Trlv8xry.jpg',
    'cars':'https://media.themoviedb.org/t/p/w500/2Touk3m5gzsqr1VsvxypdyHY5ci.jpg',
    'frozen':'https://media.themoviedb.org/t/p/w500/itAKcobTYGpYT8Phwjd8c9hleTo.jpg',
    'wreck-it-ralph':'https://media.themoviedb.org/t/p/w500/nrEupcBwf4O1zihCM34NoXusZDq.jpg',
    'despicable-me':'https://media.themoviedb.org/t/p/w500/b1BT309QWjtFUlJPLmXmrcHOWEL.jpg',
    'sing':'https://media.themoviedb.org/t/p/w500/rwopfpHqPCYBSgBuZwkaXXqHp14.jpg',
    'secret-life-of-pets':'https://media.themoviedb.org/t/p/w500/s9xg4V5EDKiphgIksVJ9gewBM11.jpg',
    'hotel-transylvania':'https://media.themoviedb.org/t/p/w500/eJGvzGrsfe2sqTUPv5IwLWXjVuR.jpg',
    'the-croods':'https://media.themoviedb.org/t/p/w500/27zvjVOtOi5ped1HSlJKNsKXkFH.jpg',
    'trolls':'https://media.themoviedb.org/t/p/w500/9VlK2j0THZWzhQPq0W3Oc0IIdBB.jpg',
    'the-bad-guys':'https://media.themoviedb.org/t/p/w500/7qop80YfuO0BwJa1uXk1DXUUEwv.jpg',
    'peter-rabbit':'https://media.themoviedb.org/t/p/w500/lugOvdaNpbVGQK9TyMRDiUbLtY6.jpg',
    'sonic':'https://media.themoviedb.org/t/p/w500/aQvJ5WPzZgYVDrxLX4R6cLJCEaQ.jpg',
    'ice-age':'https://media.themoviedb.org/t/p/w500/gLhHHZUzeseRXShoDyC4VqLgsNv.jpg'
  },
  cleanup() {
    this.generation++;
    if (this.hls) { this.hls.destroy(); this.hls = null; }
    if (this.player) { this.player.pause(); this.player.removeAttribute('src'); this.player.load(); this.player = null; }
  },
  async getLibrary(app) {
    const [series, playable] = await Promise.all([app.getJSON('data/movie-series.json'), app.getJSON('data/movies.json')]);
    return { series, playable, playableById: new Map(playable.map(item => [item.id, item])) };
  },
  stars(rating) { return '★'.repeat(rating) + '☆'.repeat(5 - rating); },
  escape(app, value) { return app.escapeHtml(String(value || '')); },
  poster(app, item, label, className='movie-poster') {
    const e = value => this.escape(app, value);
    const cover = item.cover || this.seriesCovers[item.id];
    if (cover) return `<div class="${className}"><img src="${e(cover)}" alt="${e(label)}海报" loading="lazy" referrerpolicy="no-referrer"></div>`;
    return `<div class="${className} movie-poster-fallback" aria-label="${e(label)}待补充官方海报"><span>🎬</span><strong>${e(label)}</strong><small>Official poster coming soon</small></div>`;
  },
  seriesCard(app, series, playableById) {
    const e = value => this.escape(app, value);
    const enabled = series.films.filter(([id]) => playableById.has(id)).length;
    return `<a class="movie-series-card" href="#/movie-series/${e(series.id)}" aria-label="查看${e(series.titleZh)}系列">${this.poster(app, series, series.titleZh, 'movie-series-poster')}<div class="movie-series-info"><h3>${e(series.titleZh)}</h3><p>${e(series.title)}</p><div class="movie-series-badges"><span>英语 ${e(series.level)}</span><span title="推荐度 ${series.rating}/5">${this.stars(series.rating)}</span></div><small>${series.films.length} 部影片 · ${enabled ? `${enabled} 部可 Watch` : '待补片源'}</small></div></a>`;
  },
  movieCard(app, series, film, playableById) {
    const [id, title, titleZh, year] = film;
    const item = playableById.get(id);
    const e = value => this.escape(app, value);
    const inner = `${this.poster(app, item || {id:series.id}, titleZh)}<h3>${e(titleZh)}</h3><p class="movie-english-title">${e(title)}</p><div class="movie-meta">${e(year)} · ${e(series.level)}</div>`;
    return item ? `<a class="movie-card" href="#/movie/${e(id)}" aria-label="观看 ${e(titleZh)}"><div class="movie-card-state watch">Watch · 看电影</div>${inner}</a>` : `<article class="movie-card movie-card-coming" aria-label="${e(titleZh)}待上线"><div class="movie-card-state">待上线</div>${inner}</article>`;
  },
  async renderList(app, query='', level='all') {
    const generation = this.generation;
    const { series, playableById } = await this.getLibrary(app);
    if (generation !== this.generation) return;
    document.getElementById('globalSearch').value = query;
    const normalized = query.trim().toLowerCase();
    const levels = [...new Set(series.map(item => item.level))];
    const visible = series.filter(item => (level === 'all' || item.level === level) && `${item.title} ${item.titleZh} ${item.films.flat().join(' ')}`.toLowerCase().includes(normalized));
    const totalFilms = series.reduce((count, item) => count + item.films.length, 0);
    const e = value => this.escape(app, value);
    app.el().innerHTML = `<section class="movie-intro"><div><h1>🎬 光影课堂</h1><p>Movie Classroom · 选择系列，在电影中感受英语。</p></div><span class="movie-count">${series.length} 个系列 · ${totalFilms} 部影片</span></section><div class="filters" id="movieFilters"><span class="movie-filter-label">英语难度</span>${['all', ...levels].map(item => `<button type="button" class="filter-btn ${level === item ? 'active' : ''}" data-level="${e(item)}">${item === 'all' ? '全部等级' : e(item)}</button>`).join('')}</div><div class="movie-section-heading"><h2>${query ? `搜索结果：${e(query)}` : '电影系列'}</h2><span class="meta">${visible.length} 个系列</span></div><div class="movie-series-grid">${visible.map(item => this.seriesCard(app, item, playableById)).join('')}</div>${visible.length ? '' : '<div class="empty">没有找到对应影片或系列。</div>'}`;
    document.querySelectorAll('#movieFilters button').forEach(button => button.addEventListener('click', () => this.renderList(app, query, button.dataset.level)));
  },
  async renderSeries(app, id) {
    const generation = this.generation;
    const { series, playableById } = await this.getLibrary(app);
    if (generation !== this.generation) return;
    const group = series.find(item => item.id === id);
    if (!group) { app.el().innerHTML = '<div class="empty">系列不存在。<p><a class="btn" href="#/movies">返回光影课堂</a></p></div>'; return; }
    const e = value => this.escape(app, value);
    const watchReady = group.films.filter(([filmId]) => playableById.has(filmId)).length;
    app.el().innerHTML = `<div class="breadcrumb"><a href="#/movies">光影课堂</a> › ${e(group.titleZh)}</div><section class="movie-collection-hero">${this.poster(app, group, group.titleZh, 'movie-collection-poster')}<div><h1>${e(group.titleZh)}</h1><p>${e(group.title)}</p><div class="movie-series-badges"><span>英语难度 ${e(group.level)}</span><span>${this.stars(group.rating)} 推荐</span><span>${e(group.genre)}</span></div><p class="movie-collection-note">共 ${group.films.length} 部；${watchReady ? `${watchReady} 部已提供 Watch 播放` : '播放源待补充'}。</p></div></section><div class="movie-section-heading"><h2>影片列表</h2><span class="meta">按上映顺序</span></div><div class="movie-grid">${group.films.map(film => this.movieCard(app, group, film, playableById)).join('')}</div>`;
  },
  async renderWatch(app, id) {
    const generation = this.generation;
    const { series, playableById } = await this.getLibrary(app);
    if (generation !== this.generation) return;
    const movie = playableById.get(id);
    const group = series.find(item => item.films.some(([filmId]) => filmId === id));
    if (!movie || !group) { app.el().innerHTML = '<div class="empty">这部影片暂未添加授权播放源。<p><a class="btn" href="#/movies">返回光影课堂</a></p></div>'; return; }
    const e = value => this.escape(app, value);
    app.el().innerHTML = `<div class="breadcrumb"><a href="#/movies">光影课堂</a> › <a href="#/movie-series/${e(group.id)}">${e(group.titleZh)}</a> › ${e(movie.titleZh)}</div><section class="movie-watch-head"><div><h1>${e(movie.titleZh)}</h1><p>${e(movie.title)} · ${e(movie.year)}</p></div><a class="btn secondary" href="#/movie-series/${e(group.id)}">返回系列</a></section><div class="movie-watch-frame"><video controls playsinline preload="metadata" aria-label="${e(movie.titleZh)}"></video></div><div class="movie-player-status" id="moviePlayerStatus" role="status" aria-live="polite">正在加载影片，请稍候…</div><div class="movie-watch-actions"><button type="button" class="btn secondary" id="movieRetry">重新加载</button><span class="muted">Watch 看电影 · ${e(movie.sourceLabel || '授权播放源')}</span></div><div class="movie-section-heading"><h2>同系列影片</h2></div><div class="movie-grid">${group.films.filter(([filmId]) => filmId !== id).map(film => this.movieCard(app, group, film, playableById)).join('')}</div>`;
    const player = app.el().querySelector('video'); this.player = player;
    document.getElementById('movieRetry').onclick = () => { this.cleanup(); this.renderWatch(app, id).catch(() => {}); };
    const report = (message, failed=false) => { if (generation !== this.generation) return; const status = document.getElementById('moviePlayerStatus'); if (status) { status.textContent = message; status.classList.toggle('failed', failed); } };
    player.addEventListener('loadedmetadata', () => report('影片已就绪，点击播放开始观看。'));
    player.addEventListener('playing', () => report('正在播放 · 可使用播放器控制倍速、音量和全屏。'));
    player.addEventListener('error', () => report('影片加载失败：片源可能已过期，或当前网络无法访问。请重试；仍失败时需要更新片源地址。', true));
    if (player.canPlayType('application/vnd.apple.mpegurl')) { player.src = movie.hlsUrl; return; }
    try {
      if (!window.Hls) {
        if (!this.libraryPromise) this.libraryPromise = new Promise((resolve, reject) => { const script = document.createElement('script'); script.src = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.20/dist/hls.min.js'; script.onload = resolve; script.onerror = () => reject(new Error('播放器组件加载失败')); document.head.append(script); }).catch(error => { this.libraryPromise = null; throw error; });
        await this.libraryPromise;
      }
      if (generation !== this.generation || !player.isConnected) return;
      if (!window.Hls?.isSupported()) throw new Error('当前浏览器不支持 HLS 播放');
      const hls = new window.Hls(); this.hls = hls;
      hls.on(window.Hls.Events.ERROR, (_event, data) => { if (data.fatal) { hls.stopLoad(); report('影片加载失败：片源可能已过期，或存在网络／跨站访问限制。请重试；仍失败时需要更新片源地址。', true); } });
      hls.loadSource(movie.hlsUrl); hls.attachMedia(player);
    } catch (error) { report(error.message + '，请点击重新加载。', true); }
  }
};
