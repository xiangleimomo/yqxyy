begin;
alter table public.story_books add column content_kind text not null default 'book' check(content_kind in ('book','magazine'));
create index story_books_kind_idx on public.story_books(content_kind);
do $migration$
declare source text; revised text;
begin
 source:=pg_get_functiondef('sf_books_private.api(text,jsonb)'::regprocedure);
 revised:=replace(source,'owner_id,uploader_nickname,audio_url,video_url)','owner_id,uploader_nickname,audio_url,video_url,content_kind)');
 revised:=replace(revised,'coalesce(p_payload->>''video_url'',''''));','coalesce(p_payload->>''video_url'',''''),coalesce(p_payload->>''content_kind'',''book''));');
 revised:=replace(revised,'where not coalesce(s.deleted,false) and (','where not coalesce(s.deleted,false) and x.content_kind=coalesce(p_payload->>''content_kind'',''book'') and (');
 if revised=source or position('video_url,content_kind)' in revised)=0 or position('x.content_kind=' in revised)=0 then raise exception 'Unexpected book portal definition; inspect before migrating'; end if;
 execute revised;
end $migration$;
commit;
