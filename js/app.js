
const App = {
  cache: {},
  activeLessonTab: 'watch',
  searchTimer: null,
  searchRequest: 0,
  async getJSON(path){
    if(this.cache[path]) return this.cache[path];
    const res = await fetch(path, {cache:'no-store'});
    if(!res.ok) throw new Error('无法加载 ' + path);
    const data = await res.json();
    this.cache[path] = data;
    return data;
  },
  el(){return document.getElementById('app')},
  route(){
    const hash = location.hash || '#/home';
    const parts = hash.replace(/^#\/?/,'').split('/').filter(Boolean);
    return parts.length ? parts : ['home'];
  },
  statusText(s){return {completed:'已完结',serializing:'连载中',published:'已发布',preparing:'整理中',coming:'即将上线',locked:'暂未开放',missing:'缺资料',draft:'草稿'}[s] || s || ''},
  statusClass(s){return ['completed','serializing','coming','preparing'].includes(s)?s:''},
  async start(){
    window.addEventListener('hashchange', () => this.render());
    document.getElementById('searchBtn').addEventListener('click', () => this.globalSearch());
    const searchInput=document.getElementById('globalSearch');
    searchInput.addEventListener('keydown', e=>{ if(e.key==='Enter') this.globalSearch(); if(e.key==='Escape') this.hideSearchSuggestions(); });
    searchInput.addEventListener('input',()=>this.queueSearchSuggestions());
    searchInput.addEventListener('blur',()=>setTimeout(()=>this.hideSearchSuggestions(),160));
    document.getElementById('globalSearchSuggestions').addEventListener('mousedown',event=>{
      const target=event.target.closest('[data-search-href]'); if(!target) return;
      event.preventDefault(); this.hideSearchSuggestions(); location.hash=target.dataset.searchHref;
    });
    window.SFFamily?.init(this);
    window.SFMedals?.init(this);
    this.updateUtilityNav();
    await this.render();
    if(window.SFCloud) window.SFCloud.init(this);
  },
  async globalSearch(){
    const q = document.getElementById('globalSearch').value.trim();
    if(!q) return;
    this.hideSearchSuggestions();
    if(['books','magazines'].includes(this.searchScope())){location.hash=(this.searchScope()==='magazines'?'#/magazines':'#/reading')+'/search/'+encodeURIComponent(q);return;}
    if(this.route()[0]==='movie-hub') {location.hash='#/movie-hub/search/'+encodeURIComponent(q);return;}
    if(this.searchScope()==='movies') {
      location.hash = '#/movies/' + encodeURIComponent(q);
      return;
    }
    location.hash = '#/search/' + encodeURIComponent(q);
  },
  searchScope(){
    const [page,id]=this.route();
    if(['magazines','magazine-reader'].includes(page))return 'magazines';
    if(['reading','reader','series-books'].includes(page))return 'books';
    if(['movies','movie','movie-series','movie-hub'].includes(page)||(['series','lesson'].includes(page)&&String(id||'').startsWith('movie-')))return 'movies';
    return 'animation';
  },
  hideSearchSuggestions(){
    this.searchRequest++;
    const box=document.getElementById('globalSearchSuggestions'), input=document.getElementById('globalSearch');
    if(box){box.hidden=true;box.replaceChildren();} if(input) input.setAttribute('aria-expanded','false');
  },
  queueSearchSuggestions(){
    clearTimeout(this.searchTimer);
    const input=document.getElementById('globalSearch');
    if(!input?.value.trim() || this.searchScope()!=='animation') return this.hideSearchSuggestions();
    this.searchTimer=setTimeout(()=>this.showSearchSuggestions(input.value),180);
  },
  async showSearchSuggestions(query){
    const request=++this.searchRequest;
    const normalized=query.trim().toLowerCase();
    if(!normalized) return this.hideSearchSuggestions();
    const index=await this.getJSON('data/search-index.json');
    if(request!==this.searchRequest || this.searchScope()!=='animation') return;
    const score=item=>{
      const main=`${item.title||''} ${item.titleZh||''}`.toLowerCase();
      const series=`${item.seriesTitle||''} ${item.seriesTitleZh||''}`.toLowerCase();
      return (main.startsWith(normalized)?0:main.includes(normalized)?1:series.includes(normalized)?2:9)+(item.type==='series'?0:.1);
    };
    const matches=index.items.filter(item=>!String(item.seriesId||'').startsWith('movie-') && `${item.title||''} ${item.titleZh||''} ${item.seriesTitle||''} ${item.seriesTitleZh||''}`.toLowerCase().includes(normalized)).sort((a,b)=>score(a)-score(b)).slice(0,12);
    const box=document.getElementById('globalSearchSuggestions'), input=document.getElementById('globalSearch');
    if(!box||!input||document.activeElement!==input) return;
    box.innerHTML=matches.length?matches.map(item=>{
      const href=item.type==='series'?`#/series/${encodeURIComponent(item.seriesId)}`:`#/lesson/${encodeURIComponent(item.seriesId)}/${item.episodeId}`;
      const title=this.escapeHtml(item.type==='series'?`${item.title}${item.titleZh?` · ${item.titleZh}`:''}`:`${item.seriesTitle} ${item.episodeId}: ${item.title}`);
      const meta=this.escapeHtml(item.type==='series'?`系列 · ${this.statusText(item.status)}`:`${item.seriesTitleZh||item.seriesTitle} · Episode ${item.episodeId}`);
      return `<button type="button" class="search-suggestion" role="option" data-search-href="${href}"><strong>${title}</strong><small>${meta}</small></button>`;
    }).join(''):'<div class="search-suggestion-empty">没有找到匹配课程</div>';
    box.hidden=false; input.setAttribute('aria-expanded','true');
  },
  async render(){
    const [page, a, b] = this.route();
    window.SFMedals?.cleanup();
    clearTimeout(this.searchTimer);this.hideSearchSuggestions();
    window.MovieClassroom?.cleanup();
    window.MovieHub?.cleanup();
    window.SFFamily?.stop();
    window.BookReader?.cleanup();
    this.disposeHlsPlayers(this.el());
    const isMoviePage = ['movies','movie','movie-series','movie-hub'].includes(page) || (['series','lesson'].includes(page) && String(a||'').startsWith('movie-'));
    const isMagazinePage=['magazines','magazine-reader'].includes(page);
    const isReadingPage = ['reading','reader','series-books'].includes(page);
    document.querySelectorAll('.main-tab').forEach(tab=>{
      const active = tab.getAttribute('href') === (page==='honors'?'#/honors':['homework','family','parent','child'].includes(page) ? '#/homework' : isMoviePage ? '#/movies' : isMagazinePage ? '#/magazines' : isReadingPage ? '#/reading' : '#/home');
      tab.classList.toggle('active', active);
      if(active) tab.setAttribute('aria-current','page'); else tab.removeAttribute('aria-current');
    });
    const homeworkNav=document.getElementById('navHomework');
    const honorsNav=document.getElementById('navHonors');if(page==='honors')honorsNav?.setAttribute('aria-current','page');else honorsNav?.removeAttribute('aria-current');
    if(['homework','family','parent','child'].includes(page)) homeworkNav?.setAttribute('aria-current','page');
    else homeworkNav?.removeAttribute('aria-current');
    document.getElementById('globalSearch').placeholder = isMoviePage ? '搜索电影中英文名称' : isMagazinePage ? '搜索期刊杂志、上传者' : (isReadingPage ? '搜索绘本、上传者或配套资源' : '搜索故事、单词或集数');
    this.updateUtilityNav();
    this.el().classList.remove('series-page-shell','book-reader-shell');
    document.body.classList.remove('flipbook-active');
    document.body.classList.remove('series-fixed-page');
    document.documentElement.classList.remove('series-fixed-page');
    this.el().classList.remove('movie-study-course');
    document.body.classList.remove('movie-study-page');
    document.documentElement.classList.remove('movie-study-page');
    try{
      if(page === 'honors') return await window.SFMedals.render(this,a||'works',b||'');
      if(['homework','family','parent','child'].includes(page)) return await window.SFFamily.render(this);
      if(page === 'movies') return ['favorites','recent'].includes(a) ? await window.MediaShelf.render(this,'movies',{mode:a}) : await window.MovieClassroom.renderList(this, decodeURIComponent(a || ''));
      if(page === 'movie-hub') return await window.MovieHub.render(this,a==='search'?'':a,a==='search'?decodeURIComponent(b||''):'');
      if(page === 'movie-series') return await window.MovieClassroom.renderSeries(this, a);
      if(page === 'movie') return await window.MovieClassroom.renderWatch(this, a);
      if(page === 'reading'||page === 'magazines') {
        if(a === 'admin') return await window.BookAdmin.render(this);
        if(a === 'upload') return await window.BookCommunity.renderUpload(this);
        if(a === 'mine') return await window.BookCommunity.renderMine(this,b || 'all');
        if(a === 'search') return await window.BookCommunity.renderSearch(this,decodeURIComponent(b || ''));
        return a === 'local' ? window.BookReader.renderLocalLibrary(this) : await window.BookReader.renderList(this);
      }
      if(page === 'series-books') return await window.BookReader.renderSeriesLibrary(this, a);
      if(page === 'reader'||page === 'magazine-reader') return await window.BookReader.renderReader(this, a, b);
      if(page === 'home') return ['favorites','recent'].includes(a) ? window.MediaShelf.render(this,'animation',{mode:a}) : this.renderHome();
      if(page === 'series') return this.renderSeries(a);
      if(page === 'lesson') return this.renderLesson(a, Number(b || 1));
      if(page === 'records'){location.hash='#/home/recent';return;}
      if(page === 'checkin') return this.renderCheckin();
      if(page === 'bookshelf'){location.hash='#/home/favorites';return;}
      if(page === 'wordbank') return this.renderWordbank();
      if(page === 'writing') return this.renderWriting();
      if(page === 'rewards') return this.renderRewards();
      if(page === 'account') { window.SFCloud?.open(); return this.renderHome(); }
      if(page === 'search') return this.renderSearch(decodeURIComponent(a || ''));
      this.renderHome();
    } catch(err){
      this.el().innerHTML = `<div class="empty"><h2>页面加载失败</h2><p>${err.message}</p><p><a class="btn" href="#/home">返回首页</a></p></div>`;
      console.error(err);
    }
  },
  async renderHome(statusFilter='all', levelFilter='all'){
    return window.MediaShelf.render(this,'animation',{level:levelFilter});
  },
  seriesCard(s){
    const disabled = s.status === 'coming' || s.status === 'locked';
    return `<article class="series-card ${disabled?'coming':''}">
      <img class="cover" src="${s.cover}" alt="${s.title}">
      <div class="series-info">
        <h3>${s.title}</h3>
        <div class="zh">${s.titleZh || ''}</div>
        <div class="badges"><span class="badge">Level ${s.level ?? 0}</span><span class="badge ${this.statusClass(s.status)}">${this.statusText(s.status)}</span><span class="badge">${s.readyEpisodes || 0}/${s.episodeCount || 0} Ready</span></div>
        
        <div style="margin-top:12px"><a class="btn ${disabled?'secondary':''}" href="${disabled?'#/home':'#/series/'+s.seriesId}">${disabled?'Coming Soon':'Start Learning'}</a></div>
      </div>
    </article>`;
  },
  async loadSeries(seriesId){
    const [series, episodes] = await Promise.all([
      this.getJSON(`data/${seriesId}/series.json`),
      this.getJSON(`data/${seriesId}/episodes.json`)
    ]);
    return {series, episodes};
  },
  disposeHlsPlayers(root=document){
    root.querySelectorAll?.('video,audio').forEach(player=>{
      player._disposeShelf?.();player._disposeShelf=null;
      player._disposeHls?.();
      if(player._hls) player._hls.destroy();
    });
  },
  async loadLessonAssets(seriesId, episodeId, tab){
    // Load only the material needed by the selected tab.  The previous eager
    // implementation downloaded six full course JSON files before Watch could
    // open, which was especially noticeable for long serialised courses.
    const read=tab==='listenRead';
    const vocab=tab==='words'||tab==='games';
    const quiz=tab==='quiz';
    const [reading, vocabulary, quizzes]=await Promise.all([
      read?this.getJSON(`data/${seriesId}/reading-lessons.json`).catch(()=>({})):Promise.resolve({}),
      vocab?this.getJSON(`data/${seriesId}/vocabulary.json`).catch(()=>({})):Promise.resolve({}),
      quiz?this.getJSON(`data/${seriesId}/quiz.json`).catch(()=>({})):Promise.resolve({})
    ]);
    return {reading:reading[String(episodeId)],vocab:vocabulary[String(episodeId)]||[],quiz:quizzes[String(episodeId)]};
  },
  
  episodeCoverUrl(ep){
    const id=String(ep?.sourceContentId || '');
    return /^C\d{7}$/.test(id)?`https://img.littlefox.com/static/contents/img/${id}/notext_ipad.jpg`:'';
  },
  episodeCover(ep, className){
    const url=this.episodeCoverUrl(ep);
    return url?`<img class="${className}" data-episode-cover src="${url}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`:'';
  },
  bindEpisodeCovers(root){
    root.querySelectorAll('[data-episode-cover]').forEach(img=>{
      const hide=()=>{img.hidden=true;};
      img.addEventListener('error',hide,{once:true});
      if(img.complete && !img.naturalWidth) hide();
    });
  },
async renderSeries(seriesId){
  if(!seriesId) return this.renderHome();
  const [bundle] = await Promise.all([this.loadSeries(seriesId)]);
  const {series, episodes} = bundle;
  if(this.isGuestRestrictedLevel(series.level)){
    this.el().innerHTML=this.guestLevelGate();
    this.bindGuestEpisodeGate();
    return;
  }
  const episodeGroups = Array.from({length:Math.ceil(episodes.length / 10)}, (_, index)=>{
    const start=index * 10 + 1;
    return {start, end:Math.min(start + 9, episodes.length)};
  });
  const savedEpisodeId=this.storage('selectedEpisodes')?.[seriesId];
  const initialEpisode=episodes.find(ep=>Number(ep.episodeId)===Number(savedEpisodeId) && ep.status==='published' && this.canAccessEpisode(seriesId,ep.episodeId) && !this.isGuestEpisodeLimit(seriesId,ep.episodeId)) || episodes[0];
  let activeEpisodeId=Number(initialEpisode?.episodeId || 1);
  this.el().classList.add('series-page-shell');
  this.el().classList.toggle('movie-study-course',Boolean(series.movieId));
  document.body.classList.toggle('movie-study-page',Boolean(series.movieId));
  document.documentElement.classList.toggle('movie-study-page',Boolean(series.movieId));
  document.body.classList.add('series-fixed-page');
  document.documentElement.classList.add('series-fixed-page');
  this.el().innerHTML = `
    <div class="series-page-fixed">
    <div class="breadcrumb"><a href="${series.movieId?'#/movies':'#/home'}">${series.movieId?'光影课堂':'动画故事'}</a><span>›</span><span>${series.seriesTitle}</span></div>
    <section class="series-hero">
      <img class="cover" src="${series.coverImage || `assets/covers/${seriesId}.svg`}" alt="${series.seriesTitle}">
      <div class="series-hero-content">
        <h1>${series.seriesTitle}</h1>
        <div class="sub">${series.seriesTitleZh || ''} · Level ${series.level ?? 0} · ${this.statusText(series.status)}</div>
        <p class="sub">${series.description || ''}</p>
        ${series.movieId?`<a class="btn secondary" href="#/movie/${this.escapeHtml(series.movieId)}">▶ 观看完整电影</a>`:''}
      </div>
    </section>
    <section class="learning-map">
      <aside class="episode-sidebar">
        <h3>课程列表</h3>
        <div class="episode-filter-bar">
          <input id="episodeTitleSearch" type="search" placeholder="搜索课程标题" aria-label="搜索课程标题">
          <select id="episodeRangeFilter" aria-label="按集数筛选">
            <option value="all">全部 ${episodes.length} 集</option>
            ${episodeGroups.map(group=>`<option value="${group.start}-${group.end}">${group.start}–${group.end} 集</option>`).join('')}
          </select>
        </div>
        <div class="episode-side-list" id="episodeSideList"></div>
      </aside>
      <main class="episode-workspace" id="episodeWorkspace"></main>
    </section>
    </div>`;

    const renderEpisodeList=()=>{
      const query=(document.getElementById('episodeTitleSearch')?.value || '').trim().toLowerCase();
      const range=(document.getElementById('episodeRangeFilter')?.value || 'all').split('-').map(Number);
      const [start,end]=range;
      const visible=episodes.filter(ep=>{
        const inRange=Number.isNaN(start) || (Number(ep.episodeId)>=start && Number(ep.episodeId)<=end);
        const title=`${ep.title || ''} ${ep.titleZh || ''}`.toLowerCase();
        return inRange && (!query || title.includes(query) || String(ep.episodeId)===query);
      });
      const list=document.getElementById('episodeSideList');
      list.innerHTML=visible.length ? visible.map(e=>{
        const available=e.status==='published';
        const guestLocked=this.isGuestEpisodeLimit(seriesId,e.episodeId);
        const unlocked=available && this.canAccessEpisode(seriesId,e.episodeId);
        const prog=this.episodeProgress(seriesId,e.episodeId);
        const done=!!(prog.modules.quiz);
        return `<button class="episode-side-item ${Number(e.episodeId)===activeEpisodeId?'active':''} ${unlocked?'':'locked'}" data-ep="${e.episodeId}" data-available="${available}" ${unlocked || guestLocked?'':'disabled'}>
          ${this.episodeCover(e,'episode-thumbnail')}
          <span class="episode-side-details"><span class="episode-side-title"><span class="num">${e.episodeId}</span><span>${e.title}${done?' ✓':''}</span></span>
          <small>${!available?'即将上线':(unlocked?(done?'已完成':'可学习'):(guestLocked?'🔒 注册后解锁':'🔒 未解锁'))}</small></span>
        </button>`;
      }).join('') : '<div class="episode-filter-empty">没有找到匹配课程</div>';
      this.bindEpisodeCovers(list);
      document.querySelectorAll('.episode-side-item').forEach(btn=>btn.onclick=()=>openEpisode(btn.dataset.ep));
    };
    const openEpisode = (id)=>{
      const ep=episodes.find(e=>Number(e.episodeId)===Number(id)) || episodes[0];
      if(this.isGuestEpisodeLimit(seriesId, ep.episodeId)){
        document.getElementById('episodeWorkspace').innerHTML=this.guestEpisodeGate(seriesId, ep);
        this.bindGuestEpisodeGate();
        return;
      }
      if(!this.canAccessEpisode(seriesId, ep.episodeId)){
        alert('🔒 请先完成上一集 Quiz（正确率80%以上）后解锁本集。');
        return;
      }
      activeEpisodeId=Number(ep.episodeId);
      this.rememberEpisode(seriesId,activeEpisodeId);
      document.querySelectorAll('.episode-side-item').forEach(x=>x.classList.toggle('active', Number(x.dataset.ep)===Number(ep.episodeId)));
      document.getElementById('episodeWorkspace').innerHTML=`
        <div class="episode-preview">${this.episodeCover(ep,'episode-preview-cover')}<div><h2>Episode ${ep.episodeId} · ${ep.title}</h2>
        <p class="muted">${ep.titleZh || ''}</p></div></div>
        ${series.movieId?`<p class="muted">${this.escapeHtml(ep.summaryEn || '')} · ${Math.ceil(ep.video.duration/60)} 分钟</p>`:''}
        <div class="module-grid">
          ${ep.video?.hlsUrl?'<button class="module-card direct-video-card" data-go="watch">▶️<b>Watch</b><span>看视频</span></button>':''}
          ${ep.modules?.read?'<button class="module-card" data-go="listenRead">🎧<b>Listen and Read</b><span>听读</span></button>':''}
          ${(ep.modules?.words || ep.modules?.vocabulary)?'<button class="module-card" data-go="words">🔤<b>Words</b><span>单词</span></button>':''}
          ${ep.modules?.quiz?'<button class="module-card" data-go="quiz">✅<b>Quiz</b><span>测验</span></button>':''}
          ${Number(series.level) !== 0 && ep.storyBook?.availability === 'pdf' ? `<a class="module-card" href="#/reader/${this.escapeHtml(ep.storyBook.bookId)}/${this.escapeHtml(seriesId)}">📖<b>Story Book</b><span>本集绘本</span></a>` : ''}
          ${(ep.modules?.words || ep.modules?.vocabulary)?'<button class="module-card" data-go="games">🎮<b>Games</b><span>游戏</span></button>':''}
        </div>`;
      this.bindEpisodeCovers(document.getElementById('episodeWorkspace'));
      document.querySelectorAll('button.module-card[data-go]').forEach(btn=>{
        btn.onclick=()=>{ this.openLearningModal(btn.dataset.go, seriesId, ep.episodeId); };
      });
    };
    document.getElementById('episodeTitleSearch').addEventListener('input',renderEpisodeList);
    document.getElementById('episodeRangeFilter').addEventListener('change',renderEpisodeList);
    this.episodeListRefresh={seriesId,render:renderEpisodeList};
    renderEpisodeList();
    openEpisode(activeEpisodeId);
    window.SFMedals?.attach(this,'series:'+seriesId,this.el().querySelector('.series-hero-content'));
    document.querySelector('.episode-side-item.active')?.scrollIntoView({block:'nearest'});
},
episodeCard(seriesId,e,review={}){
  const isReady = e.status === 'published';
  const href = isReady ? `#/lesson/${seriesId}/${e.episodeId}` : '#/series/' + seriesId;
  const intro = (review.summaryEn || e.summaryEn || '').trim();
  const fallback = isReady ? 'Click to open this lesson and learn with Watch, Listen and Read, Words, and Quiz.' : (e.status==='preparing' ? 'This lesson page is being prepared. The content will be added after the story and vocabulary materials are organized.' : 'This lesson is listed as a preview. It will be unlocked after the official materials are available.');
  return `<article class="episode-card ${isReady?'ready':''}">
    <a href="${href}" class="episode-no">${e.episodeId}</a>
    <div class="episode-main">
      <div class="episode-title">
        <a href="${href}"><h3>${e.title}</h3></a>
        <div class="zh">${e.titleZh || ''}</div>
        <div class="status-line">${this.statusText(e.status)}${e.releaseDate?` · ${e.releaseDate}`:''}</div>
      </div>
      <p class="episode-intro">${intro || fallback}</p>
    </div>
    <div class="episode-action">
      <span class="badge ${this.statusClass(e.status)}">${this.statusText(e.status)}</span>
      ${isReady?`<a class="btn small" href="${href}">进入学习</a>`:`<span class="module-chip">${e.status==='preparing'?'资料整理中':'敬请期待'}</span>`}
    </div>
  </article>`;
},
async renderLesson(seriesId, episodeId){
    const {series, episodes} = await this.loadSeries(seriesId);
    const ep = episodes.find(e=>Number(e.episodeId)===Number(episodeId));
    if(!ep) throw new Error('找不到这一集');
    if(ep.status !== 'published'){
      this.el().innerHTML = `<div class="breadcrumb"><a href="#/home">动画故事</a><span>›</span><a href="#/series/${seriesId}">${series.seriesTitle}</a></div><div class="empty"><h2>${ep.title}</h2><p>${this.statusText(ep.status)}</p><p>这一集还没有完整开放。</p><a class="btn" href="#/series/${seriesId}">返回系列页</a></div>`; return;
    }
    if(this.isGuestRestrictedLevel(series.level)){
      this.el().innerHTML=this.guestLevelGate();
      this.bindGuestEpisodeGate();
      return;
    }
    if(this.isGuestEpisodeLimit(seriesId,episodeId)){
      this.el().innerHTML=this.guestEpisodeGate(seriesId, ep, series);
      this.bindGuestEpisodeGate();
      return;
    }
    if(!this.canAccessEpisode(seriesId,episodeId)){
      this.el().innerHTML=`<div class="empty"><h2>🔒 本集尚未解锁</h2><p>请先完成上一集 Quiz，正确率达到 80% 后自动解锁。</p><a class="btn" href="#/series/${this.escapeHtml(seriesId)}">返回课程列表</a></div>`;
      return;
    }
    const visibleTabs=[...(ep.video?.hlsUrl?['watch']:[]),...(ep.modules?.read?['listenRead']:[]),...((ep.modules?.words||ep.modules?.vocabulary)?['words','games']:[]),...(ep.modules?.quiz?['quiz']:[])];
    const tab = visibleTabs.includes(this.activeLessonTab) ? this.activeLessonTab : 'watch';
    this.rememberEpisode(seriesId,episodeId);
    const assets=await this.loadLessonAssets(seriesId,episodeId,tab);
    const lessonData = {seriesId, episodeId, series, ep, ...assets, phrases:[], grammar:[], review:{}};
    this.disposeHlsPlayers(this.el());
    this.el().innerHTML = `
      <div class="breadcrumb"><a href="${series.movieId?'#/movies':'#/home'}">${series.movieId?'光影课堂':'动画故事'}</a><span>›</span><a href="#/series/${seriesId}">${series.seriesTitle}</a><span>›</span><span>Episode ${episodeId}</span></div>
      <section class="lesson-head">
        <h1>Episode ${episodeId} · ${ep.title}</h1>
        ${Number(series.level) !== 0 && ep.storyBook?.availability === 'pdf' ? `<a class="btn secondary" href="#/reader/${this.escapeHtml(ep.storyBook.bookId)}/${this.escapeHtml(seriesId)}">📖 本集绘本 · Story Book</a>` : ''}
        <div class="muted">${ep.titleZh || ''} · ${series.seriesTitleZh || ''}</div>
        <div class="lesson-tabs">
          ${this.lessonTabs(ep, tab)}
        </div>
      </section>
      <section id="lessonPanel" class="content-panel"></section>`;
    document.querySelectorAll('.tab').forEach(btn=>btn.addEventListener('click',()=>{this.activeLessonTab=btn.dataset.tab; this.renderLesson(seriesId, episodeId)}));
    document.getElementById('lessonPanel').innerHTML = this.lessonPanel(tab, lessonData);
    this.bindLessonPanel(tab, lessonData);
  },
  async openLearningModal(tab, seriesId, episodeId){
    const [bundle] = await Promise.all([this.loadSeries(seriesId)]);
    const {series, episodes} = bundle;
    const ep = episodes.find(e=>Number(e.episodeId)===Number(episodeId));
    if(!ep || ep.status!=='published'){
      alert('这一集暂未开放。');
      return;
    }
    if(this.isGuestRestrictedLevel(series.level)){
      window.SFCloud?.open();
      return;
    }
    if(this.isGuestEpisodeLimit(seriesId,episodeId)){
      window.SFCloud?.open();
      return;
    }
    if(!this.canAccessEpisode(seriesId,episodeId)){
      alert('🔒 请先完成上一集 Quiz（正确率80%以上）后解锁本集。');
      return;
    }
    const assets=await this.loadLessonAssets(seriesId,episodeId,tab);
    const d={seriesId, episodeId, series, ep, ...assets, phrases:[], grammar:[], review:{}};

    if(!this.windowLayer){
      this.windowLayer=document.createElement('div');
      this.windowLayer.id='windowLayer';
      document.body.appendChild(this.windowLayer);
      this.windowZ=20;
    }
    const win=document.createElement('div');
    win.className=`floating-window floating-${tab}`;
    win.style.left=(80 + this.windowLayer.children.length*30)+'px';
    win.style.top=(80 + this.windowLayer.children.length*30)+'px';
    win.style.zIndex=++this.windowZ;
    win.innerHTML=`
      <div class="floating-header">
        <span>${this.tabText(tab)}</span><span class="read-header-hint"></span>
        <button class="floating-close">×</button>
      </div>
      <div class="floating-content">${this.lessonPanel(tab,d)}</div>`;
    this.windowLayer.appendChild(win);

    const close=win.querySelector('.floating-close');
    close.onclick=()=>{
      win.querySelectorAll('video,audio').forEach(player=>{player._disposeHls?.();player.pause();});
      win.remove();
    };

    win.addEventListener('mousedown',()=>win.style.zIndex=++this.windowZ);

    const header=win.querySelector('.floating-header');
    let dragging=false, ox=0, oy=0;
    header.addEventListener('mousedown',(e)=>{
      dragging=true;
      ox=e.clientX-win.offsetLeft;
      oy=e.clientY-win.offsetTop;
      win.style.zIndex=++this.windowZ;
    });
    document.addEventListener('mousemove',e=>{
      if(!dragging)return;
      win.style.left=(e.clientX-ox)+'px';
      win.style.top=(e.clientY-oy)+'px';
    });
    document.addEventListener('mouseup',()=>dragging=false);

    this.bindLessonPanel(tab,d,win);
  },
  lessonTabs(ep, active){
    const tabs=[];
    // HLS is the current primary source. The Bilibili, direct, and local modules
    // remain implemented below as fallbacks, but are intentionally hidden.
    if(ep.video?.hlsUrl) tabs.push('watch');
    if(ep.modules?.read) tabs.push('listenRead');
    if(ep.modules?.words || ep.modules?.vocabulary) tabs.push('words');
    if(ep.modules?.quiz) tabs.push('quiz');
    if(ep.modules?.words || ep.modules?.vocabulary) tabs.push('games');
    return tabs.map(t=>`<button class="tab ${active===t?'active':''}" data-tab="${t}">${this.tabText(t)}</button>`).join('');
  },
  tabText(t){return {watch:'Watch 看视频',hlsVideo:'HLS 播放',directVideo:'直链播放 · 备用',localVideo:'Local Video 本地视频',listenRead:'Listen and Read 听读',words:'Words 单词',quiz:'Quiz 测验',games:'Games 词汇游戏'}[t]||t},
  lessonPanel(tab,d){
    if(tab==='watch') return this.watchPanel(d);
    if(tab==='hlsVideo') return this.hlsVideoPanel(d);
    if(tab==='directVideo') return this.directVideoPanel(d);
    if(tab==='localVideo') return this.localVideoPanel(d);
    if(tab==='listenRead') return this.listenReadPanel(d);
    if(tab==='words') return this.wordsPanel(d);
    if(tab==='quiz') return this.quizPanel(d);
    if(tab==='games') return EpisodeGames.panel(d);
    return '';
  },
  completeButton(d,module){return `<button class="btn small mark-complete" data-series="${d.seriesId}" data-episode="${d.episodeId}" data-module="${module}">完成本模块</button>`},
  watchPanel(d){
    const v=d.ep.video || {};
    if(!v.embedUrl && !v.directUrl && !v.hlsUrl) return `<div class="empty">本集视频暂未添加。</div>`;
    if(v.hlsUrl) return this.hlsVideoPanel(d, 'watch');
    if(!v.embedUrl) return this.directVideoPanel(d);
    return `<section class="online-video-panel"><div class="video-source-head"><div><h2>在线视频</h2><p class="muted">当前播放源：B站。遇到加载问题时，可使用下方的直链播放。</p></div>${v.directUrl?`<button class="btn secondary small open-direct-video" type="button">▶ 使用直链播放</button>`:''}</div><div class="video-wrap"><iframe src="${v.embedUrl}" allowfullscreen="allowfullscreen" scrolling="no"></iframe></div></section>${this.completeButton(d,'watch')}`;
  },
  directVideoPanel(d){
    const url=d.ep.video?.directUrl;
    if(!url) return `<div class="empty">本集暂未提供直链视频。</div>`;
    return `<section class="direct-video-panel"><div class="video-source-head"><div><h2>直链播放</h2><p class="muted">备用播放方式。已启用无来源请求以兼容源站的防盗链规则。</p></div>${d.ep.video?.embedUrl?`<button class="btn secondary small open-bilibili-video" type="button">切换到 B站播放</button>`:''}</div><div class="video-wrap"><video class="direct-video-player" controls playsinline preload="metadata" src="${this.escapeHtml(url)}"></video></div><p class="muted direct-video-help">若播放器仍无法读取，可<a href="${this.escapeHtml(url)}" target="_blank" rel="noreferrer noopener">在新页面播放直链</a>，或切换到 B站播放。</p></section>${this.completeButton(d,'directVideo')}`;
  },
  hlsVideoPanel(d, completionModule='hlsVideo'){
    const url=d.ep.video?.hlsUrl;
    if(!url) return `<div class="empty">本集 HLS 视频源暂未添加。</div>`;
    const backupHls=d.ep.video?.backupHlsUrl || '';
    const hls720=d.ep.video?.hls720Url || '';
    const fallback=d.ep.video?.mp4Url || d.ep.video?.directUrl || '';
    const hasSubtitle=true;
    const fallbacks=[...(hls720 && hls720!==url?[hls720]:[]),...(backupHls?[backupHls]:[])];
    const sourceSelector=hls720?`<label class="hls-source-control">清晰度 / 播放源<select class="hls-source-select" aria-label="选择视频清晰度和播放源" data-hls-1080="${this.escapeHtml(url)}" data-hls-720="${this.escapeHtml(hls720)}" data-hls-korea="${this.escapeHtml(backupHls)}"><option value="1080">1080P 国际站（推荐）</option><option value="720">720P 国际站（更流畅）</option>${backupHls?'<option value="korea">韩国站备用源</option>':''}</select></label>`:'';
    return `<section class="direct-video-panel"><div class="video-source-head"><div><h2>Watch 看视频</h2><p class="muted">默认使用 1080P 国际站；播放不流畅时可切换为 720P。加载失败会依次尝试可用备用源。${hasSubtitle?' 本集提供时将自动加载英文外挂字幕。':''}</p></div>${sourceSelector}</div><div class="video-wrap${hasSubtitle?' subtitle-video-wrap':''}"><video class="hls-video-player" controls playsinline preload="metadata" data-hls-src="${this.escapeHtml(url)}" data-hls-fallback-srcs="${this.escapeHtml(JSON.stringify(fallbacks))}" data-fallback-src="${this.escapeHtml(fallback)}"></video><div class="video-caption" aria-live="polite" hidden></div>${hasSubtitle?this.subtitleControls():''}</div><p class="muted direct-video-help"><span class="hls-load-status" role="status" aria-live="polite">正在连接视频…</span> ${fallback?`也可<a href="${this.escapeHtml(fallback)}" target="_blank" rel="noreferrer noopener">直接打开本集视频</a>。`:`若无法播放，可<a href="${this.escapeHtml(url)}" target="_blank" rel="noreferrer noopener">打开视频源</a>。`}</p></section>${this.completeButton(d,completionModule)}`;
  },
  subtitlePreferences(){
    const defaults={visible:true,wordHighlight:true,size:20,color:'#ffffff',captionX:50,captionY:84,opacity:72};
    try{
      const saved=JSON.parse(localStorage.getItem('storyfox-subtitle-preferences')||'{}') || {};
      const legacyY={top:16,middle:50,bottom:84}[saved.position];
      return {...defaults,...saved,...(!Number.isFinite(saved.captionY) && legacyY!==undefined?{captionY:legacyY}:{} )};
    }catch{return defaults;}
  },
  subtitleControls(){
    const prefs=this.subtitlePreferences();
    const option=(value,label,current)=>`<option value="${value}"${value===current?' selected':''}>${label}</option>`;
    return `<div class="subtitle-settings-dock">
      <button type="button" class="subtitle-settings-trigger" aria-label="打开字幕设置" aria-expanded="false">⚙<span>字幕</span></button>
      <button type="button" class="video-fullscreen-trigger" aria-label="全屏观看（保留字幕设置）" title="全屏观看（保留字幕设置）">⛶<span>全屏</span></button>
      <div class="subtitle-controls subtitle-controls-overlay" aria-label="字幕设置">
        <div class="subtitle-controls-header"><div class="subtitle-controls-title">字幕设置</div><button type="button" class="subtitle-reset-position">恢复默认设置 ↻</button></div>
        <div class="subtitle-setting-row"><span>显示字幕</span><button type="button" class="btn secondary small subtitle-toggle" aria-pressed="${prefs.visible}">${prefs.visible?'开启':'关闭'}</button></div>
        <div class="subtitle-setting-row"><span>逐词高亮</span><button type="button" class="btn secondary small subtitle-word-toggle" aria-pressed="${prefs.wordHighlight}">${prefs.wordHighlight?'开启':'关闭'}</button></div>
        <div class="subtitle-setting-row"><span>字幕位置</span><span class="subtitle-drag-tip">直接拖动字幕</span></div>
        <label class="subtitle-setting-row"><span>字幕颜色</span><input class="subtitle-color" type="color" value="${prefs.color}"></label>
        <label class="subtitle-setting-row"><span>字幕大小</span><input class="subtitle-size" type="range" min="14" max="32" step="1" value="${prefs.size}"><output>${prefs.size}px</output></label>
        <label class="subtitle-setting-row"><span>背景透明度</span><input class="subtitle-opacity" type="range" min="0" max="95" step="5" value="${prefs.opacity}"><output>${prefs.opacity}%</output></label>
      </div>
    </div>`;
  },
  applySubtitlePreferences(root=document){
    const prefs=this.subtitlePreferences();
    root.querySelectorAll('.video-caption').forEach(caption=>{
      caption.style.setProperty('--caption-size',`${prefs.size}px`);
      caption.style.setProperty('--caption-color',prefs.color);
      caption.style.setProperty('--caption-opacity',String(prefs.opacity/100));
      caption.style.setProperty('--caption-x',`${prefs.captionX}%`);
      caption.style.setProperty('--caption-y',`${prefs.captionY}%`);
      caption.dataset.subtitleVisible=String(prefs.visible);
    });
  },
  bindSubtitleControls(root=document){
    const controls=root.querySelector('.subtitle-controls');
    if(!controls || controls.dataset.bound) return;
    controls.dataset.bound='1';
    const stage=controls.closest('.subtitle-video-wrap');
    const player=stage?.querySelector('.hls-video-player');
    const dock=controls.closest('.subtitle-settings-dock');
    const trigger=dock?.querySelector('.subtitle-settings-trigger');
    const fullscreenTrigger=dock?.querySelector('.video-fullscreen-trigger');
    let hideTimer=null;
    const showControls=()=>{
      if(!stage) return;
      window.clearTimeout(hideTimer);
      stage.classList.add('subtitle-settings-visible');
    };
    const hideControlsLater=()=>{
      if(!stage || !player || player.paused) return;
      window.clearTimeout(hideTimer);
      hideTimer=window.setTimeout(()=>{
        stage.classList.remove('subtitle-settings-visible','subtitle-settings-open');
        trigger?.setAttribute('aria-expanded','false');
        trigger?.setAttribute('aria-label','打开字幕设置');
      },1800);
    };
    if(stage && player){
      const revealControls=()=>{showControls();hideControlsLater();};
      stage.addEventListener('pointerenter',revealControls);
      stage.addEventListener('pointermove',revealControls);
      stage.addEventListener('pointerleave',hideControlsLater);
      stage.addEventListener('touchstart',revealControls,{passive:true});
      controls.addEventListener('pointerdown',showControls);
      controls.addEventListener('focusin',showControls);
      controls.addEventListener('input',revealControls);
      controls.addEventListener('change',revealControls);
      trigger?.addEventListener('click',()=>{
        const open=!stage.classList.contains('subtitle-settings-open');
        stage.classList.toggle('subtitle-settings-open',open);
        trigger.setAttribute('aria-expanded',String(open));
        trigger.setAttribute('aria-label',open?'关闭字幕设置':'打开字幕设置');
        showControls();
        if(!open) hideControlsLater();
      });
      fullscreenTrigger?.addEventListener('click',async()=>{
        if(stage.classList.contains('subtitle-page-fullscreen')){
          stage.classList.remove('subtitle-page-fullscreen');
          fullscreenTrigger.setAttribute('aria-label','全屏观看（保留字幕设置）');
          fullscreenTrigger.querySelector('span').textContent='全屏';
          return;
        }
        try{
          if(document.fullscreenElement===stage) await document.exitFullscreen();
          else await stage.requestFullscreen();
        }catch{
          stage.classList.add('subtitle-page-fullscreen');
          fullscreenTrigger.setAttribute('aria-label','退出全屏');
          fullscreenTrigger.querySelector('span').textContent='退出';
        }
      });
      document.addEventListener('fullscreenchange',()=>{
        const isFullscreen=document.fullscreenElement===stage;
        fullscreenTrigger?.classList.toggle('is-fullscreen',isFullscreen);
        fullscreenTrigger?.setAttribute('aria-label',isFullscreen?'退出全屏':'全屏观看（保留字幕设置）');
        if(fullscreenTrigger) fullscreenTrigger.querySelector('span').textContent=isFullscreen?'退出':'全屏';
      });
      stage.addEventListener('focusin',showControls);
      player.addEventListener('play',hideControlsLater);
      player.addEventListener('pause',showControls);
      player.addEventListener('ended',showControls);
    }
    const save=patch=>{const next={...this.subtitlePreferences(),...patch};localStorage.setItem('storyfox-subtitle-preferences',JSON.stringify(next));this.applySubtitlePreferences(root);return next;};
    const toggle=controls.querySelector('.subtitle-toggle');
    toggle.addEventListener('click',()=>{const prefs=save({visible:!this.subtitlePreferences().visible});toggle.textContent=prefs.visible?'隐藏字幕':'显示字幕';toggle.setAttribute('aria-pressed',String(prefs.visible));root.querySelectorAll('.hls-video-player').forEach(player=>player.dispatchEvent(new Event('timeupdate')));});
    const wordToggle=controls.querySelector('.subtitle-word-toggle');
    wordToggle?.addEventListener('click',()=>{const prefs=save({wordHighlight:!this.subtitlePreferences().wordHighlight});wordToggle.textContent=prefs.wordHighlight?'开启':'关闭';wordToggle.setAttribute('aria-pressed',String(prefs.wordHighlight));root.querySelectorAll('.hls-video-player').forEach(player=>player.dispatchEvent(new Event('timeupdate')));});
    [['.subtitle-size','size','px'],['.subtitle-opacity','opacity','%']].forEach(([selector,key,suffix])=>{
      const input=controls.querySelector(selector);input.addEventListener('input',()=>{input.nextElementSibling.textContent=`${input.value}${suffix}`;save({[key]:Number(input.value)});});
    });
    controls.querySelector('.subtitle-color').addEventListener('input',event=>save({color:event.target.value}));
    controls.querySelector('.subtitle-reset-position').addEventListener('click',()=>{
      const prefs=save({visible:true,wordHighlight:true,size:20,color:'#ffffff',captionX:50,captionY:84,opacity:72});
      toggle.textContent='开启';
      toggle.setAttribute('aria-pressed','true');
      if(wordToggle){wordToggle.textContent='开启';wordToggle.setAttribute('aria-pressed','true');}
      controls.querySelector('.subtitle-size').value=prefs.size;
      controls.querySelector('.subtitle-size').nextElementSibling.textContent=`${prefs.size}px`;
      controls.querySelector('.subtitle-color').value=prefs.color;
      controls.querySelector('.subtitle-opacity').value=prefs.opacity;
      controls.querySelector('.subtitle-opacity').nextElementSibling.textContent=`${prefs.opacity}%`;
      root.querySelectorAll('.hls-video-player').forEach(player=>player.dispatchEvent(new Event('timeupdate')));
    });
  },
  subtitleVttUrl(d){
    if(d.ep?.video?.subtitleUrl){
      const url=new URL(d.ep.video.subtitleUrl,location.href);
      if(url.origin===location.origin) return url.href;
    }
    const episodeNumber=Number(d.ep?.episodeId ?? d.episodeId);
    if(!Number.isInteger(episodeNumber) || episodeNumber<1) return '';
    return `data/${d.seriesId}/subtitles/${String(episodeNumber).padStart(3,'0')}.vtt`;
  },
  parseVttTime(value){
    const parts=String(value||'').trim().replace(',', '.').split(':').map(Number);
    if(parts.length!==3 || parts.some(part=>!Number.isFinite(part))) return null;
    return Math.round(((parts[0]*3600)+(parts[1]*60)+parts[2])*1000);
  },
  parseVtt(text){
    const cues=[];
    String(text||'').replace(/^\uFEFF?WEBVTT[^\n]*\n/i,'').replace(/\r/g,'').split(/\n{2,}/).forEach(block=>{
      const lines=block.split('\n').filter(Boolean);
      const timeIndex=lines.findIndex(line=>line.includes('-->'));
      if(timeIndex<0) return;
      const [start,end]=lines[timeIndex].split('-->').map(value=>value.trim().split(/\s+/)[0]);
      const startMs=this.parseVttTime(start), endMs=this.parseVttTime(end);
      const cueText=lines.slice(timeIndex+1).join(' ').trim();
      if(startMs===null || endMs===null || endMs<=startMs || !cueText) return;
      cues.push({startMs,endMs,text:cueText});
    });
    return cues;
  },
  async bindSubtitleOverlay(player,d){
    const caption=player.parentElement?.querySelector('.video-caption');
    const vttUrl=this.subtitleVttUrl(d);
    if(!caption || !vttUrl) return;
    let cues=[];
    const panel=player.closest('.direct-video-panel');
    let subtitleStatus=null;
    if(d.ep?.video?.subtitleUrl){
      subtitleStatus=document.createElement('p');
      subtitleStatus.className='muted movie-subtitle-status';
      subtitleStatus.setAttribute('role','status');
      subtitleStatus.textContent='正在加载本集英文字幕…';
      panel?.appendChild(subtitleStatus);
    }
    try{
      const response=await fetch(vttUrl);
      if(response.ok) cues=this.parseVtt(await response.text());
    }catch{}
    if(subtitleStatus) subtitleStatus.textContent=cues.length?'英文字幕已加载 · 已匹配当前片源时间轴':'英文字幕暂时无法加载，请重新打开本集重试。视频仍可播放。';
    if(!caption || !cues.length) return;
    let nativeTrack=null;
    try{
      const track=document.createElement('track');
      track.kind='subtitles';
      track.label='English';
      track.srclang='en';
      track.src=vttUrl;
      player.appendChild(track);
      nativeTrack=track.track;
      nativeTrack.mode='hidden';
    }catch{}
    const isNativeFullscreen=()=>document.fullscreenElement===player || player.webkitDisplayingFullscreen;
    const syncNativeTrack=()=>{
      if(nativeTrack) nativeTrack.mode=isNativeFullscreen() && this.subtitlePreferences().visible?'showing':'hidden';
    };
    const syncWords=window.SFWordSync;
    const prepared=syncWords?await syncWords.load(d,cues):null;
    if(!caption.isConnected)return;
    let active=-1,renderedMode=null,wordView=null,animation=0,lastPaint=0;
    const update=()=>{
      syncNativeTrack();
      if(isNativeFullscreen()){
        caption.hidden=true;
        return;
      }
      const now=Math.round(player.currentTime*1000);
      const next=cues.findIndex(cue=>now>=cue.startMs && now<=cue.endMs);
      const wordEnabled=!!syncWords&&this.subtitlePreferences().wordHighlight!==false;
      if(next!==active||renderedMode!==wordEnabled){
        active=next;renderedMode=wordEnabled;wordView=null;
        if(next<0){
          caption.textContent='';
        }else if(wordEnabled&&prepared?.[next]){
          wordView=syncWords.render(prepared[next]);
          caption.replaceChildren(wordView.fragment);
          caption.dataset.wordTiming=prepared[next].verified?'speech':'estimated';
        }else{
          caption.textContent=cues[next].text;
        }
      }
      caption.hidden=next<0 || caption.dataset.subtitleVisible==='false';
      if(next>=0&&wordView)syncWords.paint(wordView,now,true);
    };
    const paintFrame=(time)=>{
      animation=0;
      if(!player.isConnected||player.paused)return;
      if(time-lastPaint>=55){lastPaint=time;update();}
      animation=requestAnimationFrame(paintFrame);
    };
    const startPaint=()=>{if(!animation&&!player.paused)animation=requestAnimationFrame(paintFrame);};
    const stopPaint=()=>{if(animation){cancelAnimationFrame(animation);animation=0;}};
    player.addEventListener('timeupdate',update);
    player.addEventListener('seeked',update);
    player.addEventListener('play',startPaint);
    player.addEventListener('pause',stopPaint);
    player.addEventListener('ended',()=>{stopPaint();active=-1;caption.hidden=true;});
    document.addEventListener('fullscreenchange',update);
    player.addEventListener('webkitbeginfullscreen',update);
    player.addEventListener('webkitendfullscreen',update);
    update();
    if(!player.paused)startPaint();
    if(caption.dataset.dragBound) return;
    caption.dataset.dragBound='1';
    caption.addEventListener('pointerdown',event=>{
      if(event.button!==undefined && event.button!==0) return;
      event.preventDefault();
      const stage=player.parentElement;
      const updatePosition=moveEvent=>{
        const rect=stage.getBoundingClientRect();
        const x=Math.min(93,Math.max(7,((moveEvent.clientX-rect.left)/rect.width)*100));
        const y=Math.min(86,Math.max(8,((moveEvent.clientY-rect.top)/rect.height)*100));
        const next={...this.subtitlePreferences(),captionX:Math.round(x),captionY:Math.round(y)};
        localStorage.setItem('storyfox-subtitle-preferences',JSON.stringify(next));
        this.applySubtitlePreferences(stage);
      };
      const finish=()=>{
        caption.classList.remove('caption-dragging');
        caption.removeEventListener('pointermove',updatePosition);
        caption.removeEventListener('pointerup',finish);
        caption.removeEventListener('pointercancel',finish);
      };
      caption.classList.add('caption-dragging');
      caption.setPointerCapture?.(event.pointerId);
      caption.addEventListener('pointermove',updatePosition);
      caption.addEventListener('pointerup',finish);
      caption.addEventListener('pointercancel',finish);
      updatePosition(event);
    });
  },
  async initializeHlsVideo(player){
    return this.initializeHlsMedia(player);
  },
  async initializeHlsAudio(player){
    return this.initializeHlsMedia(player);
  },
  async loadHlsLibrary(){
    if(window.Hls) return window.Hls;
    if(!this._hlsLibraryPromise){
      this._hlsLibraryPromise=new Promise((resolve,reject)=>{
        const script=document.createElement('script');
        const timer=setTimeout(()=>{script.remove();reject(new Error('Player load timed out'));},10000);
        script.src='https://cdn.jsdelivr.net/npm/hls.js@1.5.20/dist/hls.min.js';
        script.onload=()=>{clearTimeout(timer);resolve(window.Hls);};
        script.onerror=()=>{clearTimeout(timer);script.remove();reject(new Error('Player load failed'));};
        document.head.appendChild(script);
      }).catch(error=>{this._hlsLibraryPromise=null;throw error;});
    }
    return this._hlsLibraryPromise;
  },
  async initializeHlsMedia(player){
    if(player.dataset.ready) return;
    player.dataset.ready='1';
    const source=player.dataset.hlsSrc;
    let hlsFallbacks=[];
    try{hlsFallbacks=JSON.parse(player.dataset.hlsFallbackSrcs||'[]');}catch{hlsFallbacks=[];}
    if(!Array.isArray(hlsFallbacks)) hlsFallbacks=[];
    if(player.dataset.backupHlsSrc && !hlsFallbacks.includes(player.dataset.backupHlsSrc)) hlsFallbacks.push(player.dataset.backupHlsSrc);
    const fallback=player.dataset.fallbackSrc;
    const help=player.closest('.direct-video-panel')?.querySelector('.direct-video-help') || player.closest('.audio-player-card')?.querySelector('.audio-player-help');
    const loadStatus=player.closest('.direct-video-panel')?.querySelector('.hls-load-status');
    let switched=false, fallbackIndex=0, disposed=false, wantsPlay=player.dataset.resumeOnLoad==='1', disposeAdSkip;
    delete player.dataset.resumeOnLoad;
    const onPlay=()=>{wantsPlay=true;};
    player.addEventListener('play',onPlay);
    const destroy=()=>{if(player._hls){player._hls.destroy();player._hls=null;}};
    const recover=()=>{
      if(disposed || switched) return;
      disposeAdSkip?.();
      clearTimeout(timer);
      const resume=wantsPlay || !player.paused;
      const position=Number.isFinite(player.currentTime)?player.currentTime:0;
      const nextHls=hlsFallbacks[fallbackIndex++];
      if(nextHls){
        if(loadStatus)loadStatus.textContent='当前播放源加载失败，正在切换备用播放源。';else if(help)help.textContent='当前播放源加载失败，正在切换备用播放源。';
        player.addEventListener('loadedmetadata',()=>{if(!disposed&&resume)player.play().catch(()=>{});},{once:true});
        if(player._hls){player._hls.loadSource(nextHls);disposeAdSkip=window.DyttAdSkip?.attach(player,nextHls,player._hls);}
        else{player.src=nextHls;player.load();}
        return;
      }
      switched=true;
      destroy();
      if(!fallback){if(loadStatus)loadStatus.textContent='本集暂时无法加载，请稍后重试。';else if(help)help.textContent='本集暂时无法加载，请稍后重试。';return;}
      if(loadStatus)loadStatus.textContent='已切换到备用视频。'; else if(help)help.textContent='已切换到备用视频，可点击播放继续。';
      player.addEventListener('loadedmetadata',()=>{
        if(disposed) return;
        if(position>0 && Number.isFinite(player.duration))player.currentTime=Math.min(position,Math.max(0,player.duration-0.1));
        if(resume)player.play().catch(()=>{});
      },{once:true});
      player.src=fallback;
      player.load();
    };
    const timer=setTimeout(()=>{if(player.readyState<1)recover();},9000);
    const onMetadata=()=>{clearTimeout(timer);if(loadStatus)loadStatus.textContent='视频已就绪。';};
    player.addEventListener('loadedmetadata',onMetadata,{once:true});
    player.addEventListener('error',recover);
    player._disposeHls=()=>{
      disposed=true;disposeAdSkip?.();clearTimeout(timer);destroy();
      player.removeEventListener('play',onPlay);
      player.removeEventListener('error',recover);
      player.removeEventListener('loadedmetadata',onMetadata);
    };
    try{
      // Safari can use native HLS. Desktop Chrome uses the explicit MSE player.
      const native=player.canPlayType('application/vnd.apple.mpegurl');
      const safari=/Safari/i.test(navigator.userAgent) && !/Chrome|Chromium|CriOS|Edg|Android/i.test(navigator.userAgent);
      if(native && safari){player.src=source;disposeAdSkip=window.DyttAdSkip?.attach(player,source);return;}
      const Hls=await this.loadHlsLibrary();
      if(disposed || switched) return;
      if(Hls && Hls.isSupported()){
        const hls=new Hls({enableWorker:true,capLevelToPlayerSize:true,maxBufferLength:15,maxMaxBufferLength:30,backBufferLength:30,manifestLoadingTimeOut:8000,levelLoadingTimeOut:8000,fragLoadingTimeOut:15000});player._hls=hls;
        hls.on(Hls.Events.ERROR,(_event,data)=>{if(data.fatal)recover();});
        disposeAdSkip=window.DyttAdSkip?.attach(player,source,hls);
        hls.attachMedia(player);hls.loadSource(source);
      }else if(native){player.src=source;disposeAdSkip=window.DyttAdSkip?.attach(player,source);}
      else recover();
    }catch(error){
      recover();
    }
  },
  switchHlsSource(player,source,fallbacks=[]){
    if(!source) return;
    const resume=!player.paused;
    player._disposeHls?.();
    player.removeAttribute('src');
    player.load();
    player.dataset.hlsSrc=source;
    player.dataset.hlsFallbackSrcs=JSON.stringify(fallbacks.filter(url=>url && url!==source));
    if(resume) player.dataset.resumeOnLoad='1';
    delete player.dataset.ready;
    const status=player.closest('.direct-video-panel')?.querySelector('.hls-load-status');
    if(status) status.textContent='正在切换播放源…';
    this.initializeHlsMedia(player);
  },
  localVideoPanel(d){
    return `<section class="local-video-panel" data-series="${d.seriesId}" data-episode="${d.episodeId}">
      <h2>本地视频</h2>
      <p class="muted">可为这一课保存电脑中的视频。视频仅保存在当前浏览器和设备中；下次打开网站时仍可直接播放。</p>
      <p class="local-video-contact">想要更多的本地视频资源可添加微信 min258614。</p>
      <div class="local-video-actions">
        <label class="btn small local-video-upload">选择并保存视频<input class="local-video-input" type="file" accept="video/*" hidden></label>
        <button class="btn small local-video-play" type="button" disabled>▶ 播放本地视频</button>
        <button class="btn small secondary local-video-remove" type="button" hidden>删除已保存视频</button>
      </div>
      <p class="local-video-status muted" aria-live="polite">正在读取已保存的视频…</p>
      <div class="local-video-frame">
        <video class="local-video-player" controls playsinline preload="metadata" hidden></video>
        <div class="local-video-empty">选择一个本地视频后，即可在这里播放。</div>
      </div>
    </section>${this.completeButton(d,'localVideo')}`;
  },
  async localVideoDatabase(){
    if(this._localVideoDatabase) return this._localVideoDatabase;
    this._localVideoDatabase = new Promise((resolve,reject)=>{
      const request=indexedDB.open('storyfox-local-videos',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('videos',{keyPath:'id'});
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error || new Error('无法打开本地视频存储'));
    });
    return this._localVideoDatabase;
  },
  localVideoId(seriesId,episodeId){return `${seriesId}:${episodeId}`;},
  async getLocalVideo(seriesId,episodeId){
    const db=await this.localVideoDatabase();
    return new Promise((resolve,reject)=>{
      const request=db.transaction('videos','readonly').objectStore('videos').get(this.localVideoId(seriesId,episodeId));
      request.onsuccess=()=>resolve(request.result || null);
      request.onerror=()=>reject(request.error || new Error('读取本地视频失败'));
    });
  },
  async saveLocalVideo(seriesId,episodeId,file){
    const db=await this.localVideoDatabase();
    const entry={id:this.localVideoId(seriesId,episodeId),name:file.name,type:file.type,size:file.size,updatedAt:Date.now(),blob:file};
    return new Promise((resolve,reject)=>{
      const request=db.transaction('videos','readwrite').objectStore('videos').put(entry);
      request.onsuccess=()=>resolve(entry);
      request.onerror=()=>reject(request.error || new Error('保存本地视频失败；请确认浏览器有足够存储空间'));
    });
  },
  async removeLocalVideo(seriesId,episodeId){
    const db=await this.localVideoDatabase();
    return new Promise((resolve,reject)=>{
      const request=db.transaction('videos','readwrite').objectStore('videos').delete(this.localVideoId(seriesId,episodeId));
      request.onsuccess=()=>resolve();
      request.onerror=()=>reject(request.error || new Error('删除本地视频失败'));
    });
  },
  showLocalVideo(panel,entry){
    const player=panel.querySelector('.local-video-player');
    const empty=panel.querySelector('.local-video-empty');
    const status=panel.querySelector('.local-video-status');
    const remove=panel.querySelector('.local-video-remove');
    const play=panel.querySelector('.local-video-play');
    if(panel._localVideoUrl) URL.revokeObjectURL(panel._localVideoUrl);
    panel._localVideoUrl=URL.createObjectURL(entry.blob);
    player.src=panel._localVideoUrl;
    player.load();
    player.hidden=false;
    empty.hidden=true;
    remove.hidden=false;
    play.disabled=false;
    status.textContent=`已保存：${entry.name}（${(entry.size/1024/1024).toFixed(1)} MB）`;
  },
  timedSentencePanel(){
  return `<section class="timed-sentence-study" aria-label="逐句跟读">
    <div class="timed-sentence-toolbar">
      <strong>逐句跟读 · Sentence practice</strong>
      <div class="timed-sentence-actions">
        <button type="button" class="btn secondary small timed-sentence-prev" disabled>上一句</button>
        <button type="button" class="btn secondary small timed-sentence-next" disabled>下一句</button>
        <button type="button" class="btn secondary small timed-sentence-loop" aria-pressed="false" disabled>单句循环：关</button>
        <label class="timed-sentence-follow-label"><input class="timed-sentence-word-highlight" type="checkbox" ${this.subtitlePreferences().wordHighlight!==false?'checked':''}> 逐词高亮</label>
        <label class="timed-sentence-follow-label"><input class="timed-sentence-follow" type="checkbox" checked> 自动跟随</label>
      </div>
    </div>
    <p class="muted timed-sentence-status" role="status">正在加载逐句时间轴…</p>
    <div class="timed-sentence-list" role="list" aria-label="同步英文字幕"></div>
  </section>`;
},
  async bindTimedSentenceStudy(root,d){
  const panel=root.querySelector('.timed-sentence-study');
  const audio=root.querySelector('.hls-audio-player');
  if(!panel || !audio || panel.dataset.bound) return;
  panel.dataset.bound='1';
  const list=panel.querySelector('.timed-sentence-list');
  const status=panel.querySelector('.timed-sentence-status');
  const prev=panel.querySelector('.timed-sentence-prev');
  const next=panel.querySelector('.timed-sentence-next');
  const loopToggle=panel.querySelector('.timed-sentence-loop');
  const follow=panel.querySelector('.timed-sentence-follow');
  const wordToggle=panel.querySelector('.timed-sentence-word-highlight');
  const wordSync=window.SFWordSync;
  let cues=[],prepared=[],wordViews=[],wordActive=-1,active=-1,chosen=0,loopIndex=-1,frame=null,lastPaint=0;
  const readIndex=()=> {
    const ms=Math.round((Number(audio.currentTime)||0)*1000);
    return cues.findIndex(c=>ms>=c.startMs && ms<c.endMs);
  };
  const buttons=()=>list.querySelectorAll('.timed-sentence-item');
  const setLoop=(index)=>{
    loopIndex=Number.isInteger(index)&&index>=0&&index<cues.length?index:-1;
    loopToggle.setAttribute('aria-pressed',String(loopIndex>=0));
    loopToggle.textContent=loopIndex>=0?`单句循环：第 ${loopIndex+1} 句`:'单句循环：关';
    buttons().forEach((row,i)=>{
      row.classList.toggle('is-looping',i===loopIndex);
      row.querySelector('.timed-sentence-loop-one')?.setAttribute('aria-pressed',String(i===loopIndex));
    });
    if(loopIndex>=0&&!audio.paused) startFrame();
  };
  const setActive=(index)=>{
    if(index===active) return;
    if(active>=0){
      const old=list.querySelector(`[data-cue-index="${active}"]`);
      old?.classList.remove('is-active');
      old?.querySelector('.timed-sentence-text')?.removeAttribute('aria-current');
    }
    active=index;
    const row=index>=0?list.querySelector(`[data-cue-index="${index}"]`):null;
    if(row){
      row.classList.add('is-active');
      row.querySelector('.timed-sentence-text')?.setAttribute('aria-current','true');
      if(follow.checked){
        const wanted=row.offsetTop-list.offsetTop-(list.clientHeight-row.offsetHeight)/2;
        if(Math.abs(wanted-list.scrollTop)>list.clientHeight/3)list.scrollTo({top:Math.max(0,wanted),behavior:'smooth'});
      }
    }
    prev.disabled=!cues.length;
    next.disabled=!cues.length;
  };
  const update=()=>{
    if(!panel.isConnected)return;
    const now=Math.round((Number(audio.currentTime)||0)*1000);
    if(loopIndex>=0&&!audio.paused){
      const cue=cues[loopIndex];
      if(now>=cue.endMs-35 || now<cue.startMs-250){
        audio.currentTime=cue.startMs/1000;
        setActive(loopIndex);
        return;
      }
    }
    const index=readIndex();
    if(index>=0){chosen=index;setActive(index);}
    else if(loopIndex<0)setActive(-1);
    if(wordSync){
      if(wordActive!==index){
        if(wordActive>=0)wordSync.paint(wordViews[wordActive],-1,false);
        wordActive=index;
      }
      if(index>=0)wordSync.paint(wordViews[index],now,wordToggle.checked);
    }
  };
  const tick=(time)=>{
    frame=null;
    if(!panel.isConnected||audio.paused)return;
    if(time-lastPaint>=55){lastPaint=time;update();}
    frame=requestAnimationFrame(tick);
  };
  const startFrame=()=>{
    if(frame===null&&!audio.paused&&panel.isConnected)frame=requestAnimationFrame(tick);
  };
  const stopFrame=()=>{
    if(frame!==null){cancelAnimationFrame(frame);frame=null;}
  };
  const seekTo=index=>{
    if(index<0||index>=cues.length)return;
    chosen=index;
    const jump=()=>{if(panel.isConnected)audio.currentTime=cues[index].startMs/1000;};
    if(audio.readyState===0)audio.addEventListener('loadedmetadata',jump,{once:true});
    else jump();
    setActive(index);
    audio.play().catch(()=>{status.textContent='点击音频播放按钮后，可以继续逐句跟读。';});
  };
  try{
    const url=this.subtitleVttUrl(d);
    if(!url)throw Error('本集尚无字幕路径');
    const response=await fetch(url);
    if(!response.ok)throw Error('本集尚无有效时间轴');
    cues=this.parseVtt(await response.text()).filter(c=>c.text&&Number.isFinite(c.startMs)&&c.endMs>c.startMs);
    if(!cues.length)throw Error('字幕没有有效的逐句时间');
    prepared=wordSync?await wordSync.load(d,cues):[];
    if(!panel.isConnected)return;
    list.innerHTML=cues.map((c,i)=>`<div class="timed-sentence-item" role="listitem" data-cue-index="${i}">
      <span class="timed-sentence-number">${i+1}</span>
      <button type="button" class="timed-sentence-text" title="点击播放这一句">${this.escapeHtml(c.text)}</button>
      <button type="button" class="timed-sentence-loop-one" aria-label="循环播放第 ${i+1} 句" aria-pressed="false" title="循环播放此句">↻</button>
    </div>`).join('');
    if(wordSync){
      list.querySelectorAll('.timed-sentence-item').forEach((row,i)=>{
        const view=wordSync.render(prepared[i]);
        row.querySelector('.timed-sentence-text').replaceChildren(view.fragment);
        wordViews.push(view);
      });
    }
    const hasSpeech=prepared.some(row=>row.words.some(word=>word.source==='speech'));
    status.textContent=`已加载 ${cues.length} 条字幕。逐词高亮：${hasSpeech?'语音时间对齐':'按句时长估算'}。点击句子播放；↻ 可单句循环。`;
    wordToggle.addEventListener('change',()=>{
      const prefs={...this.subtitlePreferences(),wordHighlight:wordToggle.checked};
      localStorage.setItem('storyfox-subtitle-preferences',JSON.stringify(prefs));
      update();
    });
    prev.disabled=false;next.disabled=false;loopToggle.disabled=false;
    list.addEventListener('click',event=>{
      const row=event.target.closest('.timed-sentence-item');
      if(!row||!list.contains(row))return;
      const index=Number(row.dataset.cueIndex);
      if(event.target.closest('.timed-sentence-loop-one'))setLoop(loopIndex===index?-1:index);
      else if(loopIndex>=0&&loopIndex!==index)setLoop(-1);
      seekTo(index);
    });
    const step=delta=>{
      const base=active>=0?active:chosen;
      const index=Math.min(cues.length-1,Math.max(0,base+delta));
      if(loopIndex>=0)setLoop(-1);
      seekTo(index);
    };
    prev.addEventListener('click',()=>step(-1));
    next.addEventListener('click',()=>step(1));
    loopToggle.addEventListener('click',()=>{
      if(loopIndex>=0)setLoop(-1);
      else{
        const index=active>=0?active:chosen;
        setLoop(index);
        seekTo(index);
      }
    });
    audio.addEventListener('timeupdate',update);
    audio.addEventListener('seeked',update);
    audio.addEventListener('play',()=>{update();startFrame();});
    audio.addEventListener('pause',stopFrame);
    audio.addEventListener('ended',stopFrame);
    audio.addEventListener('loadedmetadata',update);
    update();
  }catch(error){
    if(panel.isConnected)status.textContent=`逐句跟读暂不可用：${error.message}。下方完整课文不受影响。`;
  }
},
  listenReadPanel(d){
    const audio=this.hlsAudioPanel(d);
    return `
    <div class="read-only-window">
      ${audio}
      ${this.timedSentencePanel()}
      ${this.readPanel(d).replace('<h2>Read</h2>','').replace(/<button class="btn small mark-complete"[^>]*data-module="read"[^>]*>完成本模块<\/button>/,'')}
    </div>
    ${this.completeButton(d,'read')}`;
  },
  hlsAudioPanel(d){
    const url=d.ep.video?.hlsUrl;
    if(!url) return `<section class="listen-header"><span class="audio-icon">🎧</span><div><h3>Listen and Read</h3><p>本集暂未添加音频播放源，可先阅读下方原文。</p></div></section>`;
    const backupHls=d.ep.video?.backupHlsUrl || '',hls720=d.ep.video?.hls720Url || '',fallback=d.ep.video?.mp4Url || d.ep.video?.directUrl || '';
    const fallbacks=[...(hls720 && hls720!==url?[hls720]:[]),...(backupHls?[backupHls]:[])];
    return `<section class="listen-read-audio" aria-label="本集音频播放"><div class="listen-header"><span class="audio-icon">🎧</span><div><h3>Listen and Read</h3><p>播放本集原声，同时阅读下方英文文本；此处只播放音频，不显示视频。</p></div></div><div class="audio-player-card"><div class="audio-player-label">本集音频</div><audio class="hls-audio-player" controls preload="metadata" data-hls-src="${this.escapeHtml(url)}" data-hls-fallback-srcs="${this.escapeHtml(JSON.stringify(fallbacks))}" data-fallback-src="${this.escapeHtml(fallback)}">当前浏览器不支持音频播放。</audio><p class="muted audio-player-help" role="status" aria-live="polite"></p></div></section>`;
  },
  readPanel(d){
    const paras=(d.reading && d.reading.paragraphs) || [];
    if(!paras.length) return `<div class="empty">本集阅读内容暂未添加。</div>`;
    const vocabTerms=new Map();
    (d.vocab||[]).forEach((word,index)=>{
      const term=String(word.word||'').replace(/[（(].*$/, '').trim();
      if(term && /[A-Za-z]/.test(term)) vocabTerms.set(term.toLowerCase(), {term,index});
    });
    // A word is marked only on its first appearance in the full lesson.
    const shownTerms=new Set();
    const renderText=(text)=>{
      const terms=Array.from(vocabTerms.values()).sort((a,b)=>b.term.length-a.term.length);
      if(!terms.length) return this.escapeHtml(text || '');
      const escaped=terms.map(item=>item.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      const matcher=new RegExp(`\\b(${escaped.join('|')})\\b`, 'gi');
      const source=String(text || '');
      let html='', lastIndex=0, match;
      while((match=matcher.exec(source)) !== null){
        const item=vocabTerms.get(match[0].toLowerCase());
        html+=this.escapeHtml(source.slice(lastIndex, match.index));
        const key=item.term.toLowerCase();
        html+=shownTerms.has(key) ? this.escapeHtml(match[0]) : `<span class="reading-word" data-word-index="${item.index}">${this.escapeHtml(match[0])}</span>`;
        shownTerms.add(key);
        lastIndex=match.index + match[0].length;
      }
      return html + this.escapeHtml(source.slice(lastIndex));
    };
    return `${window.ReadDictionary.controls()}<div class="book-reader" data-dictionary-reader data-series="${this.escapeHtml(d.seriesId)}" data-episode="${d.episodeId}">
    ${paras.map((p)=>`<div class="read-paragraph"><div class="selectable-sentence">${renderText(p.text || p)}</div>${p.translation?`<div class="translation hidden-translation">${p.translation}</div>`:''}</div>`).join('')}
    </div>${this.completeButton(d,'read')}`;
  },
  escapeHtml(text){return String(text).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));},
  speakText(text){
    if(window.WordPronunciation)return window.WordPronunciation.speak(text);
    const value=String(text||'').trim();
    if(!value || !('speechSynthesis' in window) || !window.SpeechSynthesisUtterance) return false;
    const synth=window.speechSynthesis;
    try{
      if(synth.paused) synth.resume();
      synth.cancel();
      const u=new SpeechSynthesisUtterance(value);
      const voices=synth.getVoices ? synth.getVoices() : [];
      const voice=voices.find(v=>/^en-US$/i.test(v.lang)) || voices.find(v=>/^en/i.test(v.lang));
      if(voice){ u.voice=voice; u.lang=voice.lang; }
      else u.lang='en-US';
      u.rate=0.9;
      u.pitch=1;
      u.volume=1;
      this._speechUtterance=u;
      synth.speak(u);
      return true;
    }catch(err){
      console.warn('Speech playback failed:', err);
      return false;
    }
  },
  
wordsPanel(d){
  if(!d.vocab.length) return `<div class="empty">本集单词表暂未添加。</div>`;
  this.currentWordIndex = 0;
  return `<div class="words-view">
    <div class="word-card-area">
      <div class="word-progress" id="wordProgress">1 / ${d.vocab.length}</div>
      <div id="singleWordCard">${this.wordCard(d.vocab[0],d)}</div>
      <div class="word-nav">
        <button class="btn secondary" id="prevWord">← 上一个</button>
        <button class="btn secondary" id="nextWord">下一个 →</button>
      </div>
    </div>
    <div class="practice-box" id="wordPracticeBox">
      <h3>Typing Practice 拼写挑战</h3>
      <p class="muted">完成全部单词学习后，随机打乱本集全部单词进行拼写练习。</p>
      <div id="practiceProgress"></div>
      <div id="practiceClue"></div>
      <div class="letter-input-area" id="letterInputArea"></div>
      <input id="practiceInput" class="hidden-practice-input" autocomplete="off" aria-label="typing practice">
      <div class="practice-input-row">
        <button class="btn" id="checkPractice">检查</button>
        <button class="btn secondary" id="nextPractice" disabled>下一个</button>
      </div>
      <div id="practiceFeedback"></div>
    </div>
    ${this.completeButton(d,'words')}
  </div>`;
},

wordCard(w,d){
  const meaning=w.meaningZh || w.meaning || '中文释义待补充';
  const payload=encodeURIComponent(JSON.stringify({type:'word',seriesId:d.seriesId,episodeId:d.episodeId,word:w.word,meaning:w.meaningZh || w.meaning,example:w.example}));
  return `<article class="flip-card word-card" data-text="${(w.word+' '+(w.meaningZh||'')+' '+(w.definitionEn||'')).toLowerCase()}">
    <div class="flip-card-inner">
      <div class="flip-card-face flip-card-front">
        <div class="flash-label">English</div>
        <h3>${w.word} <button class="audio-btn speak-word" data-text="${w.word}" title="Play pronunciation" aria-label="Play pronunciation">🔊</button></h3>
        ${w.phonetic?`<div class="phonetic card-phonetic">${w.phonetic}</div>`:''}
        ${w.partOfSpeech?`<p class="muted">${w.partOfSpeech}</p>`:''}
        ${w.example?`<div class="example">${w.example}</div>`:(w.definitionEn?`<div class="example">${w.definitionEn}</div>`:'')}
        <div class="flip-hint">点击翻面</div>
      </div>
      <div class="flip-card-face flip-card-back">
        <div class="flash-label">中文</div>
        <div class="meaning">${this.escapeHtml(meaning)}</div>
        ${w.exampleZh?`<div class="example chinese-example">${w.exampleZh}</div>`:''}
        <p><button class="btn ghost small save-word" data-word="${payload}">加入单词表</button></p>
      </div>
    </div>
  </article>`;
},
phrasesPanel(d){
    if(!d.phrases.length) return `<div class="empty">本集短语正在整理。</div>`;
    const markPhrase=(sentence, phrase, highlight)=>{
      if(!sentence) return '';
      const target=(highlight || phrase || '').trim();
      if(!target) return sentence;
      const escaped=target.split(/\s+/).map(x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('\\s+');
      const reg=new RegExp('('+escaped+')','ig');
      return sentence.replace(reg,'<strong>$1</strong>');
    };
    return `<h2>Phrases</h2><div class="cards-grid">${d.phrases.map(p=>{
      const payload=encodeURIComponent(JSON.stringify({type:'phrase',seriesId:d.seriesId,episodeId:d.episodeId,word:p.phrase,meaning:p.meaningZh,example:p.example}));
      const example=markPhrase(p.example||'',p.phrase,p.highlight);
      return `<article class="mini-card"><h3>${p.phrase} <button class="audio-btn speak-word" data-text="${p.phrase}" title="朗读">🔊</button></h3><div class="meaning">${p.meaningZh || ''}</div>${example?`<div class="example">${example} <button class="audio-btn speak-word" data-text="${p.example}">🔊</button></div>`:''}<p><button class="btn ghost small save-word" data-word="${payload}">加入单词表</button></p></article>`
    }).join('')}</div>`;
  },
  grammarPanel(d){
    if(!d.grammar.length) return `<div class="empty">本集语法点正在整理。</div>`;
    return `<h2>Grammar</h2>${d.grammar.map(g=>`<div class="grammar-item"><h3>${g.titleZh || g.title}</h3><p>${g.explanationZh || ''}</p>${(g.examples||[]).map(ex=>`<div class="example"><strong>${ex.sentence}</strong>${ex.translation?`<div class="muted">${ex.translation}</div>`:''}<div class="muted">${ex.focus || ''}</div></div>`).join('')}</div>`).join('')}${this.completeButton(d,'grammar')}`;
  },
  quizPanel(d){
    const quiz=d.quiz;
    if(!quiz || !quiz.questions || !quiz.questions.length) return `<div class="empty">本集 Quiz 暂未添加。</div>`;
    return `<h2>${quiz.title || 'Quiz'}</h2><form id="quizForm">${quiz.questions.map((q,i)=>`<div class="quiz-question"><h3>${i+1}. ${q.question}</h3><div class="quiz-options">${this.shuffleQuizOptions(q.options||[]).map((o,index)=>`<label><input type="radio" name="q${i}" value="${o.key}"><span><strong>${String.fromCharCode(65+index)}.</strong> ${o.text}</span></label>`).join('')}</div><div class="muted quiz-explain" id="explain-${i}" style="display:none;margin-top:8px">${q.explanation || ''}</div></div>`).join('')}<button class="btn" type="submit">提交答案</button> ${this.completeButton(d,'quiz')}<div id="quizResult"></div></form>`;
  },
  shuffleQuizOptions(options){
    const shuffled=[...options];
    for(let i=shuffled.length-1;i>0;i--){
      const j=Math.floor(Math.random()*(i+1));
      [shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];
    }
    return shuffled;
  },
  reviewPanel(d){
    const r=d.review || {};
    return `<h2>Review</h2><div class="review-block"><div class="review-box"><h3>一分钟复习</h3><p>${r.summaryZh || '本集复习内容正在整理。'}</p><p class="muted">${r.summaryEn || ''}</p></div><div class="review-box"><h3>Key Words</h3><div class="pill-row">${(r.keyWords||[]).map(x=>`<span class="pill">${x}</span>`).join('')}</div><h3>Key Phrases</h3><div class="pill-row">${(r.keyPhrases||[]).map(x=>`<span class="pill">${x}</span>`).join('')}</div></div></div><div class="review-box" style="margin-top:16px"><h3>Key Sentences</h3>${(r.keySentences||[]).map(s=>`<p><strong>${s.sentence}</strong>${s.translation?`<br><span class="muted">${s.translation}</span>`:''}</p>`).join('')}</div>${this.completeButton(d,'review')}`;
  },
  
bindLessonPanel(tab,d,root=document){
  if(tab==='games') EpisodeGames.bind(root,d);
  window.MediaShelf?.bindLesson(root===document?document.getElementById('lessonPanel')||root:root,d);
  window.SFMedals?.attach(this,'episode:'+d.seriesId+':'+d.episodeId,root===document?document.getElementById('lessonPanel'):root);
  root.querySelectorAll('.hls-video-player').forEach(player=>{this.initializeHlsVideo(player);this.bindSubtitleOverlay(player,d);});
  this.applySubtitlePreferences(root);
  this.bindSubtitleControls(root);
  document.querySelectorAll('.hls-audio-player').forEach(player=>this.initializeHlsAudio(player));
  if(tab==='listenRead')this.bindTimedSentenceStudy(root,d);
  document.querySelectorAll('.mark-complete').forEach(btn=>btn.addEventListener('click', e=>{e.preventDefault(); this.markComplete(btn.dataset.series, btn.dataset.episode, btn.dataset.module); btn.textContent='已完成 ✓';}));
  document.querySelectorAll('.open-direct-video').forEach(btn=>btn.addEventListener('click',()=>{this.activeLessonTab='directVideo'; this.renderLesson(d.seriesId,d.episodeId);}));
  document.querySelectorAll('.open-bilibili-video').forEach(btn=>btn.addEventListener('click',()=>{this.activeLessonTab='watch'; this.renderLesson(d.seriesId,d.episodeId);}));
  root.querySelectorAll('.hls-source-select').forEach(select=>select.addEventListener('change',()=>{
    const player=select.closest('.direct-video-panel')?.querySelector('.hls-video-player');
    if(!player) return;
    const is720=select.value==='720', isKorea=select.value==='korea';
    const source=is720?select.dataset.hls720:(isKorea?select.dataset.hlsKorea:select.dataset.hls1080);
    const fallbacks=is720?[select.dataset.hlsKorea]:isKorea?[]:[select.dataset.hls720,select.dataset.hlsKorea];
    this.switchHlsSource(player,source,fallbacks.filter(Boolean));
  }));
  document.querySelectorAll('.local-video-panel').forEach(panel=>{
    if(panel.dataset.bound) return;
    panel.dataset.bound='1';
    const seriesId=panel.dataset.series;
    const episodeId=panel.dataset.episode;
    const input=panel.querySelector('.local-video-input');
    const status=panel.querySelector('.local-video-status');
    const remove=panel.querySelector('.local-video-remove');
    const play=panel.querySelector('.local-video-play');
    this.getLocalVideo(seriesId,episodeId).then(entry=>{
      if(entry) this.showLocalVideo(panel,entry);
      else status.textContent='还没有为这一课保存本地视频。';
    }).catch(err=>{status.textContent=`本地视频不可用：${err.message}`;});
    input.addEventListener('change',async()=>{
      const file=input.files && input.files[0];
      if(!file) return;
      status.textContent='正在保存视频，请勿关闭页面…';
      try{
        const entry=await this.saveLocalVideo(seriesId,episodeId,file);
        this.showLocalVideo(panel,entry);
      }catch(err){
        status.textContent=`保存失败：${err.message}`;
      }finally{input.value='';}
    });
    play.addEventListener('click',async()=>{
      const player=panel.querySelector('.local-video-player');
      try{
        await player.play();
      }catch(err){
        status.textContent='暂时无法播放该文件。请确认视频格式为浏览器支持的 MP4（H.264/AAC）或 WebM。';
      }
    });
    const localPlayer=panel.querySelector('.local-video-player');
    localPlayer.addEventListener('loadedmetadata',()=>{
      status.textContent='本地视频已载入，可使用下方的原生播放、暂停、进度和音量控件。';
    });
    localPlayer.addEventListener('error',()=>{
      status.textContent='该视频格式无法在当前浏览器播放。请使用 MP4（H.264/AAC）或 WebM 格式。';
    });
    remove.addEventListener('click',async()=>{
      try{
        await this.removeLocalVideo(seriesId,episodeId);
        if(panel._localVideoUrl) URL.revokeObjectURL(panel._localVideoUrl);
        panel._localVideoUrl='';
        const player=panel.querySelector('.local-video-player');
        player.pause(); player.removeAttribute('src'); player.load(); player.hidden=true;
        panel.querySelector('.local-video-empty').hidden=false;
        remove.hidden=true;
        play.disabled=true;
        status.textContent='已删除这一课保存的本地视频。';
      }catch(err){status.textContent=`删除失败：${err.message}`;}
    });
  });
  document.querySelectorAll('.save-word').forEach(btn=>btn.addEventListener('click',()=>{this.saveWord(JSON.parse(decodeURIComponent(btn.dataset.word))); btn.textContent='已加入 ✓';}));
  document.querySelectorAll('.save-sentence').forEach(btn=>btn.addEventListener('click',()=>{this.saveSentence({seriesId:d.seriesId,episodeId:d.episodeId,sentence:decodeURIComponent(btn.dataset.sentence)}); btn.textContent='已收藏 ✓';}));
  const filter=document.getElementById('lessonWordFilter');
  if(filter){
    filter.addEventListener('input',()=>{const q=filter.value.toLowerCase();document.querySelectorAll('.word-card').forEach(c=>c.style.display=c.dataset.text.includes(q)?'block':'none')});
    document.getElementById('clearWordFilter').addEventListener('click',()=>{filter.value='';document.querySelectorAll('.word-card').forEach(c=>c.style.display='block')});
  }
  document.querySelectorAll('.speak-word').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation(); this.speakText(btn.dataset.text);}));
  document.querySelectorAll('.reading-word').forEach(span=>{
    const showTip=()=>{
      const w=d.vocab[Number(span.dataset.wordIndex)];
      const pop=document.getElementById('readingPopup'); const hint=span.closest('.floating-window')?.querySelector('.read-header-hint');
      const reader=span.closest('.book-reader') || span.closest('.read-content') || span.parentElement;
      if(pop && w && reader){
        const meaning=w.meaningZh || w.meaning || '中文释义待补充';
        const content=`<span class="popup-word">${this.escapeHtml(w.word)}</span><span class="popup-meaning">${this.escapeHtml(meaning)}</span>`; if(hint){hint.innerHTML=content; hint.style.display='inline-flex';} if(pop) pop.innerHTML=content;
        pop.style.display='block';
        const r=span.getBoundingClientRect();
        const cr=reader.getBoundingClientRect();
        const pw=pop.offsetWidth || 0;
        const ph=pop.offsetHeight || 0;
        let left=r.left-cr.left+(r.width/2)-(pw/2);
        let top=r.top-cr.top-ph-8;
        if(top<8){ top=r.bottom-cr.top+8; }
        if(left<8){ left=8; }
        if(left+pw>reader.clientWidth-8){ left=reader.clientWidth-pw-8; }
        pop.style.position='absolute';
        pop.style.left=left+'px';
        pop.style.top=top+'px';
      }
    };
    span.addEventListener('mouseenter',showTip);
    span.addEventListener('mouseleave',()=>{
      const pop=document.getElementById('readingPopup'); const hint=document.querySelector('.read-window-hint');
      if(pop) pop.style.display='none'; if(hint) hint.style.display='none';
    });
    span.addEventListener('click',showTip);
  });
  document.querySelectorAll('.selectable-sentence').forEach(el=>el.addEventListener('mouseup',()=>{
    const selection=window.getSelection().toString().trim();
    if(selection && selection.length>5){
      const box=document.getElementById('sentenceAction');
      if(box){
        box.innerHTML=`<button class="btn small save-selected-sentence">⭐ 收藏句子</button><button class="btn secondary small speak-selected-sentence">🔊 朗读</button>`;
        box.style.display='flex';
        box.querySelector('.save-selected-sentence').onclick=()=>{this.saveSentence({seriesId:d.seriesId,episodeId:d.episodeId,sentence:selection});};
        box.querySelector('.speak-selected-sentence').onclick=()=>this.speakText(selection);
      }
    }
  }));
  document.querySelectorAll('.flip-card').forEach(card=>card.addEventListener('click',e=>{if(e.target.closest('button')) return; card.classList.toggle('flipped');}));
  if(tab==='words' && d.vocab && d.vocab.length){
    this.initWordCardNav(d.vocab,d);
    this.initWordPractice(d.vocab, d.seriesId, d.episodeId);
  }
  const form=root.querySelector('#quizForm');
  if(form){
    form.addEventListener('submit', e=>{
      e.preventDefault();
      let score=0; const qs=d.quiz.questions;
      qs.forEach((q,i)=>{const ans=(new FormData(form)).get('q'+i); if(ans===q.answer) score++; const ex=form.querySelector('#explain-'+i); if(ex) ex.style.display='block';});
      const result=form.querySelector('#quizResult');
      result.innerHTML=`<div class="quiz-result">得分：${score}/${qs.length}</div>`;
      const answers=Object.fromEntries(qs.map((q,i)=>[q.id,(new FormData(form)).get('q'+i)]));
      this.saveQuizScore(d.seriesId,d.episodeId,score,qs.length,answers);
      this.markComplete(d.seriesId,d.episodeId,'quiz');
      if(score/qs.length>=0.8) this.unlockNextEpisode(d.seriesId,d.episodeId,result);
    });
  }
},
initWordCardNav(words,d){
  const show=(index)=>{
    this.currentWordIndex=index;
    document.getElementById('singleWordCard').innerHTML=this.wordCard(words[index],d);
    document.getElementById('wordProgress').textContent=`${index+1} / ${words.length}`;
    document.getElementById('prevWord').disabled=index===0;
    document.getElementById('nextWord').disabled=index===words.length-1;
    document.querySelectorAll('.flip-card').forEach(card=>card.addEventListener('click',e=>{
      if(e.target.closest('button')) return;
      card.classList.toggle('flipped');
    }));
    document.querySelectorAll('.speak-word').forEach(btn=>btn.onclick=(e)=>{e.stopPropagation();this.speakText(btn.dataset.text);});
  };
  document.getElementById('prevWord').onclick=()=>{if(this.currentWordIndex>0)show(--this.currentWordIndex);};
  document.getElementById('nextWord').onclick=()=>{if(this.currentWordIndex<words.length-1)show(++this.currentWordIndex);};
  show(0);
},

initWordPractice(words, seriesId, episodeId){
  const shuffled=words.slice().sort(()=>Math.random()-0.5);
  this.wordPractice={words:shuffled,index:0,checked:false,seriesId,episodeId};
  const input=document.getElementById('practiceInput');
  const checkBtn=document.getElementById('checkPractice');
  const nextBtn=document.getElementById('nextPractice');
  if(!input||!checkBtn||!nextBtn)return;
  input.value='';
  input.disabled=false;
  this.renderWordPractice();
  checkBtn.onclick=()=>this.checkWordPractice();
  nextBtn.onclick=()=>this.nextWordPractice();
  input.oninput=()=>{
    const area=document.getElementById('letterInputArea');
    if(area){
      [...area.children].forEach((box,i)=>box.textContent=input.value[i]||'');
    }
  };
  input.onkeydown=e=>{
    if(/^[a-zA-Z]$/.test(e.key)){
      // Allow letters to enter the hidden input so the letter boxes update.
      // Keep input length limited to the current word length.
      const item=this.wordPractice && this.wordPractice.words[this.wordPractice.index];
      if(item && input.value.length >= item.word.length){
        e.preventDefault();
      }
    }
    if(e.key==='Backspace'){
      return;
    }
    if(e.key==='Enter'){this.wordPractice.checked?this.nextWordPractice():this.checkWordPractice();}
  };
  const area=document.getElementById('letterInputArea');
  if(area){
    area.onclick=()=>input.focus();
  }
  setTimeout(()=>input.focus(),100);
},

renderWordPractice(){
  const state=this.wordPractice;
  if(!state) return;
  const item=state.words[state.index];
  if(!item) return;
  document.getElementById('practiceProgress').textContent=`${state.index+1}/${state.words.length}`;
  const clue=document.getElementById('practiceClue');
  clue.innerHTML=`<div class="dictation-clue"><button type="button" class="practice-listen-btn" id="practiceSpeak" title="播放单词发音" aria-label="播放单词发音">🔊 <span>听</span></button>${item.phonetic ? `<span class="phonetic">${item.phonetic}</span>` : ''}<span class="practice-meaning">${item.meaningZh || item.meaning || '—'}</span></div>`;
  const speakBtn=document.getElementById('practiceSpeak');
  if(speakBtn){
    speakBtn.addEventListener('click', e=>{
      e.preventDefault();
      e.stopPropagation();
      this.speakText(item.word);
    });
  }
  document.getElementById('practiceFeedback').innerHTML='';
  this.practiceLetters = [];
  const area=document.getElementById('letterInputArea');
  if(area){
    area.innerHTML=String(item.word||'').split('').map(()=>'<span class="letter-box"></span>').join('');
  }
  const input=document.getElementById('practiceInput');
  if(input){ input.value=''; input.disabled=false; setTimeout(()=>input.focus(),50); }
  document.getElementById('checkPractice').disabled=false;
  document.getElementById('nextPractice').disabled=false;
  document.getElementById('nextPractice').textContent='跳过 / 下一个';
  state.checked=false;
},
checkWordPractice(){
  const state=this.wordPractice;
  if(!state || state.checked) return;
  const item=state.words[state.index];
  const input=document.getElementById('practiceInput');
  const value=(input.value || '').trim().toLowerCase();
  const answer=(item.word || '').trim().toLowerCase();
  const fb=document.getElementById('practiceFeedback');
  if(!value){
    fb.innerHTML=`<div class="practice-result fail">请先听发音并输入英文单词。</div>`;
    input.focus();
    return;
  }
  if(value!==answer){
    fb.innerHTML=`<div class="practice-result fail">拼写不正确，请再听一次并重新拼写。</div>`;
    input.focus();
    input.select();
    return;
  }
  fb.innerHTML=`<div class="practice-result success">拼写正确！ +5 ⭐</div>`;
  this.recordTypingCorrect(state.seriesId,state.episodeId,item.word);
  this.addPoints(5);
  state.checked=true;
  input.disabled=true;
  document.getElementById('checkPractice').disabled=true;
  document.getElementById('nextPractice').disabled=false;
  if(state.index===state.words.length-1){
    document.getElementById('nextPractice').textContent='完成练习';
  }
},
nextWordPractice(){
  const state=this.wordPractice;
  if(!state) return;
  if(state.index < state.words.length-1){
    state.index += 1;
    document.getElementById('nextPractice').textContent='下一个';
    this.renderWordPractice();
    document.getElementById('practiceInput').focus();
  }else{
    document.getElementById('practiceFeedback').innerHTML=`<div class="practice-result success">本轮单词练习完成，共 ${state.words.length} 个单词。你可以重新刷新页面再练一次，或者点击下方卡片翻面复习。</div>`;
    document.getElementById('nextPractice').disabled=true;
    this.markComplete(state.seriesId, state.episodeId, 'words');
  }
},
updateUtilityNav(){
    EpisodeGames.refreshAll();
    const nav=document.getElementById('navRewards');
    if(!nav) return;
    const points=this.getPoints();
    nav.innerHTML=`🎁 积分奖励 <span class="nav-points-badge">${points}</span>`;
    nav.setAttribute('title', `当前可用积分：${points}`);
  },
  renderRewards(){
    const points=this.getPoints();
    const rules=[
      {points:10,reward:'获得一张小贴纸或一次口头表扬'},
      {points:30,reward:'获得一次零食/饮料小奖励'},
      {points:60,reward:'获得一次自由选故事时间或10分钟额外娱乐时间'},
      {points:100,reward:'获得一本小礼物书或一次亲子活动奖励'},
      {points:200,reward:'获得一次阶段大奖，可由家长自定义'}
    ];
    const next=rules.find(r=>points<r.points);
    this.el().innerHTML=`<section class="rewards-page"><header class="center-page-heading"><h1>积分奖励</h1><p>每一次练习，都在积累进步。</p></header><div class="rewards-balance"><div><span>可用积分</span><strong>${points}<small>分</small></strong><p>登录后可跨设备同步</p></div><div class="rewards-next"><span>${next?'下一档奖励':'奖励里程碑'}</span><h2>${next?next.reward:'已达到全部参考档位'}</h2><p>${next?'还差 '+(next.points-points)+' 分，目标 '+next.points+' 分':'继续练习，积累更多进步。'}</p><progress value="${next?Math.min(points,next.points):1}" max="${next?next.points:1}" aria-label="下一档奖励进度"></progress></div></div><div class="rewards-points-rules"><div><b>＋5</b><span>拼写挑战答对 1 个单词</span></div><div><b>−2</b><span>开始或重玩 1 局 Games</span></div></div><section class="rewards-reference"><h2>家庭奖励参考</h2><div class="rewards-list">${rules.map((rule,i)=>`<article class="rewards-row ${points>=rule.points?'reached':''}"><span class="rewards-gift" aria-hidden="true">${['🌟','🍎','🎈','📚','🏆'][i]}</span><div><strong>${rule.reward}</strong><small>${rule.points} 积分</small></div><span class="rewards-tier">${points>=rule.points?'✓ 已达到':'还差 '+(rule.points-points)+' 分'}</span></article>`).join('')}</div><p class="center-page-note">以上为家庭奖励参考，具体奖励由家长安排。游戏积分不足时不能开始。</p></section></section>`;
  },
recordTypingCorrect(seriesId,episodeId,word){
    const progress=this.storage('progress')||{},key=`${seriesId}:${episodeId}`,spelling=String(word||'').trim().toLowerCase();
    if(!spelling)return;
    const entry=progress[key]||{seriesId,episodeId:Number(episodeId),modules:{}};
    entry.typingCorrect={...(entry.typingCorrect||{}),[spelling]:true};entry.updatedAt=new Date().toISOString();progress[key]=entry;
    this.storage('progress',progress);
    EpisodeGames.refreshAll();
  },
addPoints(n=1){
    const key=window.SFCloud?.storageKey('points')||'sf_points';
    const p=(Number(localStorage.getItem(key))||0)+Number(n);
    localStorage.setItem(key,String(Math.max(0,p)));
    window.SFCloud?.schedule();
    this.updateUtilityNav();
  },
  getPoints(){
    const key=window.SFCloud?.storageKey('points')||'sf_points';
    return Math.max(0,Number(localStorage.getItem(key))||0);
  },
  storage(key, val){
    const k=window.SFCloud?.storageKey(key)||'sf_'+key;
    if(val===undefined){try{return JSON.parse(localStorage.getItem(k)||'null')}catch(e){return null}}
    localStorage.setItem(k, JSON.stringify(val));
    window.SFCloud?.schedule();
  },

  rememberEpisode(seriesId,episodeId){
    // Keep the view per account without queuing a cloud progress sync.
    const selections=this.storage('selectedEpisodes') || {};
    selections[seriesId]=Number(episodeId);
    const key=window.SFCloud?.storageKey('selectedEpisodes') || 'sf_selectedEpisodes';
    localStorage.setItem(key,JSON.stringify(selections));
  },

  isAdmin(){return window.SFCloud?.isAdmin?.()===true;},
  isGuest(){
    return !window.SFCloud?.user;
  },
  isGuestRestrictedLevel(level){
    return this.isGuest() && Number(level)>3;
  },
  isGuestEpisodeLimit(seriesId, episodeId){
    // Visitors may try the first three episodes in every animation series.
    // Movie Classroom does not use this lesson flow.
    return this.isGuest() && Number(episodeId)>3;
  },
  canAccessEpisode(seriesId, episodeId){
    if(this.isAdmin())return true;
    if(window.SFFamily?.canAccessLesson(seriesId,episodeId))return true;
    // The trial episodes are intentionally available without a quiz or account.
    // Once signed in, the existing level-based quiz-unlock rules take over.
    if(this.isGuest() && Number(episodeId)<=3) return true;
    return this.isEpisodeUnlocked(seriesId, episodeId);
  },
  guestEpisodeGate(seriesId, ep, series=null){
    const back=series ? `<a class="btn secondary" href="#/series/${this.escapeHtml(seriesId)}">返回课程列表</a>` : '';
    return `<div class="empty guest-episode-gate"><h2>🔒 注册后继续学习</h2><p>游客可免费学习本系列前 3 集。注册或登录后，即可继续完成 Quiz，按学习进度解锁后续课程。</p><button class="btn" type="button" data-guest-register>注册 / 登录继续学习</button>${back}</div>`;
  },
  guestLevelGate(){
    return `<div class="empty guest-episode-gate"><h2>🔒 注册后解锁更多分级</h2><p>游客可浏览并学习 Level 0–3。注册或登录后，即可查看 Level 4–9 的全部动画故事，并继续按 Quiz 学习进度解锁课程。</p><button class="btn" type="button" data-guest-register>注册 / 登录查看全部内容</button><p><a class="btn secondary" href="#/home">返回动画故事</a></p></div>`;
  },
  bindGuestEpisodeGate(){
    document.querySelector('[data-guest-register]')?.addEventListener('click',()=>window.SFCloud?.open());
  },

  requiresQuizUnlock(seriesId){
    // Every learning entry loads series.json before checking access.
    const level=Number(this.cache[`data/${seriesId}/series.json`]?.level);
    return !Number.isFinite(level) || level>=3;
  },
  isEpisodeUnlocked(seriesId, episodeId){
    if(this.isAdmin())return true;
    if(!this.requiresQuizUnlock(seriesId)) return true;
    const id=Number(episodeId);
    if(id<=1) return true;
    const p=this.storage('progress') || {};
    const prev=p[`${seriesId}:${id-1}`];
    const q=this.storage('quizScores') || {};
    const quiz=q[`${seriesId}:${id-1}`];
    return !!(prev && prev.modules && prev.modules.quiz && quiz && Number(quiz.total)>0 && Number(quiz.score)/Number(quiz.total)>=0.8);
  },
  episodeProgress(seriesId, episodeId){
    const p=this.storage('progress') || {};
    const item=p[`${seriesId}:${episodeId}`] || {modules:{}};
    const q=this.storage('quizScores') || {};
    const quiz=q[`${seriesId}:${episodeId}`];
    return {modules:item.modules||{}, quiz};
  },
  markComplete(seriesId, episodeId, module){
    const p=this.storage('progress') || {};
    const key=`${seriesId}:${episodeId}`;
    if(!p[key]) p[key]={seriesId, episodeId:Number(episodeId), modules:{}, updatedAt:new Date().toISOString()};
    p[key].modules[module]=true; p[key].updatedAt=new Date().toISOString();
    if(module!=='quiz')window.SFFamily?.record(seriesId,episodeId,module);
    this.storage('progress',p);
    window.SFMedals?.lessonCompleted(seriesId,episodeId,module);
    const today=new Date();const ds=[today.getFullYear(),String(today.getMonth()+1).padStart(2,'0'),String(today.getDate()).padStart(2,'0')].join('-');
    const dates=new Set(this.storage('checkins')||[]);dates.add(ds);this.storage('checkins',[...dates].sort());
  },
  saveQuizScore(seriesId, episodeId, score, total, answers){
    if(answers)window.SFFamily?.record(seriesId,episodeId,'quiz',answers);
    const q=this.storage('quizScores') || {}, key=`${seriesId}:${episodeId}`, old=q[key];
    if(old && Number(old.total)>0 && Number(old.score)/Number(old.total)>Number(score)/Number(total)) return;
    q[key]={score,total,date:new Date().toISOString()}; this.storage('quizScores',q);
  },
  unlockNextEpisode(seriesId, episodeId, result){
    const [page,currentSeries]=this.route();
    if(page==='series' && currentSeries===seriesId && this.episodeListRefresh?.seriesId===seriesId){
      this.episodeListRefresh.render();
    }
    if(result) result.insertAdjacentHTML('beforeend',this.requiresQuizUnlock(seriesId)?'<p>🎉 已通过！后续已发布课程将按顺序解锁。</p>':'<p>🎉 已通过！本系列可自由选择已发布课程。</p>');
  },
  saveWord(item){
    const arr=this.storage('wordbank') || []; const id=item.sourceId&&['book','magazine'].includes(item.sourceType)?`${item.type}:${item.sourceType}:${item.sourceId}:${item.page||0}:${item.word}`:`${item.type}:${item.seriesId}:${item.episodeId}:${item.word}`;
    const index=arr.findIndex(x=>x.id===id),now=new Date().toISOString();if(index<0)arr.push({...item,id,date:now,updatedAt:now});else if(arr[index].deletedAt){arr[index]={...arr[index],...item,updatedAt:now};delete arr[index].deletedAt;}this.storage('wordbank',arr);
  },
  saveSentence(item){
    const arr=this.storage('sentences') || []; const id=item.sourceId&&['book','magazine'].includes(item.sourceType)?`${item.sourceType}:${item.sourceId}:${item.page||0}:${item.sentence}`:`${item.seriesId}:${item.episodeId}:${item.sentence.slice(0,40)}`;
    const index=arr.findIndex(x=>x.id===id),now=new Date().toISOString();if(index<0)arr.push({...item,id,date:now,updatedAt:now});else if(arr[index].deletedAt){arr[index]={...arr[index],...item,updatedAt:now};delete arr[index].deletedAt;}this.storage('sentences',arr);
  },
  async renderRecords(){
    const p=this.storage('progress') || {}; const q=this.storage('quizScores') || {};
    const rows=Object.values(p).sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt));
    this.el().innerHTML=`<section class="hero"><div><h1>学习记录</h1><p>登录后学习记录会同步到云端，可在其他设备使用同一账户继续学习；游客记录只保存在当前设备。</p></div></section><div class="personal-grid"><div class="personal-card"><h3>已学习课程</h3><p style="font-size:34px;font-weight:900">${rows.length}</p></div><div class="personal-card"><h3>单词收藏</h3><p style="font-size:34px;font-weight:900">${(this.storage('wordbank')||[]).length}</p></div><div class="personal-card"><h3>句子收藏</h3><p style="font-size:34px;font-weight:900">${(this.storage('sentences')||[]).length}</p></div><div class="personal-card"><h3>累计积分</h3><p style="font-size:34px;font-weight:900">${this.getPoints()}</p></div></div><div class="content-panel" style="margin-top:16px"><h2>最近学习</h2>${rows.length?rows.map(r=>`<p><strong>${r.seriesId}</strong> Episode ${r.episodeId} · ${Object.keys(r.modules).join(', ')} · ${(r.updatedAt||'').slice(0,10)} ${q[`${r.seriesId}:${r.episodeId}`]?`· Quiz ${q[`${r.seriesId}:${r.episodeId}`].score}/${q[`${r.seriesId}:${r.episodeId}`].total}`:''}</p>`).join(''):'<div class="empty">还没有学习记录。</div>'}</div>`;
  },
  renderCheckin(selectedMonth=''){
    const key=date=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`,now=new Date(),today=key(now),currentMonth=today.slice(0,7);
    const valid=value=>{if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value>today||Number(value.slice(0,4))<2000)return false;const date=new Date(value+'T12:00:00');return Number.isFinite(date.getTime())&&key(date)===value;};
    const dates=new Set((this.storage('checkins')||[]).filter(valid));
    for(const row of Object.values(this.storage('progress')||{})){const date=new Date(row.updatedAt);if(Number.isFinite(date.getTime())){const value=key(date);if(valid(value))dates.add(value);}}
    const sorted=[...dates].sort(),earliest=sorted[0]?.slice(0,7)||currentMonth;
    const month=/^\d{4}-(0[1-9]|1[0-2])$/.test(selectedMonth)?(selectedMonth<earliest?earliest:selectedMonth>currentMonth?currentMonth:selectedMonth):currentMonth;
    const [year,m]=month.split('-').map(Number),first=new Date(year,m-1,1),days=new Date(year,m,0).getDate(),offset=(first.getDay()+6)%7,monthCount=sorted.filter(date=>date.startsWith(month)).length;
    const counts=new Map();for(const date of sorted){const name=date.slice(0,7);counts.set(name,(counts.get(name)||0)+1);}
    let streak=0,cursor=new Date(now.getFullYear(),now.getMonth(),now.getDate(),12);if(!dates.has(today))cursor.setDate(cursor.getDate()-1);while(dates.has(key(cursor))){streak++;cursor.setDate(cursor.getDate()-1);}
    let cells='<span class="checkin-blank" aria-hidden="true"></span>'.repeat(offset);
    for(let day=1;day<=days;day++){const value=month+'-'+String(day).padStart(2,'0'),done=dates.has(value),isToday=value===today;cells+=`<div class="checkin-day ${done?'done':''} ${isToday?'today':''} ${value>today?'future':''}" ${isToday?'aria-current="date"':''} aria-label="${year}年${m}月${day}日${done?'已签到':'未签到'}"><span>${day}</span><small>${done?'✓':isToday?'今天':''}</small></div>`;}
    cells+='<span class="checkin-blank" aria-hidden="true"></span>'.repeat((7-(offset+days)%7)%7);
    this.el().innerHTML=`<section class="checkin-page"><header class="checkin-heading"><div><h1>签到</h1><p>完成任意学习模块，记录每天的进步。</p></div><span class="checkin-today-status ${dates.has(today)?'done':''}">${dates.has(today)?'✓ 今日已签到':'今日待签到'}</span></header><div class="checkin-stats"><div><strong>${dates.size}</strong><span>累计签到 / 天</span></div><div><strong>${monthCount}</strong><span>${m}月签到 / 天</span></div><div><strong>${streak}</strong><span>最近连续 / 天</span></div></div><div class="checkin-calendar-card"><div class="checkin-month-nav"><button type="button" id="checkinPrevious" aria-label="上个月" ${month<=earliest?'disabled':''}>‹</button><label><input id="checkinMonth" type="month" min="${earliest}" max="${currentMonth}" value="${month}" aria-label="查看签到月份"></label><button type="button" id="checkinNext" aria-label="下个月" ${month>=currentMonth?'disabled':''}>›</button><button type="button" id="checkinCurrent" ${month===currentMonth?'disabled':''}>本月</button></div><div class="checkin-calendar">${['一','二','三','四','五','六','日'].map((name,i)=>`<span class="checkin-weekday ${i>4?'weekend':''}">${name}</span>`).join('')}${cells}</div><p class="checkin-legend"><span>● 已签到</span><span>边框标记今天</span></p></div><section class="checkin-history"><h2>历史签到</h2>${counts.size?`<div class="checkin-history-months">${[...counts].reverse().map(([name,count])=>`<button type="button" data-checkin-month="${name}" ${name===month?'aria-current="true"':''}><span>${name.replace('-','年')}月</span><strong>${count} 天</strong></button>`).join('')}</div>`:'<p class="muted">完成学习后，签到记录会显示在这里。</p>'}<p class="checkin-history-note">可切换月份查看已保存的签到记录。</p></section></section>`;
    const move=delta=>this.renderCheckin(key(new Date(year,m-1+delta,1,12)).slice(0,7));
    this.el().querySelector('#checkinPrevious').onclick=()=>move(-1);this.el().querySelector('#checkinNext').onclick=()=>move(1);this.el().querySelector('#checkinCurrent').onclick=()=>this.renderCheckin();
    this.el().querySelector('#checkinMonth').onchange=event=>this.renderCheckin(event.target.value);this.el().querySelectorAll('[data-checkin-month]').forEach(button=>button.onclick=()=>this.renderCheckin(button.dataset.checkinMonth));
  },
  async renderBookshelf(){
    const all=await this.getJSON('data/series-list.json'); const list=this.isGuest()?all.filter(s=>!this.isGuestRestrictedLevel(s.level)):all; const p=this.storage('progress') || {};
    this.el().innerHTML=`<section class="hero"><div><h1>书架</h1><p>这里收集正在学习和已经学过的故事系列。</p></div></section><div class="series-grid">${list.map(s=>{const done=Object.values(p).filter(x=>x.seriesId===s.seriesId).length;return `<article class="series-card"><img class="cover" src="${s.cover}" alt=""><div class="series-info"><h3>${s.title}</h3><div class="zh">${s.titleZh||''}</div><p>学习进度：${done}/${s.episodeCount || 0}</p><div class="progress-bar"><span style="width:${s.episodeCount?Math.min(100,done/s.episodeCount*100):0}%"></span></div><p><a class="btn small" href="#/series/${s.seriesId}">进入系列</a></p></div></article>`}).join('')}</div>`;
  },
  renderWordbank(){return this.renderStudyCollection('wordbank');},
  renderWriting(){return this.renderStudyCollection('sentences');},
  async renderStudyCollection(kind){
    const route=location.hash,uid=window.SFCloud?.user?.id,word=kind==='wordbank',e=value=>this.escapeHtml(String(value||''));
    const series=await this.getJSON('data/series-list.json');if(route!==location.hash||uid!==window.SFCloud?.user?.id)return;
    const titles=new Map(series.map(row=>[row.seriesId,row.titleZh||row.title])),labels={animation:'动画故事',movie:'光影课堂',book:'绘本',magazine:'期刊'};
    this.el().innerHTML=window.MediaShelf.nav('animation',word?'wordbank':'writing')+`<section class="study-collection"><h1>${word?'单词表':'英文写作'}</h1><p class="muted">${word?'收藏喜欢的单词和短语':'整理收藏的英文句子'}，支持动画、绘本和期刊来源。</p><div class="study-collection-filters"><input id="studyCollectionSearch" type="search" placeholder="${word?'搜索单词、释义或来源':'搜索句子、译文或来源'}"><select id="studyCollectionSource" aria-label="来源"><option value="">全部来源</option>${Object.entries(labels).map(([key,label])=>`<option value="${key}">${label}</option>`).join('')}</select><select id="studyCollectionCategory" aria-label="我的分类"></select></div><p id="studyCollectionCount" class="muted"></p><div id="studyCollectionItems" class="cards-grid"></div></section>`;
    const host=this.el(),search=host.querySelector('#studyCollectionSearch'),sourceFilter=host.querySelector('#studyCollectionSource'),categoryFilter=host.querySelector('#studyCollectionCategory');
    const draw=()=>{
      const rows=this.storage(kind)||[],selected=categoryFilter.value,categories=[...new Set(rows.filter(row=>!row.deletedAt).map(row=>row.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'zh-CN'));
      categoryFilter.innerHTML='<option value="">全部分类</option><option value="__uncategorized">未分类</option>'+categories.map(name=>`<option value="${e(name)}">${e(name)}</option>`).join('');if([...categoryFilter.options].some(option=>option.value===selected))categoryFilter.value=selected;
      const query=search.value.trim().toLowerCase();
      const filtered=rows.map((row,index)=>{const type=row.sourceType||(String(row.seriesId||'').startsWith('movie-')?'movie':'animation'),title=row.sourceTitle||titles.get(row.seriesId)||row.seriesId||labels[type]||'收藏',href=row.sourceHref||(row.seriesId&&row.episodeId?`#/lesson/${encodeURIComponent(row.seriesId)}/${Number(row.episodeId)}`:'');return {row,index,type,title,href};}).filter(({row,type,title})=>!row.deletedAt&&(!sourceFilter.value||type===sourceFilter.value)&&(!categoryFilter.value||(categoryFilter.value==='__uncategorized'?!row.category:row.category===categoryFilter.value))&&(!query||[row.word,row.meaning,row.sentence,row.translation,title,row.category].join(' ').toLowerCase().includes(query))).reverse();
      host.querySelector('#studyCollectionCount').textContent=`${filtered.length} ${word?'条单词 / 短语':'条句子'}`;
      host.querySelector('#studyCollectionItems').innerHTML=filtered.map(({row,index,type,title,href})=>`<article class="mini-card study-collection-card"><${word?'h3':'p'}>${e(word?row.word:row.sentence)}</${word?'h3':'p'}>${row.meaning||row.translation?`<div class="meaning">${e(row.meaning||row.translation)}</div>`:''}${row.example?`<div class="example">${e(row.example)}</div>`:''}<p class="muted">${e(labels[type])} · ${e(title)}${row.page?' · 第 '+Number(row.page)+' 页':row.episodeId?' · 第 '+Number(row.episodeId)+' 集':''}${row.category?' · '+e(row.category):''}</p><div class="study-collection-actions">${href.startsWith('#/')?`<a href="${e(href)}">查看来源</a>`:''}<button type="button" data-study-speak="${index}">朗读</button><button type="button" data-study-category="${index}">分类</button><button type="button" data-study-remove="${index}">移除</button></div></article>`).join('')||'<div class="empty">暂无匹配收藏。在动画阅读或绘本、期刊的可选文字中选中英文，即可收藏。</div>';
      host.querySelectorAll('[data-study-speak]').forEach(button=>button.onclick=()=>{const row=rows[Number(button.dataset.studySpeak)];this.speakText(row.word||row.sentence);});
      host.querySelectorAll('[data-study-remove]').forEach(button=>button.onclick=()=>{const row=rows[Number(button.dataset.studyRemove)];row.deletedAt=new Date().toISOString();row.updatedAt=row.deletedAt;this.storage(kind,rows);draw();});
      host.querySelectorAll('[data-study-category]').forEach(button=>button.onclick=()=>{const row=rows[Number(button.dataset.studyCategory)],name=prompt('分类名称（留空取消分类，最多 60 个字）',row.category||'');if(name===null)return;row.category=name.trim().slice(0,60);row.updatedAt=new Date().toISOString();this.storage(kind,rows);draw();});
    };
    for(const field of [search,sourceFilter,categoryFilter])field.oninput=draw;draw();
  },
  async renderSearch(q){
    const all=await this.getJSON('data/series-list.json');
    const animations=all.filter(s=>!String(s.seriesId||'').startsWith('movie-'));
    const list=this.isGuest()?animations.filter(s=>!this.isGuestRestrictedLevel(s.level)):animations;
    const results=[];
    for(const s of list.filter(x=>!['coming','locked'].includes(x.status))){
      try{
        const [eps, voc] = await Promise.all([this.getJSON(`data/${s.seriesId}/episodes.json`), this.getJSON(`data/${s.seriesId}/vocabulary.json`)]);
        eps.filter(e=>(e.title+' '+(e.titleZh||'')).toLowerCase().includes(q.toLowerCase()) || String(e.episodeId)===q).slice(0,10).forEach(e=>results.push({type:'episode',series:s,ep:e}));
        Object.entries(voc).forEach(([eid,words])=>words.filter(w=>(w.word+' '+(w.meaningZh||'')).toLowerCase().includes(q.toLowerCase())).slice(0,5).forEach(w=>results.push({type:'word',series:s,eid,w})));
      }catch(e){}
    }
    this.el().innerHTML=`<section class="hero"><div><h1>搜索：${q}</h1><p>搜索系列标题、集数和单词。</p></div></section><div class="content-panel">${results.length?results.map(r=>r.type==='episode'?`<p><a href="#/lesson/${r.series.seriesId}/${r.ep.episodeId}"><strong>${r.series.title}</strong> Episode ${r.ep.episodeId} · ${r.ep.title}</a></p>`:`<p><a href="#/lesson/${r.series.seriesId}/${r.eid}"><strong>${r.w.word}</strong></a> · ${r.w.meaningZh||''} <span class="muted">${r.series.title} Episode ${r.eid}</span></p>`).join(''):'<div class="empty">没有找到相关结果。</div>'}</div>`;
  }
};
App.start();
