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
        page.cleanup();
      }
      documentProxy.destroy();
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
        minWidth: portraitMinWidth,
        maxWidth: Math.max(pageWidth, portraitMinWidth),
        minHeight: 360,
        maxHeight: 900,
        drawShadow: true,
        maxShadowOpacity: .42,
        flippingTime: 460,
        usePortrait: true,
        autoSize: true,
        showCover: false,
        mobileScrollSupport: true,
        useMouseEvents: true,
        clickEventForward: true
      });
      const updateProgress = pageIndex => {
        const current = Number(pageIndex) + 1;
        indicator.textContent = `第 ${current} / ${pageCount} 页`;
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
      setStatus('PDF 阅读进度保存在此设备。');
    } catch (error) {
      console.error(error);
      root.innerHTML = '<div class="ebook-error"><strong>暂时无法打开 PDF 绘本</strong><span>请稍后重试；若持续失败，请检查 Pone 文件链接是否仍可访问。</span></div>';
      setStatus(error.message || 'PDF 阅读器加载失败。');
    }
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
