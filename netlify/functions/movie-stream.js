const {resolveMovie}=require('../lib/dulo-stream.cjs');
exports.handler=async event=>{
 const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','Netlify-CDN-Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 if(event.httpMethod!=='GET')return {statusCode:405,headers,body:JSON.stringify({error:'请使用 GET'})};
 const id=event.queryStringParameters?.id;if(typeof id!=='string'||!/^[a-z0-9-]{1,100}$/.test(id))return {statusCode:400,headers,body:JSON.stringify({error:'影片编号无效'})};
 try{return {statusCode:200,headers,body:JSON.stringify(await resolveMovie(id))};}
 catch(error){return {statusCode:502,headers,body:JSON.stringify({error:error.name==='TimeoutError'?'获取影片线路超时，请重试':error.message||'获取影片线路失败'})};}
};
