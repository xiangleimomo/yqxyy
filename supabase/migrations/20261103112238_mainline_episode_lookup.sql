begin;
create function sf_medals_private.resource_for(p_key text) returns sf_medals_private.resources
language plpgsql stable security definer set search_path='' as $$
declare r sf_medals_private.resources%rowtype;series_key text;episode integer;
begin
 select * into r from sf_medals_private.resources where key=p_key and active;
 if found then return r;end if;
 if p_key !~ '^episode:[a-z0-9-]+:[0-9]+$' then return null;end if;
 series_key:='series:'||split_part(p_key,':',2);episode:=split_part(p_key,':',3)::integer;
 select rr.* into r from sf_medals_private.resources rr where rr.key=series_key and rr.active and exists(select 1 from sf_medals_private.work_badges w where w.resource_key=rr.key and w.unlock_rule='series_quiz' and w.active and episode=any(w.required_episodes));
 if not found then return null;end if;
 r.key:=p_key;r.resource_type:='episode';r.resource_id:=split_part(p_key,':',2)||':'||episode;r.canonical_key:=p_key;r.parent_key:=series_key;r.href:='#/lesson/'||split_part(p_key,':',2)||'/'||episode;
 return r;
end $$;
revoke all on function sf_medals_private.resource_for(text) from public,anon,authenticated;
do $migration$
declare source text;
begin
 source:=pg_get_functiondef('sf_medals_private.api(text,jsonb)'::regprocedure);
 source:=replace(source,'select * into r from sf_medals_private.resources where key=p_payload->>''resource_key'' and active;',
 'select * into r from sf_medals_private.resource_for(p_payload->>''resource_key'') where key is not null and active;');
 source:=replace(source,'if source is not null then insert into sf_medals_private.completions',
 'if source is not null and exists(select 1 from sf_medals_private.resources where key=r.canonical_key) then insert into sf_medals_private.completions');
 execute source;
end $migration$;
commit;
