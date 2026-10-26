import { createClient } from '@supabase/supabase-js';
const headers = {'Access-Control-Allow-Origin':'https://yqxyy.netlify.app','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json'};
const reply = (code: number, data: unknown) => new Response(JSON.stringify(data),{status:code,headers});
async function publicJSON(path: string) {
 const r=await fetch('https://yqxyy.netlify.app/data/'+path,{signal:AbortSignal.timeout(15000),redirect:'error'});
 if(!r.ok) throw Error('课程内容暂时无法读取');
 const raw=await r.text(); if(raw.length>4000000) throw Error('课程内容过大');
 return JSON.parse(raw);
}
Deno.serve(async req=>{
 if(req.method==='OPTIONS') return new Response('ok',{headers});
 if(req.method!=='POST') return reply(405,{error:'请使用 POST'});
 try {
  const authorization=req.headers.get('Authorization');
  if(!authorization?.startsWith('Bearer ')) return reply(401,{error:'请先登录'});
  const url=Deno.env.get('SUPABASE_URL')!;
  const userClient=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
  const {data:auth,error:authError}=await userClient.auth.getUser();
  if(authError||!auth.user) return reply(401,{error:'登录已过期，请重新登录'});
  const length=Number(req.headers.get('Content-Length')||0); if(length>1000) return reply(413,{error:'请求过大'});
  const raw=await req.text(); if(raw.length>1000) return reply(413,{error:'请求过大'});
  const body=JSON.parse(raw), series=String(body.series_id||''), episode=Number(body.episode_id);
  if(!/^[a-z0-9][a-z0-9-]{0,99}$/.test(series)||!Number.isInteger(episode)||episode<1||episode>10000) return reply(400,{error:'课程编号无效'});
  const {data:dash,error:dashError}=await userClient.rpc('sf_family',{p_action:'dashboard',p_payload:{}});
  if(dashError||!dash?.profile) return reply(403,{error:'请先设置家庭身份'});

  const [info,episodes]=await Promise.all([publicJSON(series+'/series.json'),publicJSON(series+'/episodes.json')]);
  const row=episodes.find((e:{episodeId:number})=>Number(e.episodeId)===episode);
  if(!row||['draft','coming','locked'].includes(row.status)) return reply(400,{error:'本集尚未发布'});
  const modules=[];
  if(row.modules?.watch||row.video?.hlsUrl||row.video?.embedUrl||row.video?.directUrl) modules.push('watch');
  if(row.modules?.read) modules.push('read');
  if(row.modules?.words||row.modules?.vocabulary) modules.push('words');
  const answers:Record<string,string>={};
  if(row.modules?.quiz){
   const quizzes=await publicJSON(series+'/quiz.json');
   for(const q of quizzes[String(episode)]?.questions||[]) {
    if(typeof q.id==='string'&&q.options?.some((o:{key:string})=>o.key===q.answer)) answers[q.id]=q.answer;
   }
   if(Object.keys(answers).length)modules.push('quiz');
  }
  const admin=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
  const {error}=await admin.rpc('sf_family_catalog_put',{p_lesson:{series_id:series,episode_id:episode,series_title:info.seriesTitle||info.title||series,title:row.title||'Episode '+episode,modules,quiz_answers:answers}});
  if(error) throw Error('课程准备失败，请稍后再试');
  return reply(200,{modules,title:row.title,series_title:info.seriesTitle||info.title||series});
 }catch(e){return reply(400,{error:e instanceof Error?e.message:'课程准备失败'});}
});
