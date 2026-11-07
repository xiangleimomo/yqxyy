'use strict';

const crypto=require('node:crypto');
const core=require('../source-lab/core.js');
const hls=require('./v2-hls.cjs');
const subtitles=require('./v2-subtitles.cjs');

function assertPublicHttps(raw){
  const u=new URL(raw);
  const host=u.hostname.toLowerCase();
  if(u.protocol!=='https:'||u.username||u.password||host==='localhost'||host.endsWith('.local')||
    /^(127\.|10\.|192\.168\.|169\.254\.)/.test(host)||/^172\.(1[6-9]|2\d|3[01])\./.test(host)||host==='::1'){
    throw new Error('Source URL is not an allowed public HTTPS address');
  }
  return u.href;
}
async function fetchBody(url,fetcher=fetch,accept='*/*'){
  const safe=assertPublicHttps(url);
  const response=await fetcher(safe,{headers:{Accept:accept,'User-Agent':'yqxyy-v2-course-engine/1.0'},redirect:'error',signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error('Source fetch failed: HTTP '+response.status);
  const text=await response.text();
  if(text.length>20_000_000)throw new Error('Source playlist exceeds the safe size limit');
  return text;
}
function hashUrl(url){return crypto.createHash('sha256').update(String(url)).digest('hex');}
function isEnglishTrack(track){
  const language=String(track?.LANGUAGE||'').toLowerCase();
  const name=String(track?.NAME||'').toLowerCase();
  return /^(en|eng)(-|$)/.test(language)||name.startsWith('english');
}
async function duloUrl({tmdbId,mediaType,season,episode,fetcher=fetch}){
  const url=new URL('/cdn',core.duloCdnOrigin);
  url.searchParams.set('tmdb',String(tmdbId));
  url.searchParams.set('type',mediaType==='tv'?'tv':'movie');
  if(mediaType==='tv'){
    if(!Number.isInteger(season)||season<0||!Number.isInteger(episode)||episode<1)throw new Error('TV source lookup requires an exact season and episode');
    url.searchParams.set('season',String(season));
    url.searchParams.set('episode',String(episode));
  }
  const raw=await fetchBody(url.href,fetcher,'application/json');
  let data;try{data=JSON.parse(raw);}catch{throw new Error('Dulo source lookup returned invalid JSON');}
  if(data.ready!==true)throw new Error('Dulo source is not ready for this work item');
  const source=core.duloMediaUrl(data.url||'');
  if(!source||!core.duloMediaUrl(source))throw new Error('Dulo did not return an allowed direct HLS media URL');
  if(typeof data.rb!=='string'||!/^[A-Za-z0-9._~-]{1,128}$/.test(data.rb))throw new Error('Dulo handoff token is missing or invalid');
  const signed=new URL(source);signed.searchParams.set('_rb',data.rb);
  return signed.href;
}
function sourceTransform(sourceUrl,provider){
  if(provider!=='dulo')return null;
  return (raw,base)=>core.duloHlsRequestUrl(raw,sourceUrl,base);
}
async function inspectHlsSource({sourceUrl,provider='existing',descriptor,fetcher=fetch}){
  sourceUrl=assertPublicHttps(sourceUrl);
  const transform=sourceTransform(sourceUrl,provider);
  const masterText=await fetchBody(sourceUrl,fetcher,'application/vnd.apple.mpegurl,application/x-mpegURL,*/*');
  const master=hls.parseMaster(masterText,sourceUrl,{uriTransform:transform||undefined});
  const variant=hls.chooseVariant(master);
  const videoText=master.kind==='media'?masterText:await fetchBody(variant.uri,fetcher,'application/vnd.apple.mpegurl,application/x-mpegURL,*/*');
  const video=hls.parseMediaPlaylist(videoText,variant.uri,{uriTransform:transform||undefined});
  let audioTrack=null,audio=null;
  if(variant.AUDIO){
    audioTrack=hls.chooseTrack(master,'AUDIO','en',variant.AUDIO);
    if(!audioTrack||!isEnglishTrack(audioTrack))throw new Error('Selected video variant has no verified English audio rendition');
    const audioText=await fetchBody(audioTrack.uri,fetcher,'application/vnd.apple.mpegurl,application/x-mpegURL,*/*');
    audio=hls.parseMediaPlaylist(audioText,audioTrack.uri,{uriTransform:transform||undefined});
    if(Math.abs(audio.duration-video.duration)>2.5)throw new Error('Audio/video playlist durations differ by more than 2.5 seconds');
  }
  const subtitleCandidate=variant.SUBTITLES?hls.chooseTrack(master,'SUBTITLES','en',variant.SUBTITLES):hls.chooseTrack(master,'SUBTITLES','en');
  const subtitleTrack=isEnglishTrack(subtitleCandidate)?subtitleCandidate:null;
  let subtitle=null;
  if(subtitleTrack){
    subtitle=await subtitles.acquireSubtitleTrack({url:subtitleTrack.uri,fetcher});
    if(subtitle.lastCueAt>video.duration+120)throw new Error('English subtitle timestamps exceed the source video duration');
    if(subtitle.cueCount<5)throw new Error('English subtitle track has too few cues to represent a full film/episode');
  }
  const resolution=variant.RESOLUTION||null;
  const codecs=variant.CODECS||null;
  const encrypted=video.segments.some(segment=>segment.key&&segment.key!=='#EXT-X-KEY:METHOD=NONE');
  return {
    sourceUrl,provider,descriptor:descriptor||null,
    master,variant,video,audio,audioTrack,subtitleTrack,subtitle,
    report:{
      checkedAt:new Date().toISOString(),
      provider,
      descriptor:descriptor||null,
      sourceUrlHash:hashUrl(sourceUrl),
      sourceUrlStored:provider!=='dulo',
      resolution,
      codecs,
      audioLanguage:audioTrack?.LANGUAGE||'embedded-unverified',
      subtitleTrack:subtitleTrack?.NAME||null,
      subtitleLanguage:subtitleTrack?.LANGUAGE||null,
      subtitleCueCount:subtitle?.cueCount||0,
      subtitleSourceKind:subtitle?.sourceKind||null,
      durationSeconds:video.duration,
      videoSegments:video.segments.length,
      audioSegments:audio?.segments.length||0,
      videoEncrypted:encrypted,
      encryption:encrypted?'AES-128':'none',
      actualMediaDecode:'not_tested'
    }
  };
}
async function resolveEpisodeSource({tmdbId,mediaType='movie',season=null,episode=null,existingHlsUrl=null,allowObj2Candidate=true,fetcher=fetch}){
  const failures=[];
  const candidates=[];
  if(existingHlsUrl)candidates.push({url:existingHlsUrl,provider:'existing'});
  if(allowObj2Candidate&&mediaType==='movie'&&Number.isSafeInteger(Number(tmdbId))&&Number(tmdbId)>0){
    candidates.push({url:'https://api.obj2.top/hls/movie/'+Number(tmdbId)+'/master.m3u8',provider:'obj2'});
  }
  for(const candidate of candidates){
    try{
      return await inspectHlsSource({sourceUrl:candidate.url,provider:candidate.provider,descriptor:{tmdbId,mediaType,season,episode},fetcher});
    }catch(error){failures.push(candidate.provider+': '+String(error.message).slice(0,180));}
  }
  try{
    const url=await duloUrl({tmdbId,mediaType,season,episode,fetcher});
    const result=await inspectHlsSource({sourceUrl:url,provider:'dulo',descriptor:{tmdbId,mediaType,season,episode},fetcher});
    // The signed URL is transient. Callers must persist only report.descriptor
    // and report.sourceUrlHash, never result.sourceUrl or transformed playlist URLs.
    result.requiresDynamicPlayback=true;
    result.sourceDescriptor={provider:'dulo',tmdbId:Number(tmdbId),mediaType,season,episode};
    return result;
  }catch(error){failures.push('dulo: '+String(error.message).slice(0,180));}
  throw new Error('No verified HLS source found. '+failures.join(' | '));
}
module.exports={assertPublicHttps,fetchBody,duloUrl,inspectHlsSource,resolveEpisodeSource,hashUrl,isEnglishTrack};
