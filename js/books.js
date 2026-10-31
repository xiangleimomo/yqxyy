window.BookReader = {
  book: null,
  rendition: null,
  libraryPromise: null,

  cleanup() {
    try { this.rendition?.destroy(); } catch (_) {}
    try { this.book?.destroy(); } catch (_) {}
    this.book = null;
    this.rendition = null;
  },

  async library(app) {
    return app.getJSON('data/books.json');
  },

  escape(app, value) {
    return app.escapeHtml(String(value || ''));
  },

  async renderList(app) {
    const books = await this.library(app);
    const e = value => this.escape(app, value);
    app.el().innerHTML = `<section class="books-intro"><div><h1>📚 绘本阅读</h1><p>Movie Companion Books · 为光影课堂准备的配套电子书，可独立阅读并自动保存进度。</p></div><span class="books-count">${books.length} 本绘本</span></section><section class="books-notice"><strong>测试阶段</strong><span>当前开放 EPUB 测试书；PDF 阅读器与影片配套书目会逐步添加。</span></section><div class="book-grid">${books.map(item => `<a class="book-card" href="#/reader/${e(item.id)}" aria-label="阅读 ${e(item.titleZh)}"><div class="book-cover book-cover-${e(item.format)}"><span>${item.format.toUpperCase()}</span><b>📖</b></div><div class="book-card-body"><span class="book-format">${e(item.format.toUpperCase())}</span><h2>${e(item.titleZh)}</h2><p>${e(item.title)}</p><small>${e(item.level)} · ${e(item.description)}</small></div></a>`).join('')}</div>`;
  },

  async renderReader(app, id) {
    const books = await this.library(app);
    const item = books.find(book => book.id === id);
    if (!item) {
      app.el().innerHTML = '<div class="empty"><h2>绘本不存在</h2><p><a class="btn" href="#/reading">返回绘本阅读</a></p></div>';
      return;
    }
    const e = value => this.escape(app, value);
    app.el().innerHTML = `<div class="breadcrumb"><a href="#/reading">绘本阅读</a> › ${e(item.titleZh)}</div><section class="reader-head"><div><span class="book-format">${e(item.format.toUpperCase())}</span><h1>${e(item.titleZh)}</h1><p>${e(item.title)}</p></div><a class="btn secondary" href="#/reading">返回书架</a></section><section class="ebook-reader" id="ebookReader"><div class="ebook-toolbar"><button type="button" class="btn secondary small" id="bookPrev">← 上一页</button><button type="button" class="btn secondary small" id="bookToc">目录</button><button type="button" class="btn secondary small" id="bookSmaller">A−</button><button type="button" class="btn secondary small" id="bookLarger">A＋</button><button type="button" class="btn secondary small" id="bookFullscreen">⛶ 全屏</button><button type="button" class="btn secondary small" id="bookNext">下一页 →</button></div><aside class="ebook-toc" id="ebookToc" hidden></aside><div class="ebook-stage"><div id="epubViewport" class="epub-viewport"><div class="ebook-loading">正在打开电子书…</div></div></div><p class="ebook-status" id="ebookStatus" role="status" aria-live="polite">正在准备阅读器…</p></section>`;

    if (item.format !== 'epub') {
      document.getElementById('ebookStatus').textContent = '该格式的阅读器正在接入。';
      return;
    }
    await this.openEpub(app, item);
  },

  async loadEpubJs() {
    if (window.ePub && window.JSZip) return;
    if (!this.libraryPromise) {
      const loadScript = (src, globalName) => new Promise((resolve, reject) => {
        if (window[globalName]) return resolve();
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => window[globalName] ? resolve() : reject(new Error(`${globalName} 未能初始化`));
        script.onerror = () => reject(new Error('EPUB 阅读组件加载失败，请检查网络。'));
        document.head.appendChild(script);
      });
      this.libraryPromise = loadScript('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js', 'JSZip')
        .then(() => loadScript('https://cdn.jsdelivr.net/npm/epubjs@0.3.93/dist/epub.min.js', 'ePub'))
        .catch(error => { this.libraryPromise = null; throw error; });
    }
    await this.libraryPromise;
  },

  async openEpub(app, item) {
    const stage = document.getElementById('epubViewport');
    const status = document.getElementById('ebookStatus');
    const toc = document.getElementById('ebookToc');
    const progressKey = `storyfox-book-progress:${item.id}`;
    let fontSize = Number(localStorage.getItem(`storyfox-book-font-size:${item.id}`) || 100);
    const setStatus = text => { if (status) status.textContent = text; };

    try {
      await this.loadEpubJs();
      this.book = window.ePub(item.readerUrl);
      this.rendition = this.book.renderTo(stage, { width: '100%', height: '100%', spread: 'auto', flow: 'paginated' });
      this.rendition.themes.fontSize(`${fontSize}%`);
      await this.rendition.display(localStorage.getItem(progressKey) || undefined);
      setStatus('阅读进度会自动保存在此设备。');

      document.getElementById('bookPrev').onclick = () => this.rendition.prev();
      document.getElementById('bookNext').onclick = () => this.rendition.next();
      document.getElementById('bookSmaller').onclick = () => { fontSize = Math.max(80, fontSize - 10); this.rendition.themes.fontSize(`${fontSize}%`); localStorage.setItem(`storyfox-book-font-size:${item.id}`, String(fontSize)); };
      document.getElementById('bookLarger').onclick = () => { fontSize = Math.min(160, fontSize + 10); this.rendition.themes.fontSize(`${fontSize}%`); localStorage.setItem(`storyfox-book-font-size:${item.id}`, String(fontSize)); };
      document.getElementById('bookFullscreen').onclick = () => document.getElementById('ebookReader').requestFullscreen?.();
      document.getElementById('bookToc').onclick = () => { toc.hidden = !toc.hidden; };
      this.rendition.on('relocated', location => localStorage.setItem(progressKey, location.start.cfi));

      const navigation = await this.book.loaded.navigation;
      toc.innerHTML = navigation.toc.length ? navigation.toc.map(chapter => `<button type="button" data-href="${app.escapeHtml(chapter.href)}">${app.escapeHtml(chapter.label)}</button>`).join('') : '<span>本书未提供目录。</span>';
      toc.querySelectorAll('button').forEach(button => button.addEventListener('click', () => { this.rendition.display(button.dataset.href); toc.hidden = true; }));
    } catch (error) {
      console.error(error);
      stage.innerHTML = '<div class="ebook-error"><strong>暂时无法打开电子书</strong><span>请稍后重试；若持续失败，请检查书籍链接是否仍可访问。</span></div>';
      setStatus(error.message || '阅读器加载失败。');
    }
  }
};
