/* Shared by Words, dictation, phrases and reading. No autoplay or microphone access. */
(()=>{
 'use strict';
 let serial=0,player=null,utterance=null,timer=0,hideTimer=0,voices=[];
 const synth=window.speechSynthesis;
 const warm=()=>{try{voices=synth?.getVoices()||[]}catch{voices=[]}};
 warm();synth?.addEventListener?.('voiceschanged',warm);
 function status(text){
  clearTimeout(hideTimer);let node=document.getElementById('pronunciation-status');
  if(!node){node=document.createElement('div');node.id='pronunciation-status';node.setAttribute('role','status');node.setAttribute('aria-live','polite');document.body.append(node)}
  node.textContent=text;node.hidden=!text;
  if(text)hideTimer=setTimeout(()=>{node.hidden=true},8000);
 }
 function stop(){
  serial++;clearTimeout(timer);
  if(player){player.onplaying=player.onended=player.onerror=null;player.pause();player.removeAttribute('src');player.load();player=null}
  try{synth?.cancel()}catch{/* Missing / unavailable system voice. */}
  utterance=null;
  clearTimeout(hideTimer);const node=document.getElementById('pronunciation-status');if(node)node.hidden=true;
 }
 function speak(text){
  const value=String(text||'').trim();if(!value)return false;
  stop();const token=serial;let fallbackStarted=false;
  const failed=()=>{if(token===serial){clearTimeout(timer);status('暂时无法播放，请检查网络和设备声音，再点击喇叭重试。')}};
  function system(){
   if(token!==serial||fallbackStarted)return;fallbackStarted=true;clearTimeout(timer);
   if(player){player.pause();player.onerror=player.onended=player.onplaying=null}
   if(!synth||!window.SpeechSynthesisUtterance){failed();return}
   try{
    warm();const u=new SpeechSynthesisUtterance(value);utterance=u;
    const voice=voices.find(v=>/^en-US$/i.test(v.lang))||voices.find(v=>/^en\b/i.test(v.lang));
    if(voice)u.voice=voice;u.lang=voice?.lang||'en-US';u.rate=.9;u.pitch=1;u.volume=1;
    u.onstart=()=>{if(token===serial){clearTimeout(timer);status('🔊 正在朗读：'+value)}};
    u.onend=()=>{if(token===serial){clearTimeout(timer);utterance=null;status('')}};
    u.onerror=e=>{if(token===serial&&!['canceled','interrupted'].includes(e.error))failed()};
    if(synth.paused)synth.resume();
    timer=setTimeout(failed,8000);
    // Stay inside the tap gesture whenever possible; never defer speak() with setTimeout.
    synth.speak(u);
   }catch{failed()}
  }
  status('🔊 正在准备发音…');
  const shortEnglish=/^[a-zA-Z][a-zA-Z\s.'’,-]*$/.test(value)&&value.length<=120;
  if(!shortEnglish||navigator.onLine===false||!window.Audio){system();return true}
  try{
   const audio=new Audio();player=audio;audio.preload='auto';audio.volume=1;
   // Send only the requested English text, never account or lesson identifiers.
   audio.src='https://dict.youdao.com/dictvoice?audio='+encodeURIComponent(value)+'&type=2';
   audio.onplaying=()=>{if(token===serial){clearTimeout(timer);status('🔊 正在朗读：'+value)}};
   audio.onended=()=>{if(token===serial){clearTimeout(timer);status('')}};
   audio.onerror=system;timer=setTimeout(system,8000);
   const result=audio.play();result?.catch(system);
  }catch{system()}
  return true;
 }
 window.WordPronunciation={speak,stop};
})();
