begin;
alter table sf_medals_private.work_badges alter column asset_id drop not null;
alter table sf_medals_private.honor_templates alter column asset_id drop not null;
alter table sf_medals_private.work_badges drop constraint work_badges_unlock_rule_check;
alter table sf_medals_private.work_badges add constraint work_badges_unlock_rule_check check(unlock_rule in ('self_report','quiz','series_all','series_quiz','movie_quiz'));
alter table sf_medals_private.work_badges add column required_episodes integer[] not null default '{}';
alter table sf_medals_private.work_badges add column required_count integer not null default 0 check(required_count>=0);
alter table sf_medals_private.work_badges add column quiz_ready_count integer not null default 0 check(quiz_ready_count>=0);
create unique index mainline_medal_resource_idx on sf_medals_private.work_badges(resource_key) where unlock_rule in ('series_quiz','movie_quiz');
create table sf_medals_private.movie_quizzes(
 resource_key text primary key references sf_medals_private.resources(key),questions jsonb not null check(jsonb_typeof(questions)='array' and jsonb_array_length(questions) between 5 and 10),version text not null
);
create table sf_medals_private.movie_quiz_results(
 child_id uuid not null references auth.users(id) on delete cascade,resource_key text not null references sf_medals_private.movie_quizzes(resource_key),
 score integer not null,total integer not null check(total between 5 and 10),version text not null,updated_at timestamptz not null default now(),primary key(child_id,resource_key),check(score between 0 and total)
);
create index movie_quiz_results_resource_idx on sf_medals_private.movie_quiz_results(resource_key);
alter table sf_medals_private.movie_quizzes enable row level security;
alter table sf_medals_private.movie_quiz_results enable row level security;
revoke all on sf_medals_private.movie_quizzes,sf_medals_private.movie_quiz_results from public,anon,authenticated;
create policy deny_direct_access on sf_medals_private.movie_quizzes for all to anon,authenticated using(false) with check(false);
create policy deny_direct_access on sf_medals_private.movie_quiz_results for all to anon,authenticated using(false) with check(false);

create function sf_medals_private.mainline_progress(p_badge uuid,p_child uuid) returns integer
language plpgsql stable security definer set search_path='' as $$
declare b sf_medals_private.work_badges%rowtype;result integer;
begin
 if p_child is null then return 0;end if;
 select * into b from sf_medals_private.work_badges where id=p_badge;
 if b.unlock_rule='series_quiz' then
  select count(distinct e.episode_id) into result from sf_family_private.events e
   where e.user_id=p_child and e.series_id=split_part(b.resource_key,':',2) and e.episode_id=any(b.required_episodes)
    and e.module='quiz' and e.total>0 and e.score*100>=b.quiz_min*e.total;
  return result;
 elsif b.unlock_rule='movie_quiz' then
  select r.score into result from sf_medals_private.movie_quiz_results r join sf_medals_private.movie_quizzes q on q.resource_key=r.resource_key and q.version=r.version
   where r.child_id=p_child and r.resource_key=b.resource_key;
  return coalesce(result,0);
 end if;
 return 0;
end $$;
revoke all on function sf_medals_private.mainline_progress(uuid,uuid) from public,anon,authenticated;

do $migration$
declare source text;addition text;
begin
 source:=pg_get_functiondef('sf_medals_private.eligibility(uuid,uuid)'::regprocedure);
 source:=replace(source,'if b.unlock_rule=''quiz'' then',
 'if b.unlock_rule=''series_quiz'' then
  if b.required_count>0 and cardinality(b.required_episodes)=b.required_count and b.quiz_ready_count>=b.required_count and sf_medals_private.mainline_progress(b.id,p_child)>=b.required_count then return ''quiz_verified'';end if;
 elsif b.unlock_rule=''movie_quiz'' then
  if b.required_count between 5 and 10 and sf_medals_private.mainline_progress(b.id,p_child)*100>=b.quiz_min*b.required_count then return ''quiz_verified'';end if;
 elsif b.unlock_rule=''quiz'' then');
 execute source;

 source:=pg_get_functiondef('sf_medals_private.api(text,jsonb)'::regprocedure);
 source:=replace(source,'w.unlock_rule=''series_all''','w.unlock_rule in (''series_all'',''series_quiz'')');
 source:=replace(source,'unlock_rule=''series_all'')) loop','unlock_rule in (''series_all'',''series_quiz''))) loop');
 source:=replace(source,'''rule'',w.unlock_rule,',
 '''rule'',w.unlock_rule,''mainline'',w.unlock_rule in (''series_quiz'',''movie_quiz''),''required'',w.required_count,''ready'',w.quiz_ready_count,''progress'',sf_medals_private.mainline_progress(w.id,case when p_action=''dashboard'' then child else u end),');
 source:=replace(source,'from sf_medals_private.honor_templates h where',
 'from sf_medals_private.honor_templates h where not exists(select 1 from sf_medals_private.work_badges mainline where mainline.template_id=h.id and mainline.unlock_rule in (''series_quiz'',''movie_quiz'')) and');
 source:=replace(source,'if p_action=''award'' then',
 'if p_action=''award'' then
  if exists(select 1 from sf_medals_private.work_badges mainline where mainline.template_id=(p_payload->>''template_id'')::uuid and mainline.unlock_rule in (''series_quiz'',''movie_quiz'')) then raise exception ''主线勋章只能通过完成答题自动解锁'';end if;');
 source:=replace(source,'if p_action=''badge_save'' then',
 'if p_action=''badge_save'' then
  select * into b from sf_medals_private.work_badges where id=nullif(p_payload->>''id'','''')::uuid;
  if b.unlock_rule in (''series_quiz'',''movie_quiz'') and (p_payload->>''unlock_rule'' is distinct from b.unlock_rule or p_payload->>''resource_key'' is distinct from b.resource_key) then raise exception ''主线任务的作品和答题规则由目录维护，不能改为自报领取'';end if;
  if (p_payload->>''unlock_rule'') in (''series_quiz'',''movie_quiz'') and b.id is null then raise exception ''主线任务须由目录脚本建立'';end if;');
 source:=replace(source,'if not exists(select 1 from sf_medals_private.assets where id=asset and ready and not blocked and(owner_id=u or owner_id is null)) then',
 'if not(asset is null and b.id is not null and b.unlock_rule in (''series_quiz'',''movie_quiz'')) and not exists(select 1 from sf_medals_private.assets where id=asset and ready and not blocked and(owner_id=u or owner_id is null)) then');
 addition:=$actions$
 if p_action in ('movie_questions','movie_submit') then
  res:=p_payload->>'resource_key';
  select q.questions,q.version into own_items,target from sf_medals_private.movie_quizzes q join sf_medals_private.resources rr on rr.key=q.resource_key and rr.active
   where q.resource_key=res and exists(select 1 from sf_medals_private.work_badges w where w.resource_key=res and w.active and w.unlock_rule='movie_quiz');
  if own_items is null then raise exception '该影片的主线题库尚未开放';end if;
  if p_action='movie_questions' then
   return jsonb_build_object('version',target,'questions',(select jsonb_agg(question-'answer') from jsonb_array_elements(own_items) question),'pass_percent',(select quiz_min from sf_medals_private.work_badges where resource_key=res and unlock_rule='movie_quiz'));
  end if;
  if me.role is distinct from 'child' then raise exception '请使用孩子账号完成主线答题';end if;
  if jsonb_typeof(p_payload->'answers') is distinct from 'object' then raise exception '请提交全部题目的答案';end if;
  if p_payload->>'version' is distinct from target then raise exception '题库已更新，请重新打开答题';end if;
  n:=0;affected:=0;
  for items in select value from jsonb_array_elements(own_items) loop
   if not exists(select 1 from jsonb_array_elements(items->'options') option where option->>'key'=p_payload->'answers'->>(items->>'id')) then raise exception '请完成所有题目';end if;
   affected:=affected+1;if p_payload->'answers'->>(items->>'id')=items->>'answer' then n:=n+1;end if;
  end loop;
  insert into sf_medals_private.movie_quiz_results(child_id,resource_key,score,total,version) values(u,res,n,affected,target)
   on conflict(child_id,resource_key) do update set score=case when sf_medals_private.movie_quiz_results.version=excluded.version then greatest(sf_medals_private.movie_quiz_results.score,excluded.score) else excluded.score end,total=excluded.total,version=excluded.version,updated_at=now();
  items:=sf_medals_private.api('complete',jsonb_build_object('resource_key',res));
  return jsonb_build_object('score',n,'total',affected,'passed',n*100>=affected*(select quiz_min from sf_medals_private.work_badges where resource_key=res and unlock_rule='movie_quiz'),'unlocked',items->'unlocked');
 end if;
$actions$;
 source:=replace(source,'if p_action=''resources'' then',addition||'if p_action=''resources'' then');
 execute source;
end $migration$;
commit;
