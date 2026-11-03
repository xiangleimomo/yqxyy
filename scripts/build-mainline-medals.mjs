import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const read=async p=>JSON.parse(await fs.readFile(p,'utf8'));
const registry=await read('data/medal-resources.json'),tasks=[];
const uuid=key=>{const h=createHash('sha256').update('storyfox-mainline:'+key).digest('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-5${h.slice(13,16)}-a${h.slice(17,20)}-${h.slice(20,32)}`;};
const raw=(await fs.readFile('data/movie-mainline-prompts.txt','utf8')).split(/\r?\n/).filter(line=>line.trim()&&!line.startsWith('#')).map(line=>line.split('|'));
const originals=new Map(raw.map(([id,...items])=>[id,items.map(item=>{const [question,answer,category]=item.split('~');if(!question||!answer||!category)throw Error('Invalid question '+id);return {question,answer,category};})]));
if(originals.size!==raw.length)throw Error('Duplicate film questions');
const pools={};for(const qs of originals.values())for(const q of qs)(pools[q.category]??=new Set()).add(q.answer);
Object.assign(pools,{number:new Set(['One','Two','Three','Four','Five','Six']),goal:new Set(['Win a spelling contest','Open a furniture shop','Build a shopping mall','Become a weather reporter']),group:new Set(['A royal orchestra','A class of chess students','A team of deep-sea divers','A group of astronauts']),animal:new Set(['A giraffe','A penguin','A dolphin','A hamster']),job:new Set(['A dentist','A taxidermist','A ballet teacher','A weather reporter']),event:new Set(['A museum loses its paintings','A school cancels all homework','Everyone moves to the Moon'])});
const questions={};for(const [id,qs] of originals){if(qs.length!==5)throw Error('Expected five questions for '+id);questions[id]=qs.map((q,index)=>{
 const digest=createHash('sha256').update(id+index).digest(),wrong=[...pools[q.category]].filter(a=>a.toLowerCase()!==q.answer.toLowerCase());if(wrong.length<2)throw Error('Insufficient distractors '+id);
 const first=digest[1]%wrong.length,second=(first+1+digest[2]%(wrong.length-1))%wrong.length,correct=digest[0]%3,choices=[wrong[first],wrong[second]];choices.splice(correct,0,q.answer);
 return {id:'q'+(index+1),question:q.question,options:choices.map((text,i)=>({key:'ABC'[i],text})),answer:'ABC'[correct]};
 });}
const films=[];for(const group of await read('data/movie-series.json')){const data=await read(`data/movies/${group.id}/movies.json`);for(const [id,title,titleZh] of data.films){if(!questions[id])throw Error('Missing film questions '+id);films.push({id,title:titleZh||title,resource:registry.find(r=>r.key==='movie:'+id)});}}
for(const s of await read('data/series-list.json')){
 let episodes=[],quiz={};try{episodes=await read(`data/${s.seriesId}/episodes.json`);}catch{}try{quiz=await read(`data/${s.seriesId}/quiz.json`);}catch{}
 const published=episodes.filter(e=>e.status==='published'),required=[...new Set(published.map(e=>Number(e.episodeId)))].sort((a,b)=>a-b),expected=Math.max(Number(s.episodeCount)||0,required.length);
 const ready=required.filter(id=>{const qs=quiz[id]?.questions;return Array.isArray(qs)&&qs.length>0&&qs.every(q=>q.id&&q.answer&&q.options?.some(o=>o.key===q.answer));}).length;
 const key='series:'+s.seriesId;tasks.push({id:uuid(key),key,type:'series',resourceId:s.seriesId,resourceTitle:s.titleZh||s.title,title:(s.titleZh||s.title).slice(0,75)+' · 全集答题勋章',href:'#/series/'+s.seriesId,rule:'series_quiz',expected,required,ready,active:!['coming','locked'].includes(s.status)});
}
for(const f of films){const key='movie:'+f.id;tasks.push({id:uuid(key),key,type:'movie',resourceId:f.id,resourceTitle:f.title,title:f.title.slice(0,75)+' · 观影答题勋章',href:'#/movie/'+f.id,rule:'movie_quiz',expected:5,required:[],ready:5,active:f.resource?.active!==false});}
const q=value=>"'"+String(value).replaceAll("'","''")+"'";
if(process.argv.includes('--seed-page')){
 const page=Number(process.argv[process.argv.indexOf('--seed-page')+1]);let sql='begin;';
 for(const t of tasks.slice(page*15,(page+1)*15)){
  sql+=`insert into sf_medals_private.resources(key,resource_type,resource_id,title,href,canonical_key,expected_count,active) values(${[t.key,t.type,t.resourceId,t.resourceTitle,t.href,t.key].map(q).join(',')},${t.expected},${t.active}) on conflict(key) do update set title=excluded.title,href=excluded.href,active=excluded.active;`;
  if(t.type==='movie'){const qs=questions[t.resourceId],version=createHash('sha256').update(JSON.stringify(qs)).digest('hex').slice(0,20);sql+=`insert into sf_medals_private.movie_quizzes(resource_key,questions,version) values(${q(t.key)},${q(JSON.stringify(qs))}::jsonb,${q(version)}) on conflict(resource_key) do update set questions=excluded.questions,version=excluded.version;`;}
  sql+=`insert into sf_medals_private.work_badges(id,title,description,asset_id,resource_key,source_type,rights_note,unlock_rule,quiz_min,active,required_episodes,required_count,quiz_ready_count) values(coalesce((select id from sf_medals_private.work_badges where resource_key=${q(t.key)} and creator_id is null and unlock_rule in ('self_report','series_quiz','movie_quiz') order by (unlock_rule<>'self_report') desc limit 1),${q(t.id)}::uuid),${q(t.title)},${q(t.type==='series'?'主线任务：全系列每集测验达标后自动获得。未补齐题库不提前解锁。':'主线任务：完成本片五道剧情题，达到要求后自动获得。')},null,${q(t.key)},'original','主线任务预留勋章，图片由管理员补充',${q(t.rule)},80,${t.active},array[${t.required.join(',')}]::integer[],${t.expected},${t.ready}) on conflict(id) do update set title=excluded.title,description=excluded.description,unlock_rule=excluded.unlock_rule,required_episodes=excluded.required_episodes,required_count=excluded.required_count,quiz_ready_count=excluded.quiz_ready_count;`;
 }
 console.log(sql+"commit;select 'Mainline seed page "+page+" ready' as result;");
}else{
 await fs.writeFile('data/mainline-medals.json',JSON.stringify(tasks.map(({required,...t})=>t),null,2)+'\n');
 await fs.writeFile('data/movie-mainline-quiz.json',JSON.stringify(questions,null,2)+'\n');
 console.log(JSON.stringify({series:tasks.filter(t=>t.type==='series').length,seriesReady:tasks.filter(t=>t.type==='series'&&t.ready>=t.expected&&t.required.length===t.expected).length,movies:films.length,questions:Object.values(questions).reduce((n,qs)=>n+qs.length,0),seedPages:Math.ceil(tasks.length/15)}));
}
