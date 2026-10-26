-- Extend family assignments with free-text homework and private attachments.
alter table sf_family_private.assignments alter column lesson_key drop not null;
alter table sf_family_private.assignments alter column modules set default '{}';
alter table sf_family_private.assignments add column kind text not null default 'course' check(kind in ('course','general'));
alter table sf_family_private.assignments add column attachments jsonb not null default '[]';
alter table sf_family_private.assignments add column links jsonb not null default '[]';
alter table sf_family_private.assignments add column links_text text not null default '' check(length(links_text)<=3000);
alter table sf_family_private.assignments add constraint family_assignment_shape check((kind='course' and lesson_key is not null and cardinality(modules)>0) or (kind='general' and lesson_key is null and cardinality(modules)=0));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('family-homework','family-homework',false,10485760,array['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif','application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation','text/plain']);

create function sf_family_private.validate_resources(p_owner uuid,p_files jsonb,p_links jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare f jsonb;
begin
 if jsonb_typeof(p_files)<>'array' or jsonb_array_length(p_files)>5 or jsonb_typeof(p_links)<>'array' or jsonb_array_length(p_links)>10 then raise exception '最多上传 5 个附件、填写 10 个链接'; end if;
 for f in select value from jsonb_array_elements(p_files) loop
  if coalesce(f->>'path','') not like p_owner::text||'/%' or length(coalesce(f->>'name','')) not between 1 and 200 or not exists(select 1 from storage.objects where bucket_id='family-homework' and name=f->>'path' and owner_id=p_owner::text) then raise exception '附件不存在或不属于当前账号'; end if;
 end loop;
 for f in select value from jsonb_array_elements(p_links) loop
  if coalesce(f->>'url','') !~ '^https?://[^/?#@[:space:]]+([/?#][^[:space:]]*)?$' or length(f->>'url')>2000 then raise exception '请填写有效的网页或网盘链接'; end if;
 end loop;
end $$;
revoke all on function sf_family_private.validate_resources(uuid,jsonb,jsonb) from public,anon,authenticated;

create function sf_family_private.file_allowed(p_name text) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (
 split_part(p_name,'/',1)=auth.uid()::text or exists(
 select 1 from sf_family_private.assignments a join sf_family_private.links l on l.parent_id=a.parent_id and l.child_id=a.child_id and l.status='active'
 where (a.parent_id=auth.uid() or a.child_id=auth.uid()) and (
 exists(select 1 from jsonb_array_elements(a.attachments) f where f->>'path'=p_name) or
 exists(select 1 from jsonb_array_elements(coalesce(a.submission->'attachments','[]')) f where f->>'path'=p_name))));
$$;
revoke all on function sf_family_private.file_allowed(text) from public,anon;
grant execute on function sf_family_private.file_allowed(text) to authenticated;
create policy family_homework_upload on storage.objects for insert to authenticated
with check(bucket_id='family-homework' and split_part(name,'/',1)=(select auth.uid())::text);
create policy family_homework_read on storage.objects for select to authenticated
using(bucket_id='family-homework' and sf_family_private.file_allowed(name));

create or replace function sf_family_private.api(p_action text,p_payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 u uuid := auth.uid(); me sf_family_private.profiles%rowtype; a sf_family_private.assignments%rowtype;
 c sf_family_private.catalog%rowtype; inv sf_family_private.invites%rowtype;
 target uuid; token text; mods text[]; v_score int; v_total int; t timestamptz; v_events jsonb; v_progress jsonb; v_quiz jsonb;
 v_id uuid; v_missing text[]; v_status text; v_since timestamptz; result jsonb;
begin
 if u is null then raise exception '请先登录'; end if;
 if jsonb_typeof(p_payload)<>'object' or length(p_payload::text)>20000 then raise exception '请求无效'; end if;
 select * into me from sf_family_private.profiles where user_id=u;
 if p_action='profile' then
  if nullif(btrim(p_payload->>'name'),'') is null or length(p_payload->>'name')>40 or coalesce(p_payload->>'role','') not in ('parent','child') then raise exception '请填写昵称并选择家长或孩子'; end if;
  if me.user_id is not null and me.role<>p_payload->>'role' then raise exception '已设置的身份不能自行更改，请使用独立账号'; end if;
  insert into sf_family_private.profiles(user_id,role,name) values(u,p_payload->>'role',btrim(p_payload->>'name'))
  on conflict(user_id) do update set name=excluded.name;
  return jsonb_build_object('ok',true);
 end if;
 if p_action='dashboard' then
  select jsonb_build_object('profile',case when me.user_id is null then null else jsonb_build_object('id',u,'role',me.role,'name',me.name) end,
   'links',coalesce((select jsonb_agg(jsonb_build_object('parent_id',l.parent_id,'child_id',l.child_id,'status',l.status,'name',p.name,'confirmed_at',l.confirmed_at) order by l.created_at) from sf_family_private.links l join sf_family_private.profiles p on p.user_id=case when l.parent_id=u then l.child_id else l.parent_id end where l.parent_id=u or l.child_id=u),'[]'),
   'assignments',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'parent_id',x.parent_id,'child_id',x.child_id,'title',x.title,'note',x.note,'kind',x.kind,'attachments',x.attachments,'links',x.links,'links_text',x.links_text,'series_id',cat.series_id,'episode_id',cat.episode_id,'series_title',cat.series_title,'episode_title',cat.title,'modules',x.modules,'quiz_min',x.quiz_min,'due_on',x.due_on,'status',x.status,'created_at',x.created_at,'attempt_since',x.attempt_since,'submitted_at',x.submitted_at,'feedback',x.feedback,'submission',x.submission,'child_name',cp.name,'parent_name',pp.name) order by x.created_at desc) from sf_family_private.assignments x left join sf_family_private.catalog cat on cat.lesson_key=x.lesson_key join sf_family_private.profiles cp on cp.user_id=x.child_id join sf_family_private.profiles pp on pp.user_id=x.parent_id where (x.parent_id=u or x.child_id=u) and exists(select 1 from sf_family_private.links l where l.parent_id=x.parent_id and l.child_id=x.child_id and l.status='active')),'[]')) into result;
  return result;
 end if;
 if me.user_id is null then raise exception '请先设置家庭身份'; end if;
 if p_action='invite' then
  if me.role<>'parent' then raise exception '仅家长可以创建绑定码'; end if;
  if (select count(*) from sf_family_private.invites where parent_id=u and created_at>now()-interval '1 hour')>=20 then raise exception '绑定码创建过于频繁，请稍后再试'; end if;
  update sf_family_private.invites set expires_at=now() where parent_id=u and claimed_by is null and expires_at>now();
  token := upper(replace(gen_random_uuid()::text,'-',''));
  insert into sf_family_private.invites(parent_id,token_hash,expires_at) values(u,md5(token),now()+interval '15 minutes');
  return jsonb_build_object('code',token,'expires_at',now()+interval '15 minutes');
 elsif p_action='claim' then
  if me.role<>'child' then raise exception '请使用孩子账号输入绑定码'; end if;
  token := upper(regexp_replace(coalesce(p_payload->>'code',''),'[\s-]','','g'));
  if token !~ '^[A-F0-9]{32}$' then raise exception '绑定码无效或已过期'; end if;
  select * into inv from sf_family_private.invites where token_hash=md5(token) and claimed_by is null and expires_at>now() for update;
  if inv.id is null or inv.parent_id=u then raise exception '绑定码无效或已过期'; end if;
  insert into sf_family_private.links(parent_id,child_id) values(inv.parent_id,u) on conflict do nothing;
  update sf_family_private.invites set claimed_by=u where id=inv.id;
  return jsonb_build_object('ok',true,'message','绑定申请已发送，等待家长确认');
 elsif p_action in ('confirm','unlink') then
  target := (p_payload->>'user_id')::uuid;
  if p_action='confirm' then
   if me.role<>'parent' then raise exception '仅家长可以确认'; end if;
   update sf_family_private.links set status='active',confirmed_at=now() where parent_id=u and child_id=target and status='pending';
  else
   delete from sf_family_private.links where (parent_id=u and child_id=target) or (child_id=u and parent_id=target);
  end if;
  if not found then raise exception '绑定关系不存在或无权限'; end if;
  return jsonb_build_object('ok',true);
 elsif p_action='create' then
  if me.role<>'parent' then raise exception '仅家长可以布置作业'; end if;
  target := (p_payload->>'child_id')::uuid;
  perform 1 from sf_family_private.links where parent_id=u and child_id=target and status='active' for share;
  if not found then raise exception '请先确认亲子绑定'; end if;
  perform sf_family_private.validate_resources(u,coalesce(p_payload->'attachments','[]'),coalesce(p_payload->'links','[]'));
  v_id := coalesce(nullif(p_payload->>'id','')::uuid,gen_random_uuid());
  if exists(select 1 from sf_family_private.assignments where id=v_id and parent_id=u and child_id=target) then return jsonb_build_object('ok',true,'id',v_id); end if;
  if p_payload->>'kind'='general' then
   insert into sf_family_private.assignments(id,parent_id,child_id,title,note,kind,modules,due_on,attachments,links,links_text)
   values(v_id,u,target,btrim(p_payload->>'title'),coalesce(p_payload->>'note',''),'general','{}',nullif(p_payload->>'due_on','')::date,coalesce(p_payload->'attachments','[]'),coalesce(p_payload->'links','[]'),coalesce(p_payload->>'links_text',''));
   return jsonb_build_object('ok',true,'id',v_id);
  end if;
  select * into c from sf_family_private.catalog where lesson_key=(p_payload->>'series_id')||':'||(p_payload->>'episode_id');
  if c.lesson_key is null then raise exception '课程尚未加载，请重新选择课程'; end if;
  mods := array(select distinct jsonb_array_elements_text(p_payload->'modules'));
  if cardinality(mods) not between 1 and 4 or not mods<@array['watch','read','words','quiz']::text[] or not mods<@c.modules then raise exception '请选择本集已开放的学习模块'; end if;
  if 'quiz'=any(mods) and c.quiz_answers='{}' then raise exception '本集暂未提供 Quiz'; end if;
  insert into sf_family_private.assignments(id,parent_id,child_id,title,note,lesson_key,modules,quiz_min,due_on,attachments,links,links_text)
  values(v_id,u,target,btrim(p_payload->>'title'),coalesce(p_payload->>'note',''),c.lesson_key,mods,coalesce((p_payload->>'quiz_min')::int,80),nullif(p_payload->>'due_on','')::date,coalesce(p_payload->'attachments','[]'),coalesce(p_payload->'links','[]'),coalesce(p_payload->>'links_text','')) returning id into v_id;
  return jsonb_build_object('ok',true,'id',v_id);
 elsif p_action='record' then
  if me.role<>'child' then return jsonb_build_object('ignored',true); end if;
  t := (p_payload->>'occurred_at')::timestamptz;
  if t is null or t>now()+interval '5 minutes' or t<now()-interval '30 days' then raise exception '学习记录时间无效'; end if;
  v_id := (p_payload->>'id')::uuid;
  if v_id is null then raise exception '学习记录编号无效'; end if;
  if exists(select 1 from sf_family_private.events where id=v_id and user_id=u) then return jsonb_build_object('ok',true,'duplicate',true); end if;
  if p_payload->>'module'='quiz' then
   select * into c from sf_family_private.catalog where lesson_key=(p_payload->>'series_id')||':'||(p_payload->>'episode_id');
   if c.lesson_key is null or c.quiz_answers='{}' then return jsonb_build_object('needs_catalog',true); end if;
   if jsonb_typeof(p_payload->'answers')<>'object' then raise exception '缺少本次答题内容'; end if;
   select count(*),count(*) filter(where p_payload->'answers'->>key=value) into v_total,v_score from jsonb_each_text(c.quiz_answers);
  end if;
  insert into sf_family_private.events(id,user_id,series_id,episode_id,module,score,total,answers,occurred_at)
  values(v_id,u,p_payload->>'series_id',(p_payload->>'episode_id')::int,p_payload->>'module',v_score,v_total,case when p_payload->>'module'='quiz' then p_payload->'answers' else null end,least(t,now()));
  return jsonb_build_object('ok',true,'score',v_score,'total',v_total);
 elsif p_action='records' then
  target := coalesce(nullif(p_payload->>'child_id','')::uuid,u);
  if target<>u and not exists(select 1 from sf_family_private.links where parent_id=u and child_id=target and status='active') then raise exception '无权查看该孩子的记录'; end if;
  select coalesce(jsonb_agg(to_jsonb(e)-'user_id'-'answers' order by e.received_at desc),'[]') into v_events from (select * from sf_family_private.events where user_id=target order by received_at desc limit 200) e;
  -- Share progress and best scores only; private collections are never returned.
  select progress,quiz_scores into v_progress,v_quiz from public.user_learning_state where user_id=target;
  return jsonb_build_object('events',v_events,'progress',coalesce(v_progress,'{}'),'quiz_scores',coalesce(v_quiz,'{}'));
 elsif p_action in ('submit','review','cancel','task_progress') then
  select * into a from sf_family_private.assignments where id=(p_payload->>'id')::uuid for update;
  if a.id is null or (a.parent_id<>u and a.child_id<>u) or not exists(select 1 from sf_family_private.links where parent_id=a.parent_id and child_id=a.child_id and status='active') then raise exception '作业不存在或无访问权限'; end if;
  if p_action='review' then
   if a.parent_id<>u or a.status<>'submitted' or coalesce(p_payload->>'decision','') not in ('approved','revision') then raise exception '只能审核已提交的作业'; end if;
   update sf_family_private.assignments set status=p_payload->>'decision',feedback=coalesce(p_payload->>'feedback',''),reviewed_at=now(),attempt_since=case when p_payload->>'decision'='revision' then now() else attempt_since end where id=a.id;
   return jsonb_build_object('ok',true);
  elsif p_action='cancel' then
   if a.parent_id<>u or a.status in ('approved','cancelled') then raise exception '该作业不能取消'; end if;
   update sf_family_private.assignments set status='cancelled' where id=a.id;
   return jsonb_build_object('ok',true);
  end if;
  if p_action='submit' then
   if a.child_id<>u or a.status not in ('assigned','revision') then raise exception '该作业不能重复提交'; end if;
   perform sf_family_private.validate_resources(u,coalesce(p_payload->'attachments','[]'),coalesce(p_payload->'links','[]'));
  end if;
  if a.kind='general' then
   if p_action='task_progress' then return jsonb_build_object('done',jsonb_build_object('checkin',a.status in ('submitted','approved'))); end if;
   update sf_family_private.assignments set status='submitted',submitted_at=now(),submission=jsonb_build_object('note',left(coalesce(p_payload->>'note',''),1000),'attachments',coalesce(p_payload->'attachments','[]'),'links',coalesce(p_payload->'links','[]'),'links_text',left(coalesce(p_payload->>'links_text',''),3000)) where id=a.id;
   return jsonb_build_object('ok',true);
  end if;
  select * into c from sf_family_private.catalog where lesson_key=a.lesson_key;
  select coalesce(jsonb_object_agg(m,exists(select 1 from sf_family_private.events e where e.user_id=a.child_id and e.series_id=c.series_id and e.episode_id=c.episode_id and e.module=m and e.occurred_at>=a.attempt_since and e.received_at>=a.attempt_since and (m<>'quiz' or 100.0*e.score/e.total>=a.quiz_min))),'{}') into v_progress from unnest(a.modules) m;
  if p_action='task_progress' then return jsonb_build_object('done',v_progress); end if;
  if a.child_id<>u or a.status not in ('assigned','revision') then raise exception '该作业不能重复提交'; end if;
  select array_agg(key) into v_missing from jsonb_each(v_progress) where value<>'true'::jsonb;
  if cardinality(v_missing)>0 then raise exception '还有任务未完成或 Quiz 未达标'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('module',e.module,'score',e.score,'total',e.total,'occurred_at',e.occurred_at) order by e.received_at desc),'[]') into v_events from (select distinct on(module) * from sf_family_private.events where user_id=u and series_id=c.series_id and episode_id=c.episode_id and occurred_at>=a.attempt_since and received_at>=a.attempt_since and module=any(a.modules) and (module<>'quiz' or 100.0*score/total>=a.quiz_min) order by module,received_at desc) e;
  update sf_family_private.assignments set status='submitted',submitted_at=now(),submission=jsonb_build_object('done',v_progress,'events',v_events,'note',left(coalesce(p_payload->>'note',''),1000),'attachments',coalesce(p_payload->'attachments','[]'),'links',coalesce(p_payload->'links','[]'),'links_text',left(coalesce(p_payload->>'links_text',''),3000)) where id=a.id;
  return jsonb_build_object('ok',true);
 end if;
 raise exception '未知家庭操作';
end $$;

notify pgrst,'reload schema';
