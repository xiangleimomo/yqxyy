const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ctx=vm.createContext({window:{addEventListener(){}},crypto:require('node:crypto').webcrypto});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/episode-games.js'),'utf8')+'\nglobalThis.api=EpisodeGames',ctx);
const api=ctx.api;
const Rules=require('../arcade/rules.js');
const casing=api.pack([{word:'APPLE',meaningZh:'苹果'},{word:'bridge',meaningZh:'桥'},{word:'Venus',meaningZh:'金星'},{word:'TV',meaningZh:'电视'},{word:'Guanyin',meaningZh:'观音'},{word:'Good',meaningZh:'好'},{word:'eBay',meaningZh:'品牌',preserveCase:true}]).words;
assert.equal(casing.map(w=>w.en).join(','),'apple,bridge,Venus,TV,Guanyin,good,eBay');
assert.equal(Rules.normalize(Rules.normalize(casing)).map(w=>w.en).join(','),'apple,bridge,Venus,TV,Guanyin,good,eBay');
const ordinary=Rules.normalize([{en:'APPLE',zh:'苹果'},{en:'BRIDGE',zh:'桥'},{en:'CLOUD',zh:'云'},{en:'DRAGON',zh:'龙'}]);
assert.ok(ordinary.every(w=>w.en===w.en.toLowerCase()));
for(let i=0;i<30;i++){const search=Rules.search(ordinary),cross=Rules.crossword(ordinary);assert.ok(search.grid.flat().every(ch=>/^[a-z]$/.test(ch)));assert.ok(cross.grid.flat().filter(Boolean).every(ch=>/^[a-z]$/.test(ch)));for(const entry of search.entries)assert.equal(entry.cells.map(p=>search.grid[p.r][p.c]).join(''),entry.en);for(const entry of cross.entries)assert.equal(entry.cells.map(p=>cross.grid[p.r][p.c]).join(''),entry.en)}
const random=Array.from({length:300},()=>api.choose());
assert.ok(random.every(ids=>ids.length===3&&new Set(ids).size===3));
assert.equal(new Set(random.flat()).size,27);
assert.ok(api.choose(random[0]).every(id=>!random[0].includes(id)));
const pack=api.pack([{word:'apple',meaningZh:'苹果'},{word:'APPLE',meaningZh:'重复'},{word:'two words',meaningZh:'短语'},{word:'a',meaningZh:'字母'},{word:'missing'},{word:'valid',meaning:'有效'}]);
assert.equal(pack.words.length,2);assert.equal(pack.excluded.length,3);
assert.ok(!api.panel({vocab:[]}).includes('<iframe'));
let lessons=0,playable=0;
const data=path.join(__dirname,'../data');
for(const series of fs.readdirSync(data,{withFileTypes:true}).filter(d=>d.isDirectory())){
 const file=path.join(data,series.name,'vocabulary.json');if(!fs.existsSync(file))continue;
 for(const vocab of Object.values(JSON.parse(fs.readFileSync(file,'utf8')))){
  if(!Array.isArray(vocab))continue;lessons++;const p=api.pack(vocab);if(p.words.length>=4)playable++;
  const source=new Set(vocab.map(w=>String(w.word||'').trim().toUpperCase()));
  assert.equal(new Set(p.words.map(w=>w.en.toUpperCase())).size,p.words.length);
  assert.ok(p.words.every(w=>source.has(w.en.toUpperCase())&&/^[a-z]{2,16}$/i.test(w.en)&&w.zh));
 }
}
console.log(`PASS: 27-game random selection, non-repeating refresh, vocabulary validation; ${lessons} lesson packs audited (${playable} have at least four supported words).`);
