/* Separate, optional movie aggregator. Existing media sources stay in movies.js. */
window.MovieHub={
  generation:0,frame:null,timer:null,listener:null,
  cleanup(){
    this.generation++;
    clearTimeout(this.timer);this.timer=null;
    if(this.listener)window.removeEventListener('message',this.listener);
    this.listener=null;
    if(this.frame){this.frame.src='about:blank';this.frame.remove();this.frame=null;}
  },
  providerUrl(provider,film){
    if(!Number.isSafeInteger(film.tmdbId)||film.tmdbId<1)return '';
    try{
      const url=new URL(provider.movieUrl.replace('{tmdbId}',String(film.tmdbId)));
      return url.protocol==='https:'&&!url.username&&!url.password?url.href:'';
    }catch{return '';}
  },
  async render(app,id='',query=''){
    this.cleanup();const generation=this.generation;
    const [catalog,providers,library]=await Promise.all([app.getJSON('data/movie-hub-catalog.json'),app.getJSON('data/movie-hub-providers.json'),window.MovieClassroom.getLibrary(app)]);
    if(generation!==this.generation)return;
    const e=value=>app.escapeHtml(String(value||''));
    const groups=new Map(library.series.map(s=>[s.id,s]));
    if(!id){
      app.el().innerHTML=`<section class="movie-intro"><div><h1>🎬 多平台聚合播放</h1><p>Movie Hub · 同一部影片，自主选择播放平台。</p></div><a class="btn secondary" href="#/movies">返回光影课堂</a></section><p class="muted">平台入口不代表已确认可播放。可在下方选择影片，再逐个尝试。</p><div class="hub-filters"><input id="hubSearch" type="search" placeholder="搜索中英文片名或年份" aria-label="搜索聚合影片" value="${e(query)}"><select id="hubSeries" aria-label="选择电影系列"><option value="">全部系列</option>${library.series.map(s=>`<option value="${e(s.id)}">${e(s.titleZh)}</option>`).join('')}</select></div><p id="hubCount" class="muted"></p><div class="movie-grid" id="hubFilms"></div>`;
      const renderFilms=()=>{
        const query=document.getElementById('hubSearch').value.trim().toLowerCase(),series=document.getElementById('hubSeries').value;
        const films=catalog.films.filter(f=>(!series||f.seriesId===series)&&`${f.title} ${f.titleZh} ${f.year} ${groups.get(f.seriesId)?.titleZh}`.toLowerCase().includes(query));
        document.getElementById('hubCount').textContent=`${films.length} 部影片 · ${providers.length} 个平台入口`;
        document.getElementById('hubFilms').innerHTML=films.length?films.map(f=>`<a class="movie-card" href="#/movie-hub/${e(f.id)}"><div class="movie-card-state">${f.tmdbId?'多平台入口':'影片对应信息待确认'}</div>${window.MovieClassroom.poster(app,{id:f.id},f.titleZh)}<h3>${e(f.titleZh)}</h3><p class="movie-english-title">${e(f.title)}</p><div class="movie-meta">${e(f.year)} · ${e(groups.get(f.seriesId)?.titleZh)}</div></a>`).join(''):'<div class="empty">没有找到对应影片。</div>';
      };
      document.getElementById('hubSearch').oninput=renderFilms;
      document.getElementById('hubSeries').onchange=renderFilms;
      renderFilms();return;
    }
    const film=catalog.films.find(f=>f.id===id);
    if(!film){app.el().innerHTML='<div class="empty">没有找到这部影片。<p><a href="#/movie-hub">返回聚合播放</a></p></div>';return;}
    const links=providers.map(p=>({...p,url:this.providerUrl(p,film)})).filter(p=>p.url);
    const embeds=links.filter(p=>p.mode==='embed');
    app.el().innerHTML=`<div class="breadcrumb"><a href="#/movies">光影课堂</a> › <a href="#/movie-hub">多平台聚合</a> › ${e(film.titleZh)}</div><section class="movie-watch-head"><div><h1>${e(film.titleZh)}</h1><p>${e(film.title)} · ${e(film.year)}</p></div><a class="btn secondary" href="${library.playableById.has(id)?`#/movie/${e(id)}`:`#/movie-series/${e(film.seriesId)}`}">返回原播放页</a></section><p class="muted">选择下方平台尝试播放。若画面提示无资源，可切换平台；若限制站内播放，可新页打开。</p><div class="hub-providers">${links.map(p=>p.mode==='embed'?`<button class="hub-provider" type="button" data-hub-provider="${e(p.id)}" aria-pressed="false"><strong>${e(p.name)}</strong><span>站内播放器</span><small data-hub-state="${e(p.id)}">待尝试</small></button>`:`<a class="hub-provider" href="${e(p.url)}" target="_blank" rel="noopener noreferrer"><strong>${e(p.name)} ↗</strong><span>新页打开</span><small>${e(p.note)}</small></a>`).join('')}</div>${links.length?'':'<div class="empty">本片的对应编号尚未确认，暂不生成播放入口。</div>'}<div class="hub-player" id="hubPlayer"><div class="hub-placeholder">${links.length?'点击上方平台，加载本片播放器。':'您仍可返回原播放页。'}</div></div><p class="movie-player-status" id="hubStatus" role="status" aria-live="polite">尚未加载播放器。</p><div class="movie-watch-actions"><button class="btn secondary" id="hubRetry" disabled>重新加载</button><button class="btn secondary" id="hubNext" ${embeds.length?'':'disabled'}>尝试下个平台</button><button class="btn secondary" id="hubStop" disabled>关闭播放器</button><a class="btn secondary" id="hubOpen" target="_blank" rel="noopener noreferrer" hidden>新页打开当前平台</a></div>`;
    let selected=null;
    const report=text=>{document.getElementById('hubStatus').textContent=text;};
    const reset=()=>{
      this.cleanup();
      if(selected)app.el().querySelector(`[data-hub-state="${selected.id}"]`).textContent='已停止';
      document.getElementById('hubPlayer').innerHTML='<div class="hub-placeholder">点击上方平台，加载本片播放器。</div>';
      app.el().querySelectorAll('[data-hub-provider]').forEach(b=>b.setAttribute('aria-pressed','false'));
      document.getElementById('hubStop').disabled=true;
    };
    const select=provider=>{
      reset();selected=provider;
      const frame=document.createElement('iframe');
      this.frame=frame;
      frame.title=`${film.titleZh} · ${provider.name}`;
      frame.allow='autoplay; fullscreen; encrypted-media; picture-in-picture';frame.allowFullscreen=true;
      frame.referrerPolicy='no-referrer';
      // These providers explicitly reject sandboxed embeds. Use their documented
      // iframe contract only after a user selects a platform on this optional page.
      // The original movie player's iframe isolation in movies.js stays intact.
      const button=app.el().querySelector(`[data-hub-provider="${provider.id}"]`),state=app.el().querySelector(`[data-hub-state="${provider.id}"]`);
      button.setAttribute('aria-pressed','true');state.textContent='正在加载页面';
      const current=()=>this.frame===frame&&frame.isConnected;
      let playing=false;
      frame.addEventListener('load',()=>{if(current()&&!playing){state.textContent='页面已加载 · 待试播';report('播放器页面已加载，请在画面内点击播放；能否播放以平台提示为准。');}});
      frame.addEventListener('error',()=>{if(current()){state.textContent='页面加载失败';report('页面未能加载，可切换平台或新页打开。');}});
      this.listener=event=>{
        if(!current()||event.source!==frame.contentWindow||event.origin!==new URL(provider.url).origin||event.data?.type!=='PLAYER_EVENT')return;
        const data=event.data.data;
        if(!data||typeof data!=='object')return;
        const tmdb=data.mtmdbId??data.player_info?.tmdb;
        if(tmdb!=null&&Number(tmdb)!==film.tmdbId)return;
        const duration=data.duration??data.player_duration,time=data.currentTime??data.player_progress;
        if((data.event==='play'||data.event==='timeupdate'||data.player_status==='playing')&&Number.isFinite(duration)&&duration>0&&Number.isFinite(time)&&time>=0){
          playing=true;clearTimeout(this.timer);state.textContent='已收到播放状态';report(`${provider.name} 正在播放。`);
        }
      };
      window.addEventListener('message',this.listener);
      document.getElementById('hubPlayer').replaceChildren(frame);
      report(`正在加载 ${provider.name}，请稍候…`);
      this.timer=setTimeout(()=>{if(current()&&!playing)report('尚未确认播放。若持续转圈或提示无资源，可切换平台或新页打开。');},20000);
      const open=document.getElementById('hubOpen');open.href=provider.url;open.hidden=false;
      document.getElementById('hubRetry').disabled=false;document.getElementById('hubStop').disabled=false;
      frame.src=provider.url;
    };
    app.el().querySelectorAll('[data-hub-provider]').forEach(b=>b.onclick=()=>select(embeds.find(p=>p.id===b.dataset.hubProvider)));
    document.getElementById('hubRetry').onclick=()=>{if(selected)select(selected);};
    document.getElementById('hubNext').onclick=()=>select(embeds[(embeds.indexOf(selected)+1)%embeds.length]);
    document.getElementById('hubStop').onclick=()=>{reset();report('播放器已关闭。');};
  }
};
