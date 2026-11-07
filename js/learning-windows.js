/* Desktop learning workspaces can coexist with a playing video window. */
window.LearningWindows = {
  desktop() { return matchMedia('(min-width:901px) and (pointer:fine)').matches; },
  enhance(win) {
    if (!this.desktop() || win.dataset.workspaceReady) return;
    win.dataset.workspaceReady = 'true';
    win.classList.add('sf-desktop-workspace');
    const count = Math.max(0, win.parentElement.children.length - 1);
    const width = Math.min(900, innerWidth * .85);
    const besideVideo = innerWidth >= 1600 && !!win.parentElement.querySelector('.floating-watch,.floating-hlsVideo');
    win.style.setProperty('--workspace-left', `${besideVideo ? innerWidth - width - 20 : Math.min(80 + count * 32, Math.max(12, innerWidth - width - 12))}px`);
    win.style.setProperty('--workspace-top', `${Math.min(64 + count * 32, Math.max(12, innerHeight - Math.min(640, innerHeight * .82) - 12))}px`);
    const header = win.querySelector('.floating-header');
    const maximize = document.createElement('button');
    maximize.type = 'button'; maximize.className = 'sf-window-maximize';
    maximize.textContent = '⛶'; maximize.title = '全屏'; maximize.setAttribute('aria-label', '全屏学习窗口');
    header.insertBefore(maximize, header.querySelector('.floating-close'));
    const toggle = () => {
      const full = win.classList.toggle('sf-workspace-maximized');
      maximize.textContent = full ? '❐' : '⛶'; maximize.title = full ? '还原窗口' : '全屏';
      maximize.setAttribute('aria-label', full ? '还原学习窗口' : '全屏学习窗口');
      maximize.setAttribute('aria-pressed', String(full));
      window.dispatchEvent(new Event('resize'));
    };
    maximize.onclick = toggle;
    let drag = null;
    const move = event => {
      if (!drag) return;
      win.style.setProperty('--workspace-left', `${Math.max(0, Math.min(innerWidth - 100, event.clientX - drag.x))}px`);
      win.style.setProperty('--workspace-top', `${Math.max(0, Math.min(innerHeight - 48, event.clientY - drag.y))}px`);
    };
    const finish = () => { drag = null; };
    header.addEventListener('mousedown', event => {
      if (event.button !== 0 || event.target.closest('button') || win.classList.contains('sf-workspace-maximized')) return;
      const rect = win.getBoundingClientRect(); drag = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      event.preventDefault();
    });
    const escape = event => {
      if (event.key === 'Escape' && win.contains(document.activeElement) && win.classList.contains('sf-workspace-maximized')) toggle();
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', finish);
    document.addEventListener('keydown', escape);
    win.querySelector('.floating-close').addEventListener('click', () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', finish);
      document.removeEventListener('keydown', escape);
    });
  },
  openBook(app, bookId, seriesId = '') {
    if (!/^[a-z0-9-]+$/.test(bookId) || (seriesId && !/^[a-z0-9-]+$/.test(seriesId))) return;
    if (!app.windowLayer?.isConnected) {
      app.windowLayer = document.createElement('div'); app.windowLayer.id = 'windowLayer';
      document.body.appendChild(app.windowLayer); app.windowZ = 20;
    }
    const win = document.createElement('section');
    win.className = 'floating-window floating-storyBook';
    win.style.zIndex = ++app.windowZ;
    win.innerHTML = '<div class="floating-header"><span>Story Book 绘本</span><span class="read-header-hint"></span><button class="floating-close" type="button" aria-label="关闭绘本窗口">×</button></div><div class="floating-content"><iframe class="sf-book-workspace-frame" title="绘本阅读器" allow="fullscreen" allowfullscreen></iframe></div>';
    const frame = win.querySelector('iframe');
    frame.src = new URL('index.html', location.href).href + '#/reader/' + bookId + (seriesId ? '/' + seriesId : '');
    frame.addEventListener('load', () => {
      try { frame.contentWindow.addEventListener('pointerdown', () => { win.style.zIndex = ++app.windowZ; }); } catch (_) {}
    });
    win.querySelector('.floating-close').onclick = () => { frame.src = 'about:blank'; win.remove(); };
    win.addEventListener('mousedown', () => { win.style.zIndex = ++app.windowZ; });
    app.windowLayer.appendChild(win); this.enhance(win);
  }
};

document.addEventListener('click', event => {
  if (window.self !== window.top || !LearningWindows.desktop() || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  const link = event.target.closest('a[href^="#/reader/"]');
  const match = link?.getAttribute('href').match(/^#\/reader\/([a-z0-9-]+)(?:\/([a-z0-9-]+))?$/);
  if (!match || match[1] === 'local-pdf' || typeof App === 'undefined') return;
  event.preventDefault(); LearningWindows.openBook(App, match[1], match[2] || '');
});
