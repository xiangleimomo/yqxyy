/* Original algorithms for the vocabulary arcade; no third-party assets. */
(function(root){
  const shuffle=a=>{a=[...a];for(let i=a.length-1;i>0;i--){let j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
  function normalize(a){const seen=new Set();return a.filter(w=>/^[a-z]{2,16}$/i.test(w.en)&&w.zh&&!seen.has(w.en.toLowerCase())&&seen.add(w.en.toLowerCase())).map(w=>({...w,en:w.preserveCase?w.en:w.en.toLowerCase()}))}
  const dirs=[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
  function search(a){const pool=shuffle(normalize(a)).slice(0,8),size=Math.max(10,...pool.map(w=>w.en.length+1)),grid=Array.from({length:size},()=>Array(size).fill('')),entries=[];
    for(const w of pool){const candidates=[];for(let r=0;r<size;r++)for(let c=0;c<size;c++)for(const [dr,dc] of dirs){const cells=Array.from(w.en,(_,i)=>({r:r+i*dr,c:c+i*dc}));if(cells.every((p,i)=>p.r>=0&&p.c>=0&&p.r<size&&p.c<size&&(!grid[p.r][p.c]||grid[p.r][p.c]===w.en[i])))candidates.push(cells)}
      if(!candidates.length)continue;const cells=shuffle(candidates)[0];cells.forEach((p,i)=>grid[p.r][p.c]=w.en[i]);entries.push({...w,cells});}
    grid.forEach(row=>row.forEach((v,i)=>{if(!v)row[i]=String.fromCharCode(97+Math.floor(Math.random()*26))}));return {grid,size,entries};
  }
  function line(a,b){let dr=b.r-a.r,dc=b.c-a.c;if(dr&&dc&&Math.abs(dr)!==Math.abs(dc))return [];let n=Math.max(Math.abs(dr),Math.abs(dc));return Array.from({length:n+1},(_,i)=>({r:a.r+i*Math.sign(dr),c:a.c+i*Math.sign(dc)}))}
  function crossword(a){const pool=normalize(a);let best=null;
    for(let attempt=0;attempt<24;attempt++){const grid=new Map(),entries=[],order=shuffle(pool).sort((a,b)=>b.en.length-a.en.length),key=(r,c)=>r+','+c;
      function valid(w,r,c,dr,dc){if(grid.has(key(r-dr,c-dc))||grid.has(key(r+dr*w.length,c+dc*w.length)))return false;let crossings=0;
        for(let i=0;i<w.length;i++){let rr=r+dr*i,cc=c+dc*i,old=grid.get(key(rr,cc));if(old){if(old.ch!==w[i]||old.axes.has(dr?'down':'across'))return false;crossings++}else if(grid.has(key(rr+dc,cc+dr))||grid.has(key(rr-dc,cc-dr)))return false;}return crossings>0;}
      function place(w,r,c,dr,dc){const axis=dr?'down':'across',cells=Array.from(w.en,(_,i)=>({r:r+dr*i,c:c+dc*i}));cells.forEach((p,i)=>{let k=key(p.r,p.c),old=grid.get(k);if(old)old.axes.add(axis);else grid.set(k,{ch:w.en[i],axes:new Set([axis])})});entries.push({...w,r,c,axis,cells})}
      if(!order.length)return {entries:[],grid:[],rows:0,cols:0,omitted:pool};place(order.shift(),0,0,0,1);
      let pending=order;for(let pass=0;pass<4;pass++){let next=[];for(const w of pending){let options=[];for(const [k,v] of grid){const [rr,cc]=k.split(',').map(Number);for(let i=0;i<w.en.length;i++)if(w.en[i]===v.ch)for(const [dr,dc] of [[0,1],[1,0]]){let r=rr-dr*i,c=cc-dc*i;if(valid(w.en,r,c,dr,dc)){let rs=[...entries.flatMap(e=>e.cells.map(p=>p.r)),r,r+dr*(w.en.length-1)],cs=[...entries.flatMap(e=>e.cells.map(p=>p.c)),c,c+dc*(w.en.length-1)];let rows=Math.max(...rs)-Math.min(...rs)+1,cols=Math.max(...cs)-Math.min(...cs)+1;if(rows<=19&&cols<=19)options.push({r,c,dr,dc,area:rows*cols})}}}options=shuffle(options).sort((a,b)=>a.area-b.area);if(options.length){let o=options[0];place(w,o.r,o.c,o.dr,o.dc)}else next.push(w)}pending=next;}
      if(!best||entries.length>best.entries.length){let all=entries.flatMap(e=>e.cells),minR=Math.min(...all.map(p=>p.r)),minC=Math.min(...all.map(p=>p.c));entries.forEach(e=>{e.r-=minR;e.c-=minC;e.cells.forEach(p=>{p.r-=minR;p.c-=minC})});let rows=Math.max(...all.map(p=>p.r))+1,cols=Math.max(...all.map(p=>p.c))+1,board=Array.from({length:rows},()=>Array(cols).fill(null));entries.forEach(e=>e.cells.forEach((p,i)=>board[p.r][p.c]=e.en[i]));let starts=[...new Set(entries.map(e=>key(e.r,e.c)))].sort((a,b)=>{let [ar,ac]=a.split(',').map(Number),[br,bc]=b.split(',').map(Number);return ar-br||ac-bc});entries.forEach(e=>e.number=starts.indexOf(key(e.r,e.c))+1);best={entries,grid:board,rows,cols,omitted:pending};}if(best.entries.length>=Math.min(pool.length,10))break;
    }return best;
  }
  const api={shuffle,normalize,search,line,crossword};root.ArcadeRules=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
