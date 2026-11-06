window.MediaShelf = {
  timers:new Map(), pending:new Map(),
  e(app,value){return app.escapeHtml(String(value??''));},
  nav(scope,mode='all'){
    const base=scope==='movies'?'movies':'home';
    const tabs=scope==='movies'?[['animated','动画大电影'],['documentary','纪录片'],['episodes','分集学习'],['favorites','我的收藏'],['recent','观看记录']]:[['all','全部动画'],['direct','直接观看'],['favorites','我的收藏'],['recent','观看记录']];
    return `<nav class="book-reading-tabs" aria-label="${scope==='movies'?'光影课堂':'动画故事'}书架">${tabs.map(([key,title])=>`<a href="#/${base}/${key}"${mode===key?' aria-current="page"':''}>${title}</a>`).join('')}${scope==='animation'?`<a href="#/wordbank"${mode==='wordbank'?' aria-current="page"':''}>单词表</a><a href="#/writing"${mode==='writing'?' aria-current="page"':''}>英文写作</a>`:''}${scope==='movies'&&window.SFCloud?.isAdmin?.()?'<a class="book-admin-entry" href="#/movie-admin">影视资源管理</a>':''}</nav>`;
  },
  animation(series){const englishTitles={'journey-to-the-west':'Journey to the West','three-kingdoms':'Romance of the Three Kingdoms'};return {key:'anim-'+series.seriesId,scope:'animation',id:series.seriesId,title:englishTitles[series.seriesId]||series.titleZh||series.title,cover:series.cover,href:'#/series/'+series.seriesId,level:Number(series.level||0),disabled:['coming','locked'].includes(series.status),landscape:true,totalEpisodes:Number(series.episodeCount||series.readyEpisodes||0)};},
  movieSeries(series){return {key:'film-series-'+series.id,scope:'movies',id:series.id,title:series.titleZh||series.title,search:series.title+' '+series.titleZh,cover:series.cover||window.MovieClassroom.seriesCovers[series.id],href:'#/movie-series/'+series.id,level:series.level};},
  movieFilm(series,film,playable){const [id,title,titleZh]=film;const item=playable.get(id),watchHref=item?.playerMode==='vidmario-external'?item.embedUrl:'';return {key:'film-'+id,scope:'movies',id,title:titleZh||title,courseId:item?.studyCourse?.seriesId,search:[title,titleZh,series.title,series.titleZh].join(' '),cover:item?.cover||window.MovieClassroom.filmCovers[id]||series.cover||window.MovieClassroom.seriesCovers[series.id],href:'#/movie/'+id,watchHref,level:series.level,disabled:!item};},
  card(app,item,resume='',learning=false){
    const e=value=>this.e(app,value);
    const learned=learning?new Set(Object.values(app.storage('progress')||{}).filter(row=>row.seriesId===item.id&&Object.values(row.modules||{}).some(Boolean)).map(row=>Number(row.episodeId))).size:0,total=Math.max(item.totalEpisodes||0,learned);
    const cover=item.cover?`<img src="${e(item.cover)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`:`<b>${e(item.title)}</b>`;
    const destination=resume||item.watchHref||item.href,external=!!item.watchHref&&destination===item.watchHref;
    const link=item.disabled?'<span class="media-unavailable">待上线</span>':`<a href="${e(destination)}"${external?' target="_blank" rel="noopener noreferrer" data-media-watch="true"':''}>${resume?(learning?'继续学习':'继续观看'):item.key.startsWith('film-series-')?'查看系列':item.scope==='animation'?'进入故事':'开始观看'}</a>`;
    return `<article class="book-card media-card" data-media-key="${e(item.key)}"><div class="book-cover${item.landscape?' media-animation-cover':''}"><button class="book-cover-trigger" type="button" aria-label="${e(item.title)}观看操作">${cover}</button><div class="book-actions">${link}<button type="button" class="book-personal-button media-favorite">收藏 / 分类</button></div></div><div class="book-card-body"><h2>${e(item.title)}</h2>${learning?`<div class="media-study-progress"><span>已学 ${learned} / ${total} 集</span><progress value="${learned}" max="${total||1}" aria-label="学习进度"></progress></div>`:''}</div></article>`;
  },
  resumeHref(item,row){if(item.watchHref)return item.watchHref;const meta=this.metadata(row),episode=Number(meta.episodeId),seriesId=item.scope==='animation'?item.id:item.courseId;return seriesId&&Number.isInteger(episode)&&episode>0&&meta.href===`#/lesson/${seriesId}/${episode}`?meta.href:item.href;},
  cards(app,items,states=new Map(),recent=false,learning=false){if(learning)for(const item of items){if(!this.metadata(states.get(item.key)).episodeId){const last=Object.values(app.storage('progress')||{}).filter(row=>row.seriesId===item.id).sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];if(last)states.set(item.key,{...states.get(item.key),last_cfi:JSON.stringify({episodeId:last.episodeId,href:`#/lesson/${item.id}/${last.episodeId}`})});}}return `<div class="book-grid">${items.map(item=>this.card(app,item,recent?this.resumeHref(item,states.get(item.key)):'',learning)).join('')}</div>`;},
  bindCards(app,root=app.el()){
    root.querySelectorAll('.media-favorite').forEach(button=>button.onclick=()=>window.BookCommunity.personalDialog(app,button.closest('[data-media-key]').dataset.mediaKey,{media:true,onSave:()=>app.render()}));
    root.querySelectorAll('[data-media-watch]').forEach(link=>link.addEventListener('click',()=>this.record(link.closest('[data-media-key]').dataset.mediaKey,{href:link.href})));
    root.querySelectorAll('.media-card .book-cover-trigger').forEach(button=>button.onclick=()=>{if(matchMedia('(hover: none)').matches)button.parentElement.classList.toggle('book-actions-open');});
  },
  metadata(row){try{const value=JSON.parse(row?.last_cfi||'{}');return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}catch{return {}; }},
  localKey(){return 'storyfox-media-library:'+(window.SFCloud?.user?.id||'guest');},
  local(){try{return JSON.parse(localStorage.getItem(this.localKey())||'{}');}catch{return {}; }},
  async states(app){
    const uid=window.SFCloud?.user?.id,rows=new Map(Object.entries(this.local()));
    if(uid&&window.SFCloud.client){
      const {data,error}=await window.SFCloud.client.from('book_personal').select('*').eq('user_id',uid);
      if(error)throw error;if(window.SFCloud?.user?.id!==uid)return new Map();
      for(const row of data){if(!/^(anim-|film-)/.test(row.book_id))continue;const local=rows.get(row.book_id);rows.set(row.book_id,{...row,...(Date.parse(local?.last_read_at||'')>Date.parse(row.last_read_at||'1970-01-01')?{last_read_at:local.last_read_at,last_cfi:local.last_cfi}:{} )});}
    }
    // Retain completed Watch entries recorded before personal media shelves existed.
    const existingHistory=new Set([...rows].filter(([,row])=>row.last_read_at).map(([key])=>key));
    for(const row of Object.values(app.storage('progress')||{})){
      if(!row.modules?.watch||!row.seriesId||String(row.seriesId).startsWith('movie-'))continue;
      const key='anim-'+row.seriesId,old=rows.get(key);
      if(!existingHistory.has(key)&&(!old?.last_read_at||String(row.updatedAt)>String(old.last_read_at)))rows.set(key,{...old,last_read_at:row.updatedAt,last_cfi:JSON.stringify({href:`#/lesson/${row.seriesId}/${row.episodeId}`,episodeId:row.episodeId})});
    }
    return rows;
  },
  async render(app,scope,{mode='all',query='',level='all'}={}){
    const route=location.hash,uid=window.SFCloud?.user?.id;
    if(['favorites','recent'].includes(mode)&&!uid){app.el().innerHTML=this.nav(scope,mode)+'<section class="empty"><p>登录后查看个人收藏和观看记录。</p><button class="btn" id="mediaLogin">登录 / 注册</button></section>';app.el().querySelector('#mediaLogin').onclick=()=>window.SFCloud?.open();return;}
    let items,allItems;
    if(scope==='animation'){
      const list=(await app.getJSON('data/series-list.json')).filter(row=>!String(row.seriesId).startsWith('movie-')&&(!app.isGuest()||!app.isGuestRestrictedLevel(row.level)));
      items=list.map(row=>this.animation(row));
      const {series,playableById}=await window.MovieClassroom.getLibrary(app);
      const directItems=series.filter(group=>group.dynamicCategory==='animation').flatMap(group=>group.films.map(film=>this.movieFilm(group,film,playableById)));
      allItems=[...items,...directItems];
      if(mode==='direct')items=directItems;
    }else{
      const {series,playableById}=await window.MovieClassroom.getLibrary(app);
      // Dynamic rows belong directly in the two top-level tabs, never as an extra “collection” card.
      items=series.filter(row=>!row.dynamicCategory).map(row=>this.movieSeries(row));allItems=[...items,...series.flatMap(row=>row.films.map(film=>this.movieFilm(row,film,playableById)))];
      if(mode==='animated'){
        // Every movie is a standalone card; personal favourites/categories replace series shelves.
        const originalCollections=allItems.filter(row=>row.key.startsWith('film-')&&!row.key.startsWith('film-series-')&&!row.id.startsWith('tmdb-'));
        const publishedFilms=allItems.filter(row=>row.id.startsWith('tmdb-')&&series.find(group=>group.films.some(([id])=>id===row.id))?.dynamicCategory==='animated');
        items=[...originalCollections,...publishedFilms];
      }
      if(mode==='documentary')items=series.filter(group=>group.dynamicCategory==='documentary').flatMap(group=>group.films.map(film=>this.movieFilm(group,film,playableById)));
      if(mode==='episodes'){
        const courseIds=[...new Set(series.flatMap(group=>group.films.map(([filmId])=>playableById.get(filmId)?.studyCourse?.seriesId).filter(Boolean)))];
        const courses=await Promise.all(courseIds.map(async seriesId=>{
          try{return await app.getJSON(`data/${seriesId}/series.json`);}catch{return null;}
        }));
        items=courses.filter(course=>course&&course.status!=='coming').map(course=>({
          key:`film-course-${course.seriesId}`,scope:'movies',id:course.seriesId,
          title:(course.seriesTitleZh||course.seriesTitle||course.seriesId).replace(/\s*[·|]\s*剧情分集学习\s*$/u,''),
          search:`${course.seriesTitle||''} ${course.seriesTitleZh||''} ${course.seriesId}`,
          cover:course.coverImage,href:`#/series/${course.seriesId}`,level:course.level,
          totalEpisodes:Number(course.totalEpisodes||0),disabled:course.status==='coming'
        }));
      }
    }
    // A personal bookmarks query failure must never blank the public documentary catalogue.
    let states=new Map();
    if(!['all','episodes','animated','documentary'].includes(mode)){
      try{states=await this.states(app);}catch(error){console.warn('Media personal state unavailable',error);states=new Map(Object.entries(this.local()));}
    }
    if(location.hash!==route||window.SFCloud?.user?.id!==uid)return;
    if(scope==='movies'&&mode==='recent'){
      const existingHistory=new Set([...states].filter(([,row])=>row.last_read_at).map(([key])=>key));
      for(const row of Object.values(app.storage('progress')||{})){
        const film=allItems.find(item=>item.courseId===row.seriesId),old=film&&states.get(film.key);
        if(film&&row.modules?.watch&&!existingHistory.has(film.key)&&(!old?.last_read_at||String(row.updatedAt)>String(old.last_read_at)))states.set(film.key,{last_read_at:row.updatedAt,last_cfi:JSON.stringify({href:`#/lesson/${row.seriesId}/${row.episodeId}`,episodeId:row.episodeId,seriesId:row.seriesId})});
      }
    }
    const e=value=>this.e(app,value);
    if(mode==='episodes')items=items;
    if(mode==='favorites')items=allItems.filter(row=>states.get(row.key)?.favorite);
    if(mode==='recent')items=allItems.filter(row=>!row.disabled&&states.get(row.key)?.last_read_at).sort((a,b)=>String(states.get(b.key).last_read_at).localeCompare(String(states.get(a.key).last_read_at))).slice(0,5);
    let content;
    if(mode==='episodes'||mode==='direct')content=items.length?this.cards(app,items,states):'';
    else if(mode==='favorites'){
      const groups=new Map();for(const item of items){const name=states.get(item.key)?.category||'未分类';if(!groups.has(name))groups.set(name,[]);groups.get(name).push(item);}
      content=[...groups].sort(([a],[b])=>a.localeCompare(b,'zh-CN')).map(([name,list])=>`<details class="book-category-shelf"><summary><span>${e(name)}</span><small>${list.length} 部</small></summary>${this.cards(app,list,states,scope==='animation',scope==='animation')}</details>`).join('');
    }else if(mode==='recent')content=items.length?this.cards(app,items,states,true):'';
    else if(scope==='movies'){
      const needle=query.trim().toLowerCase();
      if(needle)items=allItems.filter(row=>!row.key.startsWith('film-series-')&&`${row.title} ${row.search} ${row.id}`.toLowerCase().includes(needle));
      content=this.cards(app,items);
    }else{
      const levelNumber=value=>Number(value);
      const levels=[...new Set(items.map(row=>levelNumber(row.level)).filter(value=>value!==null))].sort((a,b)=>a-b);
      const filters=`<div class="filters media-level-filters" id="levelFilters"><span class="filter-label">动画分级</span>${['all',...levels].map(value=>`<button type="button" class="filter-btn ${String(level)===String(value)?'active':''}" data-media-level="${e(value)}">${value==='all'?'全部等级':'Level '+e(value)}</button>`).join('')}</div>`;
      const needle=query.trim().toLowerCase();
      items=items.filter(row=>(level==='all'||String(levelNumber(row.level))===String(level))&&(!needle||`${row.title} ${row.search||''} ${row.id}`.toLowerCase().includes(needle)));
      content=filters+levels.filter(value=>level==='all'||String(value)===String(level)).map(value=>{const group=items.filter(row=>levelNumber(row.level)===value);return group.length?`<section class="media-level-group"><h2>Level ${e(value)}</h2>${this.cards(app,group)}</section>`:'';}).join('');
    }
    app.el().innerHTML=`${this.nav(scope,mode)}<section class="media-catalog">${content||'<div class="empty">暂无内容。</div>'}${mode==='all'&&!items.length?'<div class="empty">没有找到对应内容。</div>':''}</section>`;
    this.bindCards(app);
    const shelves=app.el().querySelectorAll('.book-category-shelf');shelves.forEach(shelf=>shelf.addEventListener('toggle',()=>{if(shelf.open)shelves.forEach(other=>{if(other!==shelf)other.open=false;});}));
    app.el().querySelectorAll('[data-media-level]').forEach(button=>button.onclick=()=>this.render(app,scope,{mode,query,level:button.dataset.mediaLevel}));
  },
  record(key,metadata){
    const local=this.local(),row={...local[key],last_read_at:new Date().toISOString(),last_cfi:JSON.stringify(metadata)};local[key]=row;localStorage.setItem(this.localKey(),JSON.stringify(local));
    if(!window.SFCloud?.user)return;
    this.pending.set(key,{uid:window.SFCloud.user.id,cfi:row.last_cfi});clearTimeout(this.timers.get(key));this.timers.set(key,setTimeout(()=>this.flush(key),1200));
  },
  async flush(key){
    const keys=key?[key]:[...this.pending.keys()];
    for(const id of keys){clearTimeout(this.timers.get(id));this.timers.delete(id);const pending=this.pending.get(id);this.pending.delete(id);if(pending?.uid===window.SFCloud?.user?.id)try{await window.BookCommunity.rpc('personal',{book_id:id,changes:{cfi:pending.cfi}});}catch{/* Scoped local history remains available offline. */}}
  },
  bindPlayer(player,key,metadata,{resume=true}={}){
    if(player.tagName!=='VIDEO')return;
    player._disposeShelf?.();const uid=window.SFCloud?.user?.id;let last=-1,started=false,disposed=false;
    const same=()=>!disposed&&window.SFCloud?.user?.id===uid;
    const save=()=>{if(!same()||!started)return;const seconds=Math.max(0,Math.floor(player.currentTime||0));last=seconds;this.record(key,{...metadata,seconds});};
    const play=()=>{started=true;save();};const update=()=>{if(Math.abs((player.currentTime||0)-last)>=5)save();};
    player.addEventListener('play',play);player.addEventListener('timeupdate',update);player.addEventListener('pause',save);player.addEventListener('ended',save);
    const restore=async()=>{
      let row=this.local()[key];
      if(uid&&window.SFCloud.client)try{const {data,error}=await window.SFCloud.client.from('book_personal').select('*').eq('user_id',uid).eq('book_id',key).maybeSingle();if(!error&&data&&(!row||Date.parse(data.last_read_at)>Date.parse(row.last_read_at)))row=data;}catch{}
      const saved=this.metadata(row),seconds=Number(saved.seconds||0);
      if(!resume||!same()||saved.href!==metadata.href||seconds<=0)return;
      const seek=()=>{if(same()&&player.currentTime<3&&Number.isFinite(player.duration)&&seconds<player.duration-2)player.currentTime=seconds;};
      if(player.readyState>=1)seek();else player.addEventListener('loadedmetadata',seek,{once:true});
    };restore();
    player._disposeShelf=()=>{save();disposed=true;player.removeEventListener('play',play);player.removeEventListener('timeupdate',update);player.removeEventListener('pause',save);player.removeEventListener('ended',save);this.flush(key);};
  },
  bindLesson(root,d){
    const key=d.series?.movieId?'film-'+d.series.movieId:'anim-'+d.seriesId,metadata={href:`#/lesson/${d.seriesId}/${d.episodeId}`,episodeId:d.episodeId,seriesId:d.seriesId};
    root.querySelectorAll('.hls-video-player').forEach(player=>this.bindPlayer(player,key,metadata));
    const uid=window.SFCloud?.user?.id;
    root.querySelectorAll('iframe').forEach(frame=>frame.addEventListener('load',()=>{if(frame.isConnected&&window.SFCloud?.user?.id===uid)this.record(key,metadata);},{once:true}));
  }
};
