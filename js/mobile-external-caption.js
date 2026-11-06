/* Mobile Watch subtitles live OUTSIDE the video wrapping element.
 * Some Android browsers composite <video> and its adjacent overlays in a
 * proprietary layer; an independent DOM sibling is not covered by that layer.
 * Desktop Watch retains the existing draggable in-video subtitles.
 */
(function(){
  'use strict';
  function isApplicable(){
    const matches=window.matchMedia &&
      window.matchMedia('(max-width: 900px), (pointer: coarse)').matches;
    const ua=String(navigator.userAgent||'');
    return !!matches || /Android|iPhone|iPad|iPod|HarmonyOS|Mobile|Quark|UCBrowser|QQBrowser|HuaweiBrowser|VivoBrowser|MicroMessenger/i.test(ua);
  }
  function attach({player,d,vttUrl,parseVtt,preferences}){
    const panel=player.closest('.direct-video-panel');
    const tray=panel?.querySelector('.sf-mobile-captions-outside');
    const line=tray?.querySelector('.sf-mobile-caption-line');
    const hint=tray?.querySelector('.sf-mobile-caption-hint');
    if(!tray||!line||!hint||tray.dataset.bound==='1')return;
    tray.dataset.bound='1';
    tray.classList.add('is-caption-ready','is-mobile-external');
    player.closest('.subtitle-video-wrap')?.classList.add('sf-external-caption-mode');
    const setHint=value=>{hint.textContent=value||'';hint.hidden=!value;};
    const sync=window.SFWordSync;
    let cues=[], prepared=[],active=-2,mode=null,wordView=null;
    let animation=0,lastTick=0;
    const offsetHost=panel?.querySelector('.sf-subtitle-offset');
    const offsetKey='storyfox-subtitle-offset:'+String(d.seriesId||'');
    const clampOffset=value=>Math.max(-30,Math.min(30,Math.round(value*2)/2));
    let offsetSeconds=0;
    try{offsetSeconds=clampOffset(Number(localStorage.getItem(offsetKey))||0);}catch{}
    const label=offsetHost?.querySelector('.sf-offset-label');
    const updateLabel=()=>{if(label)label.textContent=(offsetSeconds>0?'+':'')+offsetSeconds.toFixed(1)+'s';};
    const changeOffset=value=>{
      offsetSeconds=clampOffset(value);
      try{localStorage.setItem(offsetKey,String(offsetSeconds));}catch{}
      updateLabel();active=-2;repaint();
    };
    offsetHost?.querySelector('.sf-offset-minus')?.addEventListener('click',()=>changeOffset(offsetSeconds-0.5));
    offsetHost?.querySelector('.sf-offset-plus')?.addEventListener('click',()=>changeOffset(offsetSeconds+0.5));
    offsetHost?.querySelector('.sf-offset-reset')?.addEventListener('click',()=>changeOffset(0));
    updateLabel();


    const repaint=()=>{
      if(!tray.isConnected)return;
      const prefs=preferences();
      const visible=prefs.visible!==false;
      const wordEnabled=prefs.wordHighlight!==false;
      const now=Math.max(0,Math.round(((Number(player.currentTime)||0)-offsetSeconds)*1000));
      tray.classList.toggle('is-caption-disabled',!visible);
      const enable=tray.querySelector('.sf-mobile-caption-enable');
      if(enable) enable.hidden=visible;
      if(!visible){
        line.textContent='';
        setHint('字幕已关闭：点击播放器上的「字幕」按钮重新开启。');
        active=-2;
        return;
      }
      if(!cues.length){
        setHint('英文字幕正在加载…');
        return;
      }
      let index=cues.findIndex(cue=>now>=cue.startMs&&now<cue.endMs);
      const gap=index<0;
      if(gap){
        // Do not leave a blank tray in speech pauses or on an offset source.
        // Preview the next/last sentence with subdued text and a gap label.
        index=cues.findIndex(cue=>cue.startMs>now);
        if(index<0)index=cues.length-1;
      }
      const showWords=d.seriesId!=='movie-harry-potter-1'&&!!sync&&wordEnabled&&Array.isArray(prepared)&&prepared[index];
      if(index!==active||mode!==String(showWords)){
        active=index;
        mode=String(showWords);
        wordView=null;
        if(showWords){
          wordView=sync.render(prepared[index],true);
          line.replaceChildren(wordView.fragment);
        }else{
          line.textContent=cues[index]?.text||'';
        }
      }
      line.classList.toggle('is-upcoming',gap);
      line.style.fontSize=(Number.isFinite(Number(prefs.size))?Math.max(14,Math.min(28,Number(prefs.size))):20)+'px';
      line.style.color=d.seriesId==='movie-harry-potter-1'?'#253447':(prefs.color||'#ffffff');
      if(d.seriesId==='movie-harry-potter-1'){
        line.style.fontWeight='500';
        line.style.textShadow='none';
      }
      if(gap)setHint(now<cues[0].startMs?'开场中，下面显示即将开始的台词':'对白间隙 · 下一句预览');
      else setHint('');
      if(!gap&&wordView)sync.paint(wordView,now,true);
      else if(wordView)sync.paint(wordView,-1,false);
    };
    const animate=time=>{
      animation=0;
      if(!tray.isConnected||player.paused)return;
      if(time-lastTick>55){lastTick=time;repaint();}
      animation=requestAnimationFrame(animate);
    };
    const start=()=>{
      if(!animation&&!player.paused&&typeof requestAnimationFrame==='function')
        animation=requestAnimationFrame(animate);
    };
    const stop=()=>{if(animation){cancelAnimationFrame(animation);animation=0;}};
    ['timeupdate','seeked','loadedmetadata','durationchange','playing','pause','ratechange'].forEach(type=>
      player.addEventListener(type,repaint));
    player.addEventListener('play',start);
    player.addEventListener('pause',stop);
    player.addEventListener('ended',stop);
    line.addEventListener('click',event=>{
      const word=event.target.closest('.sf-karaoke-word');
      if(!word||!line.contains(word)||active<0)return;
      const idx=Number(word.dataset.wordIndex);
      const target=prepared[active]?.words[idx];
      if(!target||!Number.isFinite(target.startMs))return;
      player.currentTime=Math.max(0,target.startMs/1000+offsetSeconds);
      const result=player.play();
      result?.catch?.(()=>{});
    });

    async function load(){
      setHint('英文字幕正在加载…');
      if(!vttUrl){setHint('当前课程暂无英文字幕文件');return;}
      try{
        const response=await fetch(new URL(vttUrl,location.href).href,{cache:'no-store'});
        if(!response.ok)throw Error('HTTP '+response.status);
        cues=parseVtt(await response.text());
        if(!cues.length)throw Error('No subtitle cues');
      }catch(error){
        console.warn('Mobile subtitle fetch failed',vttUrl,error);
        setHint('英文字幕加载失败（'+String(error.message||'网络错误')+'），请检查网络或刷新页面。');
        line.textContent='字幕暂时无法显示';
        return;
      }
      prepared=typeof sync?.prepare==='function'?sync.prepare(cues,null):[];
      active=-2;
      repaint();
      // Sentence subtitles are independent from the optional word JSON.
      if(sync?.load){
        sync.load(d,cues).then(result=>{
          if(!tray.isConnected||!Array.isArray(result)||result.length!==cues.length)return;
          prepared.splice(0,prepared.length,...result);
          active=-2;
          repaint();
        }).catch(()=>{});
      }
      window.SFKaraokePractice?.attachVideo({player,caption:line,cues,prepared});
      start();
    }
    tray.addEventListener('click',event=>{
      // Dedicated caption toggle remains reachable if users previously turned it off.
      const button=event.target.closest('.sf-mobile-caption-enable');
      if(!button)return;
      button.hidden=true;
      const prefs=preferences();
      if(!prefs.visible){
        try {
          localStorage.setItem('storyfox-subtitle-preferences',
            JSON.stringify({...prefs,visible:true}));
        }catch{}
      }
      repaint();
    });
    repaint();
    void load();
  }
  window.SFMobileCaption={isApplicable,attach};
})();