begin;
create index medal_completions_resource_idx on sf_medals_private.completions(resource_key);
create index medal_unlocks_resource_idx on sf_medals_private.child_work_badges(resource_key);
create index medal_badge_asset_idx on sf_medals_private.work_badges(asset_id);
create index medal_template_reviewer_idx on sf_medals_private.honor_templates(reviewed_by);
do $migration$
declare source text;revised text;
begin
 source:=pg_get_functiondef('sf_medals_private.api(text,jsonb)'::regprocedure);
 revised:=replace(source,'h.creator_id=u as own','h.creator_id=u as own,case when h.creator_id=u or admin then h.rights_note else '''' end as rights_note,case when h.creator_id=u or admin then h.rights_confirmed_at else null end as rights_confirmed_at');
 if revised=source then raise exception 'Unexpected template query';end if;
 execute revised;
end $migration$;
commit;
