export async function handlePoneUpload(req, { env, fetcher = fetch } = {}) {
  const origin = req.headers.get('origin') || '';
  const allowed = origin === 'https://yqxyy.netlify.app' || /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);
  const headers = { 'Content-Type':'application/json', 'Cache-Control':'no-store', Vary:'Origin', ...(allowed ? {'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS'} : {}) };
  const json = (value,status=200)=>Response.json(value,{status,headers});
  if(origin && !allowed)return json({error:'请求来源无效。'},403);
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(req.method!=='POST')return json({error:'仅支持上传。'},405);
  const authorization=req.headers.get('authorization')||'';
  if(!/^Bearer \S+$/.test(authorization))return json({error:'请先登录。'},401);
  const kind=new URL(req.url).searchParams.get('kind')||'pdf';
  const extensions={pdf:'pdf',audio:'mp3|m4a|wav|ogg|aac|flac',video:'mp4|webm|mov',image:'jpg|jpeg|png|webp|gif|avif'};
  if(!extensions[kind])return json({error:'文件类型无效。'},400);
  try {
    const project=env('SUPABASE_URL'), apikey=env('SUPABASE_ANON_KEY');
    const auth=await fetcher(project+'/auth/v1/user',{headers:{authorization,apikey},signal:AbortSignal.timeout(10000)});
    if(!auth.ok)return json({error:'登录已过期。'},401);
    const user=await auth.json();
    if(!user.id)return json({error:'登录已过期。'},401);
    if(user.app_metadata?.site_admin!==true){
      const access=await fetcher(project+'/rest/v1/rpc/book_portal',{method:'POST',headers:{authorization,apikey,'Content-Type':'application/json'},body:JSON.stringify({p_action:'access',p_payload:{}}),signal:AbortSignal.timeout(10000)});
      if(!access.ok || !(await access.json()).can_upload)return json({error:'请使用已设置账号昵称的家长账号。'},403);
    }
    const contentType=req.headers.get('content-type')||'';
    if(!/^multipart\/form-data;\s*boundary=/i.test(contentType))return json({error:'请选择文件。'},400);
    const max=1024**3+65536;
    if(Number(req.headers.get('content-length'))>max)return json({error:'文件不能超过 1 GiB。'},413);
    let bytes=0;
    // The body remains a stream: no local file, Storage bucket, or database blob.
    const body=req.body.pipeThrough(new TransformStream({transform(chunk,controller){bytes+=chunk.byteLength;if(bytes>max)throw Error('too large');controller.enqueue(chunk);}}));
    const upstream=await fetcher('https://pone.rs/upload',{method:'POST',headers:{'Content-Type':contentType},body,duplex:'half',signal:AbortSignal.timeout(130000),redirect:'error'});
    if(!upstream.ok)return json({error:'文件上传失败，请重试。'},502);
    const result=await upstream.json(), url=result.files?.[0]?.url;
    if(!result.success || result.files?.length!==1 || !new RegExp('^https://u\\.pone\\.rs/[A-Za-z0-9]+\\.('+extensions[kind]+')$','i').test(url||''))throw Error('invalid Pone response');
    return json({url});
  }catch{return json({error:'上传超时或连接中断，请重试。'},502);}
}
