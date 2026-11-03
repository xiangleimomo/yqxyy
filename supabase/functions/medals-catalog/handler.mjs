let cached=null,expires=0;
export async function handleMedalCatalog(req,{env,fetcher=fetch}={}){
 const origin=req.headers.get('origin')||'',allowed=origin==='https://yqxyy.netlify.app'||/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin),headers={'Cache-Control':'no-store',Vary:'Origin',...(allowed?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'}:{})},json=(data,status=200)=>Response.json(data,{status,headers});
 if(origin&&!allowed)return json({error:'请求来源无效'},403);if(req.method==='OPTIONS')return new Response(null,{status:204,headers});if(req.method!=='POST')return json({error:'请求方式无效'},405);
 const authorization=req.headers.get('authorization')||'';if(!/^Bearer \S+$/.test(authorization))return json({error:'请先登录'},401);
 const project=env('SUPABASE_URL'),apikey=env('SUPABASE_ANON_KEY'),secret=env('SUPABASE_SERVICE_ROLE_KEY');
 try{
  const auth=await fetcher(project+'/auth/v1/user',{headers:{authorization,apikey},signal:AbortSignal.timeout(10000)});if(!auth.ok)return json({error:'登录已失效'},401);const user=await auth.json();if(!user.id)return json({error:'登录已失效'},401);
  const me=await fetcher(project+'/rest/v1/rpc/sf_medals',{method:'POST',headers:{authorization,apikey,'Content-Type':'application/json'},body:JSON.stringify({p_action:'dashboard',p_payload:{}}),signal:AbortSignal.timeout(10000)});if(!me.ok)return json({error:'身份校验失败'},403);const state=await me.json();if(!state.admin&&state.role!=='parent')return json({error:'仅家长或管理员可配置作品关联'},403);
  if(Number(req.headers.get('content-length'))>2000)return json({error:'请求过大'},413);const text=await req.text();if(text.length>2000)return json({error:'请求过大'},413);const input=JSON.parse(text);
  if(!/^(book|magazine|movie|series|episode):[a-z0-9-]+(:[0-9]+)?$/.test(input.key||''))return json({error:'作品编号无效'},400);
  if(input.include_episodes&&!state.admin)return json({error:'仅管理员可设置全集规则'},403);
  if(!cached||expires<Date.now()){const response=await fetcher('https://yqxyy.netlify.app/data/medal-resources.json',{signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error();cached=await response.json();expires=Date.now()+60000;}
  let resource=cached.find(row=>row.key===input.key);
  if(input.key.startsWith('book:')||input.key.startsWith('magazine:')){
   const id=input.key.split(':')[1],response=await fetcher(project+'/rest/v1/story_books?select=id,title,title_zh,content_kind&id=eq.'+encodeURIComponent(id),{headers:{apikey},signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error();const rows=await response.json();
   if(rows.length){const row=rows[0],kind=row.content_kind==='magazine'?'magazine':'book';if(!input.key.startsWith(kind+':'))return json({error:'作品类型不符'},400);resource={key:input.key,type:kind,id:row.id,title:row.title_zh||row.title,href:(kind==='magazine'?'#/magazine-reader/':'#/reader/')+row.id};}
   const shelf=await fetcher(project+'/rest/v1/story_book_shelf?select=deleted&id=eq.'+encodeURIComponent(id),{headers:{apikey},signal:AbortSignal.timeout(10000)});if(!shelf.ok)throw Error();if((await shelf.json()).some(row=>row.deleted))return json({error:'作品已下架'},404);
  }
  if(!resource||resource.active===false)return json({error:'未找到已开放的真实作品'},404);
  const items=[];if(resource.parent_key){const parent=cached.find(row=>row.key===resource.parent_key);if(parent)items.push(parent);}items.push(resource);
  if(input.include_episodes&&resource.type==='series')items.push(...cached.filter(row=>row.parent_key===resource.key&&row.active!==false));
  const response=await fetcher(project+'/rest/v1/rpc/sf_medals_service',{method:'POST',headers:{Authorization:'Bearer '+secret,apikey:secret,'Content-Type':'application/json'},body:JSON.stringify({p_action:'catalog_put',p_payload:{items}}),signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error();return json({key:resource.key,indexed:items.length});
 }catch{return json({error:'作品目录暂不可用，请稍后重试'},400);}
}
