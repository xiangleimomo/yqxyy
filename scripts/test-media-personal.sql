begin;
select set_config('test.media_user',gen_random_uuid()::text,true);
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data,raw_app_meta_data)
values(current_setting('test.media_user')::uuid,'media-test-'||gen_random_uuid()||'@example.invalid',now(),'{"display_name":"媒体测试"}','{}');
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.media_user'),'role','authenticated','app_metadata','{}'::jsonb)::text,true);
set local role authenticated;
select public.book_portal('personal','{"book_id":"anim-test-series","changes":{"favorite":true,"category":"动画分类","cfi":"{\"href\":\"#/lesson/test-series/2\",\"episodeId\":2,\"seconds\":85}"}}');
select public.book_portal('personal','{"book_id":"film-test-film","changes":{"favorite":true,"category":"电影分类","cfi":"{\"href\":\"#/movie/test-film\",\"seconds\":125}"}}');
do $$ begin
 if (select count(*) from public.book_personal where user_id=auth.uid() and book_id in ('anim-test-series','film-test-film') and favorite and last_read_at is not null)<>2 then raise exception 'Media persistence failed'; end if;
 if not exists(select 1 from public.book_personal where book_id='film-test-film' and (last_cfi::jsonb->>'seconds')::integer=125) then raise exception 'Position not persisted'; end if;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated','app_metadata','{}'::jsonb)::text,true);
do $$ begin
 if exists(select 1 from public.book_personal where book_id in ('anim-test-series','film-test-film')) then raise exception 'Media history privacy failed'; end if;
end $$;
reset role;
rollback;
select 'PASS: account media favorites, categories, position persistence and owner isolation' as result;
