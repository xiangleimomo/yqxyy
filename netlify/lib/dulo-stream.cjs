// Resolve only Dulo's public per-film lookup; never retain temporary viewer URLs.
const films=require('../../data/movie-hub-catalog.json').films;
let runtime;
async function readLimited(response,limit){
 if(!response.ok)throw Error('影片线路服务暂不可用');
 const reader=response.body.getReader(),chunks=[];let size=0;
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw Error('线路响应过大');}chunks.push(value);}
 return Buffer.concat(chunks).toString('utf8');
}
async function resolveMovie(id,{fetcher=fetch}={}){
 const film=films.find(row=>row.id===id);if(!film||!Number.isSafeInteger(film.tmdbId)||film.tmdbId<1)throw Error('影片编号无效');
 if(!runtime||runtime.expires<Date.now()){
  const response=await fetcher('https://dulo.mov/dulo-config.js',{signal:AbortSignal.timeout(4000),redirect:'error',headers:{Accept:'text/javascript'}}),text=await readLimited(response,64000);
  const domain=/WORKER_DOMAIN\s*:\s*['"]([a-z0-9-]+\.workers\.dev)['"]/i.exec(text)?.[1]?.toLowerCase();
  if(!domain)throw Error('暂未获取到有效的播放线路配置');runtime={domain,expires:Date.now()+60000};
 }
 const domain=runtime.domain,response=await fetcher('https://zcdn1.'+domain+'/cdn?tmdb='+film.tmdbId+'&type=movie',{signal:AbortSignal.timeout(6000),redirect:'error',headers:{Accept:'application/json'}}),data=JSON.parse(await readLimited(response,64000));
 if(data.ready!==true||typeof data.url!=='string')throw Error('本片暂未返回可用直链，请稍后重试');
 let url;try{url=new URL(data.url);}catch{throw Error('视频线路格式无效');}
 if(url.protocol!=='https:'||!['zcdn1','zcdn2','zcdn3'].some(host=>url.hostname===host+'.'+domain)||url.port||url.username||url.password||url.hash||!/^\/play\/[A-Za-z0-9._-]{1,160}\/(?:master\.m3u8|~[A-Za-z0-9._-]{1,160})$/.test(url.pathname)||[...url.searchParams].some(([key,value])=>key!=='_rb'||!/^[A-Za-z0-9._~-]{1,128}$/.test(value)))throw Error('视频线路校验失败');
 if(data.rb!==undefined){if(typeof data.rb!=='string'||!/^[A-Za-z0-9._~-]{1,128}$/.test(data.rb))throw Error('播放授权参数无效');url.searchParams.set('_rb',data.rb);}
 return {id:film.id,title:film.titleZh||film.title,url:url.href,temporary:true};
}
module.exports={resolveMovie};
