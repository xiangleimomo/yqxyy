begin;
alter table sf_medals_private.work_badges add column creator_id uuid references auth.users(id) on delete set null;
alter table sf_medals_private.work_badges add column removed_by_admin boolean not null default false;
create index work_badges_creator_idx on sf_medals_private.work_badges(creator_id);
create unique index work_badges_resource_asset_idx on sf_medals_private.work_badges(resource_key,asset_id);

-- Extend the existing private API, retaining its auth checks, family scoping and awards.
do $migration$
declare source text; addition text;
begin
 source:=pg_get_functiondef('sf_medals_private.api(text,jsonb)'::regprocedure);
 source:=replace(source,'select * into me from sf_family_private.profiles where user_id=u;',
 'select * into me from sf_family_private.profiles where user_id=u;
 if me.role is null and sf_books_private.parent_access() then me.role:=''parent'';end if;');
 source:=replace(source,'''share'' then ''pending'' else ''draft''','''share'' then ''approved'' else ''draft''');
 source:=replace(source,'只能收藏审核通过的公开设计','只能收藏已上架的公开设计');
 source:=replace(source,'模板不可授予，请先收藏审核通过的设计','模板不可授予，请先收藏已上架的设计');
 addition:=$actions$
 if p_action in ('work_upload','work_list','work_toggle') then
  if not admin and (me.role is distinct from 'parent' or not sf_books_private.parent_access()) then raise exception '仅已注册家长或管理员可管理作品徽章';end if;
  if p_action='work_list' then
   return coalesce((select jsonb_agg(to_jsonb(x)) from (
    select w.id,w.title,w.asset_id,w.resource_key,w.active,w.removed_by_admin,rr.title as resource_title
    from sf_medals_private.work_badges w join sf_medals_private.resources rr on rr.key=w.resource_key
    where w.creator_id=u order by w.created_at desc limit 200
   )x),'[]');
  elsif p_action='work_toggle' then
   select * into b from sf_medals_private.work_badges where id=(p_payload->>'id')::uuid for update;
   if not found or not(admin or coalesce(b.creator_id=u,false)) then raise exception '只能管理自己的作品徽章';end if;
   if not admin and b.removed_by_admin then raise exception '该徽章已由管理员停用';end if;
   if coalesce((p_payload->>'active')::boolean,false) and not exists(select 1 from sf_medals_private.assets where id=b.asset_id and ready and not blocked) then raise exception '图片不可用';end if;
   update sf_medals_private.work_badges set active=coalesce((p_payload->>'active')::boolean,false),
    removed_by_admin=case when admin then not coalesce((p_payload->>'active')::boolean,false) else removed_by_admin end,updated_at=now() where id=b.id;
   insert into sf_medals_private.audit_events(actor_id,action,entity_id) values(u,'work_toggle',b.id::text);
   return jsonb_build_object('ok',true);
  end if;
  -- Derive the resource from the already published book. Never trust client titles/ownership.
  select * into r from sf_medals_private.resources where false;
  res:=p_payload->>'resource_key';
  if not exists(select 1 from public.story_books sb left join public.story_book_shelf ss on ss.id=sb.id
   where (case when sb.content_kind='magazine' then 'magazine:' else 'book:' end)||sb.id=res
    and (admin or sb.owner_id=u) and not coalesce(ss.deleted,false)) then raise exception '只能为本人已上架的绘本或期刊添加徽章';end if;
  if jsonb_typeof(p_payload->'assets') is distinct from 'array' or jsonb_array_length(p_payload->'assets') not between 1 and 8 then raise exception '每次请选择 1–8 张徽章图片';end if;
  if not coalesce((p_payload->>'rights_confirmed')::boolean,false) then raise exception '请确认图片原创或已获授权';end if;
  insert into sf_medals_private.resources(key,resource_type,resource_id,title,href,canonical_key)
   select res,case when sb.content_kind='magazine' then 'magazine' else 'book' end,sb.id,coalesce(nullif(sb.title_zh,''),sb.title),
    (case when sb.content_kind='magazine' then '#/magazine-reader/' else '#/reader/' end)||sb.id,res
   from public.story_books sb where sb.id=split_part(res,':',2)
   on conflict(key) do update set title=excluded.title,href=excluded.href,active=true;
  select * into r from sf_medals_private.resources where key=res;
  for items in select value from jsonb_array_elements(p_payload->'assets') loop
   asset:=(items->>'asset_id')::uuid;
   if not exists(select 1 from sf_medals_private.assets where id=asset and owner_id=u and ready and not blocked) then raise exception '徽章图片不可用或不属于本人';end if;
   insert into sf_medals_private.work_badges(title,asset_id,resource_key,source_type,rights_note,creator_id)
    values(left(r.title,80)||' · 作品徽章',asset,r.canonical_key,'story_inspired','上传者确认原创或已获必要授权',u)
    on conflict(resource_key,asset_id) do nothing;
   get diagnostics affected=row_count;n:=n+affected;
  end loop;
  insert into sf_medals_private.audit_events(actor_id,action,entity_id,detail) values(u,'work_upload',res,jsonb_build_object('count',n));
  return jsonb_build_object('added',n);
 end if;
$actions$;
 if strpos(source,'if not admin then raise exception ''仅管理员可执行'';end if;')=0 then raise exception 'Medals API guard changed';end if;
 source:=replace(source,'if not admin then raise exception ''仅管理员可执行'';end if;',addition||'if not admin then raise exception ''仅管理员可执行'';end if;');
 execute source;

 -- Publish the parent book and its optional badges in the same transaction.
 source:=pg_get_functiondef('sf_books_private.api(text,jsonb)'::regprocedure);
 if strpos(source,'return jsonb_build_object(''id'',bid);')=0 then raise exception 'Book publish API changed';end if;
 source:=replace(source,'return jsonb_build_object(''id'',bid);',
 'if jsonb_array_length(coalesce(p_payload->''badge_assets'',''[]''::jsonb))>0 then
  perform sf_medals_private.api(''work_upload'',jsonb_build_object(''resource_key'',coalesce(nullif(p_payload->>''content_kind'',''''),''book'')||'':''||bid,''assets'',p_payload->''badge_assets'',''rights_confirmed'',p_payload->''badge_rights_confirmed''));
 end if;
 return jsonb_build_object(''id'',bid);');
 execute source;

 -- Existing registered parents need no extra family-profile setup to upload images.
 source:=pg_get_functiondef('sf_medals_private.service(text,jsonb)'::regprocedure);
 source:=replace(source,'select role into role_name from sf_family_private.profiles where user_id=actor;',
 'select role into role_name from sf_family_private.profiles where user_id=actor;
 if role_name is null and exists(select 1 from public.book_profiles where user_id=actor)
  and exists(select 1 from auth.users au where au.id=actor and (au.email_confirmed_at is not null or exists(select 1 from sf_books_private.legacy_accounts la where la.user_id=actor))) then role_name:=''parent'';end if;');
 execute source;
end $migration$;

-- Existing voluntarily shared submissions become available immediately, without review.
update sf_medals_private.honor_templates set review_status='approved',updated_at=now() where visibility='public' and review_status='pending';
commit;
