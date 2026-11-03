window.BookCommunity = {
  pendingProgress: null,
  progressTimer: null,
  norm(value) { return String(value || '').toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, ''); },
  e(app, value) { return app.escapeHtml(String(value || '')); },
  async rpc(action, payload = {}) {
    const cloud = window.SFCloud, uid = cloud?.user?.id;
    if (!uid || !cloud.client) throw new Error('请先登录自己的账号。');
    const { data, error } = await cloud.client.rpc('book_portal', { p_action: action, p_payload: payload });
    if (window.SFCloud?.user?.id !== uid) throw new Error('账号已切换，请重新操作。');
    if (error) throw new Error(error.code === '23505' ? '这个昵称已被使用，请换一个。' : error.message);
    return data;
  },
  async access() { return window.SFCloud?.user ? this.rpc('access') : { can_upload: false, eligible: false }; },
  requireLogin(app) {
    if (window.SFCloud?.user) return true;
    app.el().innerHTML = `${window.BookReader.readingNavigation()}<section class="empty"><h2>登录后使用个人图书功能</h2><button class="btn" id="bookLogin">登录 / 注册</button></section>`;
    app.el().querySelector('#bookLogin').onclick = () => window.SFCloud?.open();
    return false;
  },
  async find(app, query, includeMedia = true) {
    const needle = this.norm(query); if (!needle) return { books: [], media: [] };
    const [books, series] = await Promise.all([window.BookReader.shelfLibrary(app, true), includeMedia && window.BookReader.shelfBase()!=='#/magazines' ? app.getJSON('data/series-list.json') : []]);
    const matches = (...values) => values.some(value => { const text = this.norm(value); return text && (text.includes(needle) || needle.includes(text)); });
    return { books: books.filter(book => matches(book.title, book.titleZh, book.uploaderNickname)), media: series.filter(item => matches(item.title, item.titleZh)) };
  },
  async renderSearch(app, query) {
    const route=location.hash;
    const result = await this.find(app, query, false), e = value => this.e(app, value);
    if(location.hash!==route)return;
    document.getElementById('globalSearch').value=query;
    app.el().innerHTML = `${window.BookReader.readingNavigation()}<p class="book-search-result">${e(query)} · ${result.books.length} 本</p>${window.BookReader.bookCards(app, result.books)}${result.books.length?'':`<div class="empty">暂无匹配${window.BookReader.shelfLabel()}。</div>`}`;
    window.BookReader.bindBookCards(app);
  },
  async checkDuplicate(app, title) {
    const matches = await Promise.all((Array.isArray(title) ? title : [title]).filter(Boolean).map(value=>this.find(app,value)));
    const result = { books:[...new Map(matches.flatMap(value=>value.books).map(book=>[book.id,book])).values()], media:[...new Map(matches.flatMap(value=>value.media).map(series=>[series.seriesId,series])).values()] };
    if (!result.books.length && !result.media.length) return false;
    const lines = [...result.books.map(book => `${book.titleZh || book.title}${book.uploaderNickname ? '（' + book.uploaderNickname + '）' : ''}${book.audioUrl ? ' · 音频' : ''}${book.videoUrl ? ' · 视频' : ''}`), ...result.media.map(item => `${item.titleZh || item.title} · 站内动画`)];
    if (!window.confirm('发现已有相关资源：\n\n' + lines.slice(0, 12).join('\n') + '\n\n请先查看是否可以直接使用。确认仍要重复上传吗？')) throw new Error('已取消重复上传，可先搜索并阅读现有资源。');
    return true;
  },
  async upload(file, kind, status) {
    if (!file || file.size > 1073741824) throw new Error('请选择不超过 1 GiB 的文件。');
    if (kind === 'pdf' && !(await file.slice(0, 1024).text()).includes('%PDF-')) throw new Error('请选择有效 PDF。');
    const access = await this.access(); if (!access.can_upload) throw new Error('请先完成家长昵称设置。');
    const { data, error } = await window.SFCloud.client.auth.getSession();
    if (error || !data.session?.access_token) throw new Error('登录已过期。');
    const body = new FormData(); body.append('files[]', file);
    return new Promise((resolve, reject) => {
      const config=window.STORYFOX_SUPABASE;
      const xhr = new XMLHttpRequest(); xhr.open('POST', config.url + '/functions/v1/pone-upload?kind=' + kind); xhr.responseType = 'json'; xhr.timeout = 140000;
      xhr.setRequestHeader('Authorization', 'Bearer ' + data.session.access_token);
      xhr.setRequestHeader('apikey',config.publishableKey);
      xhr.upload.onprogress = event => { status.textContent = event.lengthComputable ? `正在上传… ${Math.min(99, Math.floor(event.loaded / event.total * 100))}%` : '正在上传…'; };
      xhr.upload.onload = () => { status.textContent = '正在生成直链…'; };
      xhr.onload = () => xhr.status === 200 && xhr.response?.url ? resolve(xhr.response.url) : reject(new Error(xhr.response?.error || '上传失败，请重试。'));
      xhr.onerror = xhr.ontimeout = () => reject(new Error('上传连接失败，请重试。'));
      xhr.send(body);
    });
  },
  async publishCover(value,status){
    if(!value.startsWith('data:'))return value;
    const blob=await (await fetch(value)).blob();
    status.textContent='正在上传封面至 Pone…';
    return this.upload(new File([blob],'cover.jpg',{type:'image/jpeg'}),'image',status);
  },
  imageData(image) {
    const canvas = document.createElement('canvas'), width = image.width, height = image.height;
    const scale = Math.min(1, 420 / width, 600 / height); canvas.width = Math.max(1, Math.round(width * scale)); canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL('image/jpeg', .72); if (data.length > 240000) throw new Error('封面过大，请另选图片。'); return data;
  },
  async pdfCover(file) {
    await window.BookReader.loadPdfLibraries();
    const pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    try {
      const page = await pdf.getPage(1), raw = page.getViewport({ scale: 1 }), viewport = page.getViewport({ scale: 840 / raw.width });
      const full = document.createElement('canvas'); full.width = Math.ceil(viewport.width); full.height = Math.ceil(viewport.height);
      await page.render({ canvasContext: full.getContext('2d'), viewport }).promise;
      const cover = document.createElement('canvas'), spread = raw.width > raw.height * 1.2;
      cover.width = spread ? Math.floor(full.width / 2) : full.width; cover.height = full.height;
      cover.getContext('2d').drawImage(full, spread ? full.width / 2 : 0, 0, cover.width, cover.height, 0, 0, cover.width, cover.height);
      return this.imageData(cover);
    } finally { await pdf.destroy(); }
  },
  async renderUpload(app) {
    if (!this.requireLogin(app)) return;
    const base=window.BookReader.shelfBase(),label=window.BookReader.shelfLabel();
    const access = await this.access(), e = value => this.e(app, value);
    if (!access.eligible) { app.el().innerHTML = `${window.BookReader.readingNavigation()}<section class="empty"><p>请使用家长账号，并完成新账号的邮箱验证。</p></section>`; return; }
    if (!access.nickname) {
      const nickname=window.SFCloud.nickname();
      if(nickname){await this.rpc('setup',{nickname});return this.renderUpload(app);}
      app.el().innerHTML = `${window.BookReader.readingNavigation()}<section class="empty"><h1>请先完善账号昵称</h1><p>在账号管理中设置一次昵称，即可用于${label}上传。</p><button class="btn" id="bookAccountSettings">打开账号管理</button></section>`;
      app.el().querySelector('#bookAccountSettings').onclick=()=>window.SFCloud.open();return;
    }
    app.el().innerHTML = `${window.BookReader.readingNavigation()}<section class="book-admin"><h1>上传${label}</h1><p>上传者：${e(access.nickname)}。发布后不能自行修改或删除，可提交管理员审核申请。</p><form id="parentBookForm"><label>${label}名称<input name="title" required maxlength="180"></label><label>中文名称（可选）<input name="title_zh" maxlength="180"></label><button type="button" class="btn secondary" id="checkBookDuplicate">先检索已有资源</button><div id="bookDuplicateResults"></div><label>分级<input name="level" maxlength="40"></label><label>简介<textarea name="description" maxlength="1000"></textarea></label>${[['pdf','PDF '+label,'application/pdf,.pdf'],['audio','配套音频（可选）','audio/mpeg,audio/mp4,audio/ogg,audio/wav,.mp3,.m4a,.aac'],['video','配套视频（可选）','video/mp4,video/webm,video/quicktime']].map(([kind,label,accept]) => `<fieldset><legend>${label}</legend><input type="file" name="${kind}_file" accept="${accept}"><button type="button" class="btn secondary" data-upload="${kind}">上传${kind === 'pdf' ? label : kind === 'audio' ? '音频' : '视频'}</button><label>或填写 HTTPS 直链<input type="url" name="${kind}_url" ${kind === 'pdf' ? 'required' : ''}></label></fieldset>`).join('')}<label>另选封面（可选）<input name="cover_file" type="file" accept="image/jpeg,image/png,image/webp"></label><div id="parentBookPreview"></div><p id="parentBookStatus" role="status" aria-live="polite"></p><button class="btn" id="parentBookPublish">核对后发布</button></form></section>`;
    const form = app.el().querySelector('#parentBookForm'), field = name => form.elements.namedItem(name), status = form.querySelector('#parentBookStatus');
    let cover = '', busy = false, confirmed = '', coverVersion = 0;
    const signature = () => field('title').value.trim() + '\n' + field('title_zh').value.trim();
    const lock = value => { busy = value; for (const input of form.querySelectorAll('button,input,textarea')) input.disabled = value; };
    const preview = () => { form.querySelector('#parentBookPreview').innerHTML = `${cover ? `<img src="${e(cover)}" alt="封面预览">` : ''}<strong>${e(field('title_zh').value || field('title').value)}</strong><span>上传者：${e(access.nickname)}</span>`; };
    const check = async () => { if (!field('title').value.trim()) throw new Error('请先填写书籍名称。'); const duplicate = await this.checkDuplicate(app, [field('title').value.trim(),field('title_zh').value.trim()]); confirmed = duplicate ? signature() : ''; return duplicate; };
    form.querySelector('#checkBookDuplicate').onclick = async () => {
      try { if (!field('title').value.trim()) throw new Error('请先填写书名。'); const result = await this.find(app, field('title_zh').value || field('title').value); form.querySelector('#bookDuplicateResults').innerHTML = `<p>找到 ${result.books.length} 本${label}${base==='#/magazines'?'':'和 '+result.media.length+' 个动画系列'}。</p><a href="${base}/search/${encodeURIComponent(field('title_zh').value || field('title').value)}" target="_blank" rel="noopener">查看已有${label}、上传者和配套资源</a>`; } catch (error) { status.textContent = error.message; }
    };
    form.oninput = preview;
    field('pdf_file').onchange = async () => {
      const file = field('pdf_file').files[0], version = ++coverVersion; if (!file) return;
      field('pdf_url').value = ''; if (!field('title').value) field('title').value = file.name.replace(/\.pdf$/i, '').slice(0,180);
      if (file.size > 1073741824) { status.textContent = 'PDF 不能超过 1 GiB。'; field('pdf_file').value = ''; return; }
      status.textContent = '正在提取竖版封面…';
      try { const data = await this.pdfCover(file); if (version === coverVersion) { cover = data; preview(); status.textContent = '封面已就绪，请检索资源后上传。'; } }
      catch { if (version === coverVersion) status.textContent = '封面无法自动提取，可另选封面后继续。'; }
    };
    field('cover_file').onchange = async () => { const file = field('cover_file').files[0]; if (!file) return; ++coverVersion; try { const image = await createImageBitmap(file); cover = this.imageData(image); image.close(); preview(); } catch (error) { status.textContent = error.message; } };
    form.querySelectorAll('[data-upload]').forEach(button => button.onclick = async () => {
      if (busy) return;
      const kind = button.dataset.upload;
      try { lock(true); await check(); const url = await this.upload(field(kind + '_file').files[0], kind, status); field(kind + '_url').value = url; status.textContent = '上传完成，请核对资料后发布。'; }
      catch (error) { status.textContent = error.message; } finally { lock(false); }
    });
    form.onsubmit = async event => {
      event.preventDefault(); if (busy) return;
      try {
        lock(true);
        if (!window.BookAdmin.validPdf(field('pdf_url').value.trim())) throw new Error('请上传 PDF 或填写有效 Pone PDF 直链。');
        if (confirmed !== signature()) await check();
        cover=await this.publishCover(cover,status);
        const payload = { content_kind:base==='#/magazines'?'magazine':'book', title: field('title').value.trim(), title_zh: field('title_zh').value.trim(), level: field('level').value.trim(), description: field('description').value.trim(), source_url: field('pdf_url').value.trim(), audio_url: field('audio_url').value.trim(), video_url: field('video_url').value.trim(), cover_url: cover, duplicate_confirmed: confirmed === signature() };
        for (const key of ['audio_url','video_url']) if (payload[key]) { const url = new URL(payload[key]); if (url.protocol !== 'https:' || url.username || url.password) throw new Error('音视频请使用不含账号密码的 HTTPS 直链。'); }
        await this.rpc('publish', payload); location.hash = base+'/mine/uploads';
      } catch (error) { status.textContent = '发布未完成：' + error.message; } finally { lock(false); }
    };
  },
  async personalDialog(app, id, options = {}) {
    if (!window.SFCloud?.user) { window.SFCloud?.open(); return; }
    const uid=window.SFCloud.user.id;
    const { data, error } = await window.SFCloud.client.from('book_personal').select('*').eq('book_id', id).maybeSingle();
    if(window.SFCloud?.user?.id!==uid)return;
    if (error) { alert(error.message); return; }
    const dialog = document.createElement('dialog'); dialog.className = 'book-personal-dialog';
    dialog.innerHTML = `<form><h2>${options.media?'收藏 / 分类':'个人图书管理'}</h2><label><input type="checkbox" name="favorite" ${data?.favorite ? 'checked' : ''}>${options.media?'收藏此内容':'收藏这本书'}</label><label>我的分类<input name="category" maxlength="60" value="${this.e(app, data?.category)}" placeholder="例如 睡前故事、英语启蒙"></label><p role="status"></p><button class="btn">保存</button> <button type="button" data-close>取消</button></form>`;
    (document.fullscreenElement || document.body).append(dialog); dialog.showModal(); dialog.querySelector('[data-close]').onclick = () => dialog.close(); dialog.onclose = () => dialog.remove();
    dialog.querySelector('form').onsubmit = async event => { event.preventDefault(); try { const form = event.currentTarget; await this.rpc('personal', { book_id: id, changes: { favorite: form.elements.favorite.checked, category: form.elements.category.value.trim() } }); dialog.close(); if(options.onSave)await options.onSave();else if(/^#\/(reading|magazines)\/mine\/(favorites|recent)$/.test(location.hash))await this.renderMine(app,location.hash.split('/')[3]); } catch (error) { if(dialog.isConnected)dialog.querySelector('[role=status]').textContent = error.message; } };
  },
  async renderMine(app, mode = 'all') {
    if (!this.requireLogin(app)) return;
    const route=location.hash,base=window.BookReader.shelfBase();
    const uid = window.SFCloud.user.id;
    const [books, personal, requests] = await Promise.all([window.BookReader.shelfLibrary(app, true), window.SFCloud.client.from('book_personal').select('*').eq('user_id', uid), ['favorites','recent'].includes(mode) ? {data:[]} : window.SFCloud.client.from('book_change_requests').select('*').eq('user_id', uid).order('created_at', { ascending: false })]);
    if(window.SFCloud?.user?.id!==uid||location.hash!==route)return;
    if (personal.error || requests.error) throw new Error(personal.error?.message || requests.error.message);
    const ownRequests=requests.data.filter(row=>books.some(book=>book.id===row.book_id));
    const states = new Map(personal.data.map(row => [row.book_id, row])), e = value => this.e(app, value);
    let shown = books.filter(book => mode === 'uploads' ? book.ownerId === uid : mode === 'favorites' ? states.get(book.id)?.favorite : mode === 'recent' ? states.get(book.id)?.last_read_at : book.ownerId === uid || states.has(book.id));
    if (mode === 'recent') shown=shown.sort((a,b) => String(states.get(b.id).last_read_at).localeCompare(String(states.get(a.id).last_read_at))).slice(0,5);
    if (mode==='favorites'||mode==='recent') {
      const cards=list=>window.BookReader.bookCards(app,list,'',{compact:true,resume:mode==='recent'});
      const groups=new Map();
      if(mode==='favorites')for(const book of shown){const name=states.get(book.id)?.category||'未分类';if(!groups.has(name))groups.set(name,[]);groups.get(name).push(book);}
      const shelves=[...groups].sort(([a],[b])=>a.localeCompare(b,'zh-CN')).map(([name,list])=>`<details class="book-category-shelf"><summary><span>${e(name)}</span><small>${list.length} 本</small></summary>${cards(list)}</details>`).join('');
      app.el().innerHTML=window.BookReader.readingNavigation()+(shown.length?(mode==='favorites'?`<section class="book-category-shelves">${shelves}</section>`:cards(shown)):`<div class="empty">${mode==='favorites'?'暂无收藏'+window.BookReader.shelfLabel()+'。':'暂无阅读记录。'}</div>`);
      const sections=app.el().querySelectorAll('.book-category-shelf');
      sections.forEach(section=>section.addEventListener('toggle',()=>{if(section.open)sections.forEach(other=>{if(other!==section)other.open=false;});}));
      window.BookReader.bindBookCards(app);return;
    }
    const categories = [...new Set(personal.data.filter(row=>books.some(book=>book.id===row.book_id)).map(row => row.category).filter(Boolean))].sort();
    app.el().innerHTML = `${window.BookReader.readingNavigation()}<h1>${base==='#/magazines'?'我的期刊':'我的图书'}</h1><nav class="book-personal-tabs">${[['all','全部'],['uploads','我的上传'],['favorites','我的收藏'],['recent','最近阅读']].map(([key,label]) => `<a href="${base}/mine/${key}" ${key===mode?'aria-current="page"':''}>${label}</a>`).join('')}</nav><label>按我的分类筛选 <select id="bookCategoryFilter"><option value="">全部分类</option>${categories.map(value => `<option>${e(value)}</option>`).join('')}</select></label>${window.BookReader.bookCards(app, shown)}<h2>我的修改／删除申请</h2>${ownRequests.map(row => `<article class="book-request"><strong>${e(books.find(book => book.id === row.book_id)?.titleZh || books.find(book => book.id === row.book_id)?.title || row.book_id)}</strong><p>${row.kind==='delete'?'删除':'修改'} · ${{pending:'待审核',approved:'已通过',rejected:'未通过'}[row.status]}${row.review_note?' · '+e(row.review_note):''}</p></article>`).join('') || '<p>暂无申请。</p>'}`;
    window.BookReader.bindBookCards(app);
    const cards = app.el().querySelectorAll('.book-card');
    if (!cards.length) { const empty=document.createElement('p'); empty.className='empty'; empty.textContent=mode==='recent'?'使用本站阅览器阅读后，这里会显示阅读记录和继续阅读入口。':mode==='favorites'?'点击书籍下方的“收藏 / 分类”，即可加入我的收藏。':'暂无图书，可从上传或收藏开始建立自己的书架。'; app.el().querySelector('.book-grid').after(empty); }
    cards.forEach(card => {
      const id = card.dataset.bookId, state = states.get(id), book = shown.find(book => book.id === id);
      if (state?.last_read_at) { const info = document.createElement('p'); info.className = 'book-history-note'; info.textContent = `上次阅读：${new Date(state.last_read_at).toLocaleString()} · 第 ${state.last_page + 1} 页`; card.append(info); }
      if (mode === 'recent') {
        const link = document.createElement('a'); link.className = 'btn secondary'; link.href = '#/reader/' + id; link.textContent = '继续阅读'; card.append(link);
      }
      if (book.ownerId === uid) for (const [kind,label] of [['edit','申请修改'],['delete','申请删除']]) { const button = document.createElement('button'); button.className = 'book-request-button'; button.textContent = label; button.onclick = () => this.requestDialog(app, book, kind); card.append(button); }
    });
    app.el().querySelector('#bookCategoryFilter').onchange = event => cards.forEach(card => { card.hidden = !!event.target.value && states.get(card.dataset.bookId)?.category !== event.target.value; });
  },
  requestDialog(app, book, kind) {
    const e = value => this.e(app, value), dialog = document.createElement('dialog'); dialog.className = 'book-personal-dialog';
    const fields = [['title','书名',book.title],['title_zh','中文名',book.titleZh],['level','分级',book.level],['source_url','PDF 直链',book.sourceUrl],['audio_url','音频直链',book.audioUrl],['video_url','视频直链',book.videoUrl],['description','简介',book.description]];
    dialog.innerHTML = `<form><h2>${kind==='delete'?'申请删除':'申请修改'}：${e(book.titleZh || book.title)}</h2><p>提交后仍保留当前版本，管理员审核通过才会生效。</p>${kind==='edit'?fields.map(([key,label,value]) => `<label>${label}<input name="${key}" value="${e(value)}" ${key==='title'?'required':''} maxlength="${key==='description'?1000:key.endsWith('url')?2048:180}"></label>`).join(''):''}<label>申请说明<textarea name="reason" required maxlength="1000"></textarea></label><p role="status"></p><button class="btn">提交审核</button> <button type="button" data-close>取消</button></form>`;
    document.body.append(dialog); dialog.showModal(); dialog.querySelector('[data-close]').onclick = () => dialog.close(); dialog.onclose = () => dialog.remove();
    dialog.querySelector('form').onsubmit = async event => { event.preventDefault(); const form = event.currentTarget; try { const changes = {}; if (kind==='edit') for (const [key] of fields) changes[key]=form.elements.namedItem(key).value.trim(); await this.rpc('request', { book_id: book.id, kind, changes, reason: form.elements.reason.value.trim() }); dialog.close(); await this.renderMine(app,'uploads'); } catch (error) { dialog.querySelector('[role=status]').textContent = error.message; } };
  },
  async renderReviews(app, host) {
    const { data, error } = await window.SFCloud.client.from('book_change_requests').select('*').eq('status','pending').order('created_at');
    if (error) throw error;
    const books = await window.BookReader.shelfLibrary(app), e = value => this.e(app,value);
    const pending=data.filter(row=>books.some(book=>book.id===row.book_id));
    const section = document.createElement('section'); section.className = 'book-review-list';
    section.innerHTML = `<h2>家长修改／删除申请 · ${pending.length}</h2>${pending.map(row => { const book = books.find(book => book.id===row.book_id); return `<article data-request="${e(row.id)}"><h3>${e(book?.titleZh || book?.title || row.book_id)}</h3><p>上传者：${e(book?.uploaderNickname)} · ${row.kind==='delete'?'申请删除':'申请修改'}</p><p>${e(row.reason)}</p>${row.kind==='edit'?`<pre>${e(JSON.stringify(row.changes,null,2))}</pre>`:''}<label>审核说明<input name="note" maxlength="1000"></label><button type="button" data-approve="true">通过并生效</button> <button type="button" data-approve="false">拒绝</button><p role="status"></p></article>`; }).join('') || '<p>暂无待审核申请。</p>'}`;
    host.append(section);
    section.querySelectorAll('[data-approve]').forEach(button => button.onclick = async () => { const article = button.closest('[data-request]'); article.querySelectorAll('button').forEach(node => { node.disabled=true; }); try { await this.rpc('review',{request_id:article.dataset.request,approve:button.dataset.approve==='true',note:article.querySelector('input').value.trim()}); article.replaceChildren(document.createTextNode('审核已完成。')); } catch(error) { article.querySelector('[role=status]').textContent=error.message; article.querySelectorAll('button').forEach(node=>{node.disabled=false;}); } });
  },
  progressKey(id) { const uid = window.SFCloud?.user?.id; return 'storyfox-pdf-progress:' + (uid ? uid + ':' : '') + id; },
  async restoreProgress(item) {
    const uid = window.SFCloud?.user?.id; if (!uid || !window.SFCloud.client) return;
    const key=this.progressKey(item.id), cfiKey='storyfox-book-progress:'+uid+':'+item.id;
    try {
      const {data,error}=await window.SFCloud.client.from('book_personal').select('last_page,last_cfi,last_read_at').eq('book_id',item.id).eq('user_id',uid).maybeSingle();
      if (error || window.SFCloud?.user?.id!==uid) return;
      const stamp=Number(localStorage.getItem(key+':updated')||0);
      if (stamp > Date.parse(data?.last_read_at || '1970-01-01')) { this.record(item,Number(localStorage.getItem(key)||0),item.format==='epub' ? localStorage.getItem(cfiKey)||'' : ''); return; }
      if (data?.last_read_at) { localStorage.setItem(key,String(data.last_page)); localStorage.setItem(key+':updated',String(Date.parse(data.last_read_at))); if(data.last_cfi)localStorage.setItem(cfiKey,data.last_cfi); }
    } catch { /* Own local progress remains available offline. */ }
  },
  record(item, page, cfi = '') {
    const uid = window.SFCloud?.user?.id;
    localStorage.setItem(this.progressKey(item.id),String(Math.max(0,Number(page)||0)));
    localStorage.setItem(this.progressKey(item.id)+':updated',String(Date.now()));
    if (!uid || item.id.startsWith('local-')) return;
    if (this.pendingProgress?.book_id !== item.id) this.flushProgress();
    this.pendingProgress={ uid, book_id:item.id, changes:cfi?{cfi}:{page:Math.max(0,Math.floor(Number(page)||0))} };
    clearTimeout(this.progressTimer); this.progressTimer=setTimeout(()=>this.flushProgress(),1200);
  },
  flushProgress() {
    clearTimeout(this.progressTimer); const pending=this.pendingProgress; this.pendingProgress=null;
    if (pending && pending.uid===window.SFCloud?.user?.id) return this.rpc('personal',{book_id:pending.book_id,changes:pending.changes}).catch(()=>{});
  }
};
