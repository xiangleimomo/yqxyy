const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {plan,capacity}=require('../arcade/campaign.js');
const ctx=vm.createContext({window:{addEventListener(){}},crypto:require('node:crypto').webcrypto});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/episode-games.js'),'utf8')+'\nglobalThis.api=EpisodeGames',ctx);
const ids=Array.from({length:27},(_,i)=>'G'+String(i+2).padStart(2,'0'));
function check(pool,extra){for(const id of ids){
 const levels=plan(pool,extra,id),expected=new Set([...pool,...extra].map(w=>w.en.toLowerCase()));
 assert.ok(levels.length<=3);const sizes=levels.map(l=>l.review.length);assert.ok(Math.max(...sizes)-Math.min(...sizes)<=1);
 const review=levels.flatMap(l=>l.review.map(w=>w.en.toLowerCase()));assert.equal(review.length,expected.size);assert.deepEqual(new Set(review),expected);
 const playable=new Set(pool.map(w=>w.en.toLowerCase())),actual=new Set(levels.flatMap(l=>l.waves.flat().map(w=>w.en.toLowerCase())));
 assert.deepEqual(actual,playable);
 for(const level of levels)for(const wave of level.waves){assert.ok(wave.length<=capacity(id));assert.equal(new Set(wave.map(w=>w.en.toLowerCase())).size,wave.length);if(id==='G07')assert.equal(wave.length,4);if(id==='G11')assert.ok(wave.length<=3)}
}}
let lessons=0;
const dir=path.join(__dirname,'../data');
for(const series of fs.readdirSync(dir,{withFileTypes:true}).filter(d=>d.isDirectory())){
 const file=path.join(dir,series.name,'vocabulary.json');if(!fs.existsSync(file))continue;
 for(const vocab of Object.values(JSON.parse(fs.readFileSync(file,'utf8')))){
  if(!Array.isArray(vocab))continue;const p=ctx.api.pack(vocab);if(p.words.length<4)continue;
  const extra=vocab.filter(w=>w.word&&(w.meaningZh||w.meaning)).map(w=>({en:w.word.trim(),zh:w.meaningZh||w.meaning}));check(p.words,extra);lessons++;
 }
}
const pool=['apple','bridge','cloud','dragon'].map(en=>({en,zh:en}));
check(pool,[{en:'a',zh:'一'},{en:'look after',zh:'照顾'},{en:'seventeenlettersxx',zh:'长词'}]);
assert.equal(plan([],[]).length,0);
console.log(`PASS: ${lessons} lesson vocabularies × 27 games: <=3 balanced levels, all supported words in waves, every valid Words entry in mandatory review, no sample vocabulary.`);
