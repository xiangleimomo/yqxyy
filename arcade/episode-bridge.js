'use strict';
// Isolated iframe: lesson-owned words and an allowlist of exactly three games.
if(new URLSearchParams(location.search).get('embedded')==='1'){
 document.body.classList.add('episode-embedded');
 stopRound();app.innerHTML='<p class="panel">正在加载本集词汇与游戏…</p>';
 let selected=[],lessonTitle='',scoreKey='';const originalPlay=play;
 hall=function(){stopRound();document.body.dataset.view='hall';app.innerHTML=`<section class="episode-game-lobby"><h2>${esc(lessonTitle)}</h2><p class="muted">本集 ${words.length} 个单词 · 本次随机 3 款游戏</p><div class="grid">${selected.map(id=>{const g=games.find(g=>g[0]===id);return `<article class="card"><div class="art"><img src="assets/previews/${id}.png" alt="${esc(g[1])}" width="900" height="600"></div><div class="card-body"><h3>${esc(g[1])}</h3><p>${esc(g[2])}</p><button class="primary" onclick="play('${id}')">开始游戏 ↗</button></div></article>`}).join('')}</div></section>`};
 play=function(id){if(selected.includes(id))originalPlay(id)};
 wordPage=()=>{};scorePage=()=>{};
 saveScore=function(id,score){if(!selected.includes(id)||!scoreKey)return;try{const s=JSON.parse(localStorage.getItem(scoreKey)||'[]');s.unshift({id,score,time:Date.now()});localStorage.setItem(scoreKey,JSON.stringify(s.slice(0,100)))}catch{/* Storage can be unavailable; gameplay still works. */}};
 window.addEventListener('message',event=>{
  if(event.source!==parent||event.origin!==location.origin||event.data?.type!=='episode-games:init')return;
  const d=event.data;if(!Array.isArray(d.words)||!Array.isArray(d.ids)||d.ids.length!==3||new Set(d.ids).size!==3||d.ids.some(id=>!games.some(g=>g[0]===id))||typeof d.episodeKey!=='string')return;
  const pool=ArcadeRules.normalize(d.words);if(pool.length<4||pool.length!==d.words.length)return;
  stopRound();words=pool;selected=[...d.ids];lessonTitle=String(d.title||'本集游戏');scoreKey='episodeArcadeScores:'+d.episodeKey;hall();
 });
 const report=()=>parent.postMessage({type:'episode-games:height',height:Math.ceil(document.documentElement.getBoundingClientRect().height)},location.origin);
 new ResizeObserver(report).observe(document.body);window.addEventListener('resize',report);
 parent.postMessage({type:'episode-games:ready'},location.origin);
}
