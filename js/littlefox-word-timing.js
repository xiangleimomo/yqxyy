/* Lightweight XML sentence-to-word timing. No ASR; timings are estimates. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  if(root) root.LittleFoxWordTiming=api;
})(typeof globalThis!=='undefined'?globalThis:null,function(){
  'use strict';
  function decodeEntities(s){
    return String(s).replace(/&#(x[0-9a-f]+|[0-9]+);|&(?:amp|lt|gt|quot|apos);/gi,function(m,n){
      if(n){const code=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):parseInt(n,10);return code>0&&code<=0x10ffff?String.fromCodePoint(code):m;}
      return {'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'"}[m.toLowerCase()]||m;
    });
  }
  function textOf(block,tag){
    const m=block.match(new RegExp('<(?:[\\w.-]+:)?'+tag+'\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?'+tag+'>','i'));
    return m?decodeEntities(m[1].replace(/<[^>]*>/g,'')).trim():'';
  }
  function parseXml(xml){
    const result=[];
    const blocks=String(xml).match(/<(?:[\w.-]+:)?Paragraph\b[^>]*>[\s\S]*?<\/(?:[\w.-]+:)?Paragraph>/gi)||[];
    for(const block of blocks){
      const start=Number(textOf(block,'StartMilliseconds')),end=Number(textOf(block,'EndMilliseconds'));
      const text=textOf(block,'Text');
      if(text&&Number.isFinite(start)&&Number.isFinite(end)&&end>start)result.push({start:start/1000,end:end/1000,text});
    }
    return result;
  }
  function estimateWords(cue){
    const words=String(cue.text||'').trim().match(/\S+/g)||[];
    if(!words.length||!(cue.end>cue.start))return [];
    const weights=words.map(w=>Math.max(1,w.replace(/[^\p{L}\p{N}]/gu,'').length));
    const total=weights.reduce((a,b)=>a+b,0),duration=cue.end-cue.start;
    let used=0;
    return words.map((word,i)=>{
      const start=cue.start+duration*used/total;used+=weights[i];
      return {word,start,end:i===words.length-1?cue.end:cue.start+duration*used/total,estimated:true};
    });
  }
  function fromXml(xml){return parseXml(xml).map((cue,i)=>({...cue,index:i+1,words:estimateWords(cue),timingSource:'estimated-character-weight'}));}
  function batch(episodes,xmlByContentId){
    return episodes.map(ep=>{
      const id=ep.sourceContentId,xml=xmlByContentId[id];
      if(!id||typeof xml!=='string')return {episodeId:ep.episodeId,sourceContentId:id,status:'missing-xml'};
      const cues=fromXml(xml);
      return {episodeId:ep.episodeId,sourceContentId:id,status:cues.length?'estimated':'invalid-xml',cues};
    });
  }
  return {parseXml,estimateWords,fromXml,batch};
});
