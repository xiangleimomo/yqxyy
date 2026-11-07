-- Membership foundation only. This migration does NOT enable a content paywall.
begin;
create schema sf_membership_private;
revoke all on schema sf_membership_private from public, anon;
grant usage on schema sf_membership_private to authenticated, service_role;

create table sf_membership_private.accounts (
 user_id uuid primary key references auth.users(id) on delete cascade,
 tier text not null default 'trial' check (tier in ('trial','monthly','annual')),
 trial_started_at timestamptz not null default now(),
 valid_until timestamptz,
 version integer not null default 0,
 updated_at timestamptz not null default now(),
 check ((tier='trial' and valid_until is null) or (tier<>'trial' and valid_until is not null))
);
create table sf_membership_private.audit (
 id bigint generated always as identity primary key,
 user_id uuid references auth.users(id) on delete set null,
 actor_id uuid references auth.users(id) on delete set null,
 source text not null check(source in ('admin','payment')),
 previous_state jsonb not null, next_state jsonb not null,
 note text not null default '', created_at timestamptz not null default now()
);
create index membership_audit_user_idx on sf_membership_private.audit(user_id,created_at desc);
create index membership_audit_actor_idx on sf_membership_private.audit(actor_id);
create table sf_membership_private.payment_events (
 event_id text primary key check(length(event_id) between 1 and 200),
 user_id uuid references auth.users(id) on delete set null,
 tier text not null check(tier in ('monthly','annual')),
 result jsonb not null, created_at timestamptz not null default now()
);
create index membership_payment_user_idx on sf_membership_private.payment_events(user_id);
alter table sf_membership_private.accounts enable row level security;
alter table sf_membership_private.audit enable row level security;
alter table sf_membership_private.payment_events enable row level security;
revoke all on all tables in schema sf_membership_private from public,anon,authenticated;
revoke all on all sequences in schema sf_membership_private from public,anon,authenticated;

-- Only called inside the checked functions below; not directly exposed.
create function sf_membership_private.describe(p_user uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
  'user_id',u.id,'tier',coalesce(m.tier,'trial'),'version',coalesce(m.version,0),
  'trial_started_at',m.trial_started_at,'trial_ends_at',m.trial_started_at+interval '72 hours',
  'valid_until',m.valid_until,
  'exempt',coalesce(u.raw_app_meta_data->>'site_admin','false')='true' or lower(u.email)='hanyi888@qq.com',
  'status',case
   when coalesce(u.raw_app_meta_data->>'site_admin','false')='true' or lower(u.email)='hanyi888@qq.com' then 'exempt'
   when m.user_id is null then 'not_started'
   when m.tier='trial' and m.trial_started_at+interval '72 hours'>now() then 'trial'
   when m.tier<>'trial' and m.valid_until>now() then 'active'
   else 'expired' end,
  'enforcement_enabled',false)
 from auth.users u left join sf_membership_private.accounts m on m.user_id=u.id where u.id=p_user;
$$;

create function sf_membership_private.api(p_action text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 actor uuid:=auth.uid(); is_admin boolean; target uuid; chosen text; expiry timestamptz;
 current_row sf_membership_private.accounts%rowtype; before_state jsonb; result jsonb;
 query_text text:=trim(coalesce(p_payload->>'query','')); page_number integer;
begin
 if actor is null then raise exception '请先登录' using errcode='42501'; end if;
 select coalesce(raw_app_meta_data->>'site_admin','false')='true' into is_admin from auth.users where id=actor;
 if is_admin is null then raise exception '账号不存在' using errcode='42501'; end if;
 if p_action='me' then
  insert into sf_membership_private.accounts(user_id) values(actor) on conflict do nothing;
  return sf_membership_private.describe(actor);
 end if;
 if not is_admin then raise exception '仅管理员可管理会员' using errcode='42501'; end if;
 if p_action='list' then
  if length(query_text)>100 then raise exception '搜索内容过长'; end if;
  page_number:=greatest(0,least(100000,coalesce((p_payload->>'page')::integer,0)));
  select jsonb_build_object('items',coalesce(jsonb_agg(row_data order by created_at desc,id),'[]'::jsonb),
   'page',page_number,'has_more',count(*)>20) into result
  from (
   select u.id,u.created_at,
    sf_membership_private.describe(u.id)||jsonb_build_object('email',u.email,
     'nickname',left(coalesce(u.raw_user_meta_data->>'display_name',''),40)) as row_data
   from auth.users u where u.email is not null and (query_text='' or position(lower(query_text) in lower(u.email))>0)
   order by u.created_at desc,u.id limit 21 offset page_number*20
  ) candidates;
  -- The extra row determines pagination; never return more than 20 accounts.
  return jsonb_set(result,'{items}',coalesce((select jsonb_agg(value order by ordinality)
   from jsonb_array_elements(result->'items') with ordinality where ordinality<=20),'[]'::jsonb));
 elsif p_action='set' then
  target:=(p_payload->>'user_id')::uuid; chosen:=p_payload->>'tier';
  if chosen is null or chosen not in ('trial','monthly','annual') then raise exception '会员类型无效'; end if;
  if length(coalesce(p_payload->>'note',''))>500 then raise exception '备注最多500字'; end if;
  if not exists(select 1 from auth.users where id=target) then raise exception '账号不存在'; end if;
  -- Serialize administrator edits with future verified payment callbacks.
  perform pg_advisory_xact_lock(hashtextextended(target::text,0));
  insert into sf_membership_private.accounts(user_id) values(target) on conflict do nothing;
  select * into current_row from sf_membership_private.accounts where user_id=target for update;
  if (p_payload->>'version')::integer is distinct from current_row.version then
   raise exception '会员资料已变化，请重新查询后保存' using errcode='40001';
  end if;
  before_state:=sf_membership_private.describe(target);
  if chosen<>'trial' then
   expiry:=coalesce(nullif(p_payload->>'valid_until','')::timestamptz,
    now()+case when chosen='monthly' then interval '30 days' else interval '365 days' end);
   if not isfinite(expiry) or expiry<=now() then raise exception '有效期必须晚于当前时间'; end if;
  end if;
  update sf_membership_private.accounts set tier=chosen,valid_until=expiry,
   version=version+1,updated_at=now() where user_id=target;
  result:=sf_membership_private.describe(target);
  insert into sf_membership_private.audit(user_id,actor_id,source,previous_state,next_state,note)
   values(target,actor,'admin',before_state,result,coalesce(p_payload->>'note',''));
  return result;
 end if;
 raise exception '未知会员操作';
end $$;

-- Reserved payment integration: callable ONLY by a trusted service after verifying
-- a provider's payment signature, order owner, product and settled amount.
-- No payment provider, public callback or checkout is enabled by this migration.
create function sf_membership_private.payment(p_event_id text,p_user uuid,p_tier text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare existing sf_membership_private.payment_events%rowtype;
 current_row sf_membership_private.accounts%rowtype; before_state jsonb; result jsonb;
begin
 if p_event_id is null or length(p_event_id) not between 1 and 200 then raise exception '支付事件编号无效'; end if;
 if p_tier is null or p_tier not in ('monthly','annual') then raise exception '会员类型无效'; end if;
 perform pg_advisory_xact_lock(hashtextextended('payment:'||p_event_id,0));
 select * into existing from sf_membership_private.payment_events where event_id=p_event_id;
 if found then
  if existing.user_id is distinct from p_user or existing.tier<>p_tier then raise exception '支付事件资料不一致'; end if;
  return existing.result;
 end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 insert into sf_membership_private.accounts(user_id) values(p_user) on conflict do nothing;
 select * into current_row from sf_membership_private.accounts where user_id=p_user for update;
 before_state:=sf_membership_private.describe(p_user);
 update sf_membership_private.accounts set tier=p_tier,
  valid_until=greatest(now(),coalesce(current_row.valid_until,now()))+
   case when p_tier='monthly' then interval '30 days' else interval '365 days' end,
  version=version+1,updated_at=now() where user_id=p_user;
 result:=sf_membership_private.describe(p_user);
 insert into sf_membership_private.payment_events(event_id,user_id,tier,result) values(p_event_id,p_user,p_tier,result);
 insert into sf_membership_private.audit(user_id,source,previous_state,next_state,note)
  values(p_user,'payment',before_state,result,p_event_id);
 return result;
end $$;

revoke all on all functions in schema sf_membership_private from public,anon,authenticated,service_role;
grant execute on function sf_membership_private.api(text,jsonb) to authenticated;
grant execute on function sf_membership_private.payment(text,uuid,text) to service_role;
create function public.sf_membership(p_action text,p_payload jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$select sf_membership_private.api(p_action,p_payload);$$;
revoke all on function public.sf_membership(text,jsonb) from public,anon;
grant execute on function public.sf_membership(text,jsonb) to authenticated;
create function public.sf_membership_payment(p_event_id text,p_user uuid,p_tier text) returns jsonb
language sql security invoker set search_path='' as $$select sf_membership_private.payment(p_event_id,p_user,p_tier);$$;
revoke all on function public.sf_membership_payment(text,uuid,text) from public,anon,authenticated;
grant execute on function public.sf_membership_payment(text,uuid,text) to service_role;
commit;
