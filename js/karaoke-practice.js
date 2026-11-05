/* Interactive karaoke practice for Story Fox Watch and Listen and Read.
 * Uses the existing .words.json / official VTT timeline; no media re-encoding.
 */
(function(){
  'use strict';
  const byTime = media => Math.round((Number(media.currentTime) || 0) * 1000);
  const valid = segment => segment && Number.isFinite(segment.startMs) &&
    Number.isFinite(segment.endMs) && segment.endMs > segment.startMs;
  const jump = (media, timeMs) => {
    const seek = () => {
      if (!media.isConnected) return;
      media.currentTime = Math.max(0, timeMs / 1000);
      const result = media.play();
      if (result && result.catch) result.catch(() => {});
    };
    if (media.readyState === 0) media.addEventListener('loadedmetadata', seek, {once: true});
    else seek();
  };
  function createButton(className, title) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn secondary small ' + className;
    button.setAttribute('aria-pressed', 'false');
    button.textContent = title;
    return button;
  }
  function appendSetting(controls, name, button) {
    const row = document.createElement('div');
    row.className = 'subtitle-setting-row';
    const label = document.createElement('span');
    label.textContent = name;
    row.append(label, button);
    controls.appendChild(row);
    return row;
  }
  function attachSpeed(container, media, className) {
    const label = document.createElement('label');
    label.className = className;
    const text = document.createElement('span');
    text.textContent = '播放速度';
    const select = document.createElement('select');
    select.setAttribute('aria-label', '播放速度');
    [0.75, 1, 1.25, 1.5].forEach(speed => {
      const option = document.createElement('option');
      option.value = String(speed);
      option.textContent = speed + '×';
      select.appendChild(option);
    });
    select.value = '1';
    select.addEventListener('change', () => { media.playbackRate = Number(select.value); });
    label.append(text, select);
    container.appendChild(label);
  }
  function pumpLoop(media, readSegment) {
    let frame = null;
    const stop = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
    };
    const tick = () => {
      frame = null;
      if (!media.isConnected || media.paused) return;
      const segment = readSegment();
      if (!valid(segment)) return;
      const now = byTime(media);
      if (now >= segment.endMs - 35 || now < segment.startMs - 250) {
        media.currentTime = segment.startMs / 1000;
      }
      frame = requestAnimationFrame(tick);
    };
    const start = () => {
      if (frame === null && !media.paused && valid(readSegment())) {
        frame = requestAnimationFrame(tick);
      }
    };
    media.addEventListener('play', start);
    media.addEventListener('pause', stop);
    media.addEventListener('ended', stop);
    return {start, stop};
  }
  function attachVideo(options) {
    const {player, caption, cues, prepared} = options;
    const controls = player.closest('.subtitle-video-wrap')?.querySelector('.subtitle-controls');
    if (!controls || !Array.isArray(prepared) || !cues.length || player._sfKaraokePractice) return;
    player._sfKaraokePractice = true;

    let mode = 'off';
    let segment = null;
    const sentenceButton = createButton('sf-sentence-loop-toggle', '开启');
    const wordButton = createButton('sf-word-loop-toggle', '开启');
    appendSetting(controls, '单句循环', sentenceButton);
    appendSetting(controls, '单词循环', wordButton);
    const speedRow = document.createElement('div');
    speedRow.className = 'subtitle-setting-row';
    appendSetting(controls, '提示', (() => {
      const hint = document.createElement('span');
      hint.className = 'sf-practice-hint';
      hint.textContent = '点击字幕单词可定位并播放';
      return hint;
    })());
    appendSetting(controls, '词级时间轴', (() => {
      const count = prepared.reduce((sum, cue) => {
        cue.words.forEach(word => {
          sum.total++;
          if (word.source === 'speech') sum.speech++;
        });
        return sum;
      }, {total: 0, speech: 0});
      const quality = document.createElement('span');
      quality.className = 'sf-practice-quality';
      quality.textContent = count.total ? '语音对齐 ' + Math.round(count.speech / count.total * 100) + '% · 其余估算' : '按字幕估算';
      quality.title = '语音对齐来自音频识别，估算词的高亮不代表精确语音边界';
      return quality;
    })());
    attachSpeed(speedRow, player, 'sf-speed-control');
    controls.appendChild(speedRow);

    const loop = pumpLoop(player, () => segment);
    const refresh = () => {
      sentenceButton.setAttribute('aria-pressed', String(mode === 'sentence'));
      wordButton.setAttribute('aria-pressed', String(mode === 'word'));
      sentenceButton.textContent = mode === 'sentence' ? '关闭' : '开启';
      wordButton.textContent = mode === 'word' ? (segment ? '关闭' : '选择单词') : '开启';
    };
    const select = (nextMode, nextSegment) => {
      mode = nextMode;
      segment = valid(nextSegment) ? nextSegment : null;
      loop.stop();
      refresh();
      loop.start();
    };
    const currentCue = () => {
      const now = byTime(player);
      let index = cues.findIndex(cue => now >= cue.startMs && now < cue.endMs);
      if (index < 0) index = cues.findIndex(cue => cue.startMs > now);
      return index >= 0 ? index : 0;
    };
    sentenceButton.addEventListener('click', () => {
      if (mode === 'sentence') return select('off');
      const cue = cues[currentCue()];
      select('sentence', cue);
      jump(player, cue.startMs);
    });
    wordButton.addEventListener('click', () => {
      select(mode === 'word' ? 'off' : 'word');
    });
    caption.addEventListener('click', event => {
      const target = event.target.closest('.sf-karaoke-word');
      if (!target || !caption.contains(target)) return;
      const cueIndex = cues.findIndex(cue => byTime(player) >= cue.startMs && byTime(player) <= cue.endMs);
      const wordIndex = Number(target.dataset.wordIndex);
      const word = prepared[cueIndex]?.words[wordIndex];
      if (!valid(word)) return;
      if (mode === 'word') select('word', word);
      else select('off');
      jump(player, word.startMs);
    });
    caption.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const target = event.target.closest('.sf-karaoke-word');
      if (target && caption.contains(target)) {
        event.preventDefault();
        target.click();
      }
    });
    refresh();
  }
  function attachAudio(options) {
    const {panel, audio, cues, prepared} = options;
    const actions = panel.querySelector('.timed-sentence-actions');
    const list = panel.querySelector('.timed-sentence-list');
    const sentenceLoop = panel.querySelector('.timed-sentence-loop');
    if (!actions || !list || !cues.length || !Array.isArray(prepared) || panel._sfKaraokePractice) return;
    panel._sfKaraokePractice = true;

    let armed = false;
    let selectedWord = null;
    const button = createButton('sf-audio-word-loop', '单词循环：关');
    actions.insertBefore(button, actions.querySelector('.timed-sentence-follow-label'));
    attachSpeed(actions, audio, 'sf-audio-speed-control');
    const loop = pumpLoop(audio, () => armed ? selectedWord : null);
    const refresh = () => {
      button.setAttribute('aria-pressed', String(armed));
      button.textContent = armed ? (selectedWord ? '单词循环：开' : '单词循环：选词') : '单词循环：关';
    };
    const reset = () => {
      armed = false;
      selectedWord = null;
      loop.stop();
      refresh();
    };
    button.addEventListener('click', () => {
      armed = !armed;
      selectedWord = null;
      loop.stop();
      refresh();
    });
    sentenceLoop?.addEventListener('click', reset);
    panel.querySelector('.timed-sentence-prev')?.addEventListener('click', reset);
    panel.querySelector('.timed-sentence-next')?.addEventListener('click', reset);
    list.addEventListener('click', event => {
      if (event.target.closest('.timed-sentence-loop-one')) {
        reset();
        return;
      }
      const target = event.target.closest('.sf-karaoke-word');
      if (!target) {
        if (armed) { selectedWord = null; loop.stop(); refresh(); }
        return;
      }
      const row = target.closest('.timed-sentence-item');
      const cueIndex = Number(row?.dataset.cueIndex);
      const wordIndex = Number(target.dataset.wordIndex);
      const word = prepared[cueIndex]?.words[wordIndex];
      if (!valid(word)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (armed) {
        if (sentenceLoop?.getAttribute('aria-pressed') === 'true') sentenceLoop.click();
        armed = true;
        selectedWord = word;
      } else {
        selectedWord = null;
      }
      refresh();
      jump(audio, word.startMs);
      loop.start();
    }, true);
    refresh();
  }
  window.SFKaraokePractice = {attachVideo, attachAudio};
})();