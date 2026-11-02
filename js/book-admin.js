window.BookAdmin = {
  validPdf(value) { return /^https:\/\/u\.pone\.rs\/[A-Za-z0-9]+\.pdf$/.test(value); },
  async render(app) {
    if (!window.SFCloud?.isAdmin()) {
      app.el().innerHTML = '<section class="empty"><h2>仅管理员可以管理绘本</h2><a href="#/reading">返回书架</a></section>';
      return;
    }
    const books = await window.BookReader.library(app);
    const e = value => app.escapeHtml(String(value || ''));
    app.el().innerHTML = `${window.BookReader.readingNavigation()}<section class="book-admin"><header><h1>管理绘本</h1><p>上传 PDF 或填写已有 Pone 直链，核对预览后发布到全站书架。</p></header><form id="bookAdminForm"><label>新增或更新<select name="existing"><option value="">新增绘本</option>${books.map(book => `<option value="${e(book.id)}">${e(book.titleZh || book.title)}</option>`).join('')}</select></label><div class="book-admin-columns"><div><label>PDF 文件<input name="pdf" type="file" accept="application/pdf,.pdf"></label><button type="button" class="btn secondary" id="bookUpload">上传至 Pone</button><p class="muted">文件上传成功后会自动填写直链。已有直链可直接填写。</p><label>PDF 直链<input name="source" type="url" required placeholder="https://u.pone.rs/xxxxxxxx.pdf"></label><label>英文名称<input name="title" required maxlength="180"></label><label>中文名称<input name="titleZh" maxlength="180"></label><label>分级<input name="level" maxlength="40" placeholder="例如 Level 5 或双语绘本"></label><label>简介<textarea name="description" maxlength="1000"></textarea></label><label>封面图片（可选）<input name="cover" type="file" accept="image/jpeg,image/png,image/webp"></label></div><aside><h2>发布预览</h2><div id="bookAdminPreview"></div></aside></div><p id="bookAdminStatus" role="status" aria-live="polite"></p><button type="submit" class="btn" id="bookPublish">确认发布</button> <a href="#/reading">返回书架</a></form></section>`;
    const form = app.el().querySelector('#bookAdminForm');
    const field = name => form.elements.namedItem(name);
    const status = form.querySelector('#bookAdminStatus');
    let coverUrl = '', busy = false, selection = 0;
    const preview = () => {
      const target = form.querySelector('#bookAdminPreview');
      target.replaceChildren();
      if (coverUrl) { const image = new Image(); image.src = coverUrl; image.alt = '封面预览'; target.append(image); }
      const title = document.createElement('h3'); title.textContent = field('titleZh').value || field('title').value || '绘本名称'; target.append(title);
      const detail = document.createElement('p'); detail.textContent = field('level').value; target.append(detail);
    };
    const lock = value => {
      busy = value;
      for (const input of form.querySelectorAll('input,select,textarea,button')) input.disabled = value;
    };
    const auth = async () => {
      const cloud = window.SFCloud;
      if (!cloud?.isAdmin() || !cloud.client) throw new Error('请重新登录管理员账号。');
      const { data, error } = await cloud.client.auth.getUser();
      if (error || data.user?.app_metadata?.site_admin !== true) throw new Error('管理员权限验证失败。');
      const session = await cloud.client.auth.getSession();
      if (!session.data.session?.access_token) throw new Error('登录已过期，请重新登录。');
      return session.data.session.access_token;
    };
    field('existing').onchange = () => {
      selection++;
      const book = books.find(book => book.id === field('existing').value);
      for (const [name, key] of [['title','title'],['titleZh','titleZh'],['source','sourceUrl'],['level','level'],['description','description']]) field(name).value = book?.[key] || '';
      field('pdf').value = ''; field('cover').value = '';
      coverUrl = book?.coverUrl || ''; status.textContent = ''; preview();
    };
    const imageData = image => {
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 360 / image.width, 510 / image.height);
      canvas.width = Math.round(image.width * scale); canvas.height = Math.round(image.height * scale);
      const context = canvas.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const data = canvas.toDataURL('image/jpeg', .75);
      if (data.length > 240000) throw new Error('封面过大，请选择较简单的图片。');
      return data;
    };
    field('cover').onchange = async () => {
      const file = field('cover').files[0]; if (!file) return;
      const version = ++selection;
      try { const image = await createImageBitmap(file); const data = imageData(image); image.close(); if (version === selection) { coverUrl = data; preview(); } }
      catch (error) { status.textContent = error.message || '封面读取失败。'; }
    };
    field('pdf').onchange = async () => {
      const file = field('pdf').files[0]; if (!file) return;
      const version = ++selection;
      field('source').value = '';
      if (!field('title').value) field('title').value = file.name.replace(/\.pdf$/i, '').slice(0, 180);
      if (file.size > 1073741824) { status.textContent = 'PDF 不能超过 1 GiB。'; field('pdf').value = ''; return; }
      status.textContent = '正在读取 PDF 封面…';
      let pdf;
      try {
        if (!(await file.slice(0, 1024).text()).includes('%PDF-')) throw new Error('请选择有效 PDF 文件。');
        await window.BookReader.loadPdfLibraries();
        pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
        const page = await pdf.getPage(1), raw = page.getViewport({ scale: 1 }), viewport = page.getViewport({ scale: 360 / raw.width });
        const canvas = document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        if (version === selection) { coverUrl = imageData(canvas); status.textContent = `已读取 ${pdf.numPages} 页，可以上传。`; preview(); }
      } catch (error) { if (version === selection) status.textContent = '封面未能自动读取，可另选封面后继续：' + error.message; }
      finally { await pdf?.destroy(); }
    };
    form.querySelector('#bookUpload').onclick = async () => {
      if (busy) return;
      const file = field('pdf').files[0];
      if (!file) { status.textContent = '请先选择 PDF 文件。'; return; }
      lock(true);
      try {
        const token = await auth();
        if (file.size > 1073741824 || !(await file.slice(0, 1024).text()).includes('%PDF-')) throw new Error('请选择不超过 1 GiB 的有效 PDF。');
        const body = new FormData(); body.append('files[]', file);
        const url = await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest(); xhr.open('POST', '/book-admin/upload'); xhr.setRequestHeader('Authorization', 'Bearer ' + token); xhr.responseType = 'json';
          xhr.timeout = 1800000;
          xhr.upload.onload = () => { status.textContent = '正在生成直链…'; };
          xhr.upload.onprogress = event => { status.textContent = event.lengthComputable ? `正在上传… ${Math.min(99, Math.floor(event.loaded / event.total * 100))}%` : '正在上传…'; };
          xhr.onload = () => xhr.status === 200 && this.validPdf(xhr.response?.url) ? resolve(xhr.response.url) : reject(new Error(xhr.response?.error || '上传失败，请稍后重试。'));
          xhr.onerror = xhr.ontimeout = () => reject(new Error('上传连接失败，可重试或填写已有直链。'));
          status.textContent = '正在上传…'; xhr.send(body);
        });
        field('source').value = url; status.textContent = '上传成功。请核对名称和封面，再点击确认发布。'; preview();
      } catch (error) { status.textContent = error.message; }
      finally { lock(false); }
    };
    form.oninput = preview;
    form.onsubmit = async event => {
      event.preventDefault(); if (busy) return;
      if (!this.validPdf(field('source').value.trim())) { status.textContent = '请填写有效 Pone PDF 直链。'; return; }
      if (!field('title').value.trim()) { status.textContent = '请填写绘本名称。'; return; }
      lock(true);
      try {
        await auth();
        const id = field('existing').value || 'book-' + crypto.randomUUID();
        const row = { id, title: field('title').value.trim(), title_zh: field('titleZh').value.trim(), level: field('level').value.trim(), description: field('description').value.trim(), source_url: field('source').value.trim(), cover_url: coverUrl, updated_at: new Date().toISOString() };
        const { error } = await window.SFCloud.client.from('story_books').upsert(row, { onConflict: 'id' });
        if (error) throw error;
        status.textContent = '发布成功，所有访客刷新书架即可看到。';
        if (!books.some(book => book.id === id)) {
          const option = document.createElement('option'); option.value = id; option.textContent = row.title_zh || row.title; field('existing').append(option);
        }
        const saved = { id, title: row.title, titleZh: row.title_zh, level: row.level, description: row.description, sourceUrl: row.source_url, coverUrl: row.cover_url };
        const index = books.findIndex(book => book.id === id); if (index < 0) books.push(saved); else books[index] = saved;
        field('existing').value = id;
      } catch (error) { status.textContent = '发布失败：' + (error.message || '请重试。'); }
      finally { lock(false); }
    };
    preview();
  }
};
