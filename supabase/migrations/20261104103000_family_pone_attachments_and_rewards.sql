-- Homework files are stored with the existing external upload gateway. The
-- database keeps only a validated direct URL; it never stores the file blob.
alter table sf_family_private.assignments
 add column reward_template_id uuid references sf_medals_private.honor_templates(id),
 add column reward_award_id uuid references sf_medals_private.honor_awards(id);

create or replace function sf_family_private.validate_resources(p_owner uuid,p_files jsonb,p_links jsonb) returns void
language plpgsql security invoker set search_path='' as $$
declare f jsonb;
begin
 if jsonb_typeof(p_files)<>'array' or jsonb_array_length(p_files)>5 then raise exception '每项作业最多上传 5 个附件'; end if;
 if jsonb_typeof(p_links)<>'array' or jsonb_array_length(p_links)<>0 then raise exception '作业不支持资料链接或网盘分享'; end if;
 for f in select value from jsonb_array_elements(p_files) loop
  if coalesce(f->>'url','') !~ '^https://u\.pone\.rs/[A-Za-z0-9]+\.(jpg|jpeg|png|webp|gif|heic|heif|pdf|doc|docx|xls|xlsx|ppt|pptx|txt)$'
   or length(coalesce(f->>'name','')) not between 1 and 200
   or coalesce((f->>'size')::bigint,0) not between 1 and 10485760 then raise exception '附件无效，请重新上传'; end if;
 end loop;
end $$;
revoke all on function sf_family_private.validate_resources(uuid,jsonb,jsonb) from public,anon,authenticated;

create function sf_family_private.reward_available(p_parent uuid,p_template uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from sf_medals_private.honor_templates t
  join sf_medals_private.assets asset on asset.id=t.asset_id and asset.ready and not asset.blocked
  where t.id=p_template and t.review_status not in ('removed','rejected') and
   (t.creator_id=p_parent or (t.visibility='public' and t.review_status='approved' and
    (t.is_system or exists(select 1 from sf_medals_private.collections c where c.parent_id=p_parent and c.template_id=t.id))))
 );
$$;
revoke all on function sf_family_private.reward_available(uuid,uuid) from public,anon,authenticated;

create function sf_family_private.deliver_homework_reward(p_assignment uuid) returns void
language plpgsql security definer set search_path='' as $$
declare a sf_family_private.assignments%rowtype;t sf_medals_private.honor_templates%rowtype; award_id uuid;
begin
 select * into a from sf_family_private.assignments where id=p_assignment for update;
 if not found or a.status<>'submitted' or a.reward_template_id is null or a.reward_award_id is not null then return; end if;
 select * into t from sf_medals_private.honor_templates where id=a.reward_template_id;
 if not found or not sf_family_private.reward_available(a.parent_id,t.id) then return; end if;
 insert into sf_medals_private.honor_awards(child_id,parent_id,template_id,asset_id,title_snapshot,creator_nickname_snapshot,giver_nickname_snapshot,message,completion_date,idempotency_key,request_hash)
 values(a.child_id,a.parent_id,t.id,t.asset_id,t.title,case when t.is_system then '平台原创' else sf_medals_private.nickname(t.creator_id) end,sf_medals_private.nickname(a.parent_id),left('完成作业：'||a.title,1000),current_date,gen_random_uuid(),md5('homework:'||a.id::text||':'||t.id::text)) returning id into award_id;
 update sf_family_private.assignments set reward_award_id=award_id where id=a.id;
 insert into sf_medals_private.audit_events(actor_id,action,entity_id,detail) values(a.parent_id,'homework_reward',award_id::text,jsonb_build_object('assignment_id',a.id));
end $$;
revoke all on function sf_family_private.deliver_homework_reward(uuid) from public,anon,authenticated;

create or replace function sf_family_private.homework_reward_trigger() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.status='submitted' and old.status is distinct from 'submitted' then perform sf_family_private.deliver_homework_reward(new.id); end if;
 return new;
end $$;
drop trigger if exists family_assignment_reward on sf_family_private.assignments;
create trigger family_assignment_reward after update of status on sf_family_private.assignments for each row execute function sf_family_private.homework_reward_trigger();
revoke all on function sf_family_private.homework_reward_trigger() from public,anon,authenticated;

create function sf_family_private.set_assignment_reward(p_assignment uuid,p_template uuid) returns void
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();a sf_family_private.assignments%rowtype;
begin
 if u is null then raise exception '请先登录'; end if;
 select * into a from sf_family_private.assignments where id=p_assignment for update;
 if not found or a.parent_id<>u or a.status not in ('assigned','revision') then raise exception '作业不存在或无法设置奖励'; end if;
 if p_template is not null and not sf_family_private.reward_available(u,p_template) then raise exception '奖励徽章不可用，请重新选择'; end if;
 update sf_family_private.assignments set reward_template_id=p_template,reward_award_id=null where id=a.id;
end $$;
create function public.sf_family_set_assignment_reward(p_assignment uuid,p_template uuid) returns void
language sql security definer set search_path='' as $$ select sf_family_private.set_assignment_reward(p_assignment,p_template); $$;
revoke all on function sf_family_private.set_assignment_reward(uuid,uuid),public.sf_family_set_assignment_reward(uuid,uuid) from public,anon;
grant execute on function public.sf_family_set_assignment_reward(uuid,uuid) to authenticated;

create function public.sf_family_assignment_rewards() returns jsonb
language sql security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('assignment_id',a.id,'reward_title',t.title,'reward_awarded',a.reward_award_id is not null)),'[]')
 from sf_family_private.assignments a join sf_medals_private.honor_templates t on t.id=a.reward_template_id
 where auth.uid() in (a.parent_id,a.child_id) and exists(select 1 from sf_family_private.links l where l.parent_id=a.parent_id and l.child_id=a.child_id and l.status='active');
$$;
revoke all on function public.sf_family_assignment_rewards() from public,anon;
grant execute on function public.sf_family_assignment_rewards() to authenticated;

notify pgrst,'reload schema';
