// Temporary test identities only; no mail is sent. Keep credentials outside source control.
import fs from 'node:fs/promises';import {randomUUID,randomBytes} from 'node:crypto';
const file='supabase/.temp/medal-test-users.json';let fixture;
try{fixture=JSON.parse(await fs.readFile(file,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;fixture={tag:randomUUID(),users:['pa','pb','ca','cb','admin'].map(key=>({key,id:randomUUID(),identity:randomUUID(),email:'medal-'+randomUUID()+'@example.invalid',password:randomBytes(24).toString('base64url'),role:key.startsWith('c')?'child':'parent',name:{pa:'测试家长甲',pb:'测试家长乙',ca:'测试孩子甲',cb:'测试孩子乙',admin:'勋章测试管理员'}[key]}))};await fs.mkdir('supabase/.temp',{recursive:true});await fs.writeFile(file,JSON.stringify(fixture));}
const q=value=>"'"+String(value).replaceAll("'","''")+"'",ids=fixture.users.map(u=>q(u.id)+'::uuid').join(','),by=key=>fixture.users.find(u=>u.key===key);
if(process.argv.includes('--create-sql')){
 let sql='begin;';for(const u of fixture.users){
  sql+=`insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,confirmation_token,recovery_token,email_change_token_new,email_change_token_current,email_change,phone_change,phone_change_token,reauthentication_token,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,is_sso_user,is_anonymous) values(${q(u.id)}::uuid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',${q(u.email)},extensions.crypt(${q(u.password)},extensions.gen_salt('bf')),now(),'','','','','','','','',${q(JSON.stringify({provider:'email',providers:['email'],...(u.key==='admin'?{site_admin:true}:{})}))}::jsonb,${q(JSON.stringify({display_name:u.name,medals_fixture:fixture.tag}))}::jsonb,now(),now(),false,false) on conflict(id) do nothing;`;
  sql+=`insert into auth.identities(id,user_id,provider_id,identity_data,provider,created_at,updated_at) values(${q(u.identity)}::uuid,${q(u.id)}::uuid,${q(u.id)},${q(JSON.stringify({sub:u.id,email:u.email,email_verified:true,phone_verified:false}))}::jsonb,'email',now(),now()) on conflict(provider_id,provider) do nothing;`;
  sql+=`insert into sf_family_private.profiles(user_id,role,name) values(${q(u.id)}::uuid,${q(u.role)},${q(u.name)}) on conflict(user_id) do nothing;`;
 }
 for(const [parent,child] of [['pa','ca'],['pb','cb']])sql+=`insert into sf_family_private.links(parent_id,child_id,status,confirmed_at) values(${q(by(parent).id)}::uuid,${q(by(child).id)}::uuid,'active',now()) on conflict(parent_id,child_id) do nothing;`;
 console.log(sql+"commit;select 'Temporary test identities ready' as result;");
}else if(process.argv.includes('--cleanup-sql')){
 const predicate=`(${ids})`,ownedTemplates=`select id from sf_medals_private.honor_templates where creator_id in ${predicate}`,ownedAssets=`select id from sf_medals_private.assets where owner_id in ${predicate}`,ownedBadges=`select id from sf_medals_private.work_badges where asset_id in (${ownedAssets})`;
 console.log(`begin;
 do $$begin if exists(select 1 from auth.users where id in ${predicate} and coalesce(raw_user_meta_data->>'medals_fixture','')<>${q(fixture.tag)}) then raise exception 'Refusing to remove a non-test account';end if;end $$;
 delete from sf_medals_private.honor_awards where parent_id in ${predicate} or child_id in ${predicate} or template_id in (${ownedTemplates});
 delete from sf_medals_private.collections where parent_id in ${predicate} or template_id in (${ownedTemplates});
 delete from sf_medals_private.reports where reporter_id in ${predicate} or template_id in (${ownedTemplates});
 delete from sf_medals_private.child_work_badges where child_id in ${predicate} or badge_id in (${ownedBadges});
 delete from sf_medals_private.work_badges where id in (${ownedBadges});
 delete from sf_medals_private.honor_templates where id in (${ownedTemplates});
 delete from sf_medals_private.assets where owner_id in ${predicate};
 delete from sf_medals_private.completions where child_id in ${predicate};
 delete from sf_medals_private.audit_events where actor_id in ${predicate};
 delete from sf_medals_private.resources where resource_id in(select id from public.story_books where owner_id in ${predicate});
 delete from public.story_books where owner_id in ${predicate};
 delete from auth.sessions where user_id in ${predicate};
 delete from auth.users where id in ${predicate} and raw_user_meta_data->>'medals_fixture'=${q(fixture.tag)};
 commit;select count(*) as remaining_test_accounts from auth.users where id in ${predicate};`);
}else console.log(JSON.stringify({users:fixture.users.length,credentialsFile:file}));
