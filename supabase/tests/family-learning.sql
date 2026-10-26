-- Run as the SQL test connection. Every test fixture is rolled back, no emails sent.
begin;
insert into auth.users(id,email,aud,role) values
 ('f0000000-0000-4000-8000-000000000001','family-test-p1@example.invalid','authenticated','authenticated'),
 ('f0000000-0000-4000-8000-000000000002','family-test-c1@example.invalid','authenticated','authenticated'),
 ('f0000000-0000-4000-8000-000000000003','family-test-p2@example.invalid','authenticated','authenticated'),
 ('f0000000-0000-4000-8000-000000000004','family-test-c2@example.invalid','authenticated','authenticated');
create temporary table family_test_state(key text primary key,value text);
grant select,insert,update on family_test_state to authenticated;
select sf_family_private.catalog_put('{"series_id":"family-test","episode_id":1,"series_title":"Test Course","title":"Test Lesson","modules":["watch","read","quiz"],"quiz_answers":{"q1":"A","q2":"B","q3":"C","q4":"A","q5":"B"}}');
set local role authenticated;
select set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000001',true);
select public.sf_family('profile','{"name":"Parent One","role":"parent"}');
insert into family_test_state values('code',(public.sf_family('invite')->>'code'));
select set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000002',true);
select public.sf_family('profile','{"name":"Child One","role":"child"}');
select public.sf_family('claim',jsonb_build_object('code',(select value from family_test_state where key='code')));
do $$ begin
 begin
  perform public.sf_family('claim',jsonb_build_object('code',(select value from family_test_state where key='code')));
  raise exception 'TEST FAILED: invite reuse';
 exception when others then if sqlerrm like 'TEST FAILED:%' then raise; end if; end;
 begin
  perform public.sf_family('profile','{"name":"Changed","role":"parent"}');
  raise exception 'TEST FAILED: role change';
 exception when others then if sqlerrm like 'TEST FAILED:%' then raise; end if; end;
 begin
  perform public.sf_family('create','{"child_id":"f0000000-0000-4000-8000-000000000004","series_id":"family-test","episode_id":1,"title":"bad","modules":["watch"]}');
  raise exception 'TEST FAILED: child create assignment';
 exception when others then if sqlerrm like 'TEST FAILED:%' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000001',true);
do $$ begin
 begin
  perform public.sf_family('records','{"child_id":"f0000000-0000-4000-8000-000000000002"}');
  raise exception 'TEST FAILED: pending link records access';
 exception when others then if sqlerrm like 'TEST FAILED:%' then raise; end if; end;
end $$;
select public.sf_family('confirm','{"user_id":"f0000000-0000-4000-8000-000000000002"}');
insert into family_test_state values('general',public.sf_family('create','{"kind":"general","child_id":"f0000000-0000-4000-8000-000000000002","title":"数学同步练习第2页","note":"完成后打卡","links_text":"提取码 abcd","links":[{"url":"https://pan.quark.cn/s/test"}]}')->>'id');
do $$ begin
 begin
  perform public.sf_family('create','{"kind":"general","child_id":"f0000000-0000-4000-8000-000000000002","title":"bad link","links":[{"url":"javascript:alert(1)"}]}');
  raise exception 'TEST FAILED: unsafe resource URL';
 exception when others then if sqlerrm like 'TEST FAILED:%' then raise; end if; end;
 begin
  perform public.sf_family('create','{"kind":"general","child_id":"f0000000-0000-4000-8000-000000000002","title":"fake file","attachments":[{"name":"secret.pdf","path":"someone-else/file.pdf"}]}');
  raise exception 'TEST FAILED: foreign attachment reference';
 exception when others then if sqlerrm like 'TEST FAILED:%' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000002',true);
select public.sf_family('submit',jsonb_build_object('id',(select value from family_test_state where key='general'),'note','Completed math homework.'));
select set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000001',true);
select public.sf_family('review',jsonb_build_object('id',(select value from family_test_state where key='general'),'decision','approved'));
insert into family_test_state values('task',public.sf_family('create','{"child_id":"f0000000-0000-4000-8000-000000000002","series_id":"family-test","episode_id":1,"title":"Story homework","modules":["watch","quiz"],"quiz_min":80}')->>'id');
-- Parent cannot fabricate child events.
select public.sf_family('record',jsonb_build_object('id',gen_random_uuid(),'series_id','family-test','episode_id',1,'module','watch','occurred_at',now()));
select set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000003',true);
select public.sf_family('profile','{"name":"Other Parent","role":"parent"}');
do $$ declare d jsonb; begin
 d:=public.sf_family('dashboard');
 if jsonb_array_length(d->'assignments')<>0 then raise exception 'TEST FAILED: other family dashboard leak'; end if;
 begin
  perform public.sf_family('records','{"child_id":"f0000000-0000-4000-8000-000000000002"}');
  raise exception 'TEST FAILED: other family records leak';
 exception when others then if sqlerrm like 'TEST FAILED:%' then raise; end if; end;
 begin
  perform public.sf_family('review',jsonb_build_object('id',(select value from family_test_state where key='task'),'decision','approved'));
  raise exception 'TEST FAILED: other parent review';
 exception when others then if sqlerrm like 'TEST FAILED:%' then raise; end if; end;
 begin
  perform public.sf_family_catalog_put('{"series_id":"family-test","episode_id":1}');
  raise exception 'TEST FAILED: browser can alter grading keys';
 exception when insufficient_privilege then null; end;
 begin
  perform * from sf_family_private.assignments;
  raise exception 'TEST FAILED: browser has direct private table access';
 exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000002',true);
-- A historic, perfect score and a module mark do not count for a new task.
select public.sf_family('record',jsonb_build_object('id',gen_random_uuid(),'series_id','family-test','episode_id',1,'module','watch','occurred_at',now()-interval '1 day'));
select public.sf_family('record',jsonb_build_object('id',gen_random_uuid(),'series_id','family-test','episode_id',1,'module','quiz','occurred_at',now()-interval '1 day','answers','{"q1":"A","q2":"B","q3":"C","q4":"A","q5":"B"}'::jsonb));
do $$ begin
 begin
  perform public.sf_family('submit',jsonb_build_object('id',(select value from family_test_state where key='task')));
  raise exception 'TEST FAILED: historical results completed new assignment';
 exception when others then if sqlerrm like 'TEST FAILED:%' then raise; end if; end;
end $$;
insert into family_test_state values('event',gen_random_uuid()::text);
select public.sf_family('record',jsonb_build_object('id',(select value from family_test_state where key='event'),'series_id','family-test','episode_id',1,'module','watch','occurred_at',now()));
select public.sf_family('record',jsonb_build_object('id',(select value from family_test_state where key='event'),'series_id','family-test','episode_id',1,'module','watch','occurred_at',now()));
-- Client-supplied score is ignored; answers are graded against the server key.
do $$ declare d jsonb; begin
 d:=public.sf_family('record',jsonb_build_object('id',gen_random_uuid(),'series_id','family-test','episode_id',1,'module','quiz','score',5,'total',5,'occurred_at',now(),'answers','{"q1":"C","q2":"C","q3":"C","q4":"C","q5":"C"}'::jsonb));
 if (d->>'score')::int<>1 then raise exception 'TEST FAILED: client score trusted'; end if;
 begin
  perform public.sf_family('submit',jsonb_build_object('id',(select value from family_test_state where key='task')));
  raise exception 'TEST FAILED: below-threshold submission';
 exception when others then if sqlerrm like 'TEST FAILED:%' then raise; end if; end;
end $$;
select public.sf_family('record',jsonb_build_object('id',gen_random_uuid(),'series_id','family-test','episode_id',1,'module','quiz','occurred_at',now(),'answers','{"q1":"A","q2":"B","q3":"C","q4":"A","q5":"B"}'::jsonb));
select public.sf_family('submit',jsonb_build_object('id',(select value from family_test_state where key='task'),'note','I learned the story.'));
do $$ begin
 begin
  perform public.sf_family('review',jsonb_build_object('id',(select value from family_test_state where key='task'),'decision','approved'));
  raise exception 'TEST FAILED: child reviewed own submission';
 exception when others then if sqlerrm like 'TEST FAILED:%' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000001',true);
select public.sf_family('review',jsonb_build_object('id',(select value from family_test_state where key='task'),'decision','approved','feedback','Well done!'));
do $$ declare d jsonb; begin
 d:=public.sf_family('records','{"child_id":"f0000000-0000-4000-8000-000000000002"}');
 if d ? 'wordbank' or d ? 'sentences' or (d->'events'->0) ? 'answers' then raise exception 'TEST FAILED: private collection or answer leak'; end if;
 if jsonb_array_length(d->'events')<>5 then raise exception 'TEST FAILED: duplicate event was not idempotent'; end if;
end $$;
select public.sf_family('unlink','{"user_id":"f0000000-0000-4000-8000-000000000002"}');
do $$ begin
 begin
  perform public.sf_family('records','{"child_id":"f0000000-0000-4000-8000-000000000002"}');
  raise exception 'TEST FAILED: access after unlink';
 exception when others then if sqlerrm like 'TEST FAILED:%' then raise; end if; end;
end $$;
reset role;
set local role anon;
do $$ begin
 begin
  perform public.sf_family('dashboard');
  raise exception 'TEST FAILED: anonymous family access';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'PASS: parent/child binding, source-verified quiz grading, fresh attempts, submission/review, event idempotency, private collection protection, family isolation, unlink and anonymous denial' as result;
rollback;
