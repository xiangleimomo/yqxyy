begin;
create schema sf_books_private;
revoke all on schema sf_books_private from public,anon;
grant usage on schema sf_books_private to authenticated;
create table sf_books_private.legacy_accounts(user_id uuid primary key references auth.users(id) on delete cascade);
insert into sf_books_private.legacy_accounts select id from auth.users;
alter table sf_books_private.legacy_accounts enable row level security;
revoke all on sf_books_private.legacy_accounts from public,anon,authenticated;

alter table public.story_books add column owner_id uuid references auth.users(id) on delete set null,
 add column uploader_nickname text not null default '' check(length(uploader_nickname)<=40),
 add column audio_url text not null default '' check(length(audio_url)<=2048 and (audio_url='' or audio_url ~ '^https://[^[:space:]]+$')),
 add column video_url text not null default '' check(length(video_url)<=2048 and (video_url='' or video_url ~ '^https://[^[:space:]]+$')),
 add column created_at timestamptz not null default now();
create index story_books_owner_idx on public.story_books(owner_id);

create table public.book_profiles(
 user_id uuid primary key references auth.users(id) on delete cascade,
 nickname text not null check(length(trim(nickname)) between 2 and 40),
 created_at timestamptz not null default now()
);
create unique index book_nickname_unique on public.book_profiles(lower(nickname));
alter table public.book_profiles enable row level security;
revoke all on public.book_profiles from public,anon,authenticated;
grant select on public.book_profiles to anon,authenticated;
create policy book_profiles_public_read on public.book_profiles for select to anon,authenticated using(true);

create table public.book_personal(
 user_id uuid not null references auth.users(id) on delete cascade,
 book_id text not null check(book_id ~ '^[a-z0-9-]{1,100}$'),
 favorite boolean not null default false,
 category text not null default '' check(length(category)<=60),
 last_page integer not null default 0 check(last_page between 0 and 100000),
 last_cfi text not null default '' check(length(last_cfi)<=2000),
 last_read_at timestamptz,
 primary key(user_id,book_id)
);
alter table public.book_personal enable row level security;
revoke all on public.book_personal from public,anon,authenticated;
grant select on public.book_personal to authenticated;
create policy book_personal_read on public.book_personal for select to authenticated using((select auth.uid())=user_id);

create table public.book_change_requests(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 book_id text not null references public.story_books(id),
 kind text not null check(kind in ('edit','delete')),
 changes jsonb not null default '{}' check(octet_length(changes::text)<=250000),
 reason text not null default '' check(length(reason)<=1000),
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 review_note text not null default '' check(length(review_note)<=1000),
 created_at timestamptz not null default now(),
 reviewed_at timestamptz
);
create index book_requests_user_idx on public.book_change_requests(user_id,created_at desc);
create index book_requests_status_idx on public.book_change_requests(status,created_at);
alter table public.book_change_requests enable row level security;
revoke all on public.book_change_requests from public,anon,authenticated;
grant select on public.book_change_requests to authenticated;
create policy book_requests_read on public.book_change_requests for select to authenticated
 using((select auth.uid())=user_id or (select auth.jwt()->'app_metadata'->>'site_admin')='true');

create function sf_books_private.parent_access() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (
  coalesce(auth.jwt()->'app_metadata'->>'site_admin','false')='true' or (
   exists(select 1 from public.book_profiles where user_id=auth.uid())
   and not exists(select 1 from sf_family_private.profiles where user_id=auth.uid() and role='child')
   and exists(select 1 from auth.users u where u.id=auth.uid() and (u.email_confirmed_at is not null or exists(select 1 from sf_books_private.legacy_accounts l where l.user_id=u.id)))
  )
 );
$$;
revoke all on function sf_books_private.parent_access() from public,anon;
grant execute on function sf_books_private.parent_access() to authenticated;

create function sf_books_private.api(p_action text,p_payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 u uuid:=auth.uid(); admin boolean:=coalesce(auth.jwt()->'app_metadata'->>'site_admin','false')='true';
 nick text; b public.story_books%rowtype; req public.book_change_requests%rowtype;
 bid text; patch jsonb:=coalesce(p_payload->'changes','{}'); kind text; eligible boolean; result jsonb;
begin
 if u is null then raise exception '请先登录'; end if;
 select nickname into nick from public.book_profiles where user_id=u;
 eligible:=admin or (not exists(select 1 from sf_family_private.profiles where user_id=u and role='child') and
 exists(select 1 from auth.users a where a.id=u and (a.email_confirmed_at is not null or exists(select 1 from sf_books_private.legacy_accounts l where l.user_id=u))));
 if p_action='access' then return jsonb_build_object('admin',admin,'eligible',eligible,'nickname',nick,'can_upload',sf_books_private.parent_access()); end if;
 if p_action='setup' then
  if not eligible then raise exception '请完成邮箱验证，并使用家长账号'; end if;
  if nick is not null then return jsonb_build_object('nickname',nick); end if;
  nick:=trim(p_payload->>'nickname');
  if nick is null or length(nick) not between 2 and 40 then raise exception '昵称需要 2–40 个字'; end if;
  insert into public.book_profiles(user_id,nickname) values(u,nick);
  return jsonb_build_object('nickname',nick);
 end if;
 if p_action='publish' then
  if not sf_books_private.parent_access() then raise exception '仅已注册的家长或管理员可以上传'; end if;
  if nick is null then raise exception '请先填写上传昵称'; end if;
  if not coalesce((p_payload->>'duplicate_confirmed')::boolean,false) and exists(
   select 1 from public.story_books x left join public.story_book_shelf s on s.id=x.id
   where not coalesce(s.deleted,false) and (
    lower(trim(x.title))=lower(trim(p_payload->>'title')) or (coalesce(p_payload->>'title_zh','')<>'' and lower(trim(x.title_zh))=lower(trim(p_payload->>'title_zh')))
   )
  ) then raise exception '已存在同名绘本，请核对并二次确认重复上传'; end if;
  bid:='book-'||gen_random_uuid()::text;
  insert into public.story_books(id,title,title_zh,level,description,source_url,cover_url,owner_id,uploader_nickname,audio_url,video_url)
  values(bid,trim(p_payload->>'title'),coalesce(p_payload->>'title_zh',''),coalesce(p_payload->>'level',''),coalesce(p_payload->>'description',''),p_payload->>'source_url',coalesce(p_payload->>'cover_url',''),u,nick,coalesce(p_payload->>'audio_url',''),coalesce(p_payload->>'video_url',''));
  return jsonb_build_object('id',bid);
 end if;
 if p_action='personal' then
  bid:=p_payload->>'book_id';
  if bid !~ '^[a-z0-9-]{1,100}$' then raise exception '绘本编号无效'; end if;
  insert into public.book_personal(user_id,book_id) values(u,bid) on conflict do nothing;
  update public.book_personal set
   favorite=case when patch ? 'favorite' then (patch->>'favorite')::boolean else favorite end,
   category=case when patch ? 'category' then trim(patch->>'category') else category end,
   last_page=case when patch ? 'page' then (patch->>'page')::integer else last_page end,
   last_cfi=case when patch ? 'cfi' then patch->>'cfi' else last_cfi end,
   last_read_at=case when patch ? 'page' or patch ? 'cfi' then now() else last_read_at end
  where user_id=u and book_id=bid;
  return jsonb_build_object('ok',true);
 end if;
 if p_action='request' then
  if not sf_books_private.parent_access() then raise exception '请使用家长账号'; end if;
  bid:=p_payload->>'book_id'; kind:=p_payload->>'kind';
  select * into b from public.story_books where id=bid and owner_id=u;
  if not found then raise exception '只能申请修改或删除自己上传的绘本'; end if;
  if kind not in ('edit','delete') then raise exception '申请类型无效'; end if;
  if (patch - array['title','title_zh','level','description','source_url','cover_url','audio_url','video_url'])<>'{}'::jsonb then raise exception '申请包含不允许修改的字段'; end if;
  if exists(select 1 from public.book_change_requests where book_id=bid and status='pending') then raise exception '这本书已有待审核申请'; end if;
  insert into public.book_change_requests(user_id,book_id,kind,changes,reason) values(u,bid,kind,patch,coalesce(p_payload->>'reason','')); 
  return jsonb_build_object('ok',true);
 end if;
 if p_action='review' then
  if not admin then raise exception '只有管理员可以审核'; end if;
  select * into req from public.book_change_requests where id=(p_payload->>'request_id')::uuid for update;
  if not found or req.status<>'pending' then raise exception '申请不存在或已处理'; end if;
  if coalesce((p_payload->>'approve')::boolean,false) then
   if req.kind='delete' then
    insert into public.story_book_shelf(id,deleted) values(req.book_id,true) on conflict(id) do update set deleted=true;
   else
    patch:=req.changes;
    update public.story_books set title=coalesce(patch->>'title',title),title_zh=coalesce(patch->>'title_zh',title_zh),level=coalesce(patch->>'level',level),description=coalesce(patch->>'description',description),source_url=coalesce(patch->>'source_url',source_url),cover_url=coalesce(patch->>'cover_url',cover_url),audio_url=coalesce(patch->>'audio_url',audio_url),video_url=coalesce(patch->>'video_url',video_url),updated_at=now() where id=req.book_id;
   end if;
  end if;
  update public.book_change_requests set status=case when (p_payload->>'approve')::boolean then 'approved' else 'rejected' end,review_note=coalesce(p_payload->>'note',''),reviewed_at=now() where id=req.id;
  return jsonb_build_object('ok',true);
 end if;
 raise exception '未知操作';
end $$;
revoke all on function sf_books_private.api(text,jsonb) from public,anon;
grant execute on function sf_books_private.api(text,jsonb) to authenticated;
create function public.book_portal(p_action text,p_payload jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$ select sf_books_private.api(p_action,p_payload); $$;
revoke all on function public.book_portal(text,jsonb) from public,anon;
grant execute on function public.book_portal(text,jsonb) to authenticated;
commit;
