/* Keep phone games inside the visible viewport; desktop windows are untouched. */
(()=>{
 'use strict';
 const query=matchMedia('(max-width:640px), (pointer:coarse) and (max-width:1024px)');
 let locked=false,previousOverflow='';
 function refresh(){
  const mobile=query.matches;
  for(const win of document.querySelectorAll('.floating-games')){
   win.classList.toggle('mobile-games-window',mobile);
   win.classList.toggle('mobile-games-playing',mobile&&win.dataset.gamePlaying==='true');
   win.classList.toggle('mobile-games-fullscreen',mobile&&win.dataset.gameFullscreen==='true');
   if(mobile)win.style.setProperty('--mobile-game-height',(window.visualViewport?.height||innerHeight)+'px');else win.style.removeProperty('--mobile-game-height');
  }
  const shouldLock=mobile&&!!document.querySelector('.mobile-games-window');
  if(shouldLock&&!locked){previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden'}
  if(!shouldLock&&locked)document.body.style.overflow=previousOverflow;
  locked=shouldLock;
 }
 window.addEventListener('message',event=>{
  if(event.origin!==location.origin||event.data?.type!=='episode-games:mobile-view')return;
  const frame=[...document.querySelectorAll('.episode-games-frame')].find(f=>f.contentWindow===event.source);
  const win=frame?.closest('.floating-games');if(!win||!frame.gamePayload)return;
  win.dataset.gamePlaying=String(event.data.playing===true);win.dataset.gameFullscreen=String(event.data.fullscreen===true);refresh();
 });
 new MutationObserver(refresh).observe(document.body,{childList:true,subtree:true});
 query.addEventListener('change',refresh);window.addEventListener('resize',refresh);window.visualViewport?.addEventListener('resize',refresh);
 window.addEventListener('keydown',event=>{if(event.key!=='Escape')return;for(const frame of document.querySelectorAll('.mobile-games-fullscreen iframe'))frame.contentWindow?.postMessage({type:'episode-games:mobile-exit'},location.origin)});
 refresh();
})();
