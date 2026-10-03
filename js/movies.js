/* Watch-only movie catalogue. Source URLs are maintained in data/movies.json. */
window.MovieClassroom = {
  player: null,
  hls: null,
  libraryPromise: null,
  generation: 0,
  cleanup() {
    this.generation++;
    if(this.hls) { this.hls.destroy(); this.hls=null; }
    if(this.player) {
      this.player.pause();
      this.player.removeAttribute('src');
      this.player.load();
      this.player=null;
    }
  },
  card(app, movie) {
    const e=value=>app.escapeHtml(String(value || ''));
    return `<a class="movie-card" href="#/movie/${e(movie.id)}" aria-label="观看 ${e(movie.titleZh)}"><div class="movie-poster"><img src="${e(movie.cover)}" alt="${e(movie.titleZh)}海报" loading="lazy" referrerpolicy="no-referrer"><span class="movie-play-hover" aria-hidden="true">▶</span><span class="movie-poster-label">Watch · 看电影</span></div><h3>${e(movie.titleZh)}</h3><p class="movie-english-title">${e(movie.title)}</p><div class="movie-meta">${e(movie.year)} · ${e(movie.genre)}</div></a>`;
  },
  async renderList(app, query='', genre='all') {
    const generation=this.generation;
    const movies=[...await app.getJSON('data/movies.json')].sort((a,b)=>(a.seriesOrder || 999)-(b.seriesOrder || 999));
    if(generation!==this.generation) return;
    document.getElementById('globalSearch').value=query;
    const e=value=>app.escapeHtml(String(value || ''));
    const genres=[...new Set(movies.map(movie=>movie.genre))];
    const visible=movies.filter(movie=>(genre==='all'||movie.genre===genre)&&`${movie.title} ${movie.titleZh} ${movie.collection}`.toLowerCase().includes(query.toLowerCase()));
    app.el().innerHTML=`<section class="movie-intro"><div><h1>🎬 光影课堂</h1><p>Movie Classroom · 在电影中感受英语，先从 Watch 开始。</p></div><span class="movie-count">${movies.length} 部影片</span></section><div class="filters" id="movieFilters"><span class="movie-filter-label">题材</span>${['all',...genres].map(item=>`<button type="button" class="filter-btn ${genre===item?'active':''}" data-genre="${e(item)}">${item==='all'?'全部影片':e(item)}</button>`).join('')}</div><div class="movie-section-heading"><h2>${query?`搜索结果：${e(query)}`:'最新上线'}</h2><span class="meta">${visible.length} 部</span></div><div class="movie-grid">${visible.map(movie=>this.card(app,movie)).join('')}</div>${visible.length?'':'<div class="empty">没有找到对应影片，请尝试其他名称。</div>'}`;
    document.querySelectorAll('#movieFilters button').forEach(button=>button.addEventListener('click',()=>this.renderList(app,query,button.dataset.genre)));
  },
  async renderWatch(app, id) {
    const generation=this.generation;
    const movies=[...await app.getJSON('data/movies.json')].sort((a,b)=>(a.seriesOrder || 999)-(b.seriesOrder || 999));
    if(generation!==this.generation) return;
    const movie=movies.find(item=>item.id===id);
    if(!movie) { app.el().innerHTML='<div class="empty">影片不存在。<p><a class="btn" href="#/movies">返回光影课堂</a></p></div>'; return; }
    const e=value=>app.escapeHtml(String(value || ''));
    app.el().innerHTML=`<div class="breadcrumb"><a href="#/movies">光影课堂</a> › ${e(movie.titleZh)}</div><section class="movie-watch-head"><div><h1>${e(movie.titleZh)}</h1><p>${e(movie.title)} · ${e(movie.year)}</p></div><a class="btn secondary" href="#/movies">返回电影库</a></section><div class="movie-watch-frame"><video controls playsinline preload="metadata" aria-label="${e(movie.titleZh)}"></video></div><div class="movie-player-status" id="moviePlayerStatus" role="status" aria-live="polite">正在加载影片，请稍候…</div><div class="movie-watch-actions"><button type="button" class="btn secondary" id="movieRetry">重新加载</button><span class="muted">Watch 看电影</span></div><div class="movie-section-heading"><h2>同系列影片</h2></div><div class="movie-grid">${movies.filter(item=>item.id!==id&&item.collection===movie.collection).map(item=>this.card(app,item)).join('')}</div>`;
    const player=app.el().querySelector('video');
    this.player=player;
    document.getElementById('movieRetry').onclick=()=>{
      this.cleanup();
      this.renderWatch(app,id).catch(()=>{});
    };
    const report=(message,failed=false)=>{
      if(generation!==this.generation) return;
      const status=document.getElementById('moviePlayerStatus');
      if(status){status.textContent=message;status.classList.toggle('failed',failed);}
    };
    player.addEventListener('loadedmetadata',()=>report('影片已就绪，点击播放开始观看。'));
    player.addEventListener('playing',()=>report('正在播放 · 可使用播放器控制倍速、音量和全屏。'));
    player.addEventListener('error',()=>report('影片加载失败：片源可能已过期，或当前网络无法访问。请重试；仍失败时需要更新片源地址。',true));
    if(player.canPlayType('application/vnd.apple.mpegurl')) {player.src=movie.hlsUrl;return;}
    try {
      if(!window.Hls) {
        if(!this.libraryPromise) this.libraryPromise=new Promise((resolve,reject)=>{
          const script=document.createElement('script');
          script.src='https://cdn.jsdelivr.net/npm/hls.js@1.5.20/dist/hls.min.js';
          script.onload=resolve;script.onerror=()=>reject(new Error('播放器组件加载失败'));
          document.head.append(script);
        }).catch(error=>{this.libraryPromise=null;throw error;});
        await this.libraryPromise;
      }
      if(generation!==this.generation || !player.isConnected) return;
      if(!window.Hls?.isSupported()) throw new Error('当前浏览器不支持 HLS 播放');
      const hls=new window.Hls();
      this.hls=hls;
      hls.on(window.Hls.Events.ERROR,(_event,data)=>{
        if(data.fatal) {hls.stopLoad();report('影片加载失败：片源可能已过期，或存在网络／跨站访问限制。请重试；仍失败时需要更新片源地址。',true);}
      });
      hls.loadSource(movie.hlsUrl);
      hls.attachMedia(player);
    } catch(error) {report(error.message+'，请点击重新加载。',true);}
  }
};
