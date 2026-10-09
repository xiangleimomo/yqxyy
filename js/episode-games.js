'use strict';
// The lesson vocabulary is the only source. Never fall back to arcade sample words.
const EpisodeGames=(()=>{
 const ids=Array.from({length:27},(_,i)=>'G'+String(i+2).padStart(2,'0'));
 const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 // Words is authoritative for proper names; do not capitalize ordinary vocabulary.
 function pack(vocab){const words=[],excluded=[],seen=new Set();for(const w of vocab||[]){const raw=String(w.word||'').trim(),zh=String(w.meaningZh||w.meaning||'').trim();if(!/^[a-z]{2,16}$/i.test(raw)||!zh){excluded.push(raw||'未命名单词');continue}const key=raw.toLowerCase();if(seen.has(key))continue;seen.add(key);const preserveCase=w.preserveCase===true||/proper|专有/i.test(w.partOfSpeech||'')||(/^[A-Z][a-z]+$/.test(raw)&&!['Good','Thank','Internet'].includes(raw))||/^(TV|CD|DVD|BC|AD|AM|PM|USA|UK|US|UN|EU|NASA|BBC|DNA|RNA|USB|AI|IT|ABCs)$/.test(raw);words.push({en:preserveCase?raw:key,zh,preserveCase})}return {words,excluded}}
 function choose(previous=[]){const pool=ids.filter(id=>!previous.includes(id));for(let i=pool.length-1;i>0;i--){let j;do{const n=new Uint32Array(1);crypto.getRandomValues(n);const limit=Math.floor(4294967296/(i+1))*(i+1);if(n[0]<limit){j=n[0]%(i+1);break}}while(true);[pool[i],pool[j]]=[pool[j],pool[i]]}return pool.slice(0,3)}
 function status(d,records=typeof App==='undefined'?{}:App.storage('progress')||{}){
  const words=[...new Set((d.vocab||[]).map(w=>String(w.word||'').trim().toLowerCase()).filter(Boolean))],correct=records[`${d.seriesId}:${d.episodeId}`]?.typingCorrect||{};
  const done=words.filter(w=>correct[w]===true).length,required=Math.ceil(words.length/2);
  return {done,total:words.length,required,unlocked:words.length>0&&done>=required};
 }
 function panel(d){const p=pack(d.vocab);return `<section class="episode-games"><div class="episode-games-head"><div><h2>Games · 本集词汇游戏</h2><p>Episode ${escape(d.episodeId)} · 本集 ${p.words.length} 个游戏单词 · 每次随机出现 3 款</p></div></div><p class="games-access" role="status"></p>${p.excluded.length?`<details class="games-exclusions"><summary>${p.excluded.length} 个词条暂不适用于游戏</summary><p>${p.excluded.map(escape).join('、')}</p><p>游戏支持 2–16 个英文字母；全部 Words 词条仍计入拼写挑战解锁进度。</p></details>`:''}<p class="games-practice-note">本集 Typing Practice 拼写挑战答对至少 50% 的不同单词后解锁。每开始或重新开始一局消耗 2 积分，暂停和继续不扣分。</p><div class="games-body"></div></section>`}
 function refresh(section){
  const d=section.gameLesson;if(!d||!section.isConnected)return;const s=status(d),points=App.getPoints(),body=section.querySelector('.games-body');
  section.querySelector('.games-access').textContent=`拼写挑战：${s.done}/${s.total} 个（需 ${s.required} 个） · ${s.unlocked?'已解锁':'尚未解锁'} · 可用积分：${points} · 每局 2 积分`;
  if(!s.unlocked){body.innerHTML='<div class="empty games-locked"><h3>🔒 请先完成本集拼写挑战的 50%</h3><p>前往 Words → Typing Practice，正确拼写本集单词。跳过及重复拼写同一个词不会增加解锁进度。</p></div>';return}
  const p=pack(d.vocab);if(p.words.length<4){body.innerHTML='<div class="empty">本集不足 4 个可用游戏单词，暂不能开始游戏；不会使用其他集或示例词补齐。</div>';return}
  let frame=body.querySelector('iframe');if(!frame){frame=document.createElement('iframe');frame.className='episode-games-frame';frame.title=`Episode ${d.episodeId} 词汇游戏`;frame.src='arcade/index.html?embedded=1&v=20261009-3';frame.allow='fullscreen';frame.gameLesson=d;frame.requests=new Map();frame.gamePayload={type:'episode-games:init',episodeKey:`${d.seriesId}:${d.episodeId}`,title:`Episode ${d.episodeId} · ${d.ep.title}`,words:p.words,ids:choose()};frame.addEventListener('load',()=>sendInit(frame));body.replaceChildren(frame)}
  frame.contentWindow?.postMessage({type:'episode-games:wallet',points,unlocked:s.unlocked},location.origin);
 }
 function sendInit(frame){if(frame.isConnected){frame.contentWindow?.postMessage(frame.gamePayload,location.origin);refresh(frame.closest('.episode-games'))}}
 function refreshAll(){document.querySelectorAll('.episode-games[data-bound]').forEach(refresh)}
 function bind(root,d){for(const section of root.querySelectorAll('.episode-games:not([data-bound])')){section.dataset.bound='1';section.gameLesson=d;refresh(section)}}
 async function charge(d,id,requestId,active=()=>true){
  const scope=window.SFCloud?.storageKey('points')||'sf_points';
  const debit=()=>{
   if(!active()||scope!==(window.SFCloud?.storageKey('points')||'sf_points'))return {ok:false,message:'学习窗口或账户已变更，请重新打开游戏。'};
   if(!status(d).unlocked)return {ok:false,message:'请先在本集 Typing Practice 中正确拼写至少 50% 的不同单词。'};
   const before=App.storage('progress')||{},key=`${d.seriesId}:${d.episodeId}`;
   if(before[key]?.pointSpends?.[requestId])return {ok:false,message:'这次开始请求已经处理，请重新点击。'};
   if(App.getPoints()<2)return {ok:false,message:'积分不足，开始一局需要 2 积分。请先完成拼写挑战赚取积分。'};
   const progress=JSON.parse(JSON.stringify(before)),entry=progress[key];entry.pointSpends={...(entry.pointSpends||{}),[requestId]:{amount:2,gameId:id,at:new Date().toISOString()}};
   try{App.storage('progress',progress);App.addPoints(-2)}catch(error){App.storage('progress',before);return {ok:false,message:'无法保存积分消费记录，本局未开始。'}}
   return {ok:true,points:App.getPoints()};
  };
  // HTTPS browsers serialize purchases across all tabs of this account.
  return navigator.locks?.request?navigator.locks.request('storyfox-game-purchase:'+scope,debit):debit();
 }
 window.addEventListener('message',async event=>{
  if(event.origin!==location.origin)return;const frame=[...document.querySelectorAll('.episode-games-frame')].find(f=>f.contentWindow===event.source);if(!frame?.gamePayload)return;const msg=event.data;
  if(msg?.type==='episode-games:ready'){sendInit(frame);return}
  if(msg?.type==='episode-games:height'&&Number.isFinite(msg.height)){frame.style.height=Math.min(2400,Math.max(440,msg.height))+'px';return}
  if(msg?.type!=='episode-games:play'||!frame.gamePayload.ids.includes(msg.id)||typeof msg.requestId!=='string'||msg.requestId.length>100)return;
  if(!frame.requests.has(msg.requestId))frame.requests.set(msg.requestId,charge(frame.gameLesson,msg.id,msg.requestId,()=>frame.isConnected));
  try{const result=await frame.requests.get(msg.requestId);if(frame.isConnected)frame.contentWindow.postMessage({type:'episode-games:play-result',requestId:msg.requestId,id:msg.id,...result},location.origin)}catch{if(frame.isConnected)frame.contentWindow.postMessage({type:'episode-games:play-result',requestId:msg.requestId,id:msg.id,ok:false,message:'暂时无法开始游戏，请稍后重试。'},location.origin)}
 });
 window.addEventListener('storage',refreshAll);
 return {panel,bind,pack,choose,status,refreshAll,charge};
})();
