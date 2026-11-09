'use strict';
// Lightweight public embed reachability check. No browser, decryption or media proxy.
// This does NOT claim to discover a direct M3U8 URL.
const ORIGIN='https://111movies.net';
const json=(statusCode,data)=>({statusCode,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'},body:JSON.stringify(data)});
exports.handler=async event=>{
  if(event.httpMethod!=='GET')return json(405,{error:'GET required'});
  const q=event.queryStringParameters||{};
  const id=String(q.tmdbId||'');
  const type=q.type==='tv'?'tv':q.type==='movie'?'movie':'';
  if(!/^\d{1,12}$/.test(id)||!type)return json(400,{error:'Invalid TMDB ID or type'});
  const season=String(q.season||'1'),episode=String(q.episode||'1');
  if(type==='tv'&&(!/^[1-9]\d{0,3}$/.test(season)||!/^[1-9]\d{0,3}$/.test(episode)))return json(400,{error:'Invalid episode'});
  const path=type==='movie'?'/movie/'+id:'/tv/'+id+'/'+season+'/'+episode;
  const embedUrl=ORIGIN+path;
  try{
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),6500);
    let response;
    try{
      response=await fetch(embedUrl,{method:'GET',headers:{accept:'text/html'},redirect:'manual',signal:controller.signal});
    }finally{clearTimeout(timeout);}
    const contentType=response.headers.get('content-type')||'';
    return json(200,{source:'111movies',embedUrl,httpStatus:response.status,htmlResponse:response.ok&&contentType.includes('text/html'),directM3u8:null,note:'仅检查公开嵌入页面可访问性，不代表视频可播放或已获取 M3U8'});
  }catch(error){
    return json(200,{source:'111movies',embedUrl,htmlResponse:false,directM3u8:null,error:'云端无法访问嵌入页面或请求超时',note:'不影响管理员发布'});
  }
};
