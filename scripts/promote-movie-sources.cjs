// Usage: node scripts/promote-movie-sources.cjs <title/url text file> [--write]
const fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..');
const baseAliases = require('./import-movie-sources.cjs');
function normalize(s) { return s.replace(/[·：:、\s]/g, '').replace(/1$/, ''); }
function run(input, write=false) {
 const catalogFile=path.join(root,'data/movie-series.json'), catalog=JSON.parse(fs.readFileSync(catalogFile,'utf8'));
 const metadata=require('../docs/movie-additions-2026-10-20.json');
 const groups=new Map(catalog.map(g=>[g.id,{file:path.join(root,'data/movies',g.id,'movies.json'),data:JSON.parse(fs.readFileSync(path.join(root,'data/movies',g.id,'movies.json'),'utf8'))}]));
 for(const item of metadata) {
  if(!groups.has(item.series.id)) {catalog.push(item.series);groups.set(item.series.id,{file:path.join(root,'data/movies',item.series.id,'movies.json'),data:{films:[],sources:[]}});}
  const data=groups.get(item.series.id).data;
  if(!data.films.some(f=>f[0]===item.movie.id)) data.films.push([item.movie.id,item.movie.title,item.movie.titleZh,item.movie.year]);
  if(!data.sources.some(m=>m.id===item.movie.id)) data.sources.push({...item.movie,seriesOrder:data.films.length,hlsUrl:''});
 }
 const movies=[...groups.values()].flatMap(g=>g.data.sources), aliases=new Map();
 for(const movie of movies) aliases.set(normalize(movie.titleZh),movie);
 const extra={'精灵旅社3':'hotel-transylvania-3','精灵旅社4':'hotel-transylvania-4','疯狂原始人2':'croods-2','魔发精灵2':'trolls-2','魔发精灵3':'trolls-3','冰川时代6':'ice-age-buck-wild','海底总动员1':'finding-nemo','海底总动员2':'finding-dory'};
 for(let i=1;i<=5;i++) extra['冰川时代'+i]='ice-age-'+i;
 for(const [title,id] of Object.entries(extra)) aliases.set(normalize(title),movies.find(m=>m.id===id));
 const lines=fs.readFileSync(input,'utf8').replace(/^\uFEFF/,'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean),seen=new Set();
 if(lines.length%2) throw Error('Expected title/URL pairs');
 for(let i=0;i<lines.length;i+=2) {
  let movie=aliases.get(normalize(lines[i]));
  if(!movie) { try { const id=[...baseAliases.parse(lines[i]+'\n'+lines[i+1]).keys()][0]; movie=movies.find(m=>m.id===id); } catch {} }
  if(!movie) throw Error('Unmatched title: '+lines[i]);
  if(seen.has(movie.id)) throw Error('Duplicate: '+movie.id);seen.add(movie.id);
  const u=new URL(lines[i+1]);if(u.protocol!=='https:'||u.username||u.password||!u.pathname.endsWith('.m3u8'))throw Error('Invalid source');
  const backups=[...(movie.backupSources||[]),...(movie.backupHlsUrl?[{url:movie.backupHlsUrl}]:[])];
  if(movie.hlsUrl && movie.hlsUrl!==u.href)backups.push({url:movie.hlsUrl});
  if(movie.embedUrl)backups.push({url:movie.embedUrl,embedded:true});
  movie.backupSources=backups.filter((b,n,a)=>b.url!==u.href && a.findIndex(x=>x.url===b.url)===n);
  movie.hlsUrl=u.href;delete movie.embedUrl;
  movie.sourceLabel='主片源';
 }
 const plans=[{file:catalogFile,data:catalog},...[...groups.values()]];
 const changed=plans.filter(p=>!fs.existsSync(p.file)||JSON.stringify(JSON.parse(fs.readFileSync(p.file,'utf8')))!==JSON.stringify(p.data));
 if(write)for(const p of changed){fs.mkdirSync(path.dirname(p.file),{recursive:true});fs.writeFileSync(p.file,JSON.stringify(p.data,null,2)+'\n');}
 return {matched:seen.size,files:changed.map(p=>path.relative(root,p.file)),write};
}
if(require.main===module)console.log(JSON.stringify(run(process.argv[2],process.argv.includes('--write'))));
module.exports={run};
