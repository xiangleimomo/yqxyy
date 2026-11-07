'use strict';

function normalize(value){return String(value||'').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g,'');}
async function tmdbJson(path,{apiKey=process.env.TMDB_API_KEY,accessToken=process.env.TMDB_READ_ACCESS_TOKEN,fetcher=fetch}={}){
  if(!apiKey&&!accessToken)throw new Error('TMDB_API_KEY or TMDB_READ_ACCESS_TOKEN is required to enumerate every TV season and episode');
  const url=new URL('https://api.themoviedb.org/3'+path);
  if(apiKey)url.searchParams.set('api_key',apiKey);
  const headers={Accept:'application/json'};
  if(accessToken)headers.Authorization='Bearer '+accessToken;
  const response=await fetcher(url.href,{headers,redirect:'error',signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error('TMDB request failed: HTTP '+response.status+' for '+path);
  const data=await response.json();
  if(!data||typeof data!=='object')throw new Error('TMDB returned invalid JSON for '+path);
  return data;
}
async function expandTvSeries({tmdbId,title,titleZh='',year=null,apiKey,accessToken,fetcher=fetch}={}){
  const id=Number(tmdbId);
  if(!Number.isSafeInteger(id)||id<1)throw new Error('TV series requires a valid TMDB ID');
  const details=await tmdbJson('/tv/'+id,{apiKey,accessToken,fetcher});
  if(Number(details.id)!==id)throw new Error('TMDB series ID mismatch');
  const tmdbTitle=String(details.name||details.original_name||'').trim();
  if(!tmdbTitle)throw new Error('TMDB series title is missing');
  const firstAirYear=Number(String(details.first_air_date||'').slice(0,4))||null;
  if(year&&firstAirYear&&Math.abs(Number(year)-firstAirYear)>1)throw new Error('TMDB series year does not match the catalogue record');
  if(title&&normalize(title)!==normalize(tmdbTitle)&&normalize(title)!==normalize(details.original_name||'')){
    // Preserve the exact TMDB ID but flag title disagreement rather than silently
    // attaching a different show to a catalogue row.
    throw new Error('TMDB series title does not match the catalogue title');
  }
  const seasons=(details.seasons||[]).filter(season=>Number.isInteger(Number(season.season_number))&&Number(season.episode_count)>0);
  if(!seasons.length)throw new Error('TMDB lists no seasons with episodes');
  const episodes=[];
  for(const season of seasons){
    const seasonNumber=Number(season.season_number);
    const data=await tmdbJson('/tv/'+id+'/season/'+seasonNumber,{apiKey,accessToken,fetcher});
    if(Number(data.id)!==id||Number(data.season_number)!==seasonNumber)throw new Error('TMDB season identity mismatch for season '+seasonNumber);
    const rows=Array.isArray(data.episodes)?data.episodes:[];
    if(rows.length!==Number(season.episode_count))throw new Error('TMDB episode count mismatch in season '+seasonNumber);
    const seen=new Set();
    for(const row of rows){
      const episodeNumber=Number(row.episode_number);
      if(!Number.isInteger(episodeNumber)||episodeNumber<1||seen.has(episodeNumber))throw new Error('Invalid or duplicate episode number in season '+seasonNumber);
      seen.add(episodeNumber);
      episodes.push({
        courseEpisodeId:episodes.length+1,
        key:'tv:'+id+':s'+seasonNumber+':e'+episodeNumber,
        mediaType:'tv',scope:'episode',tmdbId:id,
        title:tmdbTitle,titleZh:titleZh||'',seasonNumber,episodeNumber,
        episodeTitle:String(row.name||'').trim(),
        overview:String(row.overview||'').trim(),
        airDate:row.air_date||null,
        runtime:Number(row.runtime)||Number(details.episode_run_time?.[0])||null,
        stillPath:row.still_path||null,
        status:'queued',stage:'discovered',qualityStatus:'not_started'
      });
    }
  }
  return {
    tmdbId:id,title:tmdbTitle,originalTitle:details.original_name||tmdbTitle,
    firstAirYear,seasonCount:seasons.length,episodeCount:episodes.length,episodes
  };
}
module.exports={tmdbJson,expandTvSeries};
