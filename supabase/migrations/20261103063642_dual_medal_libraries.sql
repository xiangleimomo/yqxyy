begin;
create schema sf_medals_private;
revoke all on schema sf_medals_private from public,anon;
grant usage on schema sf_medals_private to authenticated,service_role;

create table sf_medals_private.resources(
 key text primary key check(key ~ '^(book|magazine|movie|series|episode):[a-z0-9-]+(:[0-9]+)?$'),
 resource_type text not null check(resource_type in ('book','magazine','movie','series','episode')),
 resource_id text not null, title text not null check(length(title) between 1 and 240),
 href text not null check(href ~ '^#/'), parent_key text references sf_medals_private.resources(key) deferrable initially deferred,
 canonical_key text not null references sf_medals_private.resources(key) deferrable initially deferred,
 expected_count integer not null default 1 check(expected_count between 0 and 10000),active boolean not null default true
);
create index medal_resources_parent_idx on sf_medals_private.resources(parent_key);
create index medal_resources_canonical_idx on sf_medals_private.resources(canonical_key);
create table sf_medals_private.assets(
 id uuid primary key default gen_random_uuid(),owner_id uuid references auth.users(id) on delete cascade,
 secret_key text not null default encode(extensions.gen_random_bytes(32),'hex') check(secret_key ~ '^[a-f0-9]{64}$'),
 full_url text,thumb_url text,full_iv text,thumb_iv text,width integer,height integer,
 ready boolean not null default false,blocked boolean not null default false,created_at timestamptz not null default now(),
 check(full_url is null or full_url ~ '^https://u\.pone\.rs/[A-Za-z0-9]+\.bin$'),
 check(thumb_url is null or thumb_url ~ '^https://u\.pone\.rs/[A-Za-z0-9]+\.bin$'),
 check(full_iv is null or full_iv ~ '^[a-f0-9]{24}$'),check(thumb_iv is null or thumb_iv ~ '^[a-f0-9]{24}$')
);
create index medal_assets_owner_idx on sf_medals_private.assets(owner_id,created_at);
create table sf_medals_private.work_badges(
 id uuid primary key default gen_random_uuid(),title text not null check(length(title) between 1 and 100),
 description text not null default '' check(length(description)<=1500),asset_id uuid not null references sf_medals_private.assets(id),
 resource_key text not null references sf_medals_private.resources(key),
 source_type text not null check(source_type in ('licensed_official','story_inspired','original')),
 rights_note text not null check(length(rights_note) between 5 and 2000),
 unlock_rule text not null default 'self_report' check(unlock_rule in ('self_report','quiz','series_all')),
 quiz_min integer not null default 80 check(quiz_min between 1 and 100),active boolean not null default true,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index work_badges_resource_idx on sf_medals_private.work_badges(resource_key,active);
create table sf_medals_private.completions(
 child_id uuid not null references auth.users(id) on delete cascade,resource_key text not null references sf_medals_private.resources(key),
 source text not null check(source in ('self_report','existing_self_report')),completed_at timestamptz not null default now(),primary key(child_id,resource_key)
);
create table sf_medals_private.child_work_badges(
 id uuid primary key default gen_random_uuid(),child_id uuid not null references auth.users(id) on delete cascade,
 badge_id uuid not null references sf_medals_private.work_badges(id),resource_key text not null references sf_medals_private.resources(key),
 unlock_source text not null check(unlock_source in ('self_report','existing_self_report','quiz_verified','series_reported')),
 unlocked_at timestamptz not null default now(),unique(child_id,badge_id)
);
create index child_work_badges_badge_idx on sf_medals_private.child_work_badges(badge_id);
create table sf_medals_private.honor_templates(
 id uuid primary key default gen_random_uuid(),creator_id uuid references auth.users(id) on delete set null,
 is_system boolean not null default false,title text not null check(length(title) between 1 and 100),
 description text not null default '' check(length(description)<=1500),theme text not null default '' check(length(theme)<=80),
 resource_key text references sf_medals_private.resources(key),asset_id uuid not null references sf_medals_private.assets(id),
 visibility text not null default 'private' check(visibility in ('private','public')),
 review_status text not null default 'draft' check(review_status in ('draft','pending','approved','rejected','removed')),
 rights_confirmed_at timestamptz not null,rights_note text not null default '' check(length(rights_note)<=2000),
 reviewed_by uuid references auth.users(id) on delete set null,reviewed_at timestamptz,review_note text not null default '' check(length(review_note)<=1500),
 version integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index honor_templates_creator_idx on sf_medals_private.honor_templates(creator_id,updated_at desc);
create index honor_templates_review_idx on sf_medals_private.honor_templates(review_status,visibility);
create index honor_templates_asset_idx on sf_medals_private.honor_templates(asset_id);
create index honor_templates_resource_idx on sf_medals_private.honor_templates(resource_key);
create table sf_medals_private.collections(
 parent_id uuid not null references auth.users(id) on delete cascade,template_id uuid not null references sf_medals_private.honor_templates(id),
 collected_at timestamptz not null default now(),primary key(parent_id,template_id)
);
create index medal_collections_template_idx on sf_medals_private.collections(template_id);
create table sf_medals_private.honor_awards(
 id uuid primary key default gen_random_uuid(),child_id uuid not null references auth.users(id) on delete cascade,
 parent_id uuid not null references auth.users(id) on delete cascade,template_id uuid not null references sf_medals_private.honor_templates(id),
 asset_id uuid not null references sf_medals_private.assets(id),title_snapshot text not null,creator_nickname_snapshot text not null,
 giver_nickname_snapshot text not null,resource_key text references sf_medals_private.resources(key),resource_title_snapshot text not null default '',
 message text not null default '' check(length(message)<=1000),completion_date date,awarded_at timestamptz not null default now(),
 status text not null default 'active' check(status in ('active','revoked')),revoked_at timestamptz,revoke_reason text not null default '' check(length(revoke_reason)<=1000),
 idempotency_key uuid not null,request_hash text not null,unique(parent_id,idempotency_key)
);
create index honor_awards_child_idx on sf_medals_private.honor_awards(child_id,awarded_at desc);
create index honor_awards_parent_idx on sf_medals_private.honor_awards(parent_id,awarded_at desc);
create index honor_awards_template_idx on sf_medals_private.honor_awards(template_id);
create index honor_awards_asset_idx on sf_medals_private.honor_awards(asset_id);
create index honor_awards_resource_idx on sf_medals_private.honor_awards(resource_key);
create index honor_awards_duplicate_idx on sf_medals_private.honor_awards(parent_id,request_hash,awarded_at desc);
create table sf_medals_private.reports(
 id uuid primary key default gen_random_uuid(),reporter_id uuid not null references auth.users(id) on delete cascade,
 template_id uuid not null references sf_medals_private.honor_templates(id),reason text not null check(length(reason) between 5 and 1000),
 status text not null default 'pending' check(status in ('pending','resolved')),resolution text not null default '',created_at timestamptz not null default now()
);
create unique index medal_reports_pending_idx on sf_medals_private.reports(reporter_id,template_id) where status='pending';
create index medal_reports_template_idx on sf_medals_private.reports(template_id);
create table sf_medals_private.audit_events(
 id bigint generated always as identity primary key,actor_id uuid references auth.users(id) on delete set null,
 action text not null,entity_id text not null,detail jsonb not null default '{}',created_at timestamptz not null default now()
);
create index medal_audit_actor_idx on sf_medals_private.audit_events(actor_id,created_at desc);
do $$declare item record;begin
 for item in select tablename from pg_tables where schemaname='sf_medals_private' loop
  execute format('alter table sf_medals_private.%I enable row level security',item.tablename);
  execute format('revoke all on sf_medals_private.%I from public,anon,authenticated',item.tablename);
  execute format('create policy deny_direct_access on sf_medals_private.%I for all to anon,authenticated using(false) with check(false)',item.tablename);
 end loop;
end $$;

create function sf_medals_private.nickname(p_user uuid) returns text language sql stable security definer set search_path='' as $$
 select coalesce((select nickname from public.book_profiles where user_id=p_user),(select name from sf_family_private.profiles where user_id=p_user),'家长');
$$;
create function sf_medals_private.can_view(p_viewer uuid,p_child uuid) returns boolean language sql stable security definer set search_path='' as $$
 select p_viewer=p_child or exists(select 1 from sf_family_private.links where parent_id=p_viewer and child_id=p_child and status='active');
$$;
create function sf_medals_private.eligibility(p_badge uuid,p_child uuid) returns text language plpgsql stable security definer set search_path='' as $$
declare b sf_medals_private.work_badges%rowtype;r sf_medals_private.resources%rowtype;s text;
begin
 select * into b from sf_medals_private.work_badges where id=p_badge and active;
 if not found then return null;end if;
 select * into r from sf_medals_private.resources where key=b.resource_key and active;
 if not found then return null;end if;
 if b.unlock_rule='quiz' then
  if exists(select 1 from sf_family_private.events e where e.user_id=p_child and e.module='quiz' and e.series_id=split_part(r.resource_id,':',1) and e.episode_id=split_part(r.resource_id,':',2)::integer and e.total>0 and e.score*100>=b.quiz_min*e.total) then return 'quiz_verified';end if;
 elsif b.unlock_rule='series_all' then
  if r.expected_count>0 and (select count(*) from sf_medals_private.resources where parent_key=r.key and resource_type='episode' and active)=r.expected_count and not exists(
   select 1 from sf_medals_private.resources ep where ep.parent_key=r.key and ep.resource_type='episode' and ep.active and not exists(select 1 from sf_medals_private.completions c where c.child_id=p_child and c.resource_key=ep.canonical_key)
  ) then return 'series_reported';end if;
 else
  select source into s from sf_medals_private.completions where child_id=p_child and resource_key=r.canonical_key;
  return s;
 end if;
 return null;
end $$;

create function sf_medals_private.api(p_action text,p_payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();admin boolean:=coalesce(auth.jwt()->'app_metadata'->>'site_admin','false')='true';
 me sf_family_private.profiles%rowtype;r sf_medals_private.resources%rowtype;t sf_medals_private.honor_templates%rowtype;b sf_medals_private.work_badges%rowtype;
 a sf_medals_private.honor_awards%rowtype;v_id uuid;child uuid;source text;res text;items jsonb;own_items jsonb;target text;mode text;fingerprint text;n integer:=0;affected integer;asset uuid;
begin
 if u is null or not exists(select 1 from auth.users where id=u) then raise exception '请先登录';end if;
 if p_payload ? 'creator_user_id' and p_payload->>'creator_user_id'<>u::text then raise exception '不能冒用创作者身份';end if;
 if p_payload ? 'parent_user_id' and p_payload->>'parent_user_id'<>u::text then raise exception '不能冒用家长身份';end if;
 select * into me from sf_family_private.profiles where user_id=u;
 if p_action='dashboard' then
  child:=case when me.role='child' then u else nullif(p_payload->>'child_id','')::uuid end;
  if child is not null and not admin and not sf_medals_private.can_view(u,child) then raise exception '只能查看本人或已绑定孩子的荣誉';end if;
  return jsonb_build_object('role',me.role,'admin',admin,'name',sf_medals_private.nickname(u),'child_id',child,
   'children',coalesce((select jsonb_agg(jsonb_build_object('id',l.child_id,'name',p.name) order by p.name) from sf_family_private.links l join sf_family_private.profiles p on p.user_id=l.child_id where l.parent_id=u and l.status='active'),'[]'),
   'works',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'title',w.title,'description',w.description,'asset_id',w.asset_id,'resource_key',w.resource_key,'resource_title',x.title,'href',x.href,'rule',w.unlock_rule,'earned',c.id is not null,'unlocked_at',c.unlocked_at,'unlock_source',c.unlock_source) order by w.created_at) from sf_medals_private.work_badges w join sf_medals_private.resources x on x.key=w.resource_key left join sf_medals_private.child_work_badges c on c.badge_id=w.id and c.child_id=child where w.active and x.active),'[]'),
   'awards',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'title',x.title_snapshot,'asset_id',case when h.review_status='removed' then null else x.asset_id end,'removed',h.review_status='removed','creator',x.creator_nickname_snapshot,'giver',x.giver_nickname_snapshot,'awarded_at',x.awarded_at,'completion_date',x.completion_date,'message',x.message,'resource_title',x.resource_title_snapshot,'href',rr.href) order by x.awarded_at desc) from sf_medals_private.honor_awards x join sf_medals_private.honor_templates h on h.id=x.template_id left join sf_medals_private.resources rr on rr.key=x.resource_key where x.child_id=child and x.status='active'),'[]'));
 end if;
 if p_action='resources' then
  return coalesce((select jsonb_agg(to_jsonb(x)) from(select key,resource_type,title,href,canonical_key,expected_count from sf_medals_private.resources where active and (coalesce(p_payload->>'query','')='' or title ilike '%'||(p_payload->>'query')||'%' or key ilike '%'||(p_payload->>'query')||'%') and (coalesce(p_payload->>'type','')='' or resource_type=p_payload->>'type') order by resource_type,title limit 100)x),'[]');
 end if;
 if p_action='available' then
  select * into r from sf_medals_private.resources where key=p_payload->>'resource_key' and active;
  if not found then return '[]';end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'title',w.title,'asset_id',w.asset_id,'rule',w.unlock_rule,'quiz_min',w.quiz_min,'is_series',w.resource_key<>r.canonical_key,'earned',c.id is not null,'source',c.unlock_source,'eligible',sf_medals_private.eligibility(w.id,u) is not null)) from sf_medals_private.work_badges w left join sf_medals_private.child_work_badges c on c.badge_id=w.id and c.child_id=u where w.active and (w.resource_key=r.canonical_key or (w.resource_key=r.parent_key and w.unlock_rule='series_all'))),'[]');
 end if;
 if p_action='complete' then
  if me.role is distinct from 'child' then raise exception '请使用孩子账号收集作品徽章';end if;
  if p_payload ? 'child_id' and p_payload->>'child_id'<>u::text then raise exception '只能为自己领取';end if;
  select * into r from sf_medals_private.resources where key=p_payload->>'resource_key' and active;
  if not found then raise exception '作品未配置';end if;
  if coalesce((p_payload->>'self_report')::boolean,false) then source:='self_report';
  elsif r.resource_type='episode' and exists(select 1 from public.user_learning_state s where s.user_id=u and (s.progress->r.resource_id->'modules'->>'watch'='true' or s.progress->r.resource_id->'modules'->>'read'='true')) then source:='existing_self_report';end if;
  if source is not null then insert into sf_medals_private.completions(child_id,resource_key,source) values(u,r.canonical_key,source) on conflict do nothing;end if;
  for b in select * from sf_medals_private.work_badges where active and (resource_key=r.canonical_key or(resource_key=r.parent_key and unlock_rule='series_all')) loop
   source:=sf_medals_private.eligibility(b.id,u);
   if source is not null then
    insert into sf_medals_private.child_work_badges(child_id,badge_id,resource_key,unlock_source) values(u,b.id,b.resource_key,source) on conflict do nothing;
    get diagnostics affected=row_count;n:=n+affected;
   end if;
  end loop;
  return jsonb_build_object('unlocked',n,'message',case when n>0 then '作品徽章已收集' else '完成记录已保存；已领取或尚未达到徽章条件' end);
 end if;
 if p_action='templates' then
  if me.role is distinct from 'parent' and not admin then raise exception '奖章工坊供家长使用，请先设置家庭身份';end if;
  mode:=coalesce(p_payload->>'mode','public');
  if mode='review' and not admin then raise exception '仅管理员可审核';end if;
  return coalesce((select jsonb_agg(x) from(select h.id,h.title,h.description,h.theme,h.asset_id,h.resource_key,h.is_system,h.review_status,h.visibility,h.version,
    case when h.is_system then '平台原创' else sf_medals_private.nickname(h.creator_id) end as creator_nickname,
    case when h.creator_id=u or admin then h.review_note else '' end as review_note,
    exists(select 1 from sf_medals_private.collections c where c.parent_id=u and c.template_id=h.id) as collected,
    h.creator_id=u as own
   from sf_medals_private.honor_templates h where
    (case when mode='mine' then h.creator_id=u or(admin and h.is_system) when mode='review' then h.review_status='pending' when mode='collections' then exists(select 1 from sf_medals_private.collections c where c.parent_id=u and c.template_id=h.id) and h.visibility='public' and h.review_status='approved' else h.visibility='public' and h.review_status='approved' end)
    and (coalesce(p_payload->>'query','')='' or h.title ilike '%'||(p_payload->>'query')||'%' or h.theme ilike '%'||(p_payload->>'query')||'%' or sf_medals_private.nickname(h.creator_id) ilike '%'||(p_payload->>'query')||'%') order by h.updated_at desc limit 200)x),'[]');
 end if;
 if p_action in ('template_save','share','withdraw','collect','report','award','issued','revoke') then
  if me.role is distinct from 'parent' and not (admin and p_action in ('template_save','share','withdraw','report','issued','revoke')) then raise exception '仅家长可执行此操作';end if;
 end if;
 if p_action='template_save' then
  if not coalesce((p_payload->>'rights_confirmed')::boolean,false) then raise exception '请确认原创或必要授权';end if;
  asset:=(p_payload->>'asset_id')::uuid;
  if not exists(select 1 from sf_medals_private.assets where id=asset and ready and not blocked and (owner_id=u or(admin and owner_id is null))) then raise exception '图片不可用或不属于本人';end if;
  v_id:=coalesce(nullif(p_payload->>'id','')::uuid,gen_random_uuid());
  select * into t from sf_medals_private.honor_templates where id=v_id for update;
  if found and not(coalesce(t.creator_id=u,false) or(admin and t.is_system)) then raise exception '不能修改他人的设计';end if;
  if t.review_status='removed' then raise exception '已下架设计不能重新发布，请提交新的合规设计';end if;
  res:=nullif(p_payload->>'resource_key','');
  insert into sf_medals_private.honor_templates(id,creator_id,is_system,title,description,theme,asset_id,resource_key,rights_confirmed_at,rights_note)
  values(v_id,case when admin and coalesce((p_payload->>'is_system')::boolean,false) then null else u end,admin and coalesce((p_payload->>'is_system')::boolean,false),trim(p_payload->>'title'),coalesce(p_payload->>'description',''),coalesce(p_payload->>'theme',''),asset,res,now(),coalesce(p_payload->>'rights_note',''))
  on conflict(id) do update set title=excluded.title,description=excluded.description,theme=excluded.theme,asset_id=excluded.asset_id,resource_key=excluded.resource_key,rights_note=excluded.rights_note,rights_confirmed_at=now(),visibility='private',review_status='draft',review_note='',version=sf_medals_private.honor_templates.version+1,updated_at=now();
  insert into sf_medals_private.audit_events(actor_id,action,entity_id) values(u,'template_save',v_id::text);
  return jsonb_build_object('id',v_id);
 end if;
 if p_action in ('share','withdraw','collect','report') then
  select * into t from sf_medals_private.honor_templates where id=(p_payload->>'id')::uuid for update;
  if not found then raise exception '设计不存在';end if;
  if p_action in ('share','withdraw') then
   if not(coalesce(t.creator_id=u,false) or(admin and t.is_system)) or t.review_status='removed' then raise exception '没有分享管理权限';end if;
   if p_action='share' and not coalesce((p_payload->>'rights_confirmed')::boolean,false) then raise exception '请确认有权公开分享并允许家长采用';end if;
   update sf_medals_private.honor_templates set visibility=case when p_action='share' then 'public' else 'private' end,review_status=case when p_action='share' then 'pending' else 'draft' end,rights_confirmed_at=now(),updated_at=now() where id=t.id;
  elsif p_action='collect' then
   if coalesce((p_payload->>'collect')::boolean,true) then
    if t.visibility<>'public' or t.review_status<>'approved' then raise exception '只能收藏审核通过的公开设计';end if;
    insert into sf_medals_private.collections(parent_id,template_id) values(u,t.id) on conflict do nothing;
   else delete from sf_medals_private.collections where parent_id=u and template_id=t.id;end if;
  else
   if t.visibility<>'public' or t.review_status<>'approved' then raise exception '设计当前未公开';end if;
   insert into sf_medals_private.reports(reporter_id,template_id,reason) values(u,t.id,trim(p_payload->>'reason')) on conflict(reporter_id,template_id) where status='pending' do nothing;
  end if;
  insert into sf_medals_private.audit_events(actor_id,action,entity_id) values(u,p_action,t.id::text);
  return jsonb_build_object('ok',true);
 end if;
 if p_action='award' then
  child:=(p_payload->>'child_id')::uuid;
  perform 1 from sf_family_private.links l join sf_family_private.profiles p on p.user_id=l.child_id and p.role='child' where l.parent_id=u and l.child_id=child and l.status='active' for share of l;
  if not found then raise exception '只能向已确认绑定的孩子颁章';end if;
  select * into t from sf_medals_private.honor_templates where id=(p_payload->>'template_id')::uuid for share;
  if not found or t.review_status in ('removed','rejected') or not(coalesce(t.creator_id=u,false) or(t.visibility='public' and t.review_status='approved' and(t.is_system or exists(select 1 from sf_medals_private.collections where parent_id=u and template_id=t.id)))) then raise exception '模板不可授予，请先收藏审核通过的设计';end if;
  if not exists(select 1 from sf_medals_private.assets where id=t.asset_id and ready and not blocked) then raise exception '图片已停用';end if;
  res:=nullif(p_payload->>'resource_key','');
  fingerprint:=md5(jsonb_build_array(child,t.id,res,coalesce(p_payload->>'message',''),p_payload->>'completion_date')::text);
  perform pg_advisory_xact_lock(hashtextextended(u::text||fingerprint,0));
  select * into a from sf_medals_private.honor_awards where parent_id=u and (idempotency_key=(p_payload->>'idempotency_key')::uuid or(request_hash=fingerprint and awarded_at>now()-interval '1 minute' and status='active')) order by awarded_at desc limit 1;
  if found then return jsonb_build_object('id',a.id,'duplicate',true);end if;
  insert into sf_medals_private.honor_awards(child_id,parent_id,template_id,asset_id,title_snapshot,creator_nickname_snapshot,giver_nickname_snapshot,resource_key,resource_title_snapshot,message,completion_date,idempotency_key,request_hash)
  values(child,u,t.id,t.asset_id,t.title,case when t.is_system then '平台原创' else sf_medals_private.nickname(t.creator_id) end,sf_medals_private.nickname(u),res,coalesce((select title from sf_medals_private.resources where key=res),''),coalesce(p_payload->>'message',''),nullif(p_payload->>'completion_date','')::date,(p_payload->>'idempotency_key')::uuid,fingerprint) returning id into v_id;
  insert into sf_medals_private.audit_events(actor_id,action,entity_id) values(u,'award',v_id::text);
  return jsonb_build_object('id',v_id);
 end if;
 if p_action='issued' then
  return coalesce((select jsonb_agg(x) from(select a.id,a.title_snapshot as title,a.child_id,p.name as child_name,a.giver_nickname_snapshot as giver,a.creator_nickname_snapshot as creator,a.awarded_at,a.message,a.completion_date,a.status,a.revoke_reason,case when t.review_status='removed' then null else a.asset_id end as asset_id from sf_medals_private.honor_awards a join sf_family_private.profiles p on p.user_id=a.child_id join sf_medals_private.honor_templates t on t.id=a.template_id where (admin or(a.parent_id=u and sf_medals_private.can_view(u,a.child_id))) order by a.awarded_at desc limit 200)x),'[]');
 end if;
 if p_action='revoke' then
  select * into a from sf_medals_private.honor_awards where id=(p_payload->>'id')::uuid for update;
  if not found or not(admin or(a.parent_id=u and sf_medals_private.can_view(u,a.child_id))) then raise exception '没有撤销权限';end if;
  if length(trim(coalesce(p_payload->>'reason','')))<2 then raise exception '请填写撤销原因';end if;
  update sf_medals_private.honor_awards set status='revoked',revoked_at=now(),revoke_reason=trim(p_payload->>'reason') where id=a.id;
  insert into sf_medals_private.audit_events(actor_id,action,entity_id,detail) values(u,'revoke',a.id::text,jsonb_build_object('reason',p_payload->>'reason'));
  return jsonb_build_object('ok',true);
 end if;
 if not admin then raise exception '仅管理员可执行';end if;
 if p_action='badge_save' then
  select * into r from sf_medals_private.resources where key=p_payload->>'resource_key' and active;
  if not found then raise exception '请关联真实作品';end if;
  if p_payload->>'unlock_rule'='quiz' and r.resource_type<>'episode' then raise exception '测验规则仅用于分集';end if;
  if p_payload->>'unlock_rule'='series_all' and r.resource_type<>'series' then raise exception '全集规则仅用于系列';end if;
  asset:=(p_payload->>'asset_id')::uuid;
  if not exists(select 1 from sf_medals_private.assets where id=asset and ready and not blocked and(owner_id=u or owner_id is null)) then raise exception '图片不可用';end if;
  v_id:=coalesce(nullif(p_payload->>'id','')::uuid,gen_random_uuid());
  insert into sf_medals_private.work_badges(id,title,description,asset_id,resource_key,source_type,rights_note,unlock_rule,quiz_min,active)
  values(v_id,trim(p_payload->>'title'),coalesce(p_payload->>'description',''),asset,r.canonical_key,p_payload->>'source_type',p_payload->>'rights_note',coalesce(p_payload->>'unlock_rule','self_report'),coalesce((p_payload->>'quiz_min')::integer,80),coalesce((p_payload->>'active')::boolean,true))
  on conflict(id) do update set title=excluded.title,description=excluded.description,asset_id=excluded.asset_id,resource_key=excluded.resource_key,source_type=excluded.source_type,rights_note=excluded.rights_note,unlock_rule=excluded.unlock_rule,quiz_min=excluded.quiz_min,active=excluded.active,updated_at=now();
  insert into sf_medals_private.audit_events(actor_id,action,entity_id) values(u,'badge_save',v_id::text);
  return jsonb_build_object('id',v_id);
 elsif p_action='resource_link' then
  select * into r from sf_medals_private.resources where key=p_payload->>'canonical_key' and canonical_key=key;
  if not found then raise exception '请选择独立的作品主记录';end if;
  update sf_medals_private.resources set canonical_key=r.key where key=p_payload->>'resource_key' and resource_type=r.resource_type;
  if not found then raise exception '仅可关联相同类型的作品';end if;
  return jsonb_build_object('ok',true);
 elsif p_action='review' then
  select * into t from sf_medals_private.honor_templates where id=(p_payload->>'id')::uuid for update;
  if not found or t.review_status='removed' then raise exception '设计不存在或已下架';end if;
  mode:=p_payload->>'decision';
  if mode not in ('approved','rejected','removed') then raise exception '审核操作无效';end if;
  if mode<>'approved' and length(trim(coalesce(p_payload->>'note','')))<2 then raise exception '请填写处理理由';end if;
  if mode='approved' and t.review_status<>'pending' then raise exception '只能通过待审设计';end if;
  update sf_medals_private.honor_templates set review_status=mode,visibility=case when mode='approved' then 'public' else 'private' end,reviewed_by=u,reviewed_at=now(),review_note=coalesce(p_payload->>'note',''),updated_at=now() where id=t.id;
  if mode='removed' then update sf_medals_private.assets set blocked=true where id=t.asset_id or id in(select asset_id from sf_medals_private.honor_awards where template_id=t.id);end if;
  insert into sf_medals_private.audit_events(actor_id,action,entity_id,detail) values(u,'review',t.id::text,jsonb_build_object('decision',mode,'note',p_payload->>'note'));
  return jsonb_build_object('ok',true);
 elsif p_action='admin' then
  return jsonb_build_object('badges',coalesce((select jsonb_agg(to_jsonb(w)||jsonb_build_object('resource_title',r.title)) from sf_medals_private.work_badges w join sf_medals_private.resources r on r.key=w.resource_key),'[]'),
   'reports',coalesce((select jsonb_agg(to_jsonb(x)) from(select r.id,r.template_id,r.reason,r.status,r.created_at,t.title from sf_medals_private.reports r join sf_medals_private.honor_templates t on t.id=r.template_id where r.status='pending' order by r.created_at)x),'[]'),
   'audit',coalesce((select jsonb_agg(to_jsonb(x)) from(select id,action,entity_id,detail,created_at from sf_medals_private.audit_events order by created_at desc limit 100)x),'[]'),
   'unconfigured',(select count(*) from sf_medals_private.resources r where r.active and r.resource_type<>'episode' and not exists(select 1 from sf_medals_private.work_badges w where w.resource_key=r.canonical_key and w.active)));
 elsif p_action='resolve_report' then
  update sf_medals_private.reports set status='resolved',resolution=left(coalesce(p_payload->>'note','已处理'),1500) where id=(p_payload->>'id')::uuid;
  insert into sf_medals_private.audit_events(actor_id,action,entity_id) values(u,'resolve_report',p_payload->>'id');
  return jsonb_build_object('ok',true);
 end if;
 raise exception '未知操作';
end $$;

-- Only server-side service calls can see ciphertext locations and decryption keys.
create function sf_medals_private.service(p_action text,p_payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid;row sf_medals_private.assets%rowtype;value jsonb;is_admin boolean;role_name text;
begin
 if p_action='catalog_put' then
  for value in select * from jsonb_array_elements(p_payload->'items') loop
   insert into sf_medals_private.resources(key,resource_type,resource_id,title,href,parent_key,canonical_key,expected_count,active)
   values(value->>'key',value->>'type',value->>'id',value->>'title',value->>'href',nullif(value->>'parent_key',''),value->>'key',coalesce((value->>'expected_count')::integer,1),coalesce((value->>'active')::boolean,true))
   on conflict(key) do update set title=excluded.title,href=excluded.href,parent_key=excluded.parent_key,expected_count=excluded.expected_count,active=excluded.active;
  end loop;
  return jsonb_build_object('ok',true);
 end if;
 actor:=nullif(p_payload->>'viewer_id','')::uuid;
 if actor is null or not exists(select 1 from auth.users where id=actor) then raise exception '请登录';end if;
 select coalesce(raw_app_meta_data->>'site_admin','false')='true' into is_admin from auth.users where id=actor;
 select role into role_name from sf_family_private.profiles where user_id=actor;
 if p_action='prepare' then
  if not is_admin and role_name is distinct from 'parent' then raise exception '仅家长或管理员可上传勋章图片';end if;
  if (select count(*) from sf_medals_private.assets where owner_id=actor and created_at>now()-interval '1 hour')>=30 then raise exception '图片上传过于频繁，请稍后再试';end if;
  insert into sf_medals_private.assets(owner_id) values(actor) returning * into row;
  return jsonb_build_object('id',row.id,'key',row.secret_key);
 elsif p_action='finalize' then
  update sf_medals_private.assets set full_url=p_payload->>'full_url',thumb_url=p_payload->>'thumb_url',full_iv=p_payload->>'full_iv',thumb_iv=p_payload->>'thumb_iv',width=(p_payload->>'width')::integer,height=(p_payload->>'height')::integer,ready=true
  where id=(p_payload->>'id')::uuid and owner_id=actor and not ready and not blocked;
  if not found then raise exception '素材状态无效';end if;
  return jsonb_build_object('ok',true);
 elsif p_action='resolve' then
  select * into row from sf_medals_private.assets where id=(p_payload->>'id')::uuid and ready;
  if not found then raise exception '图片不可用';end if;
  if not is_admin then
   if row.blocked then raise exception '素材已下架';end if;
   if not(coalesce(row.owner_id=actor,false) or
    exists(select 1 from sf_medals_private.work_badges w where w.asset_id=row.id and w.active and role_name in ('parent','child')) or
    exists(select 1 from sf_medals_private.honor_templates t where t.asset_id=row.id and t.visibility='public' and t.review_status='approved' and role_name='parent') or
    exists(select 1 from sf_medals_private.honor_awards a join sf_medals_private.honor_templates t on t.id=a.template_id where a.asset_id=row.id and a.status='active' and t.review_status<>'removed' and sf_medals_private.can_view(actor,a.child_id))
   ) then raise exception '没有图片访问权限';end if;
  end if;
  return jsonb_build_object('url',case when coalesce((p_payload->>'thumbnail')::boolean,false) then row.thumb_url else row.full_url end,'iv',case when coalesce((p_payload->>'thumbnail')::boolean,false) then row.thumb_iv else row.full_iv end,'key',row.secret_key);
 end if;
 raise exception '未知服务操作';
end $$;
revoke all on all functions in schema sf_medals_private from public,anon,authenticated;
grant execute on function sf_medals_private.api(text,jsonb) to authenticated;
grant execute on function sf_medals_private.service(text,jsonb) to service_role;
create function public.sf_medals(p_action text,p_payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select sf_medals_private.api(p_action,p_payload);$$;
revoke all on function public.sf_medals(text,jsonb) from public,anon;
grant execute on function public.sf_medals(text,jsonb) to authenticated;
create function public.sf_medals_service(p_action text,p_payload jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select sf_medals_private.service(p_action,p_payload);$$;
revoke all on function public.sf_medals_service(text,jsonb) from public,anon,authenticated;
grant execute on function public.sf_medals_service(text,jsonb) to service_role;
commit;
