window.BookAdmin = {
  validPdf(value) { return /^https:\/\/u\.pone\.rs\/[A-Za-z0-9]+\.pdf$/.test(value); },
  async render(app) {
    const base=window.BookReader.shelfBase(),label=window.BookReader.shelfLabel();
    if (!window.SFCloud?.isAdmin()) {
      app.el().innerHTML = `<section class="empty"><h2>仅管理员可以管理${label}</h2><a href="${base}">返回书架</a></section>`;
      return;
    }
    const books = await window.BookReader.shelfLibrary(app, true);
    const e = value => app.escapeHtml(String(value || ''));
    app.el().innerHTML = `${window.BookReader.readingNavigation()}<section class="book-admin"><header><h1>管理${label}</h1><p>上传 PDF 或填写已有 Pone 直链，核对预览后发布到全站书架。</p></header><form id="bookAdminForm"><label>新增或更新<select name="existing"><option value="">新增${label}</option>${books.map(book => `<option value="${e(book.id)}">${e(book.titleZh || book.title)}</option>`).join('')}</select></label><div class="book-admin-columns"><div><label>PDF 文件<input name="pdf" type="file" accept="application/pdf,.pdf"></label><button type="button" class="btn secondary" id="bookUpload">上传至 Pone</button><p class="muted">文件上传成功后会自动填写直链。已有直链可直接填写。</p><label>PDF 直链<input name="source" type="url" required placeholder="https://u.pone.rs/xxxxxxxx.pdf"></label><label>英文名称<input name="title" required maxlength="180"></label><label>中文名称<input name="titleZh" maxlength="180"></label><label>分级<input name="level" maxlength="40" placeholder="例如 Level 5 或双语绘本"></label><label>简介<textarea name="description" maxlength="1000"></textarea></label><label>封面图片（可选）<input name="cover" type="file" accept="image/jpeg,image/png,image/webp"></label></div><aside><h2>发布预览</h2><div id="bookAdminPreview"></div></aside></div><p id="bookAdminStatus" role="status" aria-live="polite"></p><button type="submit" class="btn" id="bookPublish">确认发布</button> <a href="${base}">返回书架</a></form></section>`;
    const form = app.el().querySelector('#bookAdminForm');
    const field = name => form.elements.namedItem(name);
    const status = form.querySelector('#bookAdminStatus');
    const shelf = document.createElement('section');
    shelf.className = 'book-admin-shelf';
    shelf.innerHTML = '<h2>书架管理</h2><p>拖动 ⠿ 调整顺序，松开后自动保存。删除后全站书架将移除该绘本。</p><p class="book-shelf-status" role="status" aria-live="polite"></p><div class="book-admin-shelf-grid"></div>';
    form.before(shelf);
    const shelfStatus = shelf.querySelector('.book-shelf-status');
    const grid = shelf.querySelector('.book-admin-shelf-grid');
    let coverUrl = '', busy = false, selection = 0;
    const preview = () => {
      const target = form.querySelector('#bookAdminPreview');
      target.replaceChildren();
      if (coverUrl) { const image = new Image(); image.src = coverUrl; image.alt = '封面预览'; target.append(image); }
      const title = document.createElement('h3'); title.textContent = field('titleZh').value || field('title').value || '绘本名称'; target.append(title);
      const detail = document.createElement('p'); detail.textContent = field('level').value; target.append(detail);
      if(field('existing').value){const badge=document.createElement('a');badge.href='#/honors/admin/'+encodeURIComponent((base==='#/magazines'?'magazine:':'book:')+field('existing').value);badge.textContent='🏅 查看 / 配置作品主题徽章';target.append(badge);}
    };
    const lock = value => {
      busy = value;
      for (const input of form.querySelectorAll('input,select,textarea,button')) input.disabled = value;
      for (const button of shelf.querySelectorAll('button')) button.disabled = value;
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
    const saveShelf = async rows => {
      await auth();
      const { data, error } = await window.SFCloud.client.from('story_book_shelf').upsert(rows, { onConflict: 'id' }).select('id');
      if (error) throw error;
      if (data?.length !== rows.length) throw new Error('保存未完成，请重新登录管理员账号后重试。');
    };
    const drawShelf = () => {
      grid.innerHTML = books.map(book => `<article class="book-admin-shelf-card" data-book-id="${e(book.id)}"><button type="button" class="book-drag-handle" draggable="true" aria-label="拖动排序 ${e(book.titleZh || book.title)}" title="拖动调整顺序">⠿</button>${book.coverUrl ? `<img src="${e(book.coverUrl)}" alt="" draggable="false">` : '<span class="book-shelf-placeholder">📖</span>'}<strong>${e(book.titleZh || book.title)}</strong><button type="button" class="book-delete">删除</button></article>`).join('');
      let dragged = null;
      grid.querySelectorAll('.book-admin-shelf-card').forEach(card => {
        const id = card.dataset.bookId;
        const handle = card.querySelector('.book-drag-handle');
        handle.ondragstart = event => {
          if (busy || !window.SFCloud?.isAdmin()) { event.preventDefault(); return; }
          dragged = id; event.dataTransfer.setData('text/plain', id); event.dataTransfer.effectAllowed = 'move'; card.classList.add('is-dragging');
        };
        handle.ondragend = () => { dragged = null; grid.querySelectorAll('.is-dragging,.is-drop-target').forEach(node => node.classList.remove('is-dragging', 'is-drop-target')); };
        card.ondragover = event => { if (dragged && dragged !== id && !busy) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; card.classList.add('is-drop-target'); } };
        card.ondragleave = event => { if (!card.contains(event.relatedTarget)) card.classList.remove('is-drop-target'); };
        card.ondrop = async event => {
          event.preventDefault(); card.classList.remove('is-drop-target');
          if (!dragged || dragged === id || busy) return;
          const reordered = [...books];
          const from = reordered.findIndex(book => book.id === dragged), to = reordered.findIndex(book => book.id === id);
          if (from < 0 || to < 0) return;
          reordered.splice(to, 0, reordered.splice(from, 1)[0]);
          dragged = null; lock(true); shelfStatus.textContent = '正在保存书架顺序…';
          try {
            await saveShelf(reordered.map((book, index) => ({ id: book.id, sort_order: index })));
            books.splice(0, books.length, ...reordered); shelfStatus.textContent = '顺序已保存，所有用户刷新后生效。';
          } catch (error) { shelfStatus.textContent = '排序保存失败：' + error.message; }
          finally { drawShelf(); lock(false); }
        };
        card.querySelector('.book-delete').onclick = async () => {
          if (busy || !window.SFCloud?.isAdmin()) return;
          const book = books.find(book => book.id === id);
          if (!confirm(`确定从全站书架删除《${book.titleZh || book.title}》？此操作只移除绘本入口，原 PDF 文件保留。`)) return;
          lock(true); shelfStatus.textContent = '正在删除绘本…';
          try {
            await saveShelf([{ id, deleted: true }]);
            books.splice(books.findIndex(book => book.id === id), 1);
            field('existing').querySelector(`option[value="${id}"]`)?.remove();
            if (field('existing').value === '' || field('existing').value === id) { field('existing').value = ''; field('existing').onchange(); }
            shelfStatus.textContent = '绘本已删除。';
          } catch (error) { shelfStatus.textContent = '删除失败：' + error.message; }
          finally { drawShelf(); lock(false); }
        };
      });
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
        await auth();
        if (file.size > 1073741824 || !(await file.slice(0, 1024).text()).includes('%PDF-')) throw new Error('请选择不超过 1 GiB 的有效 PDF。');
        const url = await window.BookCommunity.upload(file,'pdf',status);
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
        coverUrl=await window.BookCommunity.publishCover(coverUrl,status);
        const id = field('existing').value || 'book-' + crypto.randomUUID();
        const row = { id, content_kind:base==='#/magazines'?'magazine':'book', title: field('title').value.trim(), title_zh: field('titleZh').value.trim(), level: field('level').value.trim(), description: field('description').value.trim(), source_url: field('source').value.trim(), cover_url: coverUrl, updated_at: new Date().toISOString() };
        const { error } = await window.SFCloud.client.from('story_books').upsert(row, { onConflict: 'id' });
        if (error) throw error;
        status.textContent = '发布成功，所有访客刷新书架即可看到。';
        if (!books.some(book => book.id === id)) {
          const option = document.createElement('option'); option.value = id; option.textContent = row.title_zh || row.title; field('existing').append(option);
        }
        const saved = { id, kind:row.content_kind, title: row.title, titleZh: row.title_zh, level: row.level, description: row.description, sourceUrl: row.source_url, coverUrl: row.cover_url };
        const index = books.findIndex(book => book.id === id); if (index < 0) books.push(saved); else books[index] = saved;
        field('existing').value = id;
        drawShelf();
      } catch (error) { status.textContent = '发布失败：' + (error.message || '请重试。'); }
      finally { lock(false); }
    };
    drawShelf();
    preview();
    await window.BookCommunity.renderReviews(app,app.el().querySelector('.book-admin'));
  }
};
