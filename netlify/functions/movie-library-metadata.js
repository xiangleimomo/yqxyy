const SOURCE = 'https://streamjuju.cyou/api/search';
const poster = value => typeof value === 'string' && /^\/[A-Za-z0-9._/-]+$/.test(value) ? `https://image.tmdb.org/t/p/w500${value}` : '';

exports.handler = async event => {
  const headers = {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
  if(event.httpMethod !== 'GET') return {statusCode:405,headers,body:JSON.stringify({error:'请使用 GET'})};
  const verify=String(event.queryStringParameters?.verify||'');
  if(verify){
    if(!/^\d{1,12}$/.test(verify)) return {statusCode:400,headers,body:JSON.stringify({error:'TMDB ID 无效'})};
    try{
      // Some providers reject HEAD requests from serverless networks even though their embed page is playable.
      // Read only the response headers/body stream; this does not fetch or store any video media.
      const response=await fetch(`https://player.vidmario.net/embed/movie/${verify}?server=Pythagoras`,{headers:{Accept:'text/html,application/xhtml+xml','User-Agent':'Mozilla/5.0'},signal:AbortSignal.timeout(10000),redirect:'follow'});
      if(!response.ok) throw Error('unavailable');
      return {statusCode:200,headers,body:JSON.stringify({playbackAvailable:true})};
    }catch{return {statusCode:422,headers,body:JSON.stringify({playbackAvailable:false,error:'现有播放架构暂未匹配到本片，请换一个搜索结果或稍后重试。'})};}
  }
  const query=String(event.queryStringParameters?.q||'').trim();
  if(!query || query.length>80) return {statusCode:400,headers,body:JSON.stringify({error:'请输入 1–80 个字符的影片名称'})};
  try{
    const url=new URL(SOURCE);url.searchParams.set('q',query);
    const response=await fetch(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(10000),redirect:'error'});
    if(!response.ok) throw Error(`元数据服务返回 ${response.status}`);
    const body=await response.json();
    const results=Array.isArray(body?.results)?body.results:[];
    return {statusCode:200,headers,body:JSON.stringify({results:results.slice(0,20).flatMap(item=>{
      const tmdbId=Number(item?.id),mediaType=item?.media_type;
      if(!Number.isSafeInteger(tmdbId)||tmdbId<1||!['movie','tv'].includes(mediaType)) return [];
      const date=String(item.release_date||item.first_air_date||'');
      return [{tmdbId,mediaType,title:String(item.title||item.name||'').slice(0,220),titleZh:String(item.original_title||item.original_name||'').slice(0,220),year:/^\d{4}/.test(date)?Number(date.slice(0,4)):null,posterUrl:poster(item.poster_path),overview:String(item.overview||'').slice(0,4000)}];
    })})};
  }catch(error){return {statusCode:502,headers,body:JSON.stringify({error:'影片元数据暂时无法获取，请稍后重试。'})};}
};
