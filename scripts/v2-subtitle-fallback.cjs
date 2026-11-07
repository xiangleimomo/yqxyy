'use strict';

const core=require('../source-lab/core.js');
const {tmdbJson}=require('./v2-tv-catalog.cjs');
const {parseVtt,validateSubtitleCues}=require('./v2-subtitles.cjs');

function validStremioUrl(raw){
  try{
    const u=new URL(raw);
    return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&/^subs\d*\.strem\.io$/.test(u.hostname)&&u.pathname.startsWith('/en/download/');
  }catch{return false;}
}
function titleToken(value){return core.normalize(String(value||''));}
async function fetchJson(url,fetcher=fetch){
  const response=await fetcher(url,{headers:{Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new Error('OpenSubtitles catalogue failed: HTTP '+response.status);
  const data=await response.json();
  if(!data||typeof data!=='object')throw new Error('OpenSubtitles returned invalid JSON');
  return data;
}
async function findExternalSubtitle({tmdbId,mediaType='movie',season=null,episode=null,title,year,apiKey,accessToken,fetcher=fetch}){
  const endpoint=mediaType==='tv'?'/tv/'+Number(tmdbId)+'/external_ids':'/movie/'+Number(tmdbId)+'/external_ids';
  const ids=await tmdbJson(endpoint,{apiKey,accessToken,fetcher});
  const imdbId=String(ids.imdb_id||'');
  if(!/^tt\d{5,12}$/.test(imdbId))throw new Error('TMDB did not provide a valid IMDb ID for subtitle search');
  const type=mediaType==='tv'?'series':'movie';
  const data=await fetchJson('https://opensubtitles-v3.strem.io/subtitles/'+type+'/'+imdbId+'.json',fetcher);
  const rows=(data.subtitles||[]).filter(row=>
    ['eng','en'].includes(String(row.lang||'').toLowerCase())&&
    /^\d{1,20}$/.test(String(row.id||''))&&validStremioUrl(row.url)
  );
  const exact=mediaType==='tv'?rows.filter(row=>
    Number(row.season??row.season_number)===Number(season)&&
    Number(row.episode??row.episode_number)===Number(episode)
  ):rows;
  if(!exact.length)throw new Error('No English external subtitle matched this exact movie/TV episode');
  const wanted=titleToken(title),yearText=String(year||'');
  const scored=exact.map(row=>{
    const label=String(row.subtitleFileName||row.movieReleaseName||'');
    const norm=titleToken(label);
    let score=0;
    if(wanted&&norm.includes(wanted))score+=5;
    if(yearText&&label.includes(yearText))score+=2;
    if(!/[-.]HI\b/i.test(label))score+=1;
    return {row,score,label};
  }).sort((a,b)=>b.score-a.score);
  const best=scored[0];
  const ties=scored.filter(item=>item.score===best.score);
  if(ties.length!==1)throw new Error('External subtitle candidates are ambiguous; exact release match is required');
  if(best.score<3)throw new Error('External subtitle release does not match the work title/year with sufficient confidence');
  const response=await fetcher(best.row.url,{redirect:'error',signal:AbortSignal.timeout(30000),headers:{Accept:'text/plain,text/vtt,*/*'}});
  if(!response.ok)throw new Error('External subtitle download failed: HTTP '+response.status);
  const raw=await response.text();
  if(raw.length>20_000_000)throw new Error('External subtitle file exceeds the safe size limit');
  const vtt=raw.trimStart().startsWith('WEBVTT')?raw:core.toVtt(raw);
  if(!String(vtt).trimStart().startsWith('WEBVTT'))throw new Error('External subtitle format could not be normalized to WebVTT');
  const cues=parseVtt(vtt);
  const validated=validateSubtitleCues(cues,{sourceKind:'external-opensubtitles'});
  return {
    ...validated,
    imdbId,
    subtitleId:String(best.row.id),
    label:core.clean(best.label),
    releaseMatchScore:best.score,
    subtitleVersionStatus:'likely-matched',
    provenance:'OpenSubtitles Stremio public catalogue; exact TMDB-to-IMDb identity and title/year/season/episode matched'
  };
}
module.exports={validStremioUrl,findExternalSubtitle};
