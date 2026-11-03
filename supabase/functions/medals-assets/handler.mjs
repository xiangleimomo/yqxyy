import {validatePng,encryptImage,decryptImage} from './png.mjs';
export async function handleMedalAssets(req,{env,fetcher=fetch}={}){
 const origin=req.headers.get('origin')||'',allowed=origin==='https://yqxyy.netlify.app'||/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);
 const headers={'Cache-Control':'private, no-store',Vary:'Origin',...(allowed?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'GET,POST,OPTIONS'}:{})};
 const json=(data,status=200)=>Response.json(data,{status,headers});
 if(origin&&!allowed)return json({error:'请求来源无效'},403);
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(!['GET','POST'].includes(req.method))return json({error:'请求方式无效'},405);
 const authorization=req.headers.get('authorization')||'';
 if(!/^Bearer \S+$/.test(authorization))return json({error:'请先登录'},401);
 const project=env('SUPABASE_URL'),publicKey=env('SUPABASE_ANON_KEY'),serviceKey=env('SUPABASE_SERVICE_ROLE_KEY');
 try{
  const auth=await fetcher(project+'/auth/v1/user',{headers:{authorization,apikey:publicKey},signal:AbortSignal.timeout(10000)});
  if(!auth.ok)return json({error:'登录已失效'},401);const user=await auth.json();if(!user.id)return json({error:'登录已失效'},401);
  const service=async(action,payload)=>{
   const r=await fetcher(project+'/rest/v1/rpc/sf_medals_service',{method:'POST',headers:{Authorization:'Bearer '+serviceKey,apikey:serviceKey,'Content-Type':'application/json'},body:JSON.stringify({p_action:action,p_payload:{...payload,viewer_id:user.id}}),signal:AbortSignal.timeout(15000)});
   if(!r.ok)throw Error('图片不可用或没有权限');return r.json();
  };
  if(req.method==='GET'){
   const url=new URL(req.url),id=url.searchParams.get('id');if(!/^[a-f0-9-]{36}$/i.test(id||''))return json({error:'素材编号无效'},400);
   const asset=await service('resolve',{id,thumbnail:url.searchParams.get('size')==='thumb'});
   if(!/^https:\/\/u\.pone\.rs\/[A-Za-z0-9]+\.bin$/.test(asset.url||''))throw Error('图片不可用');
   const r=await fetcher(asset.url,{redirect:'error',signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('图片暂不可用');
   const reader=r.body.getReader(),chunks=[];let size=0;try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>4*1024*1024+64)throw Error('图片超出限制');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}
   const cipher=new Uint8Array(size);let offset=0;for(const chunk of chunks){cipher.set(chunk,offset);offset+=chunk.length;}
   const plain=await decryptImage(cipher,asset.key,asset.iv);
   return new Response(plain,{headers:{...headers,'Content-Type':'image/png','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'"}});
  }
  const type=req.headers.get('content-type')||'';if(!/^multipart\/form-data;\s*boundary=/i.test(type))return json({error:'请选择徽章图片'},400);
  const max=6*1024*1024;if(Number(req.headers.get('content-length'))>max)return json({error:'图片文件过大'},413);
  // Check role before consuming the upload; the returned key never leaves this handler.
  const asset=await service('prepare',{});let size=0;
  const body=req.body.pipeThrough(new TransformStream({transform(chunk,controller){size+=chunk.length;if(size>max)throw Error('图片文件过大');controller.enqueue(chunk);}}));
  const form=await new Request(req.url,{method:'POST',headers:{'Content-Type':type},body,duplex:'half'}).formData();
  const full=form.get('full'),thumb=form.get('thumbnail');
  if(!(full instanceof File)||!(thumb instanceof File)||full.type!=='image/png'||thumb.type!=='image/png')return json({error:'只接受经过转换的 PNG 图片'},400);
  let image,small;try{image=await validatePng(await full.arrayBuffer());small=await validatePng(await thumb.arrayBuffer(),{thumbnail:true});if(Math.abs(image.width/image.height-small.width/small.height)>.03)throw Error('缩略图比例不一致');}catch(error){return json({error:error.message},400);}
  const upload=async(png,label)=>{
   const encrypted=await encryptImage(png,asset.key),payload=new FormData();payload.append('files[]',new Blob([encrypted.cipher],{type:'application/octet-stream'}),asset.id+'-'+label+'.bin');
   const r=await fetcher('https://pone.rs/upload',{method:'POST',body:payload,redirect:'error',signal:AbortSignal.timeout(45000)});if(!r.ok)throw Error('Pone 上传失败');const data=await r.json(),url=data.files?.[0]?.url;
   if(!data.success||data.files?.length!==1||!/^https:\/\/u\.pone\.rs\/[A-Za-z0-9]+\.bin$/.test(url||''))throw Error('Pone 未返回有效文件地址');return {url,iv:encrypted.iv};
  };
  const [large,tiny]=await Promise.all([upload(image.bytes,'full'),upload(small.bytes,'thumb')]);
  await service('finalize',{id:asset.id,full_url:large.url,thumb_url:tiny.url,full_iv:large.iv,thumb_iv:tiny.iv,width:image.width,height:image.height});
  return json({id:asset.id,width:image.width,height:image.height});
 }catch{return json({error:req.method==='GET'?'图片不可用或没有访问权限':'图片上传未完成，请检查身份、文件或稍后重试'},req.method==='GET'?403:400);}
}
