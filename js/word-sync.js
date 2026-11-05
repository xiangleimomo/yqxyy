/* Shared karaoke-style English word highlighting for Watch and Listen and Read.
 * Official VTT provides sentence boundaries; optional .words.json contains
 * verified per-word speech timestamps. Without it, the word motion is estimated.
 */
(function(){
  'use strict';
  const SPACE=/^\s+$/;
  const TOKEN=/\s+|\S+/gu;
  const normalized=value=>String(value||'').toLowerCase().normalize('NFKC')
    .replace(/[^\p{L}\p{N}]+/gu,'');
  const visibleWords=text=>(String(text||'').match(/\S+/gu)||[]);
  const parts=text=>(String(text||'').match(TOKEN)||[]);
  function estimated(words,startMs,endMs){
    const duration=Math.max(1,endMs-startMs);
    const weights=words.map(word=>{
      const letters=(word.match(/[\p{L}\p{N}]/gu)||[]).length;
      return Math.max(.75,Math.min(3.3,Math.sqrt(Math.max(1,letters))))+
        (/[.?!,;:]$/.test(word)?.18:0);
    });
    const total=weights.reduce((sum,weight)=>sum+weight,0);
    let cursor=startMs;
    return words.map((word,index)=>{
      const next=index===words.length-1?endMs:Math.min(endMs,Math.round(cursor+duration*weights[index]/total));
      const entry={text:word,startMs:cursor,endMs:Math.max(cursor+1,next),source:'estimated'};
      cursor=next;
      return entry;
    });
  }
  function applyExact(base,provided,cue){
    if(!Array.isArray(provided)||provided.length!==base.length) return base;
    let prev=cue.startMs;
    const result=[];
    for(let i=0;i<provided.length;i++){
      const item=provided[i];
      const start=Number(item.startMs),end=Number(item.endMs);
      if(normalized(item.text)!==normalized(base[i].text)||
        !Number.isFinite(start)||!Number.isFinite(end)||
        start<cue.startMs-150||end>cue.endMs+150||
        end<=start||start<prev-150) return base;
      const safeStart=Math.max(cue.startMs,Math.min(cue.endMs,start));
      const safeEnd=Math.max(safeStart+1,Math.min(cue.endMs,end));
      result.push({text:base[i].text,startMs:safeStart,endMs:safeEnd,source:item.source==='estimated'?'estimated':'speech'});
      prev=safeStart;
    }
    return result;
  }
  function prepare(cues,track){
    const validTrack=track&&Array.isArray(track.cues)&&track.cues.length===cues.length&&
      Number(track.cueCount)===cues.length;
    return cues.map((cue,index)=>{
      const tokens=visibleWords(cue.text);
      const fallback=estimated(tokens,cue.startMs,cue.endMs);
      const words=validTrack?applyExact(fallback,track.cues[index]?.words,cue):fallback;
      return {cue,parts:parts(cue.text),words,verified:words.length>0&&words.every(word=>word.source==='speech')};
    });
  }
  function mediaPath(value){
    if(!value)return '';
    try{
      const parsed=new URL(String(value),location.href);
      return parsed.pathname.replace(/^\/+/, '');
    }catch{return String(value).split(/[?#]/)[0].replace(/^\/+/, '');}
  }
  async function load(d,cues){
    let track=null;
    const number=Number(d.ep?.episodeId??d.episodeId),id=String(d.seriesId||'');
    if(/^[a-z0-9-]+$/.test(id)&&Number.isInteger(number)&&number>0&&number<=9999){
      const url='data/'+id+'/subtitles/'+String(number).padStart(3,'0')+'.words.json';
      try{
        const response=await fetch(url);
        if(response.ok){
          const candidate=await response.json();
          const video=d.ep?.video||{};
          const currentPaths=['hlsUrl','backupHlsUrl','hls720Url','originalHlsUrl'].map(key=>mediaPath(video[key])).filter(Boolean);
          const identityOk=(!candidate.seriesId||candidate.seriesId===id)&&
            (!Number.isFinite(Number(candidate.episodeId))||Number(candidate.episodeId)===number)&&
            (!candidate.sourceContentId||!d.ep?.sourceContentId||candidate.sourceContentId===d.ep.sourceContentId);
          const mediaOk=!candidate.mediaPath||!currentPaths.length||currentPaths.includes(mediaPath(candidate.mediaPath));
          if(identityOk&&mediaOk)track=candidate;
        }
      }catch{}
    }
    return prepare(cues,track);
  }
  function render(prepared){
    const fragment=document.createDocumentFragment(),nodes=[];
    for(const token of prepared.parts){
      if(SPACE.test(token)){
        fragment.appendChild(document.createTextNode(token));
      }else{
        const el=document.createElement('span');
        el.className='sf-karaoke-word';
        el.textContent=token;
        nodes.push(el);
        fragment.appendChild(el);
      }
    }
    return {fragment,nodes,words:prepared.words,current:-1};
  }
  function paint(view,timeMs,enabled=true){
    if(!view||!view.nodes.length) return;
    let next=-1;
    if(enabled){
      for(let i=0;i<view.words.length;i++){
        if(timeMs>=view.words[i].startMs) next=i;
        else break;
      }
    }
    if(next===view.current) return;
    if(view.current>=0)view.nodes[view.current]?.classList.remove('is-karaoke-active');
    if(next>=0)view.nodes[next]?.classList.add('is-karaoke-active');
    view.current=next;
  }
  window.SFWordSync={prepare,load,render,paint,normalized};
})();
