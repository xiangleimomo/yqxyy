/* Desktop movie chrome. Playback and mobile controls keep their existing owners. */
window.SFDesktopPlayer = {
  attach({stage, player, showControls, hideControlsLater}) {
    if (stage.querySelector('.sf-desktop-player-controls')) return;
    const panel = stage.closest('.sf-movie-lesson-player');
    const svg = body => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
    const icons = {
      play: svg('<path fill="currentColor" stroke="none" d="m7 4 14 8-14 8z"/>'),
      pause: svg('<path stroke-width="5" d="M8 5v14M16 5v14"/>'),
      back: svg('<path d="M4 9a8 8 0 1 1 0 7M4 4v5h5"/><text x="8" y="16" fill="currentColor" stroke="none" font-size="8">10</text>'),
      forward: svg('<path d="M20 9a8 8 0 1 0 0 7M20 4v5h-5"/><text x="8" y="16" fill="currentColor" stroke="none" font-size="8">10</text>'),
      volume: svg('<path d="M4 9h4l5-4v14l-5-4H4zM17 8a6 6 0 0 1 0 8M20 5a10 10 0 0 1 0 14"/>'),
      muted: svg('<path d="M4 9h4l5-4v14l-5-4H4zM17 9l5 6M22 9l-5 6"/>'),
      prev: svg('<path d="M5 5v14M19 5 7 12l12 7z"/>'),
      next: svg('<path d="M19 5v14M5 5l12 7-12 7z"/>'),
      quiz: svg('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="m8 9 1 1 2-2M13 9h3m-8 6 1 1 2-2m2 1h3"/>'),
      captions: svg('<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M10 9H6v6h4m8-6h-4v6h4"/>'),
      settings: svg('<path d="m10 3-.6 2.2-2 .9-2-.7L3.5 9l1.6 1.5v3L3.5 15l1.9 3.6 2-.7 2 .9L10 21h4l.6-2.2 2-.9 2 .7 1.9-3.6-1.6-1.5v-3L20.5 9l-1.9-3.6-2 .7-2-.9L14 3z"/><circle cx="12" cy="12" r="3"/>'),
      fullscreen: svg('<path d="M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5"/>')
    };
    const button = (action, label, icon) => `<button type="button" data-desktop-act="${action}" title="${label}" aria-label="${label}">${icons[icon || action]}</button>`;
    const bar = document.createElement('div');
    bar.className = 'sf-desktop-player-controls';
    bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', '视频播放控制');
    bar.innerHTML = `${button('play','播放','play')}${button('back','后退 10 秒')}${button('forward','前进 10 秒')}<div class="sf-desktop-volume">${button('volume','静音','volume')}<input aria-label="音量" type="range" min="0" max="1" step=".05" value="1"></div><output class="sf-desktop-clock">0:00 / 0:00</output><span class="sf-desktop-control-spacer"></span>${button('prev','上一集')}${button('next','下一集')}<button type="button" data-desktop-act="speed" title="播放速度" aria-label="播放速度">1x</button>${button('quiz','本集测验')}${button('captions','显示或隐藏字幕')}${button('settings','字幕设置')}${button('fullscreen','全屏')}`;
    stage.appendChild(bar);
    const get = action => bar.querySelector(`[data-desktop-act="${action}"]`);
    const proxy = action => panel.querySelector(`.sf-lesson-toolbar [data-act="${action}"]`);
    const time = value => {
      const seconds = Math.max(0, Math.floor(value || 0)), minutes = Math.floor(seconds / 60);
      return minutes >= 60 ? `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2,'0')}:${String(seconds % 60).padStart(2,'0')}` : `${minutes}:${String(seconds % 60).padStart(2,'0')}`;
    };
    const bounds = () => ({start: Number(player.dataset.clipStart) || 0, end: Number(player.dataset.clipEnd) || player.duration});
    const refresh = () => {
      get('play').innerHTML = icons[player.paused ? 'play' : 'pause'];
      get('play').setAttribute('aria-label', player.paused ? '播放' : '暂停');
      get('volume').innerHTML = icons[player.muted || !player.volume ? 'muted' : 'volume'];
      get('volume').setAttribute('aria-label', player.muted ? '取消静音' : '静音');
      bar.querySelector('input').value = player.muted ? 0 : player.volume;
      get('speed').textContent = player.playbackRate + 'x';
      const {start,end} = bounds();
      bar.querySelector('output').textContent = `${time(player.currentTime-start)} / ${time(Number.isFinite(end)?end-start:0)}`;
      for(const action of ['prev','next'])get(action).disabled = !!proxy(action)?.disabled;
      get('captions').setAttribute('aria-pressed', String(stage.querySelector('.video-caption')?.dataset.subtitleVisible !== 'false'));
      const seek = stage.querySelector('.sf-movie-timeline input');
      seek?.style.setProperty('--seek-progress', `${Number(seek.value)/10}%`);
    };
    get('play').onclick = () => player.paused ? player.play().catch(()=>{}) : player.pause();
    for(const [action,delta] of [['back',-10],['forward',10]])get(action).onclick = () => {
      const {start,end} = bounds();
      player.currentTime = Math.max(start,Math.min(Number.isFinite(end)?end:Infinity,player.currentTime+delta)); refresh();
    };
    get('volume').onclick = () => {player.muted=!player.muted;refresh();};
    bar.querySelector('input').oninput = event => {player.volume=Number(event.target.value);player.muted=!player.volume;refresh();};
    for(const action of ['prev','next','speed','quiz','fullscreen'])get(action).onclick = () => proxy(action)?.click();
    get('captions').onclick = () => stage.querySelector('.subtitle-toggle')?.click();
    get('settings').onclick = () => stage.querySelector('.subtitle-settings-trigger')?.click();
    bar.addEventListener('pointermove',()=>{showControls();hideControlsLater();});
    bar.addEventListener('pointerdown',showControls);
    bar.addEventListener('focusin',showControls);
    bar.addEventListener('focusout',hideControlsLater);
    bar.addEventListener('click',event=>{if(event.detail>0)event.target.closest('button')?.blur();refresh();hideControlsLater();});
    bar.querySelector('input').addEventListener('pointerup',event=>{event.target.blur();hideControlsLater();});
    for(const event of ['timeupdate','play','pause','loadedmetadata','ratechange','volumechange','sfcaptionchange'])player.addEventListener(event,refresh);
    refresh();
  }
};
