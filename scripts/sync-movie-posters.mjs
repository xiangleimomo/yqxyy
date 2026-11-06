#!/usr/bin/env node
import {readFile, writeFile} from 'node:fs/promises';

const catalog=JSON.parse(await readFile(new URL('../data/movie-hub-catalog.json',import.meta.url)));
const output=new URL('../data/movie-posters.json',import.meta.url);
const wait=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));
const posters={};

for(const film of catalog.films){
  const url=new URL('https://streamjuju.cyou/api/search');
  url.searchParams.set('q',film.title);
  try{
    const response=await fetch(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(15000)});
    const body=await response.json();
    const match=(body.results||[]).find(item=>Number(item.id)===Number(film.tmdbId));
    if(match?.poster_path && /^\/[A-Za-z0-9._/-]+$/.test(match.poster_path))posters[film.id]=`https://image.tmdb.org/t/p/w500${match.poster_path}`;
    else console.warn(`No poster match: ${film.id} (TMDB ${film.tmdbId})`);
  }catch(error){console.warn(`Poster lookup failed: ${film.id}: ${error.message}`);}
  await wait(120);
}

await writeFile(output,JSON.stringify(posters,null,2)+'\n');
console.log(`Saved ${Object.keys(posters).length}/${catalog.films.length} poster mappings to data/movie-posters.json`);
