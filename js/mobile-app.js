/* Phone/tablet app shell. Desktop routes and layouts remain the original site. */
window.MobileApp = {
  media: matchMedia('(max-width:1100px), (pointer:coarse) and (max-width:1400px)'),
  get active() { return this.media.matches; },
  icon(name) {
    const paths={home:'<path d="m3 10 9-7 9 7v10H3zM9 20v-7h6v7"/>',animation:'<rect x="3" y="4" width="18" height="16" rx="4"/><path d="m10 8 6 4-6 4z"/>',reading:'<path d="M12 6C8 3 3 4 3 4v15s5-1 9 2c4-3 9-2 9-2V4s-5-1-9 2zm0 0v15"/>',mine:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',arrow:'<path d="m9 5 7 7-7 7"/>'};
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.home}</svg>`;
  },
  init() {
    this.header=document.createElement('header');this.header.className='sf-app-header';
    this.header.innerHTML=`<div class="sf-app-header-row"><button class="sf-app-avatar" type="button" data-mobile-account aria-label="我的账户"><img src="assets/icons/account.webp" alt=""></button><a class="sf-app-brand" href="#/home"><strong data-mobile-name>一起学英语</strong><span>让每个故事，成为一次成长</span></a><a class="sf-app-points" href="#/rewards" aria-label="我的积分">⭐ <b data-mobile-points>0</b></a><button class="sf-app-search-toggle" type="button" aria-label="搜索" aria-expanded="false">${this.icon('search')}</button></div><div class="sf-app-search-slot" hidden></div>`;
    document.body.prepend(this.header);
    this.bottom=document.createElement('nav');this.bottom.className='sf-app-bottom';this.bottom.setAttribute('aria-label','移动端主导航');
    this.bottom.innerHTML=[['home','#/home','首页'],['animation','#/home/all','动画'],['reading','#/mobile-reading','阅读'],['mine','#/mobile-me','我的']].map(([key,url,title])=>`<a href="${url}" data-mobile-tab="${key}">${this.icon(key)}<span>${title}</span></a>`).join('');document.body.appendChild(this.bottom);
    const search=document.querySelector('.search-box');this.search=search;this.searchMarker=document.createComment('desktop-search');search.before(this.searchMarker);
    this.header.querySelector('.sf-app-search-toggle').onclick=()=>{
      const slot=this.header.querySelector('.sf-app-search-slot'),open=slot.hidden;slot.hidden=!open;
      this.header.querySelector('.sf-app-search-toggle').setAttribute('aria-expanded',String(open));
      if(open)document.getElementById('globalSearch').focus();
    };
    document.addEventListener('click',event=>{if(this.active&&event.target.closest('[data-mobile-account]'))window.SFCloud?.open();});
    document.addEventListener('sf-access-change',()=>this.refreshIdentity());
    const badge=document.querySelector('#navRewards .nav-points-badge');if(badge)new MutationObserver(()=>this.refreshIdentity()).observe(badge,{childList:true,characterData:true,subtree:true});
    this.media.addEventListener('change',()=>{this.setMode();if(typeof App!=='undefined')App.render();});
    this.setMode();
  },
  setMode() {
    document.body.classList.toggle('sf-mobile-app',this.active);document.documentElement.classList.toggle('sf-mobile-app',this.active);
    if(this.active)this.header.querySelector('.sf-app-search-slot').appendChild(this.search);
    else this.searchMarker.after(this.search);
  },
  refreshIdentity() {
    if(!this.header)return;
    const name=window.SFCloud?.nickname?.()||'一起学英语';
    this.header.querySelector('[data-mobile-name]').textContent=name;
    this.header.querySelector('[data-mobile-points]').textContent=this.app?.getPoints?.()||0;
  },
  sync(app,page,a) {
    this.app=app;this.refreshIdentity();document.body.dataset.mobilePage=page;
    const selected=page==='home'&&!a?'home':['reading','reader','magazines','magazine-reader','series-books','mobile-reading'].includes(page)?'reading':['mobile-me','account','checkin','homework','family','wordbank','writing','honors','rewards'].includes(page)?'mine':'animation';
    this.bottom.querySelectorAll('a').forEach(link=>{const on=link.dataset.mobileTab===selected;if(on)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});
    this.header.querySelector('.sf-app-search-slot').hidden=true;this.header.querySelector('.sf-app-search-toggle').setAttribute('aria-expanded','false');
  },
  section(title,url,content) {return `<section class="sf-app-section"><div class="sf-app-section-head"><h2>${title}</h2>${url?`<a href="${url}">查看全部 ${this.icon('arrow')}</a>`:''}</div>${content}</section>`;},
  async home(app) {
    const route=location.hash,e=value=>app.escapeHtml(String(value||''));
    app.el().innerHTML='<div class="sf-app-loading" role="status">正在准备你的学习空间…</div>';
    const list=(await app.getJSON('data/series-list.json')).filter(row=>!row.seriesId.startsWith('movie-')&&row.status!=='coming'&&(!app.isGuest()||!app.isGuestRestrictedLevel(row.level)));
    if(location.hash!==route||!this.active)return;
    const progress=Object.values(app.storage('progress')||{}).filter(row=>list.some(series=>series.seriesId===row.seriesId)).sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')))[0];
    const last=list.find(row=>row.seriesId===progress?.seriesId);
    const recent=last?`<a class="sf-app-continue" href="#/lesson/${e(last.seriesId)}/${Number(progress.episodeId)}"><img src="${e(last.cover)}" alt=""><div><span class="sf-app-eyebrow">继续上次的学习</span><h3>${e(last.titleZh||last.title)}</h3><p>上次学到第 ${Number(progress.episodeId)} 集</p></div><span class="sf-app-play" aria-hidden="true">▶</span></a>`:`<div class="sf-app-welcome"><div><span class="sf-app-eyebrow">TODAY'S STORY</span><h1>今天，听一个好故事</h1><p>看动画 · 听原声 · 读绘本</p><a href="#/home/all">开始探索 ${this.icon('arrow')}</a></div><img src="assets/nav-icons/animation-story.png" alt=""></div>`;
    const categories=[['#/home/all','animation-story.png','动画故事','blue'],['#/movies','movie-class.png','光影课堂','orange'],['#/reading','picture-books.png','绘本阅读','mint'],['#/magazines','periodicals.png','期刊杂志','violet']];
    const quick=`<div class="sf-app-category-grid">${categories.map(([url,image,title,tone])=>`<a href="${url}"><span class="sf-app-category-icon ${tone}"><img src="assets/nav-icons/${image}" alt=""></span><strong>${title}</strong></a>`).join('')}</div>`;
    const shortcuts=`<div class="sf-app-mini-tools">${[['#/checkin','checkin','每日签到'],['#/homework','homework','学习作业'],['#/honors','honors','荣誉馆'],['#/rewards','rewards','积分奖励']].map(([url,image,title])=>`<a href="${url}"><img src="assets/icons/${image}.webp" alt=""><span>${title}</span></a>`).join('')}</div>`;
    const grid=`<div class="sf-app-story-grid">${list.slice(0,8).map(row=>`<a href="#/series/${e(row.seriesId)}"><img src="${e(row.cover)}" alt="" loading="lazy"><strong>${e(row.titleZh||row.title)}</strong><span>Level ${Number(row.level)}</span></a>`).join('')}</div>`;
    const favourites=`<div class="sf-app-feature-links"><a href="#/home/favorites"><span>⭐</span><div><strong>我的收藏</strong><small>喜欢的故事，随时再看</small></div>${this.icon('arrow')}</a><a href="#/home/recent"><span>◷</span><div><strong>观看记录</strong><small>找回上次的精彩</small></div>${this.icon('arrow')}</a></div>`;
    app.el().innerHTML=`<div class="sf-app-dashboard">${recent}${this.section('探索学习','',quick)}${shortcuts}<div class="sf-app-home-columns">${this.section('故事星球','#/home/all',grid)}${this.section('我的故事角','',favourites+'<a class="sf-app-reading-banner" href="#/mobile-reading"><div><small>READ A LITTLE EVERY DAY</small><strong>打开一本书<br>遇见新的世界</strong><span>去阅读 →</span></div><img src="assets/nav-icons/picture-books.png" alt=""></a>')}</div></div>`;
  },
  reading(app) {
    app.el().innerHTML=`<div class="sf-app-reading-home"><div class="sf-app-page-title"><small>READING TIME</small><h1>阅读，让故事继续</h1><p>把喜欢的故事，变成每天的陪伴。</p></div><div class="sf-app-reading-choices"><a href="#/reading" class="mint"><img src="assets/nav-icons/picture-books.png" alt=""><div><span>PICTURE BOOKS</span><h2>绘本阅读</h2><p>翻开故事，探索世界</p></div>${this.icon('arrow')}</a><a href="#/magazines" class="violet"><img src="assets/nav-icons/periodicals.png" alt=""><div><span>MAGAZINES</span><h2>期刊杂志</h2><p>发现新知，拓展视野</p></div>${this.icon('arrow')}</a></div>${this.section('我的阅读','',`<div class="sf-app-service-list"><a href="#/reading/mine/favorites">⭐ 绘本收藏 ${this.icon('arrow')}</a><a href="#/reading/mine/recent">◷ 最近阅读 ${this.icon('arrow')}</a><a href="#/magazines/mine/favorites">📚 期刊收藏 ${this.icon('arrow')}</a><a href="#/reading/local">📂 打开本地绘本 ${this.icon('arrow')}</a></div>`)}</div>`;
  },
  mine(app) {
    const e=value=>app.escapeHtml(String(value||'')),user=window.SFCloud?.user;
    const progress=Object.values(app.storage('progress')||{}),series=new Set(progress.map(row=>row.seriesId));
    app.el().innerHTML=`<div class="sf-app-me"><div class="sf-app-profile"><img src="assets/icons/account.webp" alt=""><div><h1>${e(window.SFCloud?.nickname?.()||(user?'我的学习空间':'你好，小小探索家'))}</h1><p>${user?'每一份努力，都值得被看见':'登录后同步学习进度与收藏'}</p></div><button type="button" data-mobile-account>${user?'账户设置':'登录 / 注册'}</button></div><div class="sf-app-stats"><a href="#/home/recent"><b>${series.size}</b><span>学习系列</span></a><a href="#/home/recent"><b>${progress.length}</b><span>学习记录</span></a><a href="#/rewards"><b>${app.getPoints()}</b><span>我的积分</span></a></div>${this.section('我的学习','',`<div class="sf-app-service-list">${[['#/homework','📝','学习作业'],['#/wordbank','📘','我的单词表'],['#/writing','✍️','英文写作'],['#/home/favorites','⭐','收藏的动画'],['#/home/recent','◷','观看记录'],['#/reading/mine/recent','📖','阅读记录']].map(([url,icon,title])=>`<a href="${url}"><span>${icon} ${title}</span>${this.icon('arrow')}</a>`).join('')}</div>`)}${this.section('成长与奖励','',`<div class="sf-app-mini-tools">${[['#/checkin','checkin','每日签到'],['#/honors','honors','我的荣誉'],['#/rewards','rewards','积分奖励']].map(([url,image,title])=>`<a href="${url}"><img src="assets/icons/${image}.webp" alt=""><span>${title}</span></a>`).join('')}</div>`)}<a class="sf-app-extra" href="/source-lab/">片源探索 ${this.icon('arrow')}</a></div>`;
  }
};
MobileApp.init();
