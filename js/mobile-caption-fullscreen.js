/* Keep Story Fox's own karaoke captions visible on mobile fullscreen.
 * Never open the <video> itself in native fullscreen: that surface excludes
 * HTML captions and word-timing overlays on several mobile browsers.
 */
(function(){
  'use strict';
  const formatTime = seconds => {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const time = Math.floor(seconds);
    return Math.floor(time / 60) + ':' + String(time % 60).padStart(2, '0');
  };
  const coarsePointer = () => !!((window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ||
    (window.navigator && window.navigator.maxTouchPoints > 0));
  const mobileEnvironment = () => {
    // Some Android browsers report zero touch points in "desktop site" mode.
    const agent = String(window.navigator?.userAgent || '');
    const platform = String(window.navigator?.platform || '');
    return /Android|iPhone|iPad|iPod|Mobile|HarmonyOS|Quark|UCBrowser|QQBrowser|HuaweiBrowser|VivoBrowser|MicroMessenger/i.test(agent) ||
      (/Mac/i.test(platform) && Number(window.navigator?.maxTouchPoints || 0) > 1) ||
      coarsePointer();
  };
  function button(className, label, text) {
    const node = document.createElement('button');
    node.type = 'button';
    node.className = className;
    node.setAttribute('aria-label', label);
    node.textContent = text;
    return node;
  }
  function attach({stage, player, trigger, showControls}) {
    if (!stage || !player || !trigger || stage._sfFullscreenBound) return;
    stage._sfFullscreenBound = true;
    let placeholder = null;
    let pseudo = false;
    const isMobile = mobileEnvironment();
    const isFull = () => pseudo || document.fullscreenElement === stage;
    const updateButton = () => {
      const full = isFull();
      trigger.classList.toggle('is-fullscreen', full);
      trigger.setAttribute('aria-label', full ? '退出全屏' : '全屏观看（保留逐词高亮字幕）');
      const label = trigger.querySelector('span');
      if (label) label.textContent = full ? '退出' : (isMobile ? '网页全屏' : '全屏');
      if (mobileFullscreenButton) mobileFullscreenButton.setAttribute('aria-label', full ? '退出全屏' : '全屏观看（保留字幕）');
    };
    const restore = () => {
      if (!pseudo) return;
      pseudo = false;
      stage.classList.remove('subtitle-page-fullscreen');
      if (isMobile) stage.classList.add('sf-caption-below');
      document.documentElement.classList.remove('sf-caption-screen-locked');
      document.body.classList.remove('sf-caption-screen-locked');
      if (placeholder && placeholder.isConnected) placeholder.replaceWith(stage);
      else stage.remove(); // The lesson was closed while mobile fullscreen was active.
      placeholder = null;
      updateButton();
    };
    const enterPseudo = () => {
      if (!stage.isConnected) return;
      placeholder = document.createComment('storyfox-caption-fullscreen-placeholder');
      stage.replaceWith(placeholder);
      document.body.appendChild(stage); // Escape transformed/clipped floating windows.
      pseudo = true;
      stage.classList.remove('sf-caption-below');
      stage.classList.add('subtitle-page-fullscreen');
      document.documentElement.classList.add('sf-caption-screen-locked');
      document.body.classList.add('sf-caption-screen-locked');
      updateButton();
      showControls?.();
    };
    const exit = async () => {
      if (pseudo) restore();
      else if (document.fullscreenElement === stage && document.exitFullscreen) {
        try { await document.exitFullscreen(); } catch {}
      }
      updateButton();
    };
    const toggle = async () => {
      if (isFull()) { await exit(); return; }
      // Some mobile browsers convert even parent Fullscreen API into their
      // native video player, which cannot show external word-highlight HTML.
      // Always use viewport CSS fullscreen when this is a mobile environment.
      if (isMobile) { enterPseudo(); return; }
      // Desktop uses ordinary stage fullscreen with the caption inside.
      if (typeof stage.requestFullscreen === 'function') {
        try {
          await stage.requestFullscreen();
          if (document.fullscreenElement === stage) { updateButton(); showControls?.(); return; }
        } catch {}
      }
      // iPhone Safari and embedded browsers may only allow <video> fullscreen.
      // Use a body-level fixed stage instead; it retains clickable HTML words.
      enterPseudo();
    };
    trigger.addEventListener('click', () => { void toggle(); });
    const onChange = () => {
      if (!pseudo) updateButton();
    };
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && pseudo) { event.preventDefault(); restore(); }
    });
    window.addEventListener('hashchange', () => { if (pseudo) restore(); });
    // Some iOS browsers force <video> fullscreen even with playsinline.
    // Inline custom controls avoid offering the native fullscreen button.
    player.setAttribute('playsinline', '');
    player.setAttribute('webkit-playsinline', '');
    player.setAttribute('x5-playsinline', '');
    player.setAttribute('x5-video-player-type', 'h5');
    player.setAttribute('controlslist', 'nofullscreen noremoteplayback');
    player.setAttribute('disablepictureinpicture', '');
    let mobileFullscreenButton = null;
    if (!isMobile) {
      // Preserve the existing desktop native play/seek controls.
      player.setAttribute('controls', '');
      player.controls = true;
    }
    // Movie lessons have their own 8-button toolbar; do not inject the legacy
    // mobile seek/play/mute/fullscreen bar a second time.
    const movieToolbar = !!player.closest('.sf-movie-lesson-player')?.querySelector('.sf-lesson-toolbar');
    if (isMobile && !movieToolbar) {
      stage.classList.add('sf-touch-stage', 'sf-caption-below');
      player.removeAttribute('controls');
      player.controls = false;
      // HTML hit surface prevents a tap on <video> from being claimed by
      // mobile browsers as a request for their native fullscreen player.
      const hitArea = document.createElement('button');
      hitArea.type = 'button';
      hitArea.className = 'sf-touch-video-hitarea';
      hitArea.setAttribute('aria-label', '播放或暂停视频（保留逐词字幕）');
      hitArea.addEventListener('click', () => {
        if (player.paused) {
          const attempt = player.play();
          if (attempt && attempt.catch) attempt.catch(() => {});
        } else player.pause();
      });
      stage.appendChild(hitArea);
      const bar = document.createElement('div');
      bar.className = 'sf-touch-video-controls';
      bar.setAttribute('role', 'group');
      bar.setAttribute('aria-label', '网页视频播放控制（保留逐词字幕）');
      const play = button('sf-touch-play', '播放或暂停', '▶');
      const seek = document.createElement('input');
      seek.type = 'range';
      seek.min = '0'; seek.max = '1000'; seek.step = '1'; seek.value = '0';
      seek.className = 'sf-touch-seek';
      seek.setAttribute('aria-label', '视频播放进度');
      const time = document.createElement('span');
      time.className = 'sf-touch-time';
      time.textContent = '0:00 / 0:00';
      const mute = button('sf-touch-mute', '静音或恢复音量', '🔊');
      mobileFullscreenButton = button('sf-touch-fullscreen', '网页全屏（保留高亮字幕）', '⛶');
      bar.append(play, seek, time, mute, mobileFullscreenButton);
      stage.appendChild(bar);
      play.addEventListener('click', () => {
        if (player.paused) {
          const attempt = player.play();
          if (attempt && attempt.catch) attempt.catch(() => {});
        } else player.pause();
      });
      mute.addEventListener('click', () => { player.muted = !player.muted; });
      mobileFullscreenButton.addEventListener('click', () => { void toggle(); });
      seek.addEventListener('input', () => {
        if (Number.isFinite(player.duration) && player.duration > 0) {
          player.currentTime = player.duration * Number(seek.value) / 1000;
        }
      });
      const refresh = () => {
        play.textContent = player.paused ? '▶' : '❚❚';
        play.setAttribute('aria-label', player.paused ? '播放' : '暂停');
        mute.textContent = player.muted ? '🔇' : '🔊';
        mute.setAttribute('aria-label', player.muted ? '恢复音量' : '静音');
        const duration = Number.isFinite(player.duration) ? player.duration : 0;
        time.textContent = formatTime(player.currentTime) + ' / ' + formatTime(duration);
        if (duration > 0 && !seek.matches(':active')) {
          seek.value = String(Math.min(1000, Math.round(1000 * (player.currentTime || 0) / duration)));
        }
      };
      ['timeupdate','loadedmetadata','durationchange','play','pause','ended','volumechange','seeked'].forEach(name =>
        player.addEventListener(name, refresh));
      refresh();
    }
    updateButton();
    return {toggle, exit, isFull};
  }
  window.SFCaptionFullscreen = {attach};
})();