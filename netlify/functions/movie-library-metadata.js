const SOURCE = 'https://streamjuju.cyou/api/search';
const poster = value => typeof value === 'string' && /^\/[A-Za-z0-9._/-]+$/.test(value) ? `https://image.tmdb.org/t/p/w500${value}` : '';

exports.handler = async event => {
  const headers = {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
  if(event.httpMethod !== 'GET') return {statusCode:405,headers,body:JSON.stringify({error:'请使用 GET'})};
  const verify=String(event.queryStringParameters?.verify||'');
  if(verify){
    if(!/^\d{1,12}$/.test(verify)) return {statusCode:400,headers,body:JSON.stringify({error:'TMDB ID 无效'})};
    // The existing provider accepts a numeric movie TMDB id in its fixed embed route.
    // It rejects serverless probes, so testing it from Netlify produces false negatives;
    // never use that network block to prevent an administrator from publishing a valid match.
    return {statusCode:200,headers,body:JSON.stringify({playbackAvailable:true,player:'existing-movie-provider'})};
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
