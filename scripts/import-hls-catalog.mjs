import fs from 'node:fs/promises';
import path from 'node:path';

const base = 'http://xet.bolinzhiyin.cn/';
const root = process.cwd();
const stamp = new Date().toISOString().slice(0, 10);
const slug = text => String(text || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 56) || 'untitled';
const normalized = text => slug(text).replace(/-/g, '');

async function courseText(){
  const tokenResponse = await fetch(new URL('get_token.php', base));
  const {token} = await tokenResponse.json();
  const response = await fetch(new URL(`get_courses.php?token=${encodeURIComponent(token)}`, base), {headers:{Cookie:tokenResponse.headers.get('set-cookie') || ''}});
  if(!response.ok) throw new Error(`Course configuration failed: ${response.status}`);
  return response.text();
}

function categoriesFrom(text){
  const categories=[]; let current=null;
  for(const original of text.split(/\r?\n/)){
    const line=original.trim();
    const cat=line.match(/^\[(lanmu|lanmus)\](.+?)\[\/\1\]$/);
    if(cat){ current={name:cat[2].trim(), api:''}; categories.push(current); continue; }
    const api=line.match(/^\[api\](.+?)\[\/api\]$/);
    if(api && current) current.api=api[1].trim();
  }
  return categories.filter(x=>x.api);
}

async function albums(url){
  const response=await fetch(url,{signal:AbortSignal.timeout(45000)});
  if(!response.ok) throw new Error(`HTTP ${response.status}`);
  const data=await response.json();
  const list=Array.isArray(data) ? data : (data.albums || data.data || data.list || data.videos || []);
  return Array.isArray(list) ? list : Object.values(list || {});
}

async function fetchProjects(categories){
  const jobs=[];
  for(const category of categories){
    const api=new URL(category.api,base);
    const ids=(api.searchParams.get('id') || '').split(',').map(x=>x.trim()).filter(Boolean);
    if(ids.length) for(const id of ids){ const url=new URL(api); url.searchParams.set('id',id); jobs.push({category:urlCategory(category.name), key:id, url:url.toString()}); }
    else jobs.push({category:urlCategory(category.name), key:slug(category.name), url:api.toString()});
  }
  const projects=[]; let next=0;
  const workers=Array.from({length:5},async()=>{
    while(true){
      const index=next++; if(index>=jobs.length) return;
      const job=jobs[index];
      try{
        for(const album of await albums(job.url)){
          const episodes=(album.episodes || []).filter(ep=>/\.m3u8(?:\?|$)/i.test(ep.url || ''));
          if(episodes.length) projects.push({...job, name:album.name || job.key, cover:album.cover || '', episodes});
        }
      }catch(error){ console.warn(`Skipped ${job.key}: ${error.message}`); }
      if((index+1)%20===0) console.log(`Loaded ${index+1}/${jobs.length} project endpoints`);
    }
  });
  await Promise.all(workers);
  return projects;
}
function urlCategory(name){ return name.replace(/^L(\d+)英语动画$/, 'Level $1 English Animation').replace(/^L0英语儿歌$/, 'Level 0 English Songs'); }

function existingMatch(project){
  const name=normalized(project.name);
  if(name === normalized('Journey to the West')) return 'journey-to-the-west';
  if(name.includes('threekingdom') || name.includes('romanceofthethreekingdom')) return 'three-kingdoms';
  return null;
}

async function main(){
  const projects=await fetchProjects(categoriesFrom(await courseText()));
  const listPath=path.join(root,'data','series-list.json');
  const list=JSON.parse(await fs.readFile(listPath,'utf8'));
  const existingIds=new Set(list.map(item=>item.seriesId));
  const added=[]; const updated=[];
  for(const project of projects){
    const target=existingMatch(project);
    if(target){
      const file=path.join(root,'data',target,'episodes.json');
      const episodes=JSON.parse(await fs.readFile(file,'utf8'));
      for(const remote of project.episodes){
        const id=Number((remote.name || '').match(/\d+/)?.[0]);
        const local=episodes.find(ep=>Number(ep.episodeId)===id);
        if(local) { local.video={...(local.video || {}),hlsUrl:remote.url}; }
      }
      await fs.writeFile(file,JSON.stringify(episodes,null,2)+'\n'); updated.push(target); continue;
    }
    const seriesId=`little-fox-${slug(project.name)}-${slug(project.key)}`;
    if(existingIds.has(seriesId)) continue;
    const episodeRows=project.episodes.map((episode,index)=>({
      episodeId:index+1,
      title:episode.name || `Episode ${index+1}`,
      titleZh:'',
      releaseDate:'',
      status:'published',
      sourceType:'hls',
      unlockRequiresQuiz:false,
      video:{source:'hls',hlsUrl:episode.url},
      modules:{watch:true,read:true,words:true,vocabulary:true,phrases:false,grammar:false,quiz:true,review:false}
    }));
    const dir=path.join(root,'data',seriesId);
    await fs.mkdir(dir,{recursive:true});
    await fs.writeFile(path.join(dir,'series.json'),JSON.stringify({seriesId,seriesTitle:project.name,seriesTitleZh:'',level:Number(project.category.match(/Level (\d+)/)?.[1] || 0),language:'en',source:'Licensed HLS catalog',status:'published',totalEpisodes:episodeRows.length,description:'Video lessons are available now. Reading, words, and quiz content will be added progressively.',coverImage:project.cover,updateNote:`Video catalog imported ${stamp}.`},null,2)+'\n');
    await fs.writeFile(path.join(dir,'episodes.json'),JSON.stringify(episodeRows,null,2)+'\n');
    await Promise.all(['reading-lessons.json','vocabulary.json','quiz.json'].map(file=>fs.writeFile(path.join(dir,file),'{}\n')));
    list.push({seriesId,title:project.name,titleZh:'',level:Number(project.category.match(/Level (\d+)/)?.[1] || 0),episodeCount:episodeRows.length,status:'published',cover:project.cover,description:'Video is available. Reading, words, and quizzes will be added gradually.',readyEpisodes:episodeRows.length,tagline:`${episodeRows.length} video lessons · Content in progress`});
    existingIds.add(seriesId); added.push(seriesId);
  }
  await fs.writeFile(listPath,JSON.stringify(list,null,2)+'\n');
  console.log(JSON.stringify({projectsFound:projects.length,seriesAdded:added.length,existingSeriesUpdated:[...new Set(updated)],output:'data/series-list.json'}));
}
main();
