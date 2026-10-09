'use strict';
// Isolated iframe: lesson-owned words and an allowlist of exactly three games.
if(parent===window){
 stopRound();const blocked=()=>{stopRound();app.innerHTML='<section class="panel"><h2>请从对应课程的 Games 进入游戏</h2><p>完成本集拼写挑战的 50% 后，每局消耗 2 积分。</p><a href="../index.html">返回英语学习</a></section>'};play=()=>{};hall=blocked;wordPage=blocked;scorePage=blocked;blocked();
}else if(new URLSearchParams(location.search).get('embedded')==='1'){
 document.body.classList.add('episode-embedded');
 stopRound();app.innerHTML='<p class="panel">正在加载本集词汇与游戏…</p>';
 let selected=[],lessonTitle='',scoreKey='',points=0,unlocked=false,admin=false,pending=null,initialized=false;const originalPlay=play;
 function buttons(){app.querySelectorAll('button[onclick*="play("]').forEach(button=>{if(!button.dataset.baseLabel)button.dataset.baseLabel=button.textContent;const text=admin?`${button.dataset.baseLabel} · 管理员免费`:unlocked?`${button.dataset.baseLabel} · 2 积分`:'🔒 完成拼写后解锁 · 2 积分';if(button.textContent!==text)button.textContent=text;const disabled=!!pending||!unlocked||(!admin&&points<2);if(button.disabled!==disabled)button.disabled=disabled})}
 function notice(message=''){let node=app.querySelector('#game-wallet');if(!node){node=document.createElement('p');node.id='game-wallet';node.className='panel game-wallet';node.setAttribute('role','status');app.prepend(node)}node.textContent=message||(admin?'🛠 管理员调试 · 全部游戏免解锁、免积分':unlocked?`可用积分：${points} · 每局 2 积分${points<2?' · 积分不足，请先完成拼写挑战赚取积分':''}`:'🎮 这 3 款游戏等你来挑战！完成本集拼写挑战的 50% 即可解锁，每局 2 积分。');buttons()}
 hall=function(){stopRound();document.body.dataset.view='hall';app.innerHTML=`<section class="episode-game-lobby"><h2>${esc(lessonTitle)}</h2><p class="muted">本集 ${words.length} 个单词 · ${admin?'管理员 · 全部 27 款游戏':'本次随机 3 款游戏'}</p><div class="grid">${selected.map(id=>{const g=games.find(g=>g[0]===id);return `<article class="card"><div class="art"><img src="assets/previews/${id}.png" alt="${esc(g[1])}" width="900" height="600"></div><div class="card-body"><h3>${esc(g[1])}</h3><p>${esc(g[2])}</p><button class="primary" onclick="play('${id}')">开始游戏 ↗</button></div></article>`}).join('')}</div></section>`};
 const lobby=hall;hall=function(){if(pending)return;lobby();notice()};
 play=function(id){if(!selected.includes(id)||pending)return;if(!unlocked){notice('请先完成本集拼写挑战的 50%。');return}if(!admin&&points<2){notice('积分不足，开始一局需要 2 积分。请先完成拼写挑战赚取积分。');return}pending={id,requestId:crypto.randomUUID()};notice('正在确认积分，请稍候…');parent.postMessage({type:'episode-games:play',...pending},location.origin)};
 wordPage=()=>{};scorePage=()=>{};
 saveScore=function(id,score){if(!selected.includes(id)||!scoreKey)return;try{const s=JSON.parse(localStorage.getItem(scoreKey)||'[]');s.unshift({id,score,time:Date.now()});localStorage.setItem(scoreKey,JSON.stringify(s.slice(0,100)))}catch{/* Storage can be unavailable; gameplay still works. */}};
 window.addEventListener('message',event=>{
  if(event.source!==parent||event.origin!==location.origin)return;
  if(event.data?.type==='episode-games:wallet'){points=Math.max(0,Number(event.data.points)||0);unlocked=event.data.unlocked===true;admin=event.data.admin===true;notice();return}
  if(event.data?.type==='episode-games:play-result'){
   const d=event.data;if(!pending||d.requestId!==pending.requestId||d.id!==pending.id)return;pending=null;
   if(d.ok){points=d.points;originalPlay(d.id);notice(d.admin?'🛠 管理员调试 · 本局不消耗积分':`本局已消耗 2 积分 · 剩余 ${points} 积分`)}else notice(d.message||'无法开始游戏。');buttons();return;
  }
  if(event.data?.type!=='episode-games:init'||initialized)return;
  const d=event.data;if(!Array.isArray(d.words)||!Array.isArray(d.ids)||d.ids.length!==(d.admin===true?27:3)||new Set(d.ids).size!==d.ids.length||d.ids.some(id=>!games.some(g=>g[0]===id))||typeof d.episodeKey!=='string')return;
  const pool=ArcadeRules.normalize(d.words);if(pool.length<4||pool.length!==d.words.length)return;
  initialized=true;admin=d.admin===true;stopRound();words=pool;selected=[...d.ids];lessonTitle=String(d.title||'本集游戏');scoreKey='episodeArcadeScores:'+d.episodeKey;hall();
 });
 const report=()=>parent.postMessage({type:'episode-games:height',height:Math.ceil(document.documentElement.getBoundingClientRect().height)},location.origin);
 new ResizeObserver(report).observe(document.body);window.addEventListener('resize',report);
 new MutationObserver(buttons).observe(app,{childList:true,subtree:true});
 parent.postMessage({type:'episode-games:ready'},location.origin);
}
document.documentElement.classList.remove('episode-loading');
