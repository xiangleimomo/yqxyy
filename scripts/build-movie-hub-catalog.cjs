#!/usr/bin/env node
// Match our existing films to public title/year metadata; never import stream URLs.
const fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const normalize=s=>String(s).normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g,'');
const aliases={
  'narnia-1':['The Chronicles of Narnia: The Lion, the Witch and the Wardrobe'],
  'narnia-2':['The Chronicles of Narnia: Prince Caspian'],
  'narnia-3':['The Chronicles of Narnia: The Voyage of the Dawn Treader'],
  'harry-potter-philosophers-stone':["Harry Potter and the Sorcerer's Stone"]
};
async function main(){
  const groups=JSON.parse(await fs.readFile(path.join(root,'data/movie-series.json'),'utf8'));
  const films=[];
  for(const group of groups){
    const rows=JSON.parse(await fs.readFile(path.join(root,'data/movies',group.id,'movies.json'),'utf8'));
    for(const [id,title,titleZh,year] of rows.films)films.push({id,title,titleZh,year,seriesId:group.id});
  }
  const results=new Array(films.length);let next=0;
  await Promise.all(Array.from({length:3},async()=>{
    while(next<films.length){
      const i=next++,film=films[i];let match=null,error='';
      const titles=[film.title,...aliases[film.id]||[]];
      for(const title of titles){
        try{
          const url='https://streamjuju.cyou/api/search?q='+encodeURIComponent(title);
          const response=await fetch(url,{signal:AbortSignal.timeout(20000)});
          if(!response.ok)throw Error('HTTP '+response.status);
          const data=await response.json();
          const candidates=(data.results||[]).filter(row=>row.media_type==='movie'&&Number.isSafeInteger(row.id)&&row.id>0&&Number(String(row.release_date).slice(0,4))===film.year&&titles.some(t=>normalize(t)===normalize(row.title)));
          const unique=[...new Map(candidates.map(row=>[row.id,row])).values()];
          if(unique.length===1){match=unique[0];break;}
          error=unique.length>1?'Ambiguous title and year':'No exact title and year match';
        }catch(e){error=e.message;}
      }
      results[i]={...film,...match?{tmdbId:match.id,matchedTitle:match.title}:{pending:error}};
    }
  }));
  const output={metadataSource:'https://streamjuju.cyou/api/search',films:results};
  if(process.argv.includes('--apply'))await fs.writeFile(path.join(root,'data/movie-hub-catalog.json'),JSON.stringify(output,null,2)+'\n');
  console.log(JSON.stringify({total:results.length,matched:results.filter(f=>f.tmdbId).length,pending:results.filter(f=>!f.tmdbId)},null,2));
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={normalize,aliases};
