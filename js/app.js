
const App = {
  cache: {},
  activeLessonTab: 'watch',
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
    document.getElementById('globalSearch').addEventListener('keydown', e=>{ if(e.key==='Enter') this.globalSearch(); });
    this.updateUtilityNav();
    await this.render();
    if(window.SFCloud) window.SFCloud.init(this);
  },
  async globalSearch(){
    const q = document.getElementById('globalSearch').value.trim();
    if(!q) return;
    location.hash = '#/search/' + encodeURIComponent(q);
  },
  async render(){
    const [page, a, b] = this.route();
    this.updateUtilityNav();
    this.el().classList.remove('series-page-shell');
    document.body.classList.remove('series-fixed-page');
    document.documentElement.classList.remove('series-fixed-page');
    try{
      if(page === 'home') return this.renderHome();
      if(page === 'series') return this.renderSeries(a);
      if(page === 'lesson') return this.renderLesson(a, Number(b || 1));
      if(page === 'records') return this.renderRecords();
      if(page === 'checkin') return this.renderCheckin();
      if(page === 'bookshelf') return this.renderBookshelf();
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
    const list = await this.getJSON('data/series-list.json');
    const total = list.length;
    const levels = [...new Set(list.map(s=>Number(s.level ?? 0)))].sort((a,b)=>a-b);
    const visible = list.filter(s=>(statusFilter==='all'||s.status===statusFilter) && (levelFilter==='all'||Number(s.level ?? 0)===Number(levelFilter)));
    const grouped = (levelFilter==='all' ? levels : [Number(levelFilter)]).map(level=>{
      const series = visible.filter(s=>Number(s.level ?? 0)===level);
      if(!series.length) return '';
      return `<section class="level-group"><div class="level-group-head"><h3>Level ${level}</h3><span>${series.length} 个系列</span></div><div class="series-grid">${series.map(s=>this.seriesCard(s)).join('')}</div></section>`;
    }).join('');
    this.el().innerHTML = `
      <section class="hero">
        <div>
          <h1>动画故事</h1>
          <p>选择一个故事系列开始学习。每一集按 Watch → Listen and Read → Words → Quiz 的顺序完成，完成所有 Quiz 任务解锁下一集。</p>
        </div>
        <div class="hero-badge">Story · Level · Progress</div>
      </section>
      <div class="section-head">
        <h2>所有动画故事 <span class="meta">（${total} 个系列）</span></h2>
      </div>
      <div class="filters" id="homeFilters">
        ${['all','completed','serializing','coming'].map(x=>`<button class="filter-btn ${statusFilter===x?'active':''}" data-status="${x}">${x==='all'?'全部':this.statusText(x)}</button>`).join('')}
      </div>
      <div class="filters level-filters" id="levelFilters" aria-label="按等级筛选">
        <span class="filter-label">分级</span>
        <button class="filter-btn ${levelFilter==='all'?'active':''}" data-level="all">全部等级</button>
        ${levels.map(level=>`<button class="filter-btn ${Number(levelFilter)===level?'active':''}" data-level="${level}">Level ${level}</button>`).join('')}
      </div>
      <div class="level-groups">
        ${grouped || '<div class="empty">当前筛选条件下没有系列。</div>'}
      </div>`;
    document.querySelectorAll('#homeFilters .filter-btn').forEach(btn=>btn.addEventListener('click',()=>this.renderHome(btn.dataset.status, levelFilter)));
    document.querySelectorAll('#levelFilters .filter-btn').forEach(btn=>btn.addEventListener('click',()=>this.renderHome(statusFilter, btn.dataset.level)));
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
  
async renderSeries(seriesId){
  if(!seriesId) return this.renderHome();
  const [bundle] = await Promise.all([this.loadSeries(seriesId)]);
  const {series, episodes} = bundle;
  const episodeGroups = Array.from({length:Math.ceil(episodes.length / 10)}, (_, index)=>{
    const start=index * 10 + 1;
    return {start, end:Math.min(start + 9, episodes.length)};
  });
  let activeEpisodeId=1;
  this.el().classList.add('series-page-shell');
  document.body.classList.add('series-fixed-page');
  document.documentElement.classList.add('series-fixed-page');
  this.el().innerHTML = `
    <div class="series-page-fixed">
    <div class="breadcrumb"><a href="#/home">动画故事</a><span>›</span><span>${series.seriesTitle}</span></div>
    <section class="series-hero">
      <img class="cover" src="${series.coverImage || `assets/covers/${seriesId}.svg`}" alt="${series.seriesTitle}">
      <div>
        <h1>${series.seriesTitle}</h1>
        <div class="sub">${series.seriesTitleZh || ''} · Level ${series.level ?? 0} · ${this.statusText(series.status)}</div>
        <p class="sub">${series.description || ''}</p>
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
        const unlocked=available && (e.unlockRequiresQuiz===false || this.isEpisodeUnlocked(seriesId,e.episodeId));
        const prog=this.episodeProgress(seriesId,e.episodeId);
        const done=!!(prog.modules.quiz);
        return `<button class="episode-side-item ${Number(e.episodeId)===activeEpisodeId?'active':''} ${unlocked?'':'locked'}" data-ep="${e.episodeId}" data-available="${available}" ${unlocked?'':'disabled'}>
          <span class="num">${e.episodeId}</span>
          <span>${e.title}${done?' ✓':''}</span>
          <small>${!available?'即将上线':(unlocked?(done?'已完成':'可学习'):'🔒 未解锁')}</small>
        </button>`;
      }).join('') : '<div class="episode-filter-empty">没有找到匹配课程</div>';
      document.querySelectorAll('.episode-side-item').forEach(btn=>btn.onclick=()=>openEpisode(btn.dataset.ep));
    };
    const openEpisode = (id)=>{
      const ep=episodes.find(e=>Number(e.episodeId)===Number(id)) || episodes[0];
      if(ep.unlockRequiresQuiz!==false && !this.isEpisodeUnlocked(seriesId, ep.episodeId)){
        alert('🔒 请先完成上一集 Quiz（正确率80%以上）后解锁本集。');
        return;
      }
      activeEpisodeId=Number(ep.episodeId);
      document.querySelectorAll('.episode-side-item').forEach(x=>x.classList.toggle('active', Number(x.dataset.ep)===Number(ep.episodeId)));
      document.getElementById('episodeWorkspace').innerHTML=`
        <h2>Episode ${ep.episodeId} · ${ep.title}</h2>
        <p class="muted">${ep.titleZh || ''}</p>
        <div class="module-grid">
          ${ep.video?.embedUrl?'<button class="module-card" data-go="watch">🎬<b>在线视频</b><span>B站播放</span></button>':''}
          ${ep.video?.hlsUrl?'<button class="module-card direct-video-card" data-go="hlsVideo">▶️<b>HLS 播放</b><span>站内视频源</span></button>':''}
          ${ep.video?.directUrl?'<button class="module-card direct-video-card" data-go="directVideo">▶️<b>直链播放</b><span>备用视频在线播放</span></button>':''}
          <button class="module-card" data-go="localVideo">📁<b>Local Video</b><span>本地视频</span></button>
          ${ep.modules?.read?'<button class="module-card" data-go="listenRead">🎧<b>Listen and Read</b><span>听读</span></button>':''}
          ${(ep.modules?.words || ep.modules?.vocabulary)?'<button class="module-card" data-go="words">🔤<b>Words</b><span>单词</span></button>':''}
          ${ep.modules?.quiz?'<button class="module-card" data-go="quiz">✅<b>Quiz</b><span>测验</span></button>':''}
        </div>`;
      document.querySelectorAll('.module-card').forEach(btn=>{
        btn.onclick=()=>{ this.openLearningModal(btn.dataset.go, seriesId, ep.episodeId); };
      });
    };
    document.getElementById('episodeTitleSearch').addEventListener('input',renderEpisodeList);
    document.getElementById('episodeRangeFilter').addEventListener('change',renderEpisodeList);
    renderEpisodeList();
    openEpisode(1);
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
    const data = await Promise.all([
      this.getJSON(`data/${seriesId}/reading-lessons.json`).catch(()=>({})),
      this.getJSON(`data/${seriesId}/vocabulary.json`).catch(()=>({})),
      this.getJSON(`data/${seriesId}/phrases.json`).catch(()=>({})),
      this.getJSON(`data/${seriesId}/grammar.json`).catch(()=>({})),
      this.getJSON(`data/${seriesId}/quiz.json`).catch(()=>({})),
      this.getJSON(`data/${seriesId}/review.json`).catch(()=>({}))
    ]);
    const [reading, vocab, phrases, grammar, quiz, review] = data;
    const lessonData = {seriesId, episodeId, series, ep, reading:reading[String(episodeId)], vocab:vocab[String(episodeId)]||[], phrases:phrases[String(episodeId)]||[], grammar:grammar[String(episodeId)]||[], quiz:quiz[String(episodeId)], review:review[String(episodeId)]};
    const tab = this.activeLessonTab || 'watch';
    this.el().innerHTML = `
      <div class="breadcrumb"><a href="#/home">动画故事</a><span>›</span><a href="#/series/${seriesId}">${series.seriesTitle}</a><span>›</span><span>Episode ${episodeId}</span></div>
      <section class="lesson-head">
        <h1>Episode ${episodeId} · ${ep.title}</h1>
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
    const [reading, vocab, phrases, grammar, quiz, review] = await Promise.all([
      this.getJSON(`data/${seriesId}/reading-lessons.json`).catch(()=>({})),
      this.getJSON(`data/${seriesId}/vocabulary.json`).catch(()=>({})),
      this.getJSON(`data/${seriesId}/phrases.json`).catch(()=>({})),
      this.getJSON(`data/${seriesId}/grammar.json`).catch(()=>({})),
      this.getJSON(`data/${seriesId}/quiz.json`).catch(()=>({})),
      this.getJSON(`data/${seriesId}/review.json`).catch(()=>({}))
    ]);
    const d={seriesId, episodeId, series, ep, reading:reading[String(episodeId)], vocab:vocab[String(episodeId)]||[], phrases:phrases[String(episodeId)]||[], grammar:grammar[String(episodeId)]||[], quiz:quiz[String(episodeId)], review:review[String(episodeId)]};

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
    close.onclick=()=>win.remove();

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

    this.bindLessonPanel(tab,d);
  },
  lessonTabs(ep, active){
    const tabs=[];
    if(ep.video?.embedUrl) tabs.push('watch');
    if(ep.video?.hlsUrl) tabs.push('hlsVideo');
    if(ep.video?.directUrl) tabs.push('directVideo');
    tabs.push('localVideo');
    if(ep.modules?.read) tabs.push('listenRead');
    if(ep.modules?.words || ep.modules?.vocabulary) tabs.push('words');
    if(ep.modules?.quiz) tabs.push('quiz');
    return tabs.map(t=>`<button class="tab ${active===t?'active':''}" data-tab="${t}">${this.tabText(t)}</button>`).join('');
  },
  tabText(t){return {watch:'在线视频 · B站',hlsVideo:'HLS 播放',directVideo:'直链播放 · 备用',localVideo:'Local Video 本地视频',listenRead:'Listen and Read 听读',words:'Words 单词',quiz:'Quiz 测验'}[t]||t},
  lessonPanel(tab,d){
    if(tab==='watch') return this.watchPanel(d);
    if(tab==='hlsVideo') return this.hlsVideoPanel(d);
    if(tab==='directVideo') return this.directVideoPanel(d);
    if(tab==='localVideo') return this.localVideoPanel(d);
    if(tab==='listenRead') return this.listenReadPanel(d);
    if(tab==='words') return this.wordsPanel(d);
    if(tab==='quiz') return this.quizPanel(d);
    return '';
  },
  completeButton(d,module){return `<button class="btn small mark-complete" data-series="${d.seriesId}" data-episode="${d.episodeId}" data-module="${module}">完成本模块</button>`},
  watchPanel(d){
    const v=d.ep.video || {};
    if(!v.embedUrl && !v.directUrl && !v.hlsUrl) return `<div class="empty">本集视频暂未添加。</div>`;
    if(!v.embedUrl && v.hlsUrl) return this.hlsVideoPanel(d);
    if(!v.embedUrl) return this.directVideoPanel(d);
    return `<section class="online-video-panel"><div class="video-source-head"><div><h2>在线视频</h2><p class="muted">当前播放源：B站。遇到加载问题时，可使用下方的直链播放。</p></div>${v.directUrl?`<button class="btn secondary small open-direct-video" type="button">▶ 使用直链播放</button>`:''}</div><div class="video-wrap"><iframe src="${v.embedUrl}" allowfullscreen="allowfullscreen" scrolling="no"></iframe></div></section>${this.completeButton(d,'watch')}`;
  },
  directVideoPanel(d){
    const url=d.ep.video?.directUrl;
    if(!url) return `<div class="empty">本集暂未提供直链视频。</div>`;
    return `<section class="direct-video-panel"><div class="video-source-head"><div><h2>直链播放</h2><p class="muted">备用播放方式。已启用无来源请求以兼容源站的防盗链规则。</p></div>${d.ep.video?.embedUrl?`<button class="btn secondary small open-bilibili-video" type="button">切换到 B站播放</button>`:''}</div><div class="video-wrap"><video class="direct-video-player" controls playsinline preload="metadata" src="${this.escapeHtml(url)}"></video></div><p class="muted direct-video-help">若播放器仍无法读取，可<a href="${this.escapeHtml(url)}" target="_blank" rel="noreferrer noopener">在新页面播放直链</a>，或切换到 B站播放。</p></section>${this.completeButton(d,'directVideo')}`;
  },
  hlsVideoPanel(d){
    const url=d.ep.video?.hlsUrl;
    if(!url) return `<div class="empty">本集 HLS 视频源暂未添加。</div>`;
    return `<section class="direct-video-panel"><div class="video-source-head"><div><h2>HLS 播放</h2><p class="muted">站内视频源。播放器会自动适配支持 HLS 的浏览器。</p></div>${d.ep.video?.embedUrl?`<button class="btn secondary small open-bilibili-video" type="button">切换到 B站播放</button>`:''}</div><div class="video-wrap"><video class="hls-video-player" controls playsinline preload="metadata" data-hls-src="${this.escapeHtml(url)}"></video></div><p class="muted direct-video-help">若当前浏览器无法播放，可<a href="${this.escapeHtml(url)}" target="_blank" rel="noreferrer noopener">在新页面打开视频源</a>。</p></section>${this.completeButton(d,'hlsVideo')}`;
  },
  async initializeHlsVideo(player){
    if(player.dataset.ready) return;
    player.dataset.ready='1';
    const source=player.dataset.hlsSrc;
    if(player.canPlayType('application/vnd.apple.mpegurl')) { player.src=source; return; }
    try{
      if(!window.Hls){
        await new Promise((resolve,reject)=>{
          const script=document.createElement('script');
          script.src='https://cdn.jsdelivr.net/npm/hls.js@1.5.20/dist/hls.min.js';
          script.onload=resolve; script.onerror=reject; document.head.appendChild(script);
        });
      }
      if(window.Hls && window.Hls.isSupported()){
        const hls=new window.Hls();
        hls.loadSource(source); hls.attachMedia(player); player._hls=hls;
      }else throw new Error('HLS is not supported');
    }catch(err){
      player.closest('.direct-video-panel')?.querySelector('.direct-video-help')?.insertAdjacentHTML('beforeend',' 当前浏览器无法载入 HLS 播放器。');
    }
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
  listenReadPanel(d){
    return `
    <div class="read-only-window">
      ${this.readPanel(d).replace('<h2>Read</h2>','').replace(/<button class="btn small mark-complete"[^>]*data-module="read"[^>]*>完成本模块<\/button>/,'')}
    </div>
    ${this.completeButton(d,'read')}`;
  },
  readPanel(d){
    const paras=(d.reading && d.reading.paragraphs) || [];
    if(!paras.length) return `<div class="empty">本集阅读内容暂未添加。</div>`;
    const vocabTerms=new Map();
    (d.vocab||[]).forEach((word,index)=>{
      const term=String(word.word||'').replace(/[（(].*$/, '').trim();
      if(term && /[A-Za-z]/.test(term)) vocabTerms.set(term.toLowerCase(), {term,index});
    });
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
        html+=`<span class="reading-word" data-word-index="${item.index}">${this.escapeHtml(match[0])}</span>`;
        lastIndex=match.index + match[0].length;
      }
      return html + this.escapeHtml(source.slice(lastIndex));
    };
    return `<div class="book-reader">
    ${paras.map((p)=>`<div class="read-paragraph"><div class="selectable-sentence">${renderText(p.text || p)}</div>${p.translation?`<div class="translation hidden-translation">${p.translation}</div>`:''}</div>`).join('')}
    </div>${this.completeButton(d,'read')}`;
  },
  escapeHtml(text){return String(text).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));},
  speakText(text){
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
      window.setTimeout(()=>synth.speak(u), 0);
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
        <div class="meaning">${w.meaningZh || w.meaning || ''}</div>
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
  
bindLessonPanel(tab,d){
  document.querySelectorAll('.hls-video-player').forEach(player=>this.initializeHlsVideo(player));
  document.querySelectorAll('.mark-complete').forEach(btn=>btn.addEventListener('click', e=>{e.preventDefault(); this.markComplete(btn.dataset.series, btn.dataset.episode, btn.dataset.module); btn.textContent='已完成 ✓';}));
  document.querySelectorAll('.open-direct-video').forEach(btn=>btn.addEventListener('click',()=>{this.activeLessonTab='directVideo'; this.renderLesson(d.seriesId,d.episodeId);}));
  document.querySelectorAll('.open-bilibili-video').forEach(btn=>btn.addEventListener('click',()=>{this.activeLessonTab='watch'; this.renderLesson(d.seriesId,d.episodeId);}));
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
        const content=`<span class="popup-word">${w.word}</span><span class="popup-meaning">${w.meaningZh||w.meaning||''}</span>`; if(hint){hint.innerHTML=content; hint.style.display='inline-flex';} if(pop) pop.innerHTML=content;
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
  const form=document.getElementById('quizForm');
  if(form){
    form.addEventListener('submit', e=>{
      e.preventDefault();
      let score=0; const qs=d.quiz.questions;
      qs.forEach((q,i)=>{const ans=(new FormData(form)).get('q'+i); if(ans===q.answer) score++; const ex=document.getElementById('explain-'+i); if(ex) ex.style.display='block';});
      document.getElementById('quizResult').innerHTML=`<div class="quiz-result">得分：${score}/${qs.length}</div>`;
      this.saveQuizScore(d.seriesId,d.episodeId,score,qs.length);
      this.markComplete(d.seriesId,d.episodeId,'quiz');
      if(score/qs.length>=0.8) this.unlockNextEpisode(d.seriesId,d.episodeId);
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
  fb.innerHTML=`<div class="practice-result success">拼写正确！ +1 ⭐</div>`;
  this.addPoints(1);
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
    const nav=document.getElementById('navRewards');
    if(!nav) return;
    const points=this.getPoints();
    nav.innerHTML=`🎁 积分奖励 <span class="nav-points-badge">${points}</span>`;
    nav.setAttribute('title', `当前累计积分：${points}`);
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
    this.el().innerHTML=`<section class="hero"><div><h1>积分奖励</h1><p>单词拼写挑战中，每拼对 1 个单词可获得 1 积分。积分会自动累计，用于兑换奖励。</p></div><div class="hero-badge">当前积分：${points}</div></section>
      <div class="personal-grid">
        <div class="personal-card"><h3>累计积分</h3><div class="point-highlight">${points}</div><div class="points-note">登录可跨设备同步；游客仅保存本机</div></div>
        <div class="personal-card"><h3>积分来源</h3><p>Words 模块中的 Typing Practice 拼写挑战。</p><p class="muted">答对 1 个单词 = +1 积分</p></div>
        <div class="personal-card"><h3>下一档奖励</h3>${next?`<div class="point-highlight">${next.points}</div><div class="points-note">还差 ${next.points-points} 分可兑换：${next.reward}</div>`:`<div class="point-highlight">已满级</div><div class="points-note">当前已达到最高档奖励，可继续累计积分。</div>`}</div>
      </div>
      <div class="content-panel" style="margin-top:16px">
        <h2>积分奖励规则</h2>
        <div class="reward-grid">
          ${rules.map(rule=>`<article class="reward-card ${points>=rule.points?'unlocked':'locked'}">
              <div class="reward-points">🎁 ${rule.points} 积分</div>
              <h3>${rule.reward}</h3>
              <div class="reward-status ${points>=rule.points?'done':'todo'}">${points>=rule.points?'已解锁':'未解锁'}</div>
            </article>`).join('')}
        </div>
        <p class="points-note">说明：以上奖励方案可作为默认规则，也可以后续按家庭需要自行调整。</p>
      </div>`;
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

  isEpisodeUnlocked(seriesId, episodeId){
    const id=Number(episodeId);
    if(id<=1) return true;
    const p=this.storage('progress') || {};
    const prev=p[`${seriesId}:${id-1}`];
    const q=this.storage('quizScores') || {};
    const quiz=q[`${seriesId}:${id-1}`];
    return !!(prev && prev.modules && prev.modules.quiz && quiz && Number(quiz.score)/Number(quiz.total)>=0.8);
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
    this.storage('progress',p);
    const today=new Date();const ds=[today.getFullYear(),String(today.getMonth()+1).padStart(2,'0'),String(today.getDate()).padStart(2,'0')].join('-');
    const dates=new Set(this.storage('checkins')||[]);dates.add(ds);this.storage('checkins',[...dates].sort());
  },
  saveQuizScore(seriesId, episodeId, score, total){
    const q=this.storage('quizScores') || {}; q[`${seriesId}:${episodeId}`]={score,total,date:new Date().toISOString()}; this.storage('quizScores',q);
  },
  unlockNextEpisode(seriesId, episodeId){
    const nextId=Number(episodeId)+1;
    const next=document.querySelector(`.episode-side-item[data-ep="${nextId}"]`);
    if(!next || next.dataset.available!=='true' || !this.isEpisodeUnlocked(seriesId,nextId)) return;
    next.disabled=false;
    next.classList.remove('locked');
    const label=next.querySelector('small');
    if(label) label.textContent='可学习';
    const result=document.getElementById('quizResult');
    if(result) result.insertAdjacentHTML('beforeend','<p>🎉 已通过！下一课现已解锁。</p>');
  },
  saveWord(item){
    const arr=this.storage('wordbank') || []; const id=`${item.type}:${item.seriesId}:${item.episodeId}:${item.word}`;
    if(!arr.find(x=>x.id===id)) arr.push({...item,id,date:new Date().toISOString()}); this.storage('wordbank',arr);
  },
  saveSentence(item){
    const arr=this.storage('sentences') || []; const id=`${item.seriesId}:${item.episodeId}:${item.sentence.slice(0,40)}`;
    if(!arr.find(x=>x.id===id)) arr.push({...item,id,date:new Date().toISOString()}); this.storage('sentences',arr);
  },
  async renderRecords(){
    const p=this.storage('progress') || {}; const q=this.storage('quizScores') || {};
    const rows=Object.values(p).sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt));
    this.el().innerHTML=`<section class="hero"><div><h1>学习记录</h1><p>登录后学习记录会同步到云端，可在其他设备使用同一账户继续学习；游客记录只保存在当前设备。</p></div></section><div class="personal-grid"><div class="personal-card"><h3>已学习课程</h3><p style="font-size:34px;font-weight:900">${rows.length}</p></div><div class="personal-card"><h3>单词收藏</h3><p style="font-size:34px;font-weight:900">${(this.storage('wordbank')||[]).length}</p></div><div class="personal-card"><h3>句子收藏</h3><p style="font-size:34px;font-weight:900">${(this.storage('sentences')||[]).length}</p></div><div class="personal-card"><h3>累计积分</h3><p style="font-size:34px;font-weight:900">${this.getPoints()}</p></div></div><div class="content-panel" style="margin-top:16px"><h2>最近学习</h2>${rows.length?rows.map(r=>`<p><strong>${r.seriesId}</strong> Episode ${r.episodeId} · ${Object.keys(r.modules).join(', ')} · ${(r.updatedAt||'').slice(0,10)} ${q[`${r.seriesId}:${r.episodeId}`]?`· Quiz ${q[`${r.seriesId}:${r.episodeId}`].score}/${q[`${r.seriesId}:${r.episodeId}`].total}`:''}</p>`).join(''):'<div class="empty">还没有学习记录。</div>'}</div>`;
  },
  renderCheckin(){
    const p=this.storage('progress') || {}; const dates=new Set([...(this.storage('checkins')||[]),...Object.values(p).map(x=>(x.updatedAt||'').slice(0,10))]);
    const now=new Date(); const y=now.getFullYear(), m=now.getMonth(); const first=new Date(y,m,1); const days=new Date(y,m+1,0).getDate(); const blanks=(first.getDay()+6)%7;
    let cells=''; for(let i=0;i<blanks;i++) cells+='<div></div>';
    for(let d=1; d<=days; d++){const ds=`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`; cells+=`<div class="day ${dates.has(ds)?'done':''}"><span>${d}</span><span>${dates.has(ds)?'✓':''}</span></div>`;}
    this.el().innerHTML=`<section class="hero"><div><h1>签到</h1><p>每天完成任意学习模块后，当天会自动点亮。</p></div><div class="hero-badge">${y}年${m+1}月</div></section><div class="content-panel"><div class="calendar">${['一','二','三','四','五','六','日'].map(x=>`<strong style="text-align:center">${x}</strong>`).join('')}${cells}</div></div>`;
  },
  async renderBookshelf(){
    const list=await this.getJSON('data/series-list.json'); const p=this.storage('progress') || {};
    this.el().innerHTML=`<section class="hero"><div><h1>书架</h1><p>这里收集正在学习和已经学过的故事系列。</p></div></section><div class="series-grid">${list.map(s=>{const done=Object.values(p).filter(x=>x.seriesId===s.seriesId).length;return `<article class="series-card"><img class="cover" src="${s.cover}" alt=""><div class="series-info"><h3>${s.title}</h3><div class="zh">${s.titleZh||''}</div><p>学习进度：${done}/${s.episodeCount || 0}</p><div class="progress-bar"><span style="width:${s.episodeCount?Math.min(100,done/s.episodeCount*100):0}%"></span></div><p><a class="btn small" href="#/series/${s.seriesId}">进入系列</a></p></div></article>`}).join('')}</div>`;
  },
  renderWordbank(){
    const arr=this.storage('wordbank') || [];
    this.el().innerHTML=`<section class="hero"><div><h1>单词表</h1><p>这里收集你在各集课程中收藏的单词和短语。</p></div></section><div class="cards-grid">${arr.length?arr.map(w=>`<article class="mini-card"><h3>${w.word}</h3><div class="meaning">${w.meaning||''}</div>${w.example?`<div class="example">${w.example}</div>`:''}<p class="muted">${w.seriesId} · Episode ${w.episodeId}</p></article>`).join(''):'<div class="empty">还没有收藏单词或短语。</div>'}</div>`;
  },
  renderWriting(){
    const arr=this.storage('sentences') || [];
    this.el().innerHTML=`<section class="hero"><div><h1>英文写作</h1><p>先从收藏喜欢的英文句子开始，后期可以升级为仿写练习。</p></div></section><div class="content-panel">${arr.length?arr.map(s=>`<div class="read-paragraph"><strong>${s.sentence}</strong><div class="muted">${s.seriesId} · Episode ${s.episodeId}</div></div>`).join(''):'<div class="empty">还没有收藏句子。进入 Read 页面可以收藏好句。</div>'}</div>`;
  },
  async renderSearch(q){
    const list=await this.getJSON('data/series-list.json');
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
