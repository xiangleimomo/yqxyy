/* Three balanced levels. Small boards are waves, never extra paid games. */
(function(root){
 'use strict';
 const capacity=id=>id==='G11'?3:id==='G05'?5:['G02','G03','G06','G20'].includes(id)?6:4;
 function plan(pool,extra=[],id='G07'){
  const seen=new Set(),all=[...pool,...extra].filter(w=>w&&w.en&&w.zh&&!seen.has(w.en.toLowerCase())&&seen.add(w.en.toLowerCase()));
  const count=Math.min(3,all.length),levels=[];let offset=0;
  for(let i=0;i<count;i++){
   const size=Math.floor(all.length/count)+(i<all.length%count?1:0),review=all.slice(offset,offset+size);offset+=size;
   const playable=review.filter(w=>/^[a-z]{2,16}$/i.test(w.en)),waves=[];
   for(let j=0;j<playable.length;j+=capacity(id)){
    const batch=playable.slice(j,j+capacity(id)),min=id==='G07'?4:id==='G05'?3:id==='G28'?2:1;
    // Padding is explicitly revision from this lesson, not new or sample vocabulary.
    for(const w of [...playable,...pool]){if(batch.length>=min)break;if(!batch.some(p=>p.en.toLowerCase()===w.en.toLowerCase()))batch.push(w)}
    waves.push(batch);
   }
   levels.push({review,waves});
  }
  return levels;
 }
 const api={plan,capacity};root.ArcadeCampaign=api;
 if(typeof module!=='undefined'){module.exports=api;return}
 const launch=play,complete=finish,start=Arcade.start,baseShell=shell;
 let active=null;
 api.extra=[];
 api.current=()=>active;
 shell=function(id,title,content,help){
  baseShell(id,title,content,help);
  if(!active||active.id!==id)return;
  const level=active.levels[active.index],banner=document.createElement('p');banner.className='campaign-progress';
  banner.textContent=`第 ${active.index+1}/${active.levels.length} 关 · 本关 ${level.review.length} 个词条 · 小盘 ${Math.min(active.wave+1,level.waves.length)}/${level.waves.length} · 本局 ${active.total} 个游戏词条 · 关内继续不扣积分`;
  document.querySelector('.gamebar').after(banner);
 };
 Arcade.start=function(...args){
  const e=start(...args);if(active){e.level=active.index+1;e.stageLimit=e.level}
  else e.stageLimit=3;
  let cursor=0;e.nextWord=()=>e.target=e.pool[(++cursor)%e.pool.length];
  return e;
 };
 function nextWave(){
  const c=active,level=c.levels[c.index];
  if(c.wave>=level.waves.length){finishLevel();return}
  const saved=words;words=level.waves[c.wave];
  try{launch(c.id)}finally{words=saved}
 }
 function checkpoint(title,description,label,callback){
  stopRound();beginRound(active.id);round.done=true;
  shell(active.id,games.find(g=>g[0]===active.id)[1],`<div class="campaign-checkpoint"><h2>${esc(title)}</h2><p>${esc(description)}</p><button class="primary" id="campaign-next">${esc(label)}</button></div>`,'最多 3 关。每关分小盘轮换词汇；关内继续免费，重新开始整局消耗 2 积分。');
  on(document.querySelector('#campaign-next'),'click',callback);
 }
 function finishLevel(){
  const c=active;
  if(c.index+1<c.levels.length){
   checkpoint('本关完成！','下一关继续游戏，不扣积分。','进入下一关',()=>{c.index++;c.wave=0;nextWave()});
  }else{
   round.done=false;round.start=c.start;active=null;
   complete(c.id,c.score,`${c.levels.length} 关完成 · 游戏通关！`);
  }
 }

 play=function(id){
  const levels=plan(ArcadeRules.normalize(words),[],id);if(!levels.length)return;
  active={id,levels,index:0,wave:0,score:0,start:performance.now(),covered:new Set(),total:levels.reduce((n,l)=>n+l.review.length,0)};
  nextWave();
 };
 finish=function(id,score,message,win=true){
  if(!active||active.id!==id){complete(id,score,message);return}
  if(!round||round.done)return;
  const c=active;c.score+=score;
  if(!win){round.start=c.start;active=null;complete(id,c.score,message);return}
  // Cancel the native round before any continuation, including delayed cascades.
  round.done=true;round.jobs.forEach(clearTimeout);cancelAnimationFrame(round.frame);c.wave++;
  checkpoint('小盘完成！',c.wave<c.levels[c.index].waves.length?'接下来轮换本关剩余词汇，不扣积分。':'本关小盘已完成。',c.wave<c.levels[c.index].waves.length?'继续本关':'完成本关',nextWave);
 };
})(globalThis);
