begin;
alter table sf_medals_private.honor_templates add column medal_type text not null default 'honor' check(medal_type in ('work','honor'));
alter table sf_medals_private.honor_awards add column medal_type text not null default 'honor' check(medal_type in ('work','honor'));
alter table sf_medals_private.work_badges add column template_id uuid unique references sf_medals_private.honor_templates(id);

-- Keep user designs and automatic work-unlock configuration together, without a second upload.
create function sf_medals_private.sync_work_design() returns trigger language plpgsql security definer set search_path='' as $$
declare tid uuid;
begin
 if pg_trigger_depth()>1 then return new;end if;
 if new.template_id is null then
  insert into sf_medals_private.honor_templates(creator_id,is_system,title,description,asset_id,resource_key,rights_confirmed_at,rights_note,visibility,review_status,medal_type)
   values(new.creator_id,new.creator_id is null,new.title,new.description,new.asset_id,new.resource_key,now(),new.rights_note,
    case when new.active then 'public' else 'private' end,case when new.active then 'approved' else 'draft' end,'work') returning id into tid;
  update sf_medals_private.work_badges set template_id=tid where id=new.id;
 else
  update sf_medals_private.honor_templates set title=new.title,description=new.description,asset_id=new.asset_id,resource_key=new.resource_key,
   medal_type='work',visibility=case when new.active then 'public' else 'private' end,
   review_status=case when new.active then 'approved' when new.removed_by_admin then 'removed' else 'draft' end,updated_at=now()
   where id=new.template_id;
 end if;
 return new;
end $$;
create trigger sync_work_design after insert or update on sf_medals_private.work_badges for each row execute function sf_medals_private.sync_work_design();
-- Populate matching designs for existing uploaded and platform work badges, preserving their IDs/unlocks.
update sf_medals_private.work_badges set updated_at=updated_at where template_id is null;

create function sf_medals_private.sync_design_work() returns trigger language plpgsql security definer set search_path='' as $$
declare linked sf_medals_private.work_badges%rowtype;published boolean;canonical text;
begin
 if pg_trigger_depth()>1 then return new;end if;
 select * into linked from sf_medals_private.work_badges where template_id=new.id for update;
 published:=new.medal_type='work' and new.resource_key is not null and new.visibility='public' and new.review_status='approved';
 if linked.removed_by_admin and published and coalesce(auth.jwt()->'app_metadata'->>'site_admin','false')<>'true' then raise exception '该作品徽章已由管理员停用';end if;
 if new.medal_type='work' and new.resource_key is not null then
  select canonical_key into canonical from sf_medals_private.resources where key=new.resource_key and active;
  if canonical is null then raise exception '请绑定有效作品';end if;
 end if;
 if linked.id is not null then
  update sf_medals_private.work_badges set title=new.title,description=new.description,asset_id=new.asset_id,
   resource_key=coalesce(canonical,resource_key),rights_note=coalesce(nullif(new.rights_note,''),'上传者确认原创或必要授权'),active=published,updated_at=now() where id=linked.id;
 elsif published then
  insert into sf_medals_private.work_badges(title,description,asset_id,resource_key,source_type,rights_note,creator_id,template_id)
   values(new.title,new.description,new.asset_id,canonical,'story_inspired',coalesce(nullif(new.rights_note,''),'上传者确认原创或必要授权'),new.creator_id,new.id);
 end if;
 return new;
end $$;
create trigger sync_design_work after insert or update on sf_medals_private.honor_templates for each row execute function sf_medals_private.sync_design_work();

create function sf_medals_private.snapshot_medal_type() returns trigger language plpgsql security definer set search_path='' as $$
begin
 select medal_type into new.medal_type from sf_medals_private.honor_templates where id=new.template_id;
 return new;
end $$;
create trigger snapshot_medal_type before insert on sf_medals_private.honor_awards for each row execute function sf_medals_private.snapshot_medal_type();
revoke all on function sf_medals_private.sync_work_design(),sf_medals_private.sync_design_work(),sf_medals_private.snapshot_medal_type() from public,anon,authenticated;

do $migration$
declare source text;manual_query text;
begin
 source:=pg_get_functiondef('sf_medals_private.api(text,jsonb)'::regprocedure);
 source:=replace(source,'h.id,h.title,h.description,h.theme,h.asset_id,h.resource_key,h.is_system,','h.id,h.title,h.description,h.theme,h.asset_id,h.resource_key,h.is_system,h.medal_type,');
 source:=replace(source,'''rule'',w.unlock_rule,''earned''','''template_id'',w.template_id,''rule'',w.unlock_rule,''earned''');
 source:=replace(source,'resource_key,rights_confirmed_at,rights_note)', 'resource_key,rights_confirmed_at,rights_note,medal_type)');
 source:=replace(source,'asset,res,now(),coalesce(p_payload->>''rights_note'',''''))', 'asset,res,now(),coalesce(p_payload->>''rights_note'',''''),coalesce(p_payload->>''medal_type'',''honor''))');
 source:=replace(source,'theme=excluded.theme,asset_id=excluded.asset_id,resource_key=excluded.resource_key,','theme=excluded.theme,asset_id=excluded.asset_id,resource_key=excluded.resource_key,medal_type=excluded.medal_type,');
 -- A saved honor design cannot accidentally acquire a work-unlock binding.
 source:=replace(source,'res:=nullif(p_payload->>''resource_key'','''');',
 'res:=nullif(p_payload->>''resource_key'','''');
 if p_action=''template_save'' and coalesce(p_payload->>''medal_type'',''honor'')<>''work'' then res:=null;end if;');
 manual_query:=$query$
 'manual_works',coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'template_id',x.template_id,'title',x.title_snapshot,'asset_id',case when h.review_status='removed' then null else x.asset_id end,'removed',h.review_status='removed','creator',x.creator_nickname_snapshot,'giver',x.giver_nickname_snapshot,'awarded_at',x.awarded_at,'completion_date',x.completion_date,'message',x.message,'resource_title',x.resource_title_snapshot,'href',rr.href,'manual',true,'earned',true) order by x.awarded_at desc)
 from sf_medals_private.honor_awards x join sf_medals_private.honor_templates h on h.id=x.template_id left join sf_medals_private.resources rr on rr.key=x.resource_key
 where x.child_id=child and x.status='active' and x.medal_type='work'),'[]'),
$query$;
 source:=replace(source,'''awards'',coalesce',manual_query||'''awards'',coalesce');
 source:=replace(source,'where x.child_id=child and x.status=''active''),''[]''));','where x.child_id=child and x.status=''active'' and x.medal_type=''honor''),''[]''));');
 source:=replace(source,'issued_award.id,issued_award.title_snapshot','issued_award.id,issued_award.medal_type,issued_award.title_snapshot');
 execute source;
end $migration$;
commit;
