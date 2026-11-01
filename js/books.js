window.BookReader = {
  book: null,
  rendition: null,
  pageFlip: null,
  pdfObjectUrls: [],
  libraryPromise: null,
  pdfLibraryPromise: null,

  cleanup() {
    if (this.keyHandler) document.removeEventListener('keydown', this.keyHandler);
    if (this.fullscreenHandler) document.removeEventListener('fullscreenchange', this.fullscreenHandler);
    if (this.viewportResizeHandler) window.removeEventListener('resize', this.viewportResizeHandler);
    this.resizeObserver?.disconnect();
    try { this.pageFlip?.destroy(); } catch (_) {}
    this.pdfObjectUrls.forEach(url => URL.revokeObjectURL(url));
    this.keyHandler = null;
    this.fullscreenHandler = null;
    this.viewportResizeHandler = null;
    this.resizeObserver = null;
    this.pageFlip = null;
    this.pdfObjectUrls = [];
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
    if (item.format === 'pdf') {
      this.renderPdfReader(app, item);
      await this.openPdfFlipbook(item);
      return;
    }
    app.el().classList.add('book-reader-shell');
    document.body.classList.add('flipbook-active');
    app.el().innerHTML = `<section class="flipbook-reader" id="ebookReader"><header class="flipbook-topbar"><a href="#/reading" class="flipbook-back" aria-label="返回书架">←</a><span>绘本阅读</span><button type="button" id="bookFullscreen" aria-label="全屏阅读">⛶</button></header><div class="flipbook-stage" id="ebookStage"><button type="button" class="flipbook-turn flipbook-turn-prev" id="bookStagePrev" aria-label="上一页">‹</button><div class="flipbook-surface"><div id="epubViewport" class="epub-viewport"><div class="ebook-loading">正在打开电子书…</div></div></div><button type="button" class="flipbook-turn flipbook-turn-next" id="bookStageNext" aria-label="下一页">›</button><div class="ebook-page-turn" aria-hidden="true"></div><div class="flipbook-controls"><span class="book-page-indicator" id="bookPageIndicator">正在定位页码…</span><input type="range" id="bookProgress" min="0" max="1" value="0" step="1" aria-label="阅读进度"><button type="button" id="bookZoomOut" aria-label="缩小">−</button><button type="button" id="bookZoomIn" aria-label="放大">＋</button><button type="button" id="bookFullscreenBottom" aria-label="全屏">⛶</button></div></div><footer class="flipbook-footer"><div><h1>${e(item.title)}</h1><p>${e(item.titleZh)} · ${e(item.level)} · EPUB</p></div><span>使用左右箭头或点击页边翻页</span></footer><p class="ebook-status" id="ebookStatus" role="status" aria-live="polite">正在准备阅读器…</p></section>`;

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

  async loadPdfLibraries() {
    if (window.pdfjsLib && window.St?.PageFlip) return;
    if (!this.pdfLibraryPromise) {
      const loadScript = (src, globalName) => new Promise((resolve, reject) => {
        if (globalName.split('.').reduce((value, key) => value?.[key], window)) return resolve();
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => globalName.split('.').reduce((value, key) => value?.[key], window) ? resolve() : reject(new Error(`${globalName} 未能初始化`));
        script.onerror = () => reject(new Error('PDF 翻书组件加载失败，请检查网络。'));
        document.head.appendChild(script);
      });
      this.pdfLibraryPromise = loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', 'pdfjsLib')
        .then(() => {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          return loadScript('https://cdn.jsdelivr.net/npm/page-flip@2.0.7/dist/js/page-flip.browser.js', 'St.PageFlip');
        })
        .catch(error => { this.pdfLibraryPromise = null; throw error; });
    }
    await this.pdfLibraryPromise;
  },

  renderPdfReader(app, item) {
    const e = value => this.escape(app, value);
    app.el().classList.add('book-reader-shell');
    document.body.classList.add('flipbook-active');
    app.el().innerHTML = `<section class="flipbook-reader pdf-flipbook-reader" id="ebookReader"><header class="flipbook-topbar"><a href="#/reading" class="flipbook-back" aria-label="返回书架">←</a><span>绘本阅读</span><button type="button" id="bookFullscreen" aria-label="全屏阅读">⛶</button></header><div class="flipbook-stage" id="ebookStage"><button type="button" class="flipbook-turn flipbook-turn-prev" id="bookStagePrev" aria-label="上一页">‹</button><div class="pdf-flipbook-surface"><div id="pdfFlipbook" class="pdf-pageflip"><div class="ebook-loading">正在解析 PDF 绘本…</div></div></div><button type="button" class="flipbook-turn flipbook-turn-next" id="bookStageNext" aria-label="下一页">›</button><div class="flipbook-controls"><span class="book-page-indicator" id="bookPageIndicator">正在加载…</span><input type="range" id="bookProgress" min="0" max="1" value="0" step="1" aria-label="阅读进度"><button type="button" id="bookZoomOut" aria-label="缩小">−</button><button type="button" id="bookZoomIn" aria-label="放大">＋</button><button type="button" id="bookFullscreenBottom" aria-label="全屏">⛶</button></div></div><footer class="flipbook-footer"><div><h1>${e(item.title)}</h1><p>${e(item.titleZh)} · ${e(item.level)} · PDF</p></div><span>拖动书页、点击页角或使用左右箭头翻页</span></footer><p class="ebook-status" id="ebookStatus" role="status" aria-live="polite">正在准备 PDF 阅读器…</p></section>`;
  },

  async openPdfFlipbook(item) {
    const root = document.getElementById('pdfFlipbook');
    const reader = document.getElementById('ebookReader');
    const stage = document.getElementById('ebookStage');
    const status = document.getElementById('ebookStatus');
    const progress = document.getElementById('bookProgress');
    const indicator = document.getElementById('bookPageIndicator');
    const setStatus = text => { if (status) status.textContent = text; };
    try {
      await this.loadPdfLibraries();
      setStatus('正在下载 PDF 内容…');
      const response = await fetch(item.readerUrl, { cache: 'no-store' });
      if (!response.ok) throw new Error(`PDF 内容加载失败（${response.status}）`);
      const documentProxy = await window.pdfjsLib.getDocument({ data: await response.arrayBuffer() }).promise;
      const pageCount = documentProxy.numPages;
      const firstPage = await documentProxy.getPage(1);
      const firstViewport = firstPage.getViewport({ scale: 1.25 });
      const pageWidth = Math.round(firstViewport.width);
      const pageHeight = Math.round(firstViewport.height);
      // StPageFlip turns raster pages. Use a high-resolution, lossless source so
      // text remains sharp at desktop size and while the user is dragging a page.
      const scale = Math.max(3, Math.min(5, Math.max(screen.width, window.innerWidth) * (window.devicePixelRatio || 1) * 1.25 / firstPage.getViewport({ scale: 1 }).width));
      const pageUrls = [];
      const pageTexts = [];
      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
        setStatus(`正在渲染第 ${pageNumber} / ${pageCount} 页…`);
        const page = pageNumber === 1 ? firstPage : await documentProxy.getPage(pageNumber);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
        if (!blob) throw new Error('PDF 页面图像生成失败。');
        pageUrls.push(URL.createObjectURL(blob));
        const text = await page.getTextContent();
        pageTexts.push(text.items.map(part => part.str || '').join(' '));
        page.cleanup();
      }
      const outlineItems = [];
      const collectOutline = async entries => {
        for (const entry of entries || []) {
          const destination = typeof entry.dest === 'string' ? await documentProxy.getDestination(entry.dest) : entry.dest;
          if (destination) outlineItems.push({ title: entry.title, page: typeof destination[0] === 'number' ? destination[0] : await documentProxy.getPageIndex(destination[0]) });
          await collectOutline(entry.items);
        }
      };
      await collectOutline(await documentProxy.getOutline());
      await documentProxy.destroy();
      this.pdfObjectUrls = pageUrls;
      root.innerHTML = '';
      // This PDF is already laid out as a landscape two-page spread. Force
      // PageFlip's portrait mode so one PDF page remains one full book spread,
      // instead of PageFlip combining two spreads into four tiny pages.
      const hostWidth = Math.max(320, Math.floor(root.clientWidth));
      const portraitMinWidth = Math.floor(hostWidth / 2) + 2;
      this.pageFlip = new window.St.PageFlip(root, {
        width: pageWidth,
        height: pageHeight,
        size: 'stretch',
        minWidth: 280,
        maxWidth: 1400,
        minHeight: 360,
        maxHeight: 900,
        drawShadow: true,
        maxShadowOpacity: .42,
        flippingTime: 460,
        usePortrait: true,
        autoSize: true,
        showCover: true,
        mobileScrollSupport: true,
        useMouseEvents: true,
        clickEventForward: true
      });
      const updateProgress = pageIndex => {
        const current = Number(pageIndex) + 1;
        indicator.textContent = `${current}/${pageCount}`;
        progress.value = String(pageIndex);
      };
      progress.max = String(Math.max(0, pageCount - 1));
      this.pageFlip.on('flip', event => updateProgress(event.data));
      this.pageFlip.on('init', event => updateProgress(event.data.page));
      // HTML mode avoids StPageFlip's screen-resolution canvas resampling.
      // Images preserve their backing pixels and remain intact when the engine
      // clones a soft page during a drag (cloned canvas elements lose pixels).
      const htmlPages = pageUrls.map(url => {
        const pageElement = document.createElement('div');
        pageElement.className = 'pdf-sharp-page';
        const image = document.createElement('img');
        image.src = url;
        image.alt = '';
        image.draggable = false;
        pageElement.appendChild(image);
        root.appendChild(pageElement);
        return pageElement;
      });
      await Promise.all(htmlPages.map(element => element.firstChild.decode()));
      this.pageFlip.loadFromHTML(htmlPages);
      const spine = document.createElement('div');
      spine.className = 'pdf-book-spine';
      spine.setAttribute('aria-hidden', 'true');
      // Share PageFlip's stacking context: static pages use startZIndex + 1,
      // bottom pages + 3, and the moving sheet + 5. The spine belongs between
      // those layers so a folded sheet occludes it naturally.
      root.querySelector('.stf__block').appendChild(spine);
      spine.style.zIndex = String(this.pageFlip.getSettings().startZIndex + 4);
      const positionSpine = () => {
        const bounds = this.pageFlip?.getBoundsRect();
        if (!bounds) return;
        const currentPage = this.pageFlip.getCurrentPageIndex();
        spine.hidden = currentPage === 0 || currentPage === pageCount - 1 || this.pageFlip.getOrientation() === 'portrait';
        spine.style.left = `${bounds.left + bounds.width / 2}px`;
        spine.style.top = `${bounds.top}px`;
        spine.style.height = `${bounds.height}px`;
      };
      this.pageFlip.on('init', positionSpine);
      this.pageFlip.on('flip', positionSpine);
      this.pageFlip.on('changeOrientation', positionSpine);
      this.resizeObserver = new ResizeObserver(() => requestAnimationFrame(positionSpine));
      this.resizeObserver.observe(root);
      requestAnimationFrame(positionSpine);
      document.getElementById('bookStagePrev').onclick = () => this.pageFlip?.flipPrev();
      document.getElementById('bookStageNext').onclick = () => this.pageFlip?.flipNext();
      progress.oninput = () => this.pageFlip?.turnToPage(Number(progress.value));
      const toggleFullscreen = () => reader.requestFullscreen?.();
      document.getElementById('bookFullscreen').onclick = toggleFullscreen;
      document.getElementById('bookFullscreenBottom').onclick = toggleFullscreen;
      let zoom = 1;
      const applyZoom = () => stage.style.setProperty('--book-zoom', String(zoom));
      document.getElementById('bookZoomOut').onclick = () => { zoom = Math.max(.8, zoom - .1); applyZoom(); };
      document.getElementById('bookZoomIn').onclick = () => { zoom = Math.min(1.2, zoom + .1); applyZoom(); };
      this.fullscreenHandler = () => window.setTimeout(() => this.pageFlip?.update(), 100);
      document.addEventListener('fullscreenchange', this.fullscreenHandler);
      this.setupPdfTools(item, { reader, root, pageUrls, pageTexts, outlineItems, pageCount });
      setStatus('PDF 阅读进度保存在此设备。');
    } catch (error) {
      console.error(error);
      root.innerHTML = '<div class="ebook-error"><strong>暂时无法打开 PDF 绘本</strong><span>请稍后重试；若持续失败，请检查 Pone 文件链接是否仍可访问。</span></div>';
      setStatus(error.message || 'PDF 阅读器加载失败。');
    }
  },

  setupPdfTools(item, { reader, root, pageUrls, pageTexts, outlineItems, pageCount }) {
    const toolbar = reader.querySelector('.flipbook-footer');
    const tools = document.createElement('div');
    tools.className = 'pdf-reader-tools';
    const labels = { zoom: '放大', search: '搜索', thumbnails: '缩略图', audio: '声音' };
    const icons = { zoom: '<path d="M12 4v16M4 12h16"/>', search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>', thumbnails: '<path d="M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3zM15 15h6v6h-6z"/>', audio: '<path d="M3 9h4l5-4v14l-5-4H3zM16 8q4 4 0 8M19 5q7 7 0 14"/>' };
    Object.entries(labels).forEach(([name, label]) => {
      const button = document.createElement('button');
      button.type = 'button'; button.innerHTML = `<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`; button.dataset.tool = name;
      button.title = label; button.setAttribute('aria-label', label); button.setAttribute('aria-expanded', 'false');
      tools.appendChild(button);
    });
    reader.querySelector('.flipbook-controls').prepend(tools);
    reader.querySelector('#bookZoomOut').hidden = true;
    reader.querySelector('#bookZoomIn').hidden = true;
    const share = document.createElement('button'); share.type = 'button'; share.title = '分享'; share.setAttribute('aria-label', '分享');
    share.innerHTML = '<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M14 3h7v7M21 3 10 14M10 5H4v16h16v-6"/></svg>';
    share.onclick = async () => { try { if (navigator.share) await navigator.share({ title: item.title, url: location.href }); else { await navigator.clipboard.writeText(location.href); notify('阅读链接已复制'); } } catch (_) {} };
    reader.querySelector('#bookFullscreenBottom').before(share);
    const panel = document.createElement('aside'); panel.className = 'pdf-tools-panel'; panel.hidden = true;
    reader.appendChild(panel);
    const toast = document.createElement('div'); toast.className = 'pdf-reader-toast'; toast.hidden = true; toast.setAttribute('role', 'status'); reader.appendChild(toast);
    let toastTimer;
    const notify = message => { clearTimeout(toastTimer); toast.textContent = message; toast.hidden = false; toastTimer = setTimeout(() => { toast.hidden = true; }, 2600); };
    const key = `storyfox-pdf-bookmarks:${item.id}`;
    let bookmarks;
    try { bookmarks = JSON.parse(localStorage.getItem(key) || '[]'); } catch (_) { bookmarks = []; }
    if (!Array.isArray(bookmarks)) bookmarks = [];
    const go = page => this.pageFlip?.turnToPage(page);
    const row = (label, page, thumbnail = false) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'pdf-tool-row';
      if (thumbnail) { const image = document.createElement('img'); image.src = pageUrls[page]; image.alt = ''; button.appendChild(image); }
      const text = document.createElement('span'); text.textContent = label; button.appendChild(text); button.onclick = () => go(page); panel.appendChild(button);
    };
    let closed = false;
    const show = name => {
      if (name === 'cover') {
        closed = !closed; root.classList.toggle('pdf-book-closed', closed);
        const coverButton = tools.querySelector('[data-tool="cover"]');
        coverButton.title = closed ? '打开书' : '合上书'; coverButton.setAttribute('aria-label', coverButton.title);
        notify(closed ? '已合上书，点击「打开书」继续阅读' : '已打开书'); return;
      }
      if (!panel.hidden && panel.dataset.tool === name) { panel.hidden = true; tools.querySelectorAll('button').forEach(button => button.setAttribute('aria-expanded', 'false')); return; }
      panel.replaceChildren(); panel.hidden = false; panel.dataset.tool = name;
      tools.querySelectorAll('button').forEach(button => button.setAttribute('aria-expanded', String(button.dataset.tool === name)));
      const close = document.createElement('button'); close.textContent = '关闭 ×'; close.onclick = () => { panel.hidden = true; }; panel.appendChild(close);
      const heading = document.createElement('h3'); heading.textContent = labels[name]; panel.appendChild(heading);
      if (name === 'search') {
        const input = document.createElement('input'); input.type = 'search'; input.placeholder = '搜索本书文字'; panel.appendChild(input);
        const results = document.createElement('div'); panel.appendChild(results);
        input.oninput = () => {
          results.replaceChildren(); const query = input.value.trim().toLowerCase(); if (!query) return;
          pageTexts.forEach((text, page) => { const index = text.toLowerCase().indexOf(query); if (index < 0) return;
            const button = document.createElement('button'); button.className = 'pdf-tool-row'; button.textContent = `第 ${page + 1} 页 · ${text.slice(Math.max(0, index - 35), index + query.length + 90)}`; button.onclick = () => go(page); results.appendChild(button);
          });
          if (!results.children.length) results.textContent = '未找到匹配文字（扫描图片中的文字无法直接搜索）。';
        }; input.focus();
      } else if (name === 'contents') {
        if (outlineItems.length) outlineItems.forEach(entry => row(entry.title, entry.page));
        else { const note = document.createElement('p'); note.textContent = '本书未提供章节目录，以下为页面导航。'; panel.appendChild(note); pageUrls.forEach((_, page) => row(`第 ${page + 1} 页`, page)); }
      } else if (name === 'thumbnails') pageUrls.forEach((_, page) => row(`第 ${page + 1} 页`, page, true));
      else if (name === 'bookmarks') {
        const add = document.createElement('button'); add.textContent = '☆ 添加 / 移除当前页书签'; panel.appendChild(add);
        add.onclick = () => { const page = this.pageFlip.getCurrentPageIndex(); bookmarks = bookmarks.includes(page) ? bookmarks.filter(value => value !== page) : [...bookmarks, page]; localStorage.setItem(key, JSON.stringify(bookmarks)); panel.hidden = true; show(name); };
        bookmarks.sort((a,b) => a-b).forEach(page => row(`★ 第 ${page + 1} 页`, page, true));
      } else if (name === 'audio') {
        const audio = document.createElement('audio'); audio.controls = true; audio.preload = 'none';
        const input = document.createElement('input'); input.type = 'url'; input.placeholder = '粘贴本书配套音频直链'; input.value = item.audioUrl || localStorage.getItem(`storyfox-pdf-audio:${item.id}`) || '';
        const load = document.createElement('button'); load.textContent = '加载音频';
        load.onclick = () => { try { const url = new URL(input.value); if (!['https:', 'http:'].includes(url.protocol)) return; audio.src = url.href; localStorage.setItem(`storyfox-pdf-audio:${item.id}`, url.href); } catch (_) { notify('请输入有效的音频链接'); } };
        if (input.value) audio.src = input.value; panel.append(input, load, audio);
      } else if (name === 'zoom') {
        const preview = document.createElement('img'); preview.className = 'pdf-zoom-preview'; preview.src = pageUrls[this.pageFlip.getCurrentPageIndex()]; panel.appendChild(preview);
        const slider = document.createElement('input'); slider.type = 'range'; slider.min = '100'; slider.max = '300'; slider.value = '100'; slider.setAttribute('aria-label', '预览放大比例'); slider.oninput = () => { preview.style.width = `${slider.value}%`; }; panel.appendChild(slider);
      }
    };
    tools.onclick = event => { const name = event.target.closest('[data-tool]')?.dataset.tool; if (name) show(name); };
    const progressKey = `storyfox-pdf-progress:${item.id}`;
    this.pageFlip.on('flip', event => { localStorage.setItem(progressKey, String(event.data)); if (event.data >= pageCount - 1) notify('已经是最后一页了'); });
    const saved = Number(localStorage.getItem(progressKey) || 0); if (saved > 0 && saved < pageCount) go(saved);
    reader.querySelector('#bookStageNext').onclick = () => { if (this.pageFlip.getCurrentPageIndex() >= pageCount - 1) notify('已经是最后一页了'); else this.pageFlip.flipNext(); };
  },

  async openEpub(app, item) {
    const stage = document.getElementById('epubViewport');
    const reader = document.getElementById('ebookReader');
    const status = document.getElementById('ebookStatus');
    const pageIndicator = document.getElementById('bookPageIndicator');
    const progress = document.getElementById('bookProgress');
    const progressKey = `storyfox-book-progress:${item.id}`;
    let fontSize = Number(localStorage.getItem(`storyfox-book-font-size:${item.id}`) || 100);
    const setStatus = text => { if (status) status.textContent = text; };

    try {
      await this.loadEpubJs();
      setStatus('正在加载绘本内容…');
      const response = await fetch(item.readerUrl, { cache: 'no-store' });
      if (!response.ok) throw new Error(`绘本内容加载失败（${response.status}）`);
      const file = await response.arrayBuffer();
      if (!file.byteLength) throw new Error('电子书内容为空。');
      setStatus('正在解析电子书…');
      this.book = window.ePub(file);
      stage.innerHTML = '';
      const viewportSize = () => ({
        width: Math.max(320, Math.floor(stage.clientWidth)),
        height: Math.max(400, Math.floor(stage.clientHeight))
      });
      const initialSize = viewportSize();
      this.rendition = this.book.renderTo(stage, { width: initialSize.width, height: initialSize.height, spread: 'auto', minSpreadWidth: 720, flow: 'paginated' });
      this.rendition.themes.fontSize(`${fontSize}%`);
      await this.rendition.display(localStorage.getItem(progressKey) || undefined);
      const resizeRendition = () => {
        const size = viewportSize();
        this.rendition?.resize(size.width, size.height);
      };
      requestAnimationFrame(resizeRendition);
      setStatus('阅读进度会自动保存在此设备。');

      let turning = false;
      const totalPages = this.book?.spine?.items?.length || 1;
      progress.max = String(Math.max(0, totalPages - 1));
      const updatePageIndicator = location => {
        if (!pageIndicator || !location?.start) return;
        const current = Number(location.start.index) + 1;
        pageIndicator.textContent = `第 ${current} / ${totalPages} 页`;
        progress.value = String(Math.max(0, current - 1));
      };
      const turn = direction => {
        if (turning || !this.rendition) return;
        turning = true;
        const className = direction === 'next' ? 'turn-next' : 'turn-prev';
        reader.classList.remove('turn-next', 'turn-prev');
        void reader.offsetWidth;
        reader.classList.add(className);
        window.setTimeout(() => this.rendition?.[direction](), 140);
        window.setTimeout(() => { reader.classList.remove(className); turning = false; }, 540);
      };
      document.getElementById('bookStagePrev').onclick = () => turn('prev');
      document.getElementById('bookStageNext').onclick = () => turn('next');
      const toggleFullscreen = () => reader.requestFullscreen?.();
      document.getElementById('bookFullscreen').onclick = toggleFullscreen;
      document.getElementById('bookFullscreenBottom').onclick = toggleFullscreen;
      let zoom = 1;
      const applyZoom = () => document.getElementById('ebookStage').style.setProperty('--book-zoom', String(zoom));
      document.getElementById('bookZoomOut').onclick = () => { zoom = Math.max(.8, zoom - .1); applyZoom(); };
      document.getElementById('bookZoomIn').onclick = () => { zoom = Math.min(1.25, zoom + .1); applyZoom(); };
      progress.oninput = () => {
        const spineItem = this.book?.spine?.items?.[Number(progress.value)];
        if (spineItem) this.rendition.display(spineItem.href);
      };
      this.rendition.on('relocated', location => {
        localStorage.setItem(progressKey, location.start.cfi);
        updatePageIndicator(location);
      });
      updatePageIndicator(this.rendition.currentLocation?.());
      this.keyHandler = event => {
        if (event.defaultPrevented || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
        if (event.key === 'ArrowLeft') turn('prev');
        if (event.key === 'ArrowRight' || event.key === ' ') { event.preventDefault(); turn('next'); }
      };
      document.addEventListener('keydown', this.keyHandler);
      this.fullscreenHandler = () => requestAnimationFrame(resizeRendition);
      document.addEventListener('fullscreenchange', this.fullscreenHandler);
      if ('ResizeObserver' in window) {
        this.resizeObserver = new ResizeObserver(resizeRendition);
        this.resizeObserver.observe(stage);
      }
      this.viewportResizeHandler = resizeRendition;
      window.addEventListener('resize', this.viewportResizeHandler);

    } catch (error) {
      console.error(error);
      stage.innerHTML = '<div class="ebook-error"><strong>暂时无法打开电子书</strong><span>请稍后重试；若持续失败，请检查书籍链接是否仍可访问。</span></div>';
      setStatus(error.message || '阅读器加载失败。');
    }
  }
};
