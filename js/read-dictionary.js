/* Shared dictionary: observe native selection without cancelling browser events. */
(() => {
  const prefix='sf_read_dictionary_v1_';
  const read=k=>{try{return JSON.parse(localStorage.getItem(prefix+k));}catch{return null;}};
  const write=(k,v)=>{try{localStorage.setItem(prefix+k,JSON.stringify(v));}catch{/* Private mode or full storage. */}};
  const escape=v=>String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let enabled=read('enabled')!==false, version=0, timer, controller, audio, reader;
  const card=document.createElement('aside');
  card.className='read-dictionary-card'; card.hidden=true;
  card.setAttribute('role','dialog'); card.setAttribute('aria-label','划词词典');
  document.body.appendChild(card);
  function close(){clearTimeout(timer);version++;controller?.abort();audio?.pause();card.hidden=true;}
  window.ReadDictionary={controls:()=>`<div class="read-dictionary-tools"><label><input type="checkbox" data-dictionary-toggle ${enabled?'checked':''}> 内置划词词典</label><span>双击英文单词或划选句子查中文</span></div>`};
  document.addEventListener('change',e=>{
    if(!e.target.matches('[data-dictionary-toggle]'))return;
    enabled=e.target.checked;write('enabled',enabled);close();
    document.querySelectorAll('[data-dictionary-toggle]').forEach(input=>input.checked=enabled);
  });
  document.addEventListener('mousedown',e=>{if(!card.contains(e.target))close();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
  window.addEventListener('hashchange',close);window.addEventListener('resize',close);
  document.addEventListener('scroll',e=>{if(!card.contains(e.target))close();},true);
  new MutationObserver(()=>{if(!card.hidden&&!reader?.isConnected)close();}).observe(document.body,{childList:true,subtree:true});
  function selected(event){
    if(!enabled)return;
    const s=window.getSelection();if(!s?.rangeCount||s.isCollapsed)return;
    const range=s.getRangeAt(0), node=range.startContainer;
    const host=(node.nodeType===1?node:node.parentElement)?.closest('[data-dictionary-reader]');
    if(!host||!host.contains(range.endContainer))return;
    if(event&&['mouseup','dblclick'].includes(event.type)&&!host.contains(event.target))return;
    const text=s.toString().trim().replace(/\s+/g,' ');if(!/[a-z]/i.test(text))return;
    const rect=range.getBoundingClientRect();clearTimeout(timer);
    timer=setTimeout(()=>lookup(text,rect,host),180);
  }
  document.addEventListener('mouseup',selected);document.addEventListener('dblclick',selected);
  document.addEventListener('keyup',e=>{if(e.shiftKey&&e.key.startsWith('Arrow'))selected(e);});
  function position(rect){
    card.style.left=Math.max(8,Math.min(rect.left,innerWidth-card.offsetWidth-8))+'px';
    card.style.top=Math.max(8,Math.min(rect.bottom+8,innerHeight-card.offsetHeight-8))+'px';
  }
  async function request(url,signal,limit=12000){
    const child=new AbortController(),abort=()=>child.abort();
    signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();
    const timeout=setTimeout(abort,limit);
    try{const r=await fetch(url,{signal:child.signal});if(!r.ok)throw Error('Request failed');return await r.json();}
    finally{clearTimeout(timeout);signal.removeEventListener('abort',abort);}
  }
  async function lookup(text,rect,host){
    close();reader=host;const id=version;
    const word=/^[a-z]+(?:['’\-][a-z]+)*$/i.test(text),key=word?text.toLowerCase():text;
    const header=`<div class="read-dictionary-head"><strong>${escape(text)}</strong><button type="button" data-close aria-label="关闭词典">×</button></div>`;
    card.innerHTML=header+'<div role="status">正在查询…</div>';card.hidden=false;position(rect);
    card.querySelector('[data-close]').onclick=close;
    if(new TextEncoder().encode(text).length>500){card.querySelector('[role="status"]').textContent='选中文字过长，请选择较短的片段（最多 500 字节）。';return;}
    const current=new AbortController();controller=current;
    let result=read('query_'+key);
    if(!result||Date.now()-result.at>30*86400000)result={at:Date.now(),phonetic:'',audio:'',meanings:[],translated:''};
    let translationPending=!result.translated, dictionaryPending=word&&!result.meanings.length, saved=false;
    function update(){
      if(id!==version||!host.isConnected)return;
      render();
      // Cache the successful Chinese result even when the English service fails.
      // Missing English data can be retried separately on the next lookup.
      if(result.translated){
          let keys=read('keys')||[];keys=keys.filter(k=>k!==key);keys.push(key);
          while(keys.length>100){try{localStorage.removeItem(prefix+'query_'+keys.shift());}catch{}}
          write('query_'+key,result);write('keys',keys);
      }
    }
    function render(){
    if(id!==version||!host.isConnected)return;
    card.innerHTML=header+`<div class="read-dictionary-body" aria-live="polite">${result.phonetic?`<p>${escape(result.phonetic)}</p>`:''}<p>${escape(result.translated||(translationPending?'中文翻译查询中…':'中文翻译暂不可用，请稍后重试。'))}</p>${word?result.meanings.map(m=>`<p><b>${escape(m.partOfSpeech)}</b> ${escape(m.definitions?.[0]?.definition)}</p>`).join('')||`<p>${dictionaryPending?'音标和英文释义加载中…':'英文词典暂不可用，可继续使用中文翻译和朗读。'}</p>`:''}</div><div class="read-dictionary-actions"><button type="button" data-speak>🔊 发音</button>${word?`<button type="button" data-save ${saved||!result.translated&&!result.meanings.length?'disabled':''}>${saved?'已加入 ✓':'☆ 加入生词本'}</button>`:''}<button type="button" data-retry>重试</button></div>`;
    position(rect);card.querySelector('[data-close]').onclick=close;
    card.querySelector('[data-retry]').onclick=()=>{write('query_'+key,null);lookup(text,rect,host);};
    card.querySelector('[data-speak]').onclick=()=>{
      const fallback=()=>App.speakText(text);if(!result.audio)return fallback();
      const url=result.audio.startsWith('//')?'https:'+result.audio:result.audio;
      if(!/^https:\/\//i.test(url))return fallback();
      audio?.pause();audio=new Audio(url);audio.onerror=fallback;audio.play().catch(fallback);
    };
    const save=card.querySelector('[data-save]');if(save)save.onclick=()=>{
      try{App.saveWord({type:'word',word:key,meaning:result.translated||result.meanings[0]?.definitions?.[0]?.definition||'',seriesId:host.dataset.series,episodeId:Number(host.dataset.episode)});saved=true;save.textContent='已加入 ✓';save.disabled=true;}
      catch{save.textContent='保存失败，请重试';}
    };
    }
    render();
    const tasks=[];
    if(translationPending)tasks.push(request('https://api.mymemory.translated.net/get?q='+encodeURIComponent(text)+'&langpair=en%7Czh-CN',current.signal)
      .then(data=>{if(Number(data.responseStatus)===200)result.translated=data.responseData?.translatedText||'';})
      .catch(()=>{}).finally(()=>{translationPending=false;update();}));
    if(dictionaryPending)tasks.push(request('https://api.dictionaryapi.dev/api/v2/entries/en/'+encodeURIComponent(key),current.signal,5000)
      .then(data=>{
        const entries=Array.isArray(data)?data:[],phonetics=entries.flatMap(e=>e.phonetics||[]);
        result.phonetic=entries[0]?.phonetic||phonetics.find(p=>p.text)?.text||'';
        result.audio=phonetics.find(p=>p.audio)?.audio||'';
        result.meanings=entries.flatMap(e=>e.meanings||[]).slice(0,4);
      }).catch(()=>{}).finally(()=>{dictionaryPending=false;update();}));
    await Promise.allSettled(tasks);
  }
})();
