'use strict';

const fs=require('node:fs');
const path=require('node:path');
const {renderDynamicEpisodePlaylist}=require('../../scripts/v2-dynamic-hls.cjs');

const headers={
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Methods':'GET, OPTIONS',
  'Access-Control-Allow-Headers':'Content-Type, Range',
  'Access-Control-Expose-Headers':'Content-Length, Content-Range',
  'Cache-Control':'no-store, max-age=0',
  'Vary':'Origin'
};
function response(statusCode,body,contentType='application/json'){
  return {statusCode,headers:{...headers,'Content-Type':contentType},body};
}
function readEpisode(course,episodeId){
  if(!/^(movie-[a-z0-9-]+|tv-[0-9]+)$/.test(course))throw new Error('Invalid course ID');
  const file=path.resolve(__dirname,'../../data',course,'episodes.json');
  const root=path.resolve(__dirname,'../../data')+path.sep;
  if(!file.startsWith(root)||!fs.existsSync(file))throw new Error('Course not found');
  const episodes=JSON.parse(fs.readFileSync(file,'utf8'));
  const episode=episodes.find(row=>Number(row.episodeId)===episodeId);
  if(!episode)throw new Error('Episode not found');
  return episode;
}
exports.handler=async event=>{
  if(event.httpMethod==='OPTIONS')return response(204,'','text/plain');
  if(event.httpMethod!=='GET')return response(405,JSON.stringify({error:'Method not allowed'}));
  try{
    const params=event.queryStringParameters||{};
    const course=String(params.course||'');
    const episodeId=Number(params.episode);
    const kind=String(params.kind||'master');
    if(!Number.isSafeInteger(episodeId)||episodeId<1)throw new Error('Invalid episode number');
    const episode=readEpisode(course,episodeId);
    if(episode.video?.hlsMode!=='dynamic-dulo')throw new Error('This episode does not use dynamic Dulo playback');
    const origin=event.headers?.origin||event.headers?.Origin||'https://yqxyy.netlify.app';
    const result=await renderDynamicEpisodePlaylist({episode,courseId:course,siteOrigin:origin,kind});
    return response(200,result.body,result.contentType);
  }catch(error){
    const message=String(error.message||'Dynamic HLS failed').slice(0,300);
    const status=/not found/i.test(message)?404:/invalid|does not use/i.test(message)?400:/timeline changed/i.test(message)?409:503;
    return response(status,JSON.stringify({error:message}));
  }
};
