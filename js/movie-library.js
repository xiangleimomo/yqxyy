window.MovieLibrary={
  categories:{animated:'动画大电影',documentary:'纪录片',animation:'动画故事'},
  cache:null,
  e(app,value){return app.escapeHtml(String(value??''));},
  admin(){return !!window.SFCloud?.isAdmin?.()&&!!window.SFCloud?.client;},
  async rows(includeDrafts=false){
    const client=window.SFCloud?.client;if(!client)return [];
    let query=client.from('movie_library').select('*').order('sort_order',{ascending:true}).order('created_at',{ascending:false});
    if(!includeDrafts)query=query.eq('published',true);
    const {data,error}=await query;if(error)throw error;return data||[];
  },
  async published(){
    // Do not permanently cache an empty response when the cloud client has not initialized.
    if(!window.SFCloud?.client){this.cache=null;return [];}
    // Refresh published catalogue on every shelf navigation; admin updates must appear immediately.
    try{return await this.rows(false);}catch(error){console.warn('Published movie library unavailable',error);throw error;}
  },
  invalidate(){this.cache=null;},
  asGroups(rows){
    return Object.keys(this.categories).map(category=>({id:'library-'+category,title:this.categories[category],titleZh:this.categories[category],level:'',rating:0,genre:'动态影视',dynamicCategory:category,films:rows.filter(row=>row.category===category).map(row=>[row.id,row.title,row.title_zh,row.year])})).filter(group=>group.films.length);
  },
  info(rows){return new Map(rows.map(row=>[row.id,row]));},
  async search(query){
    const response=await fetch('/.netlify/functions/movie-library-metadata?q='+encodeURIComponent(query),{cache:'no-store',signal:AbortSignal.timeout(15000)});
    const body=await response.json().catch(()=>({}));if(!response.ok)throw Error(body.error||'搜索失败');return body.results||[];
  },
  async verifyPlayback(tmdbId){
    const response=await fetch('/.netlify/functions/movie-library-metadata?verify='+encodeURIComponent(tmdbId),{cache:'no-store',signal:AbortSignal.timeout(15000)});
    const body=await response.json().catch(()=>({}));if(!response.ok||!body.playbackAvailable)throw Error(body.error||'现有播放架构暂未匹配到本片。');
  },
  async check111Source(tmdbId,type,season=1,episode=1){
    const query=new URLSearchParams({tmdbId:String(tmdbId),type,season:String(season),episode:String(episode)});
    const response=await fetch('/.netlify/functions/111-node-source-check?'+query,{cache:'no-store',signal:AbortSignal.timeout(9000)});
    if(!response.ok)throw Error('111 检测接口返回 '+response.status);
    return response.json();
  },
  async uploadCover(file,status){
    if(!file||!/^image\/(jpeg|png|webp)$/.test(file.type))throw Error('请选择 JPG、PNG 或 WebP 图片。');
    if(file.size>20*1024*1024)throw Error('封面图片不能超过 20 MB。');
    if(!this.admin())throw Error('请重新登录管理员账号。');
    const {data,error}=await window.SFCloud.client.auth.getSession();if(error||!data.session?.access_token)throw Error('登录已过期。');
    const body=new FormData();body.append('files[]',file);
    return await new Promise((resolve,reject)=>{const xhr=new XMLHttpRequest(),config=window.STORYFOX_SUPABASE;xhr.open('POST',config.url+'/functions/v1/pone-upload?kind=image');xhr.responseType='json';xhr.timeout=140000;xhr.setRequestHeader('Authorization','Bearer '+data.session.access_token);xhr.setRequestHeader('apikey',config.publishableKey);xhr.upload.onprogress=event=>status.textContent=event.lengthComputable?`正在上传封面… ${Math.min(99,Math.floor(event.loaded/event.total*100))}%`:'正在上传封面…';xhr.onload=()=>xhr.status===200&&xhr.response?.url?resolve(xhr.response.url):reject(Error(xhr.response?.error||'封面上传失败'));xhr.onerror=xhr.ontimeout=()=>reject(Error('封面上传连接失败'));xhr.send(body);});
  },
  async renderAdmin(app){
    if(!this.admin()){app.el().innerHTML='<section class="empty"><h2>仅管理员可管理影视资源</h2><a href="#/movies">返回光影课堂</a></section>';return;}
    const e=value=>this.e(app,value);let rows=await this.rows(true),selected=null,cover='';
    const formHtml=()=>`<section class="book-admin movie-library-admin"><header><h1>影视资源管理</h1><p>搜索影片资料后发布。系统只按 TMDB 编号交给现有播放器匹配，不保存或填写影片直链。</p></header><div class="movie-admin-search"><input id="movieMetaSearch" maxlength="80" placeholder="输入中英文影片名称"><button class="btn" id="movieMetaSearchButton">搜索影片</button></div><div id="movieMetaResults" class="movie-meta-results"></div><form id="movieLibraryForm"><input name="id" type="hidden"><div class="book-admin-columns"><div><label>发布栏目<select name="category">${Object.entries(this.categories).map(([key,label])=>`<option value="${key}">${label}</option>`).join('')}</select></label><label>影片名称<input name="title" required maxlength="220"></label><label>中文名称<input name="title_zh" maxlength="220"></label><label>上映年份<input name="year" type="number" min="1888" max="2200"></label><label>TMDB ID<input name="tmdb_id" type="number" min="1" required readonly></label><label>影片类型<select name="media_type"><option value="movie">电影</option><option value="tv">电视剧</option></select></label><div class="movie-tv-fields"><label>第几季<input name="season_number" type="number" min="1" value="1"></label><label>第几集<input name="episode_number" type="number" min="1" value="1"></label></div><label>影片简介<textarea name="overview" maxlength="4000"></textarea></label><label>封面地址<input name="poster_url" type="url" maxlength="2048"></label><label>手动上传封面<input name="cover_file" type="file" accept="image/jpeg,image/png,image/webp"></label><label>排序<input name="sort_order" type="number" value="0"></label><label><input name="published" type="checkbox" checked> 立即发布</label></div><aside><h2>封面预览</h2><div id="movieLibraryPreview"></div></aside></div><p id="movieLibraryStatus" role="status" aria-live="polite"></p><button class="btn secondary" type="button" id="movie111Check">检测111来源</button> <button class="btn" type="submit">发布影片</button> <button class="btn secondary" type="button" id="movieLibraryReset">新建</button></form></section><section class="book-admin movie-library-admin"><h2>已发布资源</h2><div class="movie-admin-list">${rows.map(row=>`<article data-id="${e(row.id)}"><img src="${e(row.poster_url)}" alt="" referrerpolicy="no-referrer"><div><strong>${e(row.title_zh||row.title)}</strong><span>${e(this.categories[row.category]||row.category)} · ${e(row.year||'年份未填')} · TMDB ${e(row.tmdb_id)}</span></div><button class="btn secondary movie-edit">编辑</button><button class="btn secondary movie-delete">删除</button></article>`).join('')||'<p class="muted">尚未发布影视资源。</p>'}</div></section>`;
    app.el().innerHTML=formHtml();const form=app.el().querySelector('#movieLibraryForm'),field=name=>form.elements.namedItem(name),status=form.querySelector('#movieLibraryStatus'),publishButton=form.querySelector('button[type="submit"]');form.noValidate=true;const show=(message,kind='')=>{status.textContent=message;status.className='movie-library-status '+kind;};
    const preview=()=>{const url=field('poster_url').value.trim()||cover;app.el().querySelector('#movieLibraryPreview').innerHTML=url?`<img src="${e(url)}" alt="封面预览" referrerpolicy="no-referrer">`:'<p class="muted">选择影片或上传封面后显示预览。</p>';};
    const fill=row=>{selected=row;cover=row.posterUrl||row.poster_url||'';field('id').value=row.id||`tmdb-${row.mediaType||row.media_type}-${row.tmdbId||row.tmdb_id}`;field('category').value=row.category||'animated';field('title').value=row.title||'';field('title_zh').value=row.titleZh||row.title_zh||'';field('year').value=row.year||'';field('tmdb_id').value=row.tmdbId||row.tmdb_id||'';field('media_type').value=row.mediaType||row.media_type||'movie';field('season_number').value=row.seasonNumber||row.season_number||1;field('episode_number').value=row.episodeNumber||row.episode_number||1;field('overview').value=row.overview||'';field('poster_url').value=cover;field('sort_order').value=row.sort_order||0;field('published').checked=row.published!==false;preview();};
    const reset=()=>{form.reset();selected=null;cover='';field('id').value='';field('published').checked=true;preview();};
    app.el().querySelector('#movieLibraryReset').onclick=reset;form.oninput=preview;
    field('cover_file').onchange=async()=>{try{cover=await this.uploadCover(field('cover_file').files[0],status);field('poster_url').value=cover;status.textContent='封面已上传，可继续发布。';preview();}catch(error){status.textContent=error.message;}};
    app.el().querySelector('#movie111Check').onclick=async()=>{const id=Number(field('tmdb_id').value);if(!Number.isSafeInteger(id)||id<1){show('请先从搜索结果选择影片。','error');return;}show('正在用 Node.js 检测 111 来源…','loading');try{const result=await this.check111Source(id,field('media_type').value,field('season_number').value,field('episode_number').value);show(result.htmlResponse?'111 嵌入页面可访问；尚未获得 M3U8，现有播放器不受影响。':'111 页面未能确认可访问；不影响影片发布。',result.htmlResponse?'success':'');}catch(error){show('111 检测失败：'+error.message+'；不影响发布。','error');}};
    const drawResults=list=>{const box=app.el().querySelector('#movieMetaResults');box.innerHTML=list.map((row,index)=>`<button type="button" class="movie-meta-result" data-index="${index}">${row.posterUrl?`<img src="${e(row.posterUrl)}" alt="" referrerpolicy="no-referrer">`:''}<span><strong>${e(row.title)}</strong><small>${e(row.mediaType==='tv'?'电视剧':'电影')} · ${e(row.year||'年份未知')} · TMDB ${e(row.tmdbId)}</small></span></button>`).join('')||'<p class="muted">没有找到可用影片资料。</p>';box.querySelectorAll('[data-index]').forEach(button=>button.onclick=()=>fill(list[Number(button.dataset.index)]));};
    const search=async()=>{const query=app.el().querySelector('#movieMetaSearch').value.trim();if(!query)return;status.textContent='正在搜索影片资料…';try{const list=await this.search(query);drawResults(list);status.textContent=`找到 ${list.length} 条结果，请选择正确影片。`;}catch(error){status.textContent=error.message;}};app.el().querySelector('#movieMetaSearchButton').onclick=search;app.el().querySelector('#movieMetaSearch').onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();search();}};
    form.onsubmit=async event=>{event.preventDefault();if(!this.admin()){show('管理员登录状态已失效，请重新登录。','error');return;}if(!form.checkValidity()){show('请先填写标记为必填的影片资料。','error');form.reportValidity();return;}const type=field('media_type').value;const tmdb=Number(field('tmdb_id').value);if(!Number.isSafeInteger(tmdb)||tmdb<1){show('请从搜索结果中选择有效影片。','error');return;}const row={id:field('id').value||`tmdb-${type}-${tmdb}`,category:field('category').value,media_type:type,tmdb_id:tmdb,title:field('title').value.trim(),title_zh:field('title_zh').value.trim(),year:Number(field('year').value)||null,season_number:type==='tv'?Math.max(1,Number(field('season_number').value)||1):null,episode_number:type==='tv'?Math.max(1,Number(field('episode_number').value)||1):null,poster_url:field('poster_url').value.trim(),overview:field('overview').value.trim(),sort_order:Number(field('sort_order').value)||0,published:field('published').checked,created_by:window.SFCloud.user.id,updated_at:new Date().toISOString()};if(!row.title){show('请填写影片名称。','error');return;}publishButton.disabled=true;try{show('正在发布影片，请稍候…','loading');await this.verifyPlayback(tmdb);show('正在写入影片资料…','loading');const {data,error}=await window.SFCloud.client.from('movie_library').upsert(row,{onConflict:'id'}).select('id,published').single();if(error)throw error;if(!data?.id)throw Error('数据库未确认保存，请重试。');this.invalidate();show('保存成功，正在更新资源列表…','success');rows=await this.rows(true);app.el().innerHTML='';await this.renderAdmin(app);}catch(error){show('发布失败：'+error.message,'error');}finally{publishButton.disabled=false;}};
    app.el().querySelectorAll('.movie-edit').forEach(button=>button.onclick=()=>fill(rows.find(row=>row.id===button.closest('[data-id]').dataset.id)));app.el().querySelectorAll('.movie-delete').forEach(button=>button.onclick=async()=>{const id=button.closest('[data-id]').dataset.id,row=rows.find(item=>item.id===id);if(!window.confirm(`确认删除《${row.title_zh||row.title}》吗？删除后前台将不再显示。`))return;const {error}=await window.SFCloud.client.from('movie_library').delete().eq('id',id);if(error){status.textContent='删除失败：'+error.message;return;}this.invalidate();await this.renderAdmin(app);});preview();
  }
};
