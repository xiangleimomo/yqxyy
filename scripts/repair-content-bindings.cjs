/* Rebind by exact XET content ID, preserving episode positions and associated
 * material from that same source ID. No ordinal arithmetic or account writes. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const args=process.argv.slice(2),apply=args.includes('--apply'),reviewArg=args.find(x=>x.startsWith('--review='));if(!reviewArg||args.some(x=>!['--apply','--dry-run'].includes(x)&&!x.startsWith('--review=')))throw Error('Usage: repair-content-bindings.cjs --review=review.json [--apply]');
const review=JSON.parse(fs.readFileSync(path.resolve(reviewArg.slice(9)),'utf8'));if(review.failures?.length)throw Error('Source review has unresolved failures');
const manifest=require('./subtitle-review/2026-10-28-content-bindings.json');
const normalize=s=>String(s||'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'');
const text=r=>(r?.paragraphs||[]).map(p=>typeof p==='string'?p:(p.text||'')).join(' ');
const copies=new Map(),changes=[];
const clone=x=>x===undefined?undefined:JSON.parse(JSON.stringify(x));
const stops=new Set('the a an and or to in on at is it was were of for from with that this he she they his her their you i we be as but not had have said'.split(' '));
function newWords(t){const ws=(t.match(/[A-Za-z][A-Za-z'-]{2,}/g)||[]).map(x=>x.toLowerCase()).filter(x=>!stops.has(x));const unique=[...new Set(ws)].sort((a,b)=>ws.filter(w=>w===b).length-ws.filter(w=>w===a).length).slice(0,28);return unique.map((word,i)=>({id:'v'+(i+1),word,meaningZh:'请结合本集 Read 上下文理解',definitionEn:'',example:(t.match(/[^.!?]+[.!?]+|[^.!?]+$/g)||[]).find(x=>new RegExp('\\b'+word+'\\b','i').test(x))?.trim()||'',exampleZh:'',source:'generated-from-public-read'}));}
for(const item of manifest.lessons){
 const row=review.lessons.find(r=>r.seriesId===item.seriesId&&r.episodeId===item.episodeId);if(!row)throw Error('Missing source review '+item.seriesId+'/'+item.episodeId);
 let state=copies.get(item.seriesId);if(!state){const dir=path.join('data',item.seriesId),load=n=>JSON.parse(fs.readFileSync(path.join(dir,n+'.json'),'utf8'));const original={reads:load('reading-lessons'),vocab:load('vocabulary'),quizzes:load('quiz')};state={dir,episodes:load('episodes'),original,reads:clone(original.reads),vocab:clone(original.vocab),quizzes:clone(original.quizzes)};state.bySource=new Map(Object.entries(original.reads).filter(([k,r])=>r?.sourceId).map(([k,r])=>[r.sourceId,k]));copies.set(item.seriesId,state);}
 const ep=state.episodes.find(e=>e.episodeId===item.episodeId);assert(ep&&ep.sourceContentId===row.sourceContentId&&normalize(ep.title)===normalize(row.title),'Content ID/title mismatch');
 const previous=state.reads[ep.episodeId],oldSlot=state.bySource.get(ep.sourceContentId),candidate=oldSlot===undefined?null:state.original.reads[oldSlot],official=row.officialParagraphs.join(' ');
 const reused=candidate&&normalize(text(candidate))===normalize(official);
 const reading=reused?clone(candidate):{source:'official-public-read',sourceId:ep.sourceContentId,paragraphs:row.officialParagraphs.map((text,i)=>({id:'p'+(i+1),text,translation:''}))};reading.episodeId=ep.episodeId;reading.title=ep.title;reading.sourceId=ep.sourceContentId;
 const vocabulary=reused?clone(state.original.vocab[oldSlot]):newWords(official),quiz=reused?clone(state.original.quizzes[oldSlot]):null;
 if(quiz){quiz.episodeId=ep.episodeId;quiz.title=ep.title+' Quiz';if(quiz.sourceContentId)quiz.sourceContentId=ep.sourceContentId;}
 state.reads[ep.episodeId]=reading;state.vocab[ep.episodeId]=vocabulary?.length?vocabulary:newWords(official);if(quiz)state.quizzes[ep.episodeId]=quiz;else delete state.quizzes[ep.episodeId];
 const beforeUrl=ep.video?.hlsUrl;if(row.reviewVideoCandidate){const u=new URL(row.reviewVideoCandidate);assert(u.protocol==='https:'&&u.hostname==='cdn.littlefox.co.kr'&&!u.username&&!u.password&&!u.search,'Invalid public CDN candidate');ep.video={...ep.video,hlsUrl:u.href};}else assert(row.sameVideoPath,'Missing verified media candidate');
 ep.modules={...ep.modules,read:true,words:!!state.vocab[ep.episodeId]?.length,vocabulary:!!state.vocab[ep.episodeId]?.length,quiz:!!quiz?.questions?.length};
 changes.push({...item,sourceContentId:ep.sourceContentId,previousReadSource:previous?.sourceId,materialReusedFromSlot:oldSlot===undefined?null:Number(oldSlot),usedExistingVerifiedRead:!!reused,videoChanged:ep.video.hlsUrl!==beforeUrl,verifiedMediaFingerprint:crypto.createHash('sha256').update(new URL(ep.video.hlsUrl).pathname).digest('hex'),subtitleExists:fs.existsSync(path.join(state.dir,'subtitles',String(ep.episodeId).padStart(3,'0')+'.vtt')),readWordsMatchOfficial:normalize(text(reading))===normalize(official)});
}
if(apply){for(const state of copies.values())for(const [name,value]of [['episodes',state.episodes],['reading-lessons',state.reads],['vocabulary',state.vocab],['quiz',state.quizzes]])fs.writeFileSync(path.join(state.dir,name+'.json'),JSON.stringify(value,null,2)+'\n');fs.writeFileSync('docs/content-binding-repairs-2026-10-28.json',JSON.stringify({method:'Exact content ID and title verified against authenticated XET, existing public Read verified against official text; preserve episode positions and reuse study materials by source ID.',changes},null,2)+'\n');}
console.log(JSON.stringify({apply,lessons:changes.length,series:copies.size,readingsRebound:changes.filter(x=>x.previousReadSource!==x.sourceContentId).length,videoReplacements:changes.filter(x=>x.videoChanged).length,newlyFetchedReads:changes.filter(x=>!x.usedExistingVerifiedRead).length},null,2));
