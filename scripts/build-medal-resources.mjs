import fs from 'node:fs/promises';
import {project,publishableKey} from '../netlify/lib/book-cloud.js';
const target='data/medal-resources.json';
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
if(process.argv.includes('--page')){const page=Number(process.argv[process.argv.indexOf('--page')+1]);console.log(JSON.stringify((await read(target)).slice(page*100,(page+1)*100)));process.exit(0);}
if(process.argv.includes('--count')){const rows=await read(target);console.log(JSON.stringify({count:rows.length,pages:Math.ceil(rows.length/100)}));process.exit(0);}
const rows=new Map(),put=(type,id,title,href,more={})=>{const key=type+':'+id;rows.set(key,{key,type,id,title:String(title).slice(0,240),href,...more});};
const books=new Map((await read('data/books.json')).map(book=>[book.id,book]));
const headers={apikey:publishableKey};
const [cloud,shelf]=await Promise.all([fetch(project+'/rest/v1/story_books?select=id,title,title_zh,content_kind',{headers}),fetch(project+'/rest/v1/story_book_shelf?select=id,deleted',{headers})]);
if(!cloud.ok||!shelf.ok)throw Error('Cannot build a partial resource registry while cloud catalogue is unavailable');
for(const book of await cloud.json())books.set(book.id,{id:book.id,title:book.title,titleZh:book.title_zh,kind:book.content_kind});
const deleted=new Set((await shelf.json()).filter(row=>row.deleted).map(row=>row.id));
for(const book of books.values())if(!deleted.has(book.id)){const type=book.kind==='magazine'?'magazine':'book';put(type,book.id,book.titleZh||book.title,`${type==='magazine'?'#/magazine-reader/':'#/reader/'}${book.id}`);}
const seriesList=await read('data/series-list.json'),done=new Set();
async function series(id,item={}){
 if(done.has(id))return;done.add(id);
 let episodes=[];try{episodes=await read(`data/${id}/episodes.json`);}catch{}
 const published=episodes.filter(ep=>ep.status==='published');
 let metadata={};try{metadata=await read(`data/${id}/series.json`);}catch{}
 put('series',id,item.titleZh||metadata.seriesTitleZh||item.title||metadata.seriesTitle||id,'#/series/'+id,{expected_count:published.length,active:!['coming','locked'].includes(item.status)});
 for(const ep of published)put('episode',id+':'+ep.episodeId,`${item.titleZh||metadata.seriesTitleZh||metadata.seriesTitle||id} ${ep.episodeId} · ${ep.titleZh||ep.title}`,'#/lesson/'+id+'/'+ep.episodeId,{parent_key:'series:'+id});
}
for(const item of seriesList)await series(item.seriesId,item);
for(const group of await read('data/movie-series.json')){
 const data=await read(`data/movies/${group.id}/movies.json`),sources=data.sources||[];
 for(const film of data.films||[]){const [id,title,titleZh]=film,item=sources.find(row=>row.id===id);put('movie',id,titleZh||title,'#/movie/'+id,{active:Boolean(item&&(item.hlsUrl||item.embedUrl))});if(item?.studyCourse?.seriesId)await series(item.studyCourse.seriesId);}
}
const result=[...rows.values()].sort((a,b)=>(a.type==='episode')-(b.type==='episode')||a.key.localeCompare(b.key));
await fs.writeFile(target,'[\n'+result.map(row=>'  '+JSON.stringify(row)).join(',\n')+'\n]\n');
console.log(JSON.stringify({count:result.length,pages:Math.ceil(result.length/100),byType:Object.fromEntries([...new Set(result.map(r=>r.type))].map(type=>[type,result.filter(r=>r.type===type).length]))}));
