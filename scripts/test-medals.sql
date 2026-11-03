begin;
select set_config('medals.pa',gen_random_uuid()::text,true),set_config('medals.pb',gen_random_uuid()::text,true),set_config('medals.cc',gen_random_uuid()::text,true),set_config('medals.cd',gen_random_uuid()::text,true),set_config('medals.ad',gen_random_uuid()::text,true);
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data,raw_app_meta_data)
select current_setting('medals.'||id)::uuid,'medal-test-'||gen_random_uuid()||'@example.invalid',now(),jsonb_build_object('display_name',name,'site_admin',true),case when id='ad' then '{"site_admin":true}'::jsonb else '{}'::jsonb end
from(values('pa','家长甲'),('pb','家长乙'),('cc','孩子甲'),('cd','孩子乙'),('ad','测试管理员'))x(id,name);
insert into sf_family_private.profiles(user_id,role,name) select current_setting('medals.'||id)::uuid,role,name from(values('pa','parent','家长甲'),('pb','parent','家长乙'),('cc','child','孩子甲'),('cd','child','孩子乙'),('ad','parent','测试管理员'))x(id,role,name);
insert into sf_family_private.links(parent_id,child_id,status,confirmed_at) values(current_setting('medals.pa')::uuid,current_setting('medals.cc')::uuid,'active',now()),(current_setting('medals.pb')::uuid,current_setting('medals.cd')::uuid,'active',now()),(current_setting('medals.pa')::uuid,current_setting('medals.cd')::uuid,'pending',null);
insert into sf_medals_private.resources(key,resource_type,resource_id,title,href,parent_key,canonical_key,expected_count) values
('book:test-medals','book','test-medals','测试图书','#/reading',null,'book:test-medals',1),
('series:test-medals','series','test-medals','测试系列','#/series/test-medals',null,'series:test-medals',2),
('episode:test-medals:1','episode','test-medals:1','第1集','#/lesson/test-medals/1','series:test-medals','episode:test-medals:1',1),
('episode:test-medals:2','episode','test-medals:2','第2集','#/lesson/test-medals/2','series:test-medals','episode:test-medals:2',1);
insert into sf_medals_private.assets(owner_id,full_url,thumb_url,full_iv,thumb_iv,width,height,ready) values(current_setting('medals.pa')::uuid,'https://u.pone.rs/testcipher.bin','https://u.pone.rs/testcipher.bin',repeat('a',24),repeat('b',24),512,512,true);
select set_config('medals.asset',(select id::text from sf_medals_private.assets where owner_id=current_setting('medals.pa')::uuid),true);
insert into sf_medals_private.assets(owner_id,full_url,thumb_url,full_iv,thumb_iv,width,height,ready) values(current_setting('medals.ad')::uuid,'https://u.pone.rs/testcipher.bin','https://u.pone.rs/testcipher.bin',repeat('c',24),repeat('d',24),512,512,true);
select set_config('medals.work_asset',(select id::text from sf_medals_private.assets where owner_id=current_setting('medals.ad')::uuid),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('medals.ad'),'role','authenticated','app_metadata',jsonb_build_object('site_admin',true))::text,true);
set local role authenticated;
select set_config('medals.badge',(public.sf_medals('badge_save',jsonb_build_object('title','作品徽章','asset_id',current_setting('medals.work_asset'),'resource_key','book:test-medals','source_type','original','rights_note','测试原创设计及授权','unlock_rule','self_report'))->>'id'),true);
select set_config('medals.quiz',(public.sf_medals('badge_save',jsonb_build_object('title','测验徽章','asset_id',current_setting('medals.work_asset'),'resource_key','episode:test-medals:1','source_type','original','rights_note','测试原创设计及授权','unlock_rule','quiz'))->>'id'),true);
select set_config('medals.series',(public.sf_medals('badge_save',jsonb_build_object('title','全集徽章','asset_id',current_setting('medals.work_asset'),'resource_key','series:test-medals','source_type','original','rights_note','测试原创设计及授权','unlock_rule','series_all'))->>'id'),true);
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('medals.cc'),'role','authenticated','app_metadata','{}'::jsonb)::text,true);
do $$declare result jsonb;begin
 result:=public.sf_medals('complete','{"resource_key":"book:test-medals"}');if (result->>'unlocked')::integer<>0 then raise exception 'Opening a work unlocked a badge';end if;
 result:=public.sf_medals('complete','{"resource_key":"book:test-medals","self_report":true}');if (result->>'unlocked')::integer<>1 then raise exception 'Self-report did not unlock';end if;
 result:=public.sf_medals('complete','{"resource_key":"book:test-medals","self_report":true}');if (result->>'unlocked')::integer<>0 then raise exception 'Duplicate badge';end if;
 result:=public.sf_medals('complete','{"resource_key":"episode:test-medals:1","self_report":true}');if (result->>'unlocked')::integer<>0 then raise exception 'Self report bypassed quiz or series';end if;
 result:=public.sf_medals('complete','{"resource_key":"episode:test-medals:2","self_report":true}');if (result->>'unlocked')::integer<>1 then raise exception 'Series completion did not unlock';end if;
 if jsonb_array_length(public.sf_medals('dashboard')->'awards')<>0 then raise exception 'Work badge became honor award';end if;
end $$;
reset role;
insert into sf_family_private.events(id,user_id,series_id,episode_id,module,score,total,answers,occurred_at) values(gen_random_uuid(),current_setting('medals.cc')::uuid,'test-medals',1,'quiz',9,10,'{}',now());
set local role authenticated;
do $$declare result jsonb;begin result:=public.sf_medals('complete','{"resource_key":"episode:test-medals:1"}');if (result->>'unlocked')::integer<>1 then raise exception 'Verified quiz did not unlock';end if;end $$;
do $$declare denied boolean:=false;begin
 begin perform public.sf_medals('award',jsonb_build_object('child_id',current_setting('medals.cc'),'template_id',gen_random_uuid(),'idempotency_key',gen_random_uuid()));exception when raise_exception then denied:=true;end;
 if not denied then raise exception 'Child awarded own honor';end if;
 denied:=false;begin perform public.sf_medals_service('prepare',jsonb_build_object('viewer_id',current_setting('medals.cc')));exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Client accessed service image RPC';end if;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('medals.pa'),'role','authenticated','app_metadata','{}'::jsonb)::text,true);
select set_config('medals.template',(public.sf_medals('template_save',jsonb_build_object('title','原创荣誉章','asset_id',current_setting('medals.asset'),'rights_confirmed',true,'description','测试私有设计'))->>'id'),true);
do $$declare denied boolean:=false;begin
 begin perform public.sf_medals('badge_save',jsonb_build_object('title','越权','asset_id',current_setting('medals.asset'),'resource_key','book:test-medals','source_type','original','rights_note','不能由用户元数据授权'));exception when raise_exception then denied:=true;end;
 if not denied then raise exception 'Editable user metadata granted admin';end if;
 denied:=false;begin perform public.sf_medals('award',jsonb_build_object('child_id',current_setting('medals.cd'),'template_id',current_setting('medals.template'),'idempotency_key',gen_random_uuid()));exception when raise_exception then denied:=true;end;
 if not denied then raise exception 'Pending/unbound parent awarded';end if;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('medals.pb'),'role','authenticated','app_metadata','{}'::jsonb)::text,true);
do $$declare denied boolean:=false;begin
 if exists(select 1 from jsonb_array_elements(public.sf_medals('templates','{"mode":"public"}')) item where item->>'id'=current_setting('medals.template')) then raise exception 'Private design leaked publicly';end if;
 begin perform public.sf_medals('collect',jsonb_build_object('id',current_setting('medals.template'),'collect',true));exception when raise_exception then denied:=true;end;
 if not denied then raise exception 'Private design collected';end if;
 denied:=false;begin perform public.sf_medals('dashboard',jsonb_build_object('child_id',current_setting('medals.cc')));exception when raise_exception then denied:=true;end;
 if not denied then raise exception 'Unbound child wall leaked';end if;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('medals.pa'),'role','authenticated','app_metadata','{}'::jsonb)::text,true);
select public.sf_medals('share',jsonb_build_object('id',current_setting('medals.template'),'rights_confirmed',true));
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('medals.pb'),'role','authenticated','app_metadata','{}'::jsonb)::text,true);
do $$begin if not exists(select 1 from jsonb_array_elements(public.sf_medals('templates','{"mode":"public"}')) item where item->>'id'=current_setting('medals.template')) then raise exception 'Direct listing not public immediately';end if;end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('medals.ad'),'role','authenticated','app_metadata',jsonb_build_object('site_admin',true))::text,true);
-- Sharing is immediately public; no admin review is necessary.
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('medals.pb'),'role','authenticated','app_metadata','{}'::jsonb)::text,true);
select public.sf_medals('collect',jsonb_build_object('id',current_setting('medals.template'),'collect',true));
select set_config('medals.intent',gen_random_uuid()::text,true);
select set_config('medals.award',(public.sf_medals('award',jsonb_build_object('child_id',current_setting('medals.cd'),'template_id',current_setting('medals.template'),'message','坚持阅读真棒','idempotency_key',current_setting('medals.intent')))->>'id'),true);
do $$declare result jsonb;begin
 result:=public.sf_medals('award',jsonb_build_object('child_id',current_setting('medals.cd'),'template_id',current_setting('medals.template'),'message','坚持阅读真棒','idempotency_key',current_setting('medals.intent')));
 if result->>'id'<>current_setting('medals.award') then raise exception 'Idempotency failure';end if;
 result:=public.sf_medals('award',jsonb_build_object('child_id',current_setting('medals.cd'),'template_id',current_setting('medals.template'),'message','坚持阅读真棒','idempotency_key',gen_random_uuid()));
 if result->>'id'<>current_setting('medals.award') then raise exception 'Refresh duplicate failure';end if;
end $$;
select public.sf_medals('collect',jsonb_build_object('id',current_setting('medals.template'),'collect',false));
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('medals.cd'),'role','authenticated','app_metadata','{}'::jsonb)::text,true);
do $$declare result jsonb;begin
 result:=public.sf_medals('dashboard')->'awards';
 if jsonb_array_length(result)<>1 or result->0->>'giver'<>'家长乙' or result->0->>'creator'<>'家长甲' then raise exception 'Designer/giver separation or uncollect history failed';end if;
end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('medals.pa'),'role','authenticated','app_metadata','{}'::jsonb)::text,true);
select public.sf_medals('template_save',jsonb_build_object('id',current_setting('medals.template'),'title','修改设计后自行上架','asset_id',current_setting('medals.asset'),'rights_confirmed',true));
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('medals.pb'),'role','authenticated','app_metadata','{}'::jsonb)::text,true);
do $$begin if exists(select 1 from jsonb_array_elements(public.sf_medals('templates','{"mode":"public"}')) item where item->>'id'=current_setting('medals.template')) then raise exception 'Edited image should become private until owner relists';end if;end $$;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('medals.ad'),'role','authenticated','app_metadata',jsonb_build_object('site_admin',true))::text,true);
select public.sf_medals('review',jsonb_build_object('id',current_setting('medals.template'),'decision','removed','note','测试下架'));
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('medals.cd'),'role','authenticated','app_metadata','{}'::jsonb)::text,true);
do $$declare result jsonb;begin result:=public.sf_medals('dashboard')->'awards';if result->0->>'asset_id' is not null or result->0->>'title'<>'原创荣誉章' then raise exception 'Removed image or legal snapshot policy failed';end if;end $$;
reset role;
do $$declare denied boolean:=false;result jsonb;begin
 begin result:=public.sf_medals_service('resolve',jsonb_build_object('viewer_id',current_setting('medals.cd'),'id',current_setting('medals.asset')));exception when raise_exception then denied:=true;end;
 if not denied then raise exception 'Removed image still served';end if;
end $$;
rollback;
select 'PASS: separate libraries, idempotent child unlock, quiz/series rules, roles, active binding, private drafts and direct listing, creator/giver, award retry, uncollect history, owner relisting and removed image denial' as result;
