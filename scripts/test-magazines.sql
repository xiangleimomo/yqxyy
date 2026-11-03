begin;
select set_config('test.magazine_user',gen_random_uuid()::text,true);
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data,raw_app_meta_data)
values(current_setting('test.magazine_user')::uuid,'magazine-test-'||gen_random_uuid()||'@example.invalid',now(),'{"display_name":"期刊测试"}','{}');
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.magazine_user'),'role','authenticated','app_metadata','{}'::jsonb)::text,true);
set local role authenticated;
select set_config('test.magazine_id',(public.book_portal('publish','{"content_kind":"magazine","title":"Magazine Test","source_url":"https://u.pone.rs/testmagazine.pdf"}')->>'id'),true);
do $$ declare blocked boolean:=false; begin
 if not exists(select 1 from public.story_books where id=current_setting('test.magazine_id') and content_kind='magazine' and owner_id=auth.uid()) then raise exception 'Magazine publishing failed'; end if;
 begin perform public.book_portal('publish','{"content_kind":"magazine","title":"Magazine Test","source_url":"https://u.pone.rs/testmagazine.pdf"}');exception when raise_exception then blocked:=true;end;
 if not blocked then raise exception 'Magazine duplicate bypass';end if;
end $$;
select public.book_portal('publish','{"title":"Magazine Test","source_url":"https://u.pone.rs/testbook.pdf"}');
select public.book_portal('personal',jsonb_build_object('book_id',current_setting('test.magazine_id'),'changes',jsonb_build_object('favorite',true,'category','科普杂志','page',5)));
select public.book_portal('request',jsonb_build_object('book_id',current_setting('test.magazine_id'),'kind','edit','changes',jsonb_build_object('title','Updated magazine'),'reason','测试审核'));
do $$ begin
 if exists(select 1 from public.story_books where id=current_setting('test.magazine_id') and title='Updated magazine') then raise exception 'Unreviewed edit applied';end if;
 if not exists(select 1 from public.book_personal where book_id=current_setting('test.magazine_id') and favorite and last_page=5) then raise exception 'Magazine personal state failed';end if;
end $$;
reset role;
rollback;
select 'PASS: magazine type, parent ownership, duplicate scope, book default, personal state and pending review' as result;
