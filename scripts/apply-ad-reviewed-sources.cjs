// Apply the exact user-supplied sources after their ad segments were reviewed.
// Usage: node scripts/apply-ad-reviewed-sources.cjs <manifest.json> [--write]
const fs=require('node:fs'),path=require('node:path');
function apply(file,write=false){
 const rows=JSON.parse(fs.readFileSync(file,'utf8')),entries=new Map();
 for(const row of rows){const u=new URL(row.hlsUrl);if(u.protocol!=='https:'||!u.pathname.endsWith('.m3u8')||row.reviewedAds!==true||!row.ranges?.length||entries.has(row.id))throw Error('Invalid reviewed source '+row.id);entries.set(row.id,row);}
 const root=path.join(__dirname,'../data/movies'),plans=[],found=new Set();
 for(const series of fs.readdirSync(root)){
  const p=path.join(root,series,'movies.json');if(!fs.existsSync(p))continue;const original=fs.readFileSync(p,'utf8');
  const text=original.replace(/\{[^{}]*\}/g,block=>{let movie;try{movie=JSON.parse(block);}catch{return block;}if(!entries.has(movie.id)||!Object.hasOwn(movie,'hlsUrl'))return block;found.add(movie.id);return block.replace(/("hlsUrl"\s*:\s*)"[^"\r\n]*"/,(_,prefix)=>prefix+JSON.stringify(entries.get(movie.id).hlsUrl));});
  JSON.parse(text);if(text!==original)plans.push({p,text});
 }
 for(const id of entries.keys())if(!found.has(id))throw Error('Missing movie '+id);
 if(write)for(const {p,text}of plans)fs.writeFileSync(p,text);
 return {matched:found.size,changedFiles:plans.length,write};
}
if(require.main===module)console.log(JSON.stringify(apply(process.argv[2],process.argv.includes('--write'))));
module.exports={apply};
