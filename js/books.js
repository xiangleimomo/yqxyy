window.BookReader = {
  book: null,
  rendition: null,
  pageFlip: null,
  pdfObjectUrls: [],
  libraryPromise: null,
  pdfLibraryPromise: null,
  localPdfFiles: new Map(),

  cleanup() {
    if (this.pdfOrientationLocked) { try { screen.orientation?.unlock?.(); } catch (_) {} }
    this.pdfOrientationLocked = false;
    if (this.pdfFullscreenHost && document.fullscreenElement === this.pdfFullscreenHost) document.exitFullscreen?.().catch(() => {});
    this.pdfFullscreenHost = null;
    this.pdfPhoneLandscape = false;
    this.pdfRenderTask?.cancel();
    this.pdfRenderTask = null;
    this.mobileRenderedPages = [];
    this.pdfTextIndexReady = false;
    this.pdfDownloadAbort?.abort();
    this.pdfDownloadAbort = null;
    this.pdfDownloadSession = null;
    this.pdfSession = null;
    try { this.pdfLoadingTask?.destroy()?.catch(() => {}); } catch (_) {}
    this.pdfLoadingTask = null;
    this.pdfDocument?.destroy();
    this.pdfDocument = null;
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

  readingNavigation(local = false) {
    return `<nav class="book-reading-tabs" aria-label="绘本阅读方式"><a href="#/reading"${local ? '' : ' aria-current="page"'}>线上绘本</a><a href="#/reading/local"${local ? ' aria-current="page"' : ''}>本地绘本</a></nav>`;
  },

  async renderList(app) {
    const books = await this.library(app);
    const e = value => this.escape(app, value);
    app.el().innerHTML = `${this.readingNavigation()}<div class="book-grid">${books.map(item => {
      const direct = item.format === 'pdf' && item.sourceUrl;
      const href = direct ? item.sourceUrl : '#/reader/' + item.id;
      const cover = item.coverUrl ? '<img src="' + e(item.coverUrl) + '" alt="" loading="lazy" decoding="async">' : '<b>' + e(item.titleZh || item.title) + '</b>';
      return '<a class="book-card" href="' + e(href) + '"' + (direct ? ' target="_blank" rel="noopener noreferrer"' : '') + ' aria-label="阅读 ' + e(item.titleZh || item.title) + '"><div class="book-cover">' + cover + '</div><div class="book-card-body"><h2>' + e(item.titleZh || item.title) + '</h2></div></a>';
    }).join('')}</div>`;
  },

  renderLocalLibrary(app) {
    app.el().innerHTML = this.readingNavigation(true) + '<section class="book-local-library"></section>';
    this.addLocalPdfPicker(app);
  },

  addLocalPdfPicker(app) {
    const label = document.createElement('label');
    label.className = 'btn secondary book-local-picker'; label.textContent = '选择 PDF';
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.pdf,application/pdf';
    input.className = 'book-local-file'; label.appendChild(input);
    input.onchange = () => {
      const file = input.files?.[0]; if (!file) return;
      this.localPdfFile = file; location.hash = '#/reader/local-pdf';
    };
    app.el().querySelector('.book-local-library').appendChild(label);
  },

  async renderReader(app, id) {
    if (id === 'local-pdf') {
      if (!this.localPdfFile) { location.hash = '#/reading'; return; }
      const file = this.localPdfFile;
      const item = { id: `local-${file.name}-${file.size}-${file.lastModified}`, title: file.name, titleZh: file.name.replace(/\.pdf$/i, ''), format: 'pdf', level: '本地文件', localFile: file };
      this.renderPdfReader(app, item);
      await this.openPdfFlipbook(item);
      return;
    }
    const books = await this.library(app);
    const item = books.find(book => book.id === id);
    if (!item) {
      app.el().innerHTML = '<div class="empty"><h2>绘本不存在</h2><p><a class="btn" href="#/reading">返回绘本阅读</a></p></div>';
      return;
    }
    const e = value => this.escape(app, value);
    if (item.format === 'pdf') {
      const localFile = this.localPdfFiles.get(item.id);
      if (!localFile) { await this.downloadPdf(app, item); return; }
      const localItem = { ...item, localFile };
      this.renderPdfReader(app, localItem);
      await this.openPdfFlipbook(localItem);
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

  pdfFileCacheKey(item) {
    const key = new URL('/__pdf-files/' + encodeURIComponent(item.id), location.origin);
    key.searchParams.set('source', item.sourceUrl || item.downloadUrl || '');
    key.searchParams.set('version', item.version || '1');
    return key.href;
  },

  async downloadPdf(app, item) {
    const e = value => this.escape(app, value);
    const session = {}, controller = new AbortController();
    this.pdfDownloadSession = session;
    this.pdfDownloadAbort = controller;
    app.el().innerHTML = `<section class="book-local-setup book-download-screen"><h1>${e(item.titleZh || item.title)}</h1><p id="bookDownloadStatus" role="status" aria-live="polite">正在下载中…</p><progress id="bookDownloadProgress" aria-label="绘本下载进度"></progress><p id="bookDownloadSize" class="muted"></p><button class="btn" id="bookDownloadRetry" hidden>重新下载</button><p><a href="#/reading">取消并返回书架</a></p></section>`;
    const root = document.getElementById('bookDownloadStatus');
    const progress = document.getElementById('bookDownloadProgress');
    const current = () => this.pdfDownloadSession === session && root.isConnected;
    const isPdf = async blob => blob.size > 0 && (await blob.slice(0, 1024).text()).includes('%PDF-');
    const displayBytes = value => value >= 1048576 ? (value / 1048576).toFixed(1) + ' MB' : Math.ceil(value / 1024) + ' KB';
    let cache;
    try {
      try { cache = await caches.open('storyfox-pdf-files-v1'); } catch (_) {}
      if (!current()) return;
      const cacheKey = this.pdfFileCacheKey(item);
      let blob;
      try {
        const cached = await cache?.match(cacheKey);
        if (cached) {
          const candidate = await cached.blob();
          if (await isPdf(candidate)) blob = candidate;
          else await cache.delete(cacheKey);
        }
      } catch (_) {}
      if (!current()) return;
      if (!blob) {
        const url = new URL(item.downloadUrl || item.sourceUrl, location.origin);
        if (url.protocol !== 'https:' || url.username || url.password || (item.downloadUrl && url.origin !== location.origin)) throw new Error('绘本下载地址不可用。');
        const response = await fetch(url.href, { signal: controller.signal, credentials: 'omit' });
        if (!response.ok) throw new Error(`下载失败（${response.status}），请重试。`);
        if (response.headers.has('content-range')) throw new Error('收到不完整的 PDF，请重新下载。');
        const total = Number(response.headers.get('content-length')) || 0;
        const update = received => {
          if (!current()) return;
          if (total) { progress.max = total; progress.value = received; }
          document.getElementById('bookDownloadSize').textContent = displayBytes(received) + (total ? ' / ' + displayBytes(total) : '');
          root.textContent = total ? `正在下载中… ${Math.min(99, Math.floor(received / total * 100))}%` : '正在下载中…';
        };
        if (response.body) {
          const reader = response.body.getReader(), chunks = [];
          let received = 0;
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!current()) { await reader.cancel(); return; }
            chunks.push(value); received += value.byteLength; update(received);
          }
          if (total && !response.headers.get('content-encoding') && received !== total) throw new Error('下载未完成，请重新下载。');
          blob = new Blob(chunks, { type: 'application/pdf' });
        } else { blob = await response.blob(); }
        if (!current()) return;
        if (!(await isPdf(blob))) throw new Error('下载内容不是有效 PDF，请重试。');
        try { await cache?.put(cacheKey, new Response(blob, { headers: { 'Content-Type': 'application/pdf' } })); } catch (_) {}
      }
      if (!current()) return;
      root.textContent = '下载完成，正在打开绘本…'; progress.max = 1; progress.value = 1;
      const file = new File([blob], (item.titleZh || item.title || item.id) + '.pdf', { type: 'application/pdf' });
      this.localPdfFiles.set(item.id, file);
      this.pdfDownloadAbort = null; this.pdfDownloadSession = null;
      this.renderPdfReader(app, { ...item, localFile: file });
      await this.openPdfFlipbook({ ...item, localFile: file });
    } catch (error) {
      if (!current()) return;
      this.pdfDownloadAbort = null;
      root.textContent = error.message || '下载失败，请重试。';
      progress.hidden = true;
      const retry = document.getElementById('bookDownloadRetry'); retry.hidden = false;
      retry.onclick = () => { controller.abort(); this.downloadPdf(app, item); };
    }
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
      this.pdfLibraryPromise = Promise.all([
        loadScript('assets/vendor/pdfjs-3.11.174/pdf.min.js', 'pdfjsLib'),
        loadScript('assets/vendor/page-flip-2.0.7/page-flip.browser.js', 'St.PageFlip')
      ]).then(() => {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'assets/vendor/pdfjs-3.11.174/pdf.worker.min.js';
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
    const reader = document.getElementById('ebookReader');
    this.pdfPhoneLandscape = matchMedia('(pointer:coarse)').matches && Math.min(screen.width, screen.height) <= 760;
    if (this.pdfPhoneLandscape) {
      reader.classList.add('pdf-mobile-landscape');
      this.viewportResizeHandler = () => {
        if (!reader.isConnected || !this.pageFlip) return;
        this.pageFlip.getSettings().minWidth = Math.floor(document.getElementById('pdfFlipbook').clientWidth / 2) + 2;
        this.pageFlip.update();
      };
      window.addEventListener('resize', this.viewportResizeHandler);
    }
  },

  async openPdfFlipbook(item) {
    const root = document.getElementById('pdfFlipbook');
    const reader = document.getElementById('ebookReader');
    const stage = document.getElementById('ebookStage');
    const status = document.getElementById('ebookStatus');
    const progress = document.getElementById('bookProgress');
    const indicator = document.getElementById('bookPageIndicator');
    const setStatus = text => { if (status) status.textContent = text; };
    const session = {};
    this.pdfSession = session;
    let librariesReady = false;
    try {
      if (!item.localFile) throw new Error('请先下载 PDF 并选择本地文件。');
      await this.loadPdfLibraries();
      librariesReady = true;
      if (this.pdfSession !== session || !root.isConnected) return;
      setStatus('正在读取本地 PDF…');
      const bytes = await item.localFile.arrayBuffer();
      if (this.pdfSession !== session || !root.isConnected) return;
      const task = window.pdfjsLib.getDocument({ data: new Uint8Array(bytes) });
      this.pdfLoadingTask = task;
      const documentProxy = await task.promise;
      if (this.pdfLoadingTask === task) this.pdfLoadingTask = null;
      if (this.pdfSession !== session) { await documentProxy.destroy(); return; }
      this.pdfDocument = documentProxy;
      const pageCount = documentProxy.numPages;
      const firstPage = await documentProxy.getPage(1);
      const firstViewport = firstPage.getViewport({ scale: 1.25 });
      const pageWidth = Math.round(firstViewport.width);
      const pageHeight = Math.round(firstViewport.height);
      const mobile = matchMedia('(max-width:760px)').matches || (matchMedia('(pointer:coarse)').matches && innerWidth < 1100);
      const baseViewport = firstPage.getViewport({ scale: 1 });
      const desktopScale = Math.max(3, Math.min(5, Math.max(screen.width, window.innerWidth) * (window.devicePixelRatio || 1) * 1.25 / baseViewport.width));
      // Fit phone pixels instead of rasterizing desktop-sized lossless images.
      const mobileScale = Math.min(3, Math.sqrt(1600000 / (baseViewport.width * baseViewport.height)) * .999, Math.max(.5, Math.max(240, root.clientWidth) * Math.min(devicePixelRatio || 1, 2) * 1.1 / baseViewport.width));
      const scale = mobile ? mobileScale : desktopScale;
      const savedPage = Number(localStorage.getItem(`storyfox-pdf-progress:${item.id}`) || 0);
      const initialPage = mobile && Number.isInteger(savedPage) && savedPage >= 0 && savedPage < pageCount ? savedPage + 1 : 1;
      const placeholder = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${pageWidth}" height="${pageHeight}"><rect width="100%" height="100%" fill="white"/><text x="50%" y="50%" text-anchor="middle" fill="#789" font-size="24">正在加载书页…</text></svg>`);
      const pageUrls = Array(pageCount).fill(placeholder);
      const pageTexts = Array(pageCount).fill('');
      let htmlPages = [];
      this.pdfObjectUrls = [];
      let pageCache;
      try { pageCache = await caches.open('storyfox-pdf-pages-v1'); } catch (_) {}
      const rendered = new Set();
      const renderPage = async pageNumber => {
        if (this.pdfSession !== session || rendered.has(pageNumber)) return;
        setStatus(`正在渲染第 ${pageNumber} / ${pageCount} 页…`);
        const cacheKey = new URL(`/__pdf-cache/${mobile ? 'mobile-jpeg-v1/' : ''}${documentProxy.fingerprints[0]}/${scale.toFixed(2)}/${pageNumber}`, location.origin).href;
        let cached;
        try { cached = await pageCache?.match(cacheKey); } catch (_) {}
        if (this.pdfSession !== session) return;
        if (cached) {
          const blob = await cached.blob();
          if (this.pdfSession !== session) return;
          pageUrls[pageNumber - 1] = URL.createObjectURL(blob);
          this.pdfObjectUrls.push(pageUrls[pageNumber - 1]);
          try { pageTexts[pageNumber - 1] = decodeURIComponent(cached.headers.get('X-Page-Text') || ''); } catch (_) {}
          rendered.add(pageNumber);
          if (mobile) this.mobileRenderedPages = [...rendered];
          return;
        }
        const page = pageNumber === 1 ? firstPage : await documentProxy.getPage(pageNumber);
        if (this.pdfSession !== session) return;
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const renderTask = page.render({ canvasContext: canvas.getContext('2d'), viewport });
        this.pdfRenderTask = renderTask;
        try { await renderTask.promise; } finally { if (this.pdfRenderTask === renderTask) this.pdfRenderTask = null; }
        const blob = await new Promise(resolve => canvas.toBlob(resolve, mobile ? 'image/jpeg' : 'image/png', .92));
        canvas.width = 0; canvas.height = 0;
        if (!blob) throw new Error('PDF 页面图像生成失败。');
        if (this.pdfSession !== session) return;
        pageUrls[pageNumber - 1] = URL.createObjectURL(blob);
        this.pdfObjectUrls.push(pageUrls[pageNumber - 1]);
        if (!mobile) {
          const text = await page.getTextContent();
          pageTexts[pageNumber - 1] = text.items.map(part => part.str || '').join(' ');
        }
        if (this.pdfSession !== session) return;
        // Persist reusable images without delaying the first visible page.
        try { pageCache?.put(cacheKey, new Response(blob, { headers: { 'Content-Type': blob.type, 'X-Page-Text': encodeURIComponent(pageTexts[pageNumber - 1]) } })).catch(() => {}); } catch (_) {}
        rendered.add(pageNumber);
        if (mobile) this.mobileRenderedPages = [...rendered];
        page.cleanup();
      };
      if (mobile) await renderPage(initialPage);
      else for (let number = 1; number <= Math.min(3, pageCount); number++) await renderPage(number);
      if (this.pdfSession !== session) return;
      const outlineItems = [];
      let textIndexPromise, outlinePromise;
      const ensureTextIndex = () => textIndexPromise ||= (async () => {
        for (let number = 1; number <= pageCount; number++) {
          if (this.pdfSession !== session) return;
          if (!pageTexts[number - 1]) {
            const page = await documentProxy.getPage(number), text = await page.getTextContent();
            if (this.pdfSession !== session) return;
            pageTexts[number - 1] = text.items.map(part => part.str || '').join(' ');
          }
          await new Promise(resolve => setTimeout(resolve, 0));
        }
        if (this.pdfSession === session) this.pdfTextIndexReady = true;
      })().catch(error => { textIndexPromise = null; throw error; });
      const collectOutline = async entries => {
        for (const entry of entries || []) {
          const destination = typeof entry.dest === 'string' ? await documentProxy.getDestination(entry.dest) : entry.dest;
          if (destination) outlineItems.push({ title: entry.title, page: typeof destination[0] === 'number' ? destination[0] : await documentProxy.getPageIndex(destination[0]) });
          await collectOutline(entry.items);
        }
      };
      const ensureOutline = () => outlinePromise ||= documentProxy.getOutline().then(collectOutline);
      root.innerHTML = '';
      // This PDF is already laid out as a landscape two-page spread. Force
      // PageFlip's portrait mode so one PDF page remains one full book spread,
      // instead of PageFlip combining two spreads into four tiny pages.
      const hostWidth = Math.max(320, Math.floor(root.clientWidth));
      const portraitMinWidth = Math.floor(hostWidth / 2) + 2;
      this.pageFlip = new window.St.PageFlip(root, {
        startPage: initialPage - 1,
        width: pageWidth,
        height: pageHeight,
        size: 'stretch',
        minWidth: this.pdfPhoneLandscape ? Math.floor(root.clientWidth / 2) + 2 : 280,
        maxWidth: 1400,
        minHeight: this.pdfPhoneLandscape ? 100 : 360,
        maxHeight: 900,
        drawShadow: true,
        maxShadowOpacity: .42,
        flippingTime: 800,
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
      htmlPages = pageUrls.map((url, index) => {
        const pageElement = document.createElement('div');
        pageElement.className = 'pdf-sharp-page';
        const image = document.createElement('img');
        image.src = url;
        image.alt = '';
        image.draggable = false;
        image.dataset.pdfPage = String(index + 1);
        pageElement.appendChild(image);
        root.appendChild(pageElement);
        return pageElement;
      });
      await Promise.all(htmlPages.map(element => element.firstChild.decode()));
      this.pageFlip.loadFromHTML(htmlPages);
      if (this.pdfPhoneLandscape) {
        // The pinned PageFlip UI expects local, unrotated mouse/touch positions.
        const ui = this.pageFlip.getUI(), originalMousePos = ui.getMousePos.bind(ui);
        ui.getMousePos = (x, y) => {
          if (!matchMedia('(orientation:portrait)').matches) return originalMousePos(x, y);
          const element = ui.getDistElement(), rect = element.getBoundingClientRect();
          return { x: (y - rect.top) * element.offsetWidth / rect.height, y: (rect.right - x) * element.offsetHeight / rect.width };
        };
      }
      // Keep single centered covers, but fold them like the inner paper pages.
      // showCover otherwise assigns hard density to the first and last sheets.
      [0, pageCount - 1].forEach(index => this.pageFlip.getPage(index).setDensity('soft'));
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
      const centerBook = (animating = false) => {
        const flip = this.pageFlip;
        if (!flip) return;
        const bounds = flip.getBoundsRect();
        const page = flip.getCurrentPageIndex();
        const singleCover = flip.getOrientation() === 'landscape';
        const offset = !animating && singleCover ? (page === 0 ? -bounds.pageWidth / 2 : page === pageCount - 1 ? bounds.pageWidth / 2 : 0) : 0;
        root.style.setProperty('--cover-offset', `${offset}px`);
      };
      this.pageFlip.on('init', () => centerBook());
      this.pageFlip.on('flip', () => centerBook());
      this.pageFlip.on('changeOrientation', () => centerBook());
      this.pageFlip.on('changeState', event => {
        if (event.data === 'flipping' || event.data === 'user_fold') centerBook(true);
        else if (event.data === 'read') centerBook();
      });
      requestAnimationFrame(() => centerBook());
      this.pageFlip.on('init', positionSpine);
      this.pageFlip.on('flip', positionSpine);
      this.pageFlip.on('changeOrientation', positionSpine);
      this.resizeObserver = new ResizeObserver(() => requestAnimationFrame(positionSpine));
      this.resizeObserver.observe(root);
      requestAnimationFrame(positionSpine);
      document.getElementById('bookStagePrev').onclick = () => this.pageFlip?.flipPrev();
      document.getElementById('bookStageNext').onclick = () => this.pageFlip?.flipNext();
      progress.oninput = () => this.pageFlip?.turnToPage(Number(progress.value));
      const toggleFullscreen = async () => {
        if (!this.pdfPhoneLandscape) return reader.requestFullscreen?.();
        try {
          // Keep the rotated child inside an unrotated fullscreen host.
          const host = reader.parentElement;
          if (document.fullscreenElement === host) { await document.exitFullscreen(); return; }
          this.pdfFullscreenHost = host;
          await host.requestFullscreen?.();
          if (this.pdfSession !== session || document.fullscreenElement !== host || !screen.orientation?.lock) return;
          await screen.orientation.lock('landscape');
          if (this.pdfSession !== session || document.fullscreenElement !== host) { screen.orientation.unlock?.(); return; }
          this.pdfOrientationLocked = true;
        } catch (_) { /* The CSS landscape layout also works without native lock. */ }
      };
      document.getElementById('bookFullscreen').onclick = toggleFullscreen;
      document.getElementById('bookFullscreenBottom').onclick = toggleFullscreen;
      let zoom = 1;
      const applyZoom = () => stage.style.setProperty('--book-zoom', String(zoom));
      document.getElementById('bookZoomOut').onclick = () => { zoom = Math.max(.8, zoom - .1); applyZoom(); };
      document.getElementById('bookZoomIn').onclick = () => { zoom = Math.min(1.2, zoom + .1); applyZoom(); };
      this.fullscreenHandler = () => {
        if (!document.fullscreenElement && this.pdfOrientationLocked) {
          try { screen.orientation?.unlock?.(); } catch (_) {}
          this.pdfOrientationLocked = false;
        }
        window.setTimeout(() => { if (this.pdfSession === session) { this.viewportResizeHandler?.(); this.pageFlip?.update(); } }, 100);
      };
      document.addEventListener('fullscreenchange', this.fullscreenHandler);
      this.setupPdfTools(item, { reader, root, pageUrls, pageTexts, outlineItems, pageCount, ensureTextIndex, ensureOutline });
      if (mobile) {
        let pump = null, rerun = false;
        const nearby = () => {
          if (pump) { rerun = true; return; }
          pump = (async () => {
            while (this.pdfSession === session) {
              const current = this.pageFlip.getCurrentPageIndex() + 1;
              const number = [current, current + 1, current - 1].find(n => n >= 1 && n <= pageCount && !rendered.has(n));
              if (!number) break;
              await new Promise(resolve => setTimeout(resolve, 50));
              if (this.pdfSession !== session) return;
              if (this.pageFlip.getCurrentPageIndex() + 1 !== current) continue;
              await renderPage(number);
              if (this.pdfSession !== session) return;
              reader.querySelectorAll(`img[data-pdf-page="${number}"]`).forEach(image => { image.src = pageUrls[number - 1]; });
              const active = this.pageFlip.getCurrentPageIndex() + 1;
              for (const distant of [...rendered].filter(n => Math.abs(n - active) > 2)) {
                const oldUrl = pageUrls[distant - 1];
                pageUrls[distant - 1] = placeholder;
                reader.querySelectorAll(`img[data-pdf-page="${distant}"]`).forEach(image => { image.src = placeholder; });
                URL.revokeObjectURL(oldUrl);
                this.pdfObjectUrls = this.pdfObjectUrls.filter(url => url !== oldUrl);
                rendered.delete(distant);
              }
              this.mobileRenderedPages = [...rendered];
            }
            if (this.pdfSession === session) setStatus('当前书页已就绪；其它页面按阅读位置加载。');
          })().catch(error => { if (this.pdfSession === session) { console.error(error); setStatus('书页加载失败，请返回书架重试。'); } }).finally(() => {
            pump = null;
            if (rerun && this.pdfSession === session) { rerun = false; nearby(); }
          });
        };
        this.pageFlip.on('flip', nearby);
        nearby();
        return;
      }
      const loadRemaining = async () => {
        while (this.pdfSession === session && rendered.size < pageCount) {
          const current = this.pageFlip?.getCurrentPageIndex() || 0;
          const candidates = Array.from({ length: pageCount }, (_, index) => index + 1).filter(number => !rendered.has(number));
          candidates.sort((a, b) => Math.abs(a - current - 1) - Math.abs(b - current - 1));
          const number = candidates[0];
          await new Promise(resolve => setTimeout(resolve, 30));
          await renderPage(number);
          if (this.pdfSession !== session) return;
          htmlPages[number - 1].firstChild.src = pageUrls[number - 1];
        }
        if (this.pdfSession === session) setStatus('全部书页已就绪，高清页面已缓存。');
      };
      loadRemaining().catch(error => { if (this.pdfSession === session) { console.error(error); setStatus('部分书页加载失败，请重新打开绘本重试。'); } });
      setStatus('PDF 阅读进度保存在此设备。');
    } catch (error) {
      if (this.pdfSession !== session || !root.isConnected) return;
      if (librariesReady) {
        if (this.localPdfFiles.get(item.id) === item.localFile) this.localPdfFiles.delete(item.id);
        try { const cache = await caches.open('storyfox-pdf-files-v1'); await cache.delete(this.pdfFileCacheKey(item)); } catch (_) {}
      }
      console.error(error);
      root.innerHTML = `<div class="ebook-error"><strong>暂时无法打开本地 PDF</strong><span>${librariesReady ? '文件可能未完整下载或已损坏，请返回书架重新打开。' : '阅读组件暂时加载失败，请返回书架重试，已下载的文件会保留。'}</span><a href="#/reading">返回书架</a></div>`;
      setStatus(error.message || 'PDF 阅读器加载失败。');
    }
  },

  setupPdfTools(item, { reader, root, pageUrls, pageTexts, outlineItems, pageCount, ensureTextIndex, ensureOutline }) {
    const controls = reader.querySelector('.flipbook-controls');
    let controlsTimer;
    controls.addEventListener('pointerdown', event => {
      if (event.pointerType !== 'touch') return;
      controls.classList.add('controls-visible');
      clearTimeout(controlsTimer);
      controlsTimer = setTimeout(() => controls.classList.remove('controls-visible'), 3500);
    });
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
      if (thumbnail) { const image = document.createElement('img'); image.src = pageUrls[page]; image.alt = ''; image.dataset.pdfPage = String(page + 1); button.appendChild(image); }
      const text = document.createElement('span'); text.textContent = label; button.appendChild(text); button.onclick = () => go(page); panel.appendChild(button);
    };
    let closed = false;
    const show = async name => {
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
        let searchRequest = 0;
        input.oninput = async () => {
          const request = ++searchRequest;
          results.replaceChildren(); const query = input.value.trim().toLowerCase(); if (!query) return;
          results.textContent = '正在搜索…';
          try { await ensureTextIndex?.(); } catch (_) { if (reader.isConnected) results.textContent = '文字读取失败，请重试。'; return; }
          if (request !== searchRequest || !reader.isConnected || panel.hidden || panel.dataset.tool !== 'search') return;
          results.replaceChildren();
          pageTexts.forEach((text, page) => { const index = text.toLowerCase().indexOf(query); if (index < 0) return;
            const button = document.createElement('button'); button.className = 'pdf-tool-row'; button.textContent = `第 ${page + 1} 页 · ${text.slice(Math.max(0, index - 35), index + query.length + 90)}`; button.onclick = () => go(page); results.appendChild(button);
          });
          if (!results.children.length) results.textContent = '未找到匹配文字（扫描图片中的文字无法直接搜索）。';
        }; input.focus();
      } else if (name === 'contents') {
        try { await ensureOutline?.(); } catch (_) {}
        if (!reader.isConnected || panel.hidden || panel.dataset.tool !== name) return;
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
        preview.dataset.pdfPage = String(this.pageFlip.getCurrentPageIndex() + 1);
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
