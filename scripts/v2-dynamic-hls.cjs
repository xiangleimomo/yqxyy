'use strict';

const {duloUrl,fetchBody}=require('./v2-source-resolver.cjs');
const hls=require('./v2-hls.cjs');

function isEnglish(track){
  const language=String(track?.LANGUAGE||'').toLowerCase();
  const name=String(track?.NAME||'').toLowerCase();
  return /^(en|eng)(-|$)/.test(language)||name.startsWith('english');
}
function assertEpisodeSource(episode){
  const descriptor=episode?.video?.sourceDescriptor;
  if(!descriptor||descriptor.provider!=='dulo')throw new Error('Episode has no approved Dulo source descriptor');
  if(!Number.isSafeInteger(Number(descriptor.tmdbId))||Number(descriptor.tmdbId)<1)throw new Error('Invalid Dulo TMDB identity');
  if(!['movie','tv'].includes(descriptor.mediaType))throw new Error('Invalid Dulo media type');
  if(descriptor.mediaType==='tv'&&(!Number.isInteger(Number(descriptor.season))||!Number.isInteger(Number(descriptor.episode))))throw new Error('TV source descriptor is missing season/episode identity');
  return descriptor;
}
function createDuloTransform(sourceUrl){
  return (raw,base)=>require('../source-lab/core.js').duloHlsRequestUrl(raw,sourceUrl,base);
}
async function resolveDynamicSource(episode,fetcher=fetch){
  const descriptor=assertEpisodeSource(episode);
  const sourceUrl=await duloUrl({
    tmdbId:descriptor.tmdbId,
    mediaType:descriptor.mediaType,
    season:descriptor.season??null,
    episode:descriptor.episode??null,
    fetcher
  });
  const transform=createDuloTransform(sourceUrl);
  const masterText=await fetchBody(sourceUrl,fetcher,'application/vnd.apple.mpegurl,application/x-mpegURL,*/*');
  const master=hls.parseMaster(masterText,sourceUrl,{uriTransform:transform});
  const variant=hls.chooseVariant(master);
  const audioTrack=variant.AUDIO?hls.chooseTrack(master,'AUDIO','en',variant.AUDIO):null;
  if(variant.AUDIO&&(!audioTrack||!isEnglish(audioTrack)))throw new Error('The selected HLS variant has no verified English audio rendition');
  return {sourceUrl,transform,master,variant,audioTrack,masterText};
}
function dynamicPlaylistUrl(siteOrigin,courseId,episodeId,kind){
  const url=new URL('/.netlify/functions/v2-episode-hls',siteOrigin);
  url.searchParams.set('course',courseId);
  url.searchParams.set('episode',String(episodeId));
  url.searchParams.set('kind',kind);
  return url.pathname+url.search;
}
async function renderDynamicEpisodePlaylist({episode,courseId,siteOrigin,kind,fetcher=fetch}){
  const resolved=await resolveDynamicSource(episode,fetcher);
  if(kind==='master'){
    const videoPlaylist=dynamicPlaylistUrl(siteOrigin,courseId,episode.episodeId,'video');
    const audioPlaylist=resolved.audioTrack?dynamicPlaylistUrl(siteOrigin,courseId,episode.episodeId,'audio'):null;
    return {
      body:hls.buildEpisodeMaster({
        videoPlaylist,audioPlaylist,audioTrack:resolved.audioTrack,videoVariant:resolved.variant,version:episode.video.hlsVersion||7
      }),
      contentType:'application/vnd.apple.mpegurl',
      sourceUrlHash:require('node:crypto').createHash('sha256').update(resolved.sourceUrl).digest('hex')
    };
  }
  if(kind!=='video'&&kind!=='audio')throw new Error('Invalid dynamic HLS rendition kind');
  if(kind==='audio'&&!resolved.audioTrack)throw new Error('No separate English audio rendition is available');
  const mediaUrl=kind==='video'?resolved.variant.uri:resolved.audioTrack.uri;
  const text=await fetchBody(mediaUrl,fetcher,'application/vnd.apple.mpegurl,application/x-mpegURL,*/*');
  const media=hls.parseMediaPlaylist(text,mediaUrl,{uriTransform:resolved.transform});
  const start=Number(episode.video.originalStart??0);
  const end=Number(episode.video.originalEnd??media.duration);
  const selection=hls.selectSegments(media,start,end);
  if(kind==='video'&&Number.isFinite(Number(episode.video.timelineOrigin))&&
    Math.abs(selection.timelineOrigin-Number(episode.video.timelineOrigin))>0.25){
    throw new Error('Source segment timeline changed; subtitle/video alignment must be regenerated');
  }
  return {
    body:hls.buildMediaPlaylist(media,selection),
    contentType:'application/vnd.apple.mpegurl',
    timelineOrigin:selection.timelineOrigin,
    segmentCount:selection.segments.length
  };
}
module.exports={isEnglish,assertEpisodeSource,resolveDynamicSource,dynamicPlaylistUrl,renderDynamicEpisodePlaylist};
