/* Mobile presentation only. Canvas coordinates, game state and payment stay unchanged. */
(()=>{
 'use strict';
 const query=matchMedia('(max-width:640px), (pointer:coarse) and (max-width:1024px)');
 let mobile=false,fallback=false,scheduled=0,lastLayout=null,lastCanvas=null,lastResult=null;
 const screenObserver=new ResizeObserver(()=>schedule());
 function send(){if(parent!==window)parent.postMessage({type:'episode-games:mobile-view',playing:mobile&&!!app.querySelector('.layout'),fullscreen:mobile&&fallback},location.origin)}
 function fit(){
  scheduled=0;if(!mobile)return;
  const canvas=app.querySelector('canvas'),screen=canvas?.parentElement;
  if(!canvas||!screen||!document.body.classList.contains('mobile-canvas'))return;
  const width=screen.clientWidth,height=screen.clientHeight,scale=Math.min(width/canvas.width,height/canvas.height);
  if(scale<=0)return;
  const w=Math.floor(canvas.width*scale),h=Math.floor(canvas.height*scale);
  if(canvas.style.width!==w+'px')canvas.style.width=w+'px';
  if(canvas.style.height!==h+'px')canvas.style.height=h+'px';
 }
 function schedule(){if(!scheduled)scheduled=requestAnimationFrame(fit)}
 function label(){const b=app.querySelector('#mobile-game-fullscreen');if(b){const full=!!document.fullscreenElement||fallback;b.textContent=full?'退出全屏':'⛶ 全屏';b.setAttribute('aria-pressed',String(full))}}
 async function toggle(){
  if(!mobile)return;
  if(document.fullscreenElement){try{await document.exitFullscreen()}catch{/* Keep the browser's own exit control available. */}return}
  if(fallback){fallback=false;label();send();schedule();return}
  // Invoke inside the tap gesture, not through a postMessage (which loses activation).
  if(document.documentElement.requestFullscreen){try{await document.documentElement.requestFullscreen();label();schedule();return}catch{/* iOS / embedded browser: use the full-page layout instead. */}}
  fallback=true;label();send();schedule();
 }
 function refresh(){
  const was=mobile;mobile=query.matches;document.body.classList.toggle('mobile-game',mobile);
  const layout=app.querySelector('.layout'),canvas=app.querySelector('canvas'),result=app.querySelector('.result-banner');
  const playing=mobile&&!!layout;
  document.body.classList.toggle('mobile-playing',playing);
  document.body.classList.toggle('mobile-canvas',playing&&!!canvas&&!result);
  if(!mobile){fallback=false;app.querySelector('#mobile-game-fullscreen')?.remove();if(canvas){canvas.style.removeProperty('width');canvas.style.removeProperty('height')}}
  else if(playing&&!app.querySelector('#mobile-game-fullscreen')){
   const button=document.createElement('button');button.id='mobile-game-fullscreen';button.type='button';button.addEventListener('click',toggle);app.querySelector('.round-toolbar')?.append(button);
  }
  if(!playing)fallback=false;
  if(canvas!==lastCanvas){screenObserver.disconnect();if(canvas)screenObserver.observe(canvas.parentElement)}
  lastLayout=layout;lastCanvas=canvas;lastResult=result;label();send();schedule();
  if(was&&!mobile&&document.fullscreenElement)document.exitFullscreen().catch(()=>{});
 }
 new MutationObserver(()=>{if(lastLayout!==app.querySelector('.layout')||lastCanvas!==app.querySelector('canvas')||lastResult!==app.querySelector('.result-banner'))refresh()}).observe(app,{childList:true,subtree:true});
 query.addEventListener('change',refresh);
 window.addEventListener('resize',schedule);window.visualViewport?.addEventListener('resize',schedule);
 document.addEventListener('fullscreenchange',()=>{label();send();schedule()});
 window.addEventListener('message',event=>{if(event.source===parent&&event.origin===location.origin&&event.data?.type==='episode-games:mobile-exit'){fallback=false;label();send();schedule()}});
 refresh();
})();
