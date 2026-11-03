begin;
select set_config('test.parent',gen_random_uuid()::text,true),set_config('test.other',gen_random_uuid()::text,true),set_config('test.child',gen_random_uuid()::text,true);
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data)
select current_setting('test.'||kind)::uuid,'book-test-'||gen_random_uuid()||'@example.invalid',now(),'{}'::jsonb from unnest(array['parent','other','child']) kind;
insert into sf_family_private.profiles(user_id,role,name) values(current_setting('test.child')::uuid,'child','Test child');
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.parent'),'role','authenticated','app_metadata','{}'::jsonb)::text,true);
set local role authenticated;
select public.book_portal('setup',jsonb_build_object('nickname','Test-'||left(current_setting('test.parent'),30)));
select set_config('test.book',(public.book_portal('publish',jsonb_build_object('title','Test-'||current_setting('test.parent'),'source_url','https://u.pone.rs/testbook.pdf'))->>'id'),true);
do $$
declare blocked boolean:=false; n integer;
begin
 if not (public.book_portal('access')->>'can_upload')::boolean then raise exception 'Parent cannot upload'; end if;
 if not exists(select 1 from public.story_books where id=current_setting('test.book') and owner_id=auth.uid() and uploader_nickname like 'Test-%') then raise exception 'Ownership missing'; end if;
 begin
  perform public.book_portal('publish',jsonb_build_object('title','Test-'||current_setting('test.parent'),'source_url','https://u.pone.rs/testbook.pdf'));
 exception when raise_exception then blocked:=true; end;
 if not blocked then raise exception 'Duplicate bypass'; end if;
 update public.story_books set title='Unauthorized' where id=current_setting('test.book'); get diagnostics n=row_count;
 if n<>0 then raise exception 'Parent directly edited book'; end if;
 perform public.book_portal('personal',jsonb_build_object('book_id',current_setting('test.book'),'changes',jsonb_build_object('favorite',true,'category','Test','page',7)));
 if not exists(select 1 from public.book_personal where last_page=7 and favorite and category='Test' and user_id=auth.uid()) then raise exception 'Personal save failed'; end if;
 perform public.book_portal('request',jsonb_build_object('book_id',current_setting('test.book'),'kind','edit','changes',jsonb_build_object('title','Approved title'),'reason','Test'));
 if exists(select 1 from public.story_books where id=current_setting('test.book') and title='Approved title') then raise exception 'Edit applied before review'; end if;
end $$;
select set_config('test.request',(select id::text from public.book_change_requests where book_id=current_setting('test.book')),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.other'),'role','authenticated','app_metadata','{}'::jsonb)::text,true);
do $$
declare blocked boolean:=false;
begin
 if exists(select 1 from public.book_personal where book_id=current_setting('test.book')) then raise exception 'Other user can read personal data'; end if;
 if exists(select 1 from public.book_change_requests where id=current_setting('test.request')::uuid) then raise exception 'Other user can read request'; end if;
 begin perform public.book_portal('review',jsonb_build_object('request_id',current_setting('test.request'),'approve',true)); exception when raise_exception then blocked:=true; end;
 if not blocked then raise exception 'Non-admin approved request'; end if;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.child'),'role','authenticated','app_metadata','{}'::jsonb)::text,true);
do $$ begin if (public.book_portal('access')->>'eligible')::boolean then raise exception 'Child eligible'; end if; end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.other'),'role','authenticated','app_metadata',jsonb_build_object('site_admin',true))::text,true);
select public.book_portal('review',jsonb_build_object('request_id',current_setting('test.request'),'approve',true));
do $$ begin if not exists(select 1 from public.story_books where id=current_setting('test.book') and title='Approved title') then raise exception 'Admin review did not apply'; end if; end $$;
reset role;
rollback;
select 'PASS: parent publish, duplicate check, owner binding, direct edit denied, private personal data, child denied, admin approval' as result;
