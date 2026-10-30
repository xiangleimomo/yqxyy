#!/usr/bin/env node
// Read-only check of existing movie manifests at Dulo's published replacement host.
const fs=require('node:fs/promises'),path=require('node:path'),core=require('../source-lab/core.js');
(async()=>{
 const root=path.resolve(__dirname,'..'),groups=JSON.parse(await fs.readFile(path.join(root,'data/movie-series.json'),'utf8')),movies=[];
 for(const group of groups)for(const film of JSON.parse(await fs.readFile(path.join(root,'data/movies',group.id,'movies.json'),'utf8')).sources||[]){const url=core.duloMediaUrl(film.hlsUrl);if(url)movies.push({id:film.id,url});}
 const results=new Array(movies.length);let next=0;
 await Promise.all(Array.from({length:3},async()=>{while(next<movies.length){const i=next++,film=movies[i];try{const r=await fetch(film.url,{signal:AbortSignal.timeout(20000)}),s=await r.text();results[i]={id:film.id,status:r.status,manifest:r.ok&&s.startsWith('#EXTM3U')};}catch(e){results[i]={id:film.id,status:0,manifest:false,error:e.message};}}}));
 const report={replacementOrigin:core.duloCdnOrigin,total:results.length,passed:results.filter(r=>r.manifest).length,results};
 const output=process.argv.find(v=>v.startsWith('--output='))?.slice(9);
 if(output)await fs.writeFile(path.resolve(output),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({total:report.total,passed:report.passed,failed:results.filter(r=>!r.manifest)},null,2));
 if(report.passed!==report.total)process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
