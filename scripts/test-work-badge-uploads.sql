begin;
select set_config('worktest.parent',gen_random_uuid()::text,true),set_config('worktest.other',gen_random_uuid()::text,true),set_config('worktest.child',gen_random_uuid()::text,true);
insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data) select current_setting('worktest.'||kind)::uuid,'workbadge-'||gen_random_uuid()||'@example.invalid',now(),'{}' from(values('parent'),('other'),('child'))x(kind);
-- Parent with no family profile can use existing registered-parent upload permissions.
insert into public.book_profiles(user_id,nickname) values(current_setting('worktest.parent')::uuid,'测试上传者'||substr(current_setting('worktest.parent'),1,8)),(current_setting('worktest.other')::uuid,'测试他人'||substr(current_setting('worktest.other'),1,8));
insert into sf_family_private.profiles(user_id,role,name) values(current_setting('worktest.child')::uuid,'child','测试孩子');
insert into sf_medals_private.assets(owner_id,full_url,thumb_url,full_iv,thumb_iv,width,height,ready)
 select current_setting('worktest.parent')::uuid,'https://u.pone.rs/testcipher.bin','https://u.pone.rs/testcipher.bin',repeat('a',24),repeat('b',24),512,512,true from generate_series(1,2);
select set_config('worktest.assets',(select jsonb_agg(jsonb_build_object('asset_id',id))::text from sf_medals_private.assets where owner_id=current_setting('worktest.parent')::uuid),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('worktest.parent'),'role','authenticated','app_metadata','{}'::jsonb)::text,true);
set local role authenticated;
select set_config('worktest.book',(public.book_portal('publish',jsonb_build_object('title','测试多枚徽章'||gen_random_uuid(),'source_url','https://u.pone.rs/test.pdf','content_kind','book','badge_assets',current_setting('worktest.assets')::jsonb,'badge_rights_confirmed',true))->>'id'),true);
select set_config('worktest.magazine',(public.book_portal('publish',jsonb_build_object('title','测试期刊无徽章'||gen_random_uuid(),'source_url','https://u.pone.rs/test.pdf','content_kind','magazine'))->>'id'),true);
do $$declare rows jsonb;result jsonb;denied boolean:=false;begin
 rows:=public.sf_medals('work_list');if jsonb_array_length(rows)<>2 then raise exception 'Expected two work badges';end if;
 if exists(select 1 from jsonb_array_elements(rows) x where x->>'resource_key'<>'book:'||current_setting('worktest.book') or (x->>'active')::boolean is not true) then raise exception 'Wrong work binding or inactive';end if;
 result:=public.sf_medals('work_upload',jsonb_build_object('resource_key','book:'||current_setting('worktest.book'),'assets',current_setting('worktest.assets')::jsonb,'rights_confirmed',true));if (result->>'added')::int<>0 then raise exception 'Retry duplicated badges';end if;
 perform public.sf_medals('work_toggle',jsonb_build_object('id',rows->0->>'id','active',false));
 perform public.sf_medals('work_toggle',jsonb_build_object('id',rows->0->>'id','active',true));
 begin perform public.book_portal('publish',jsonb_build_object('title','must-rollback-workbadge','source_url','https://u.pone.rs/test.pdf','badge_assets',jsonb_build_array(jsonb_build_object('asset_id',gen_random_uuid())),'badge_rights_confirmed',true));exception when raise_exception then denied:=true;end;
 if not denied then raise exception 'Foreign asset accepted';end if;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('worktest.other'),'role','authenticated','app_metadata','{}'::jsonb)::text,true);
do $$declare denied boolean:=false;begin
 begin perform public.sf_medals('work_upload',jsonb_build_object('resource_key','book:'||current_setting('worktest.book'),'assets',current_setting('worktest.assets')::jsonb,'rights_confirmed',true));exception when raise_exception then denied:=true;end;
 if not denied then raise exception 'Other parent altered book badges';end if;
 if jsonb_array_length(public.sf_medals('work_list'))<>0 then raise exception 'Another parent sees owner management';end if;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('worktest.child'),'role','authenticated','app_metadata','{}'::jsonb)::text,true);
do $$declare result jsonb;begin result:=public.sf_medals('complete',jsonb_build_object('resource_key','book:'||current_setting('worktest.book'),'self_report',true));if (result->>'unlocked')::int<>2 then raise exception 'Child did not unlock both work badges';end if;end $$;
reset role;
do $$begin
 if exists(select 1 from public.story_books where title='must-rollback-workbadge') then raise exception 'Failed badge publish left a book behind';end if;
 if not exists(select 1 from public.story_books where id=current_setting('worktest.magazine') and content_kind='magazine') then raise exception 'Magazine without optional badges failed';end if;
end $$;
rollback;
select 'PASS: optional book/magazine badges, multiple work badges, owner-only toggles, retry idempotency, child unlock and atomic publish rollback' as result;
