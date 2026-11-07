// Local PostgreSQL integration tests. PGLITE_MODULE may point to an installed
// @electric-sql/pglite package; this never connects to a hosted database.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PGlite}=require(process.env.PGLITE_MODULE||'@electric-sql/pglite');
const migration=path.join(__dirname,'../supabase/migrations/20261107160000_membership_foundation.sql');
(async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon; create role authenticated; create role service_role;
   create schema auth;
   create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb default '{}',raw_user_meta_data jsonb default '{}',created_at timestamptz default now());
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
  await db.exec(fs.readFileSync(migration,'utf8'));
  const admin='00000000-0000-0000-0000-000000000001',user='00000000-0000-0000-0000-000000000002',special='00000000-0000-0000-0000-000000000003';
  await db.query(`insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data) values
   ($1,'admin@example.com','{"site_admin":true}','{}'),($2,'parent@example.com','{}','{"role":"parent","site_admin":true}'),($3,'hanyi888@qq.com','{}','{}')`,[admin,user,special]);
  const as=async(uid,role='authenticated')=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid||'']);await db.exec('set role '+role);};
  const rpc=async(action,payload={})=>(await db.query('select public.sf_membership($1,$2::jsonb) as value',[action,JSON.stringify(payload)])).rows[0].value;
  const rejects=async(fn,pattern)=>assert.rejects(fn,pattern);
  await as(null,'anon');await rejects(()=>rpc('me'),/permission denied/);
  await as(user);let state=await rpc('me');assert.equal(state.tier,'trial');assert.equal(state.enforcement_enabled,false);
  assert.equal(new Date(state.trial_ends_at)-new Date(state.trial_started_at),72*3600000);
  const start=state.trial_started_at;assert.equal((await rpc('me')).trial_started_at,start);
  await rejects(()=>rpc('list'),/仅管理员/);await rejects(()=>rpc('set',{user_id:user,tier:'annual',version:0}),/仅管理员/);
  await rejects(()=>db.exec(`update sf_membership_private.accounts set tier='annual'`),/permission denied/);
  await rejects(()=>db.query('select sf_membership_private.describe($1)',[user]),/permission denied/);
  await rejects(()=>db.query("select public.sf_membership_payment('forged',$1,'annual')",[user]),/permission denied/);
  await as(special);assert.equal((await rpc('me')).status,'exempt');await rejects(()=>rpc('list'),/仅管理员/);
  await as(admin);assert.equal((await rpc('me')).exempt,true);
  let list=await rpc('list',{query:'parent@example.com'});assert.equal(list.items.length,1);assert.equal(list.items[0].tier,'trial');
  state=await rpc('set',{user_id:user,tier:'monthly',version:0,note:'manual monthly'});assert.equal(state.tier,'monthly');assert.equal(state.status,'active');
  assert(Math.abs(new Date(state.valid_until)-Date.now()-30*86400000)<5000);
  await rejects(()=>rpc('set',{user_id:user,tier:'annual',version:0}),/资料已变化/);
  await rejects(()=>rpc('set',{user_id:user,tier:'annual',version:1,valid_until:'2000-01-01'}),/有效期/);
  await rejects(()=>rpc('set',{user_id:user,tier:'lifetime',version:1}),/类型无效/);
  state=await rpc('set',{user_id:user,tier:'annual',version:1});assert.equal(state.tier,'annual');assert(Math.abs(new Date(state.valid_until)-Date.now()-365*86400000)<5000);
  state=await rpc('set',{user_id:user,tier:'trial',version:2});assert.equal(state.trial_started_at,start);assert.equal(state.valid_until,null);
  const custom=new Date(Date.now()+7*86400000).toISOString();state=await rpc('set',{user_id:user,tier:'monthly',version:3,valid_until:custom});assert.equal(new Date(state.valid_until).toISOString(),custom);
  await db.exec('reset role');assert.equal((await db.query("select count(*)::int n from sf_membership_private.audit where source='admin'")).rows[0].n,4);
  await db.exec(`insert into auth.users(id,email) select ('10000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'member'||n||'@example.com' from generate_series(1,23) n`);
  await as(admin);list=await rpc('list');assert.equal(list.items.length,20);assert.equal(list.has_more,true);const next=await rpc('list',{page:1});assert.equal(next.items.length,6);assert(!next.items.some(x=>list.items.some(y=>y.user_id===x.user_id)));
  assert.equal((await rpc('list',{query:'%'})).items.length,0);
  await as(null,'service_role');const pay=async(id,who=user,tier='monthly')=>(await db.query('select public.sf_membership_payment($1,$2,$3) value',[id,who,tier])).rows[0].value;
  const paid=await pay('verified-order-1');assert.equal(new Date(paid.valid_until)-new Date(custom),30*86400000);
  assert.deepEqual(await pay('verified-order-1'),paid);await rejects(()=>pay('verified-order-1',special),/不一致/);
  const paidAgain=await pay('verified-order-2');assert.equal(new Date(paidAgain.valid_until)-new Date(paid.valid_until),30*86400000);
  await db.exec('reset role');assert.equal((await db.query("select count(*)::int n from sf_membership_private.audit where source='payment'")).rows[0].n,2);
  await db.query("update sf_membership_private.accounts set valid_until=now()-interval '1 hour' where user_id=$1",[user]);
  await as(user);assert.equal((await rpc('me')).status,'expired');
  await db.exec('reset role');await db.query("update sf_membership_private.accounts set tier='trial',valid_until=null,trial_started_at=now()-interval '73 hours' where user_id=$1",[user]);
  await as(user);state=await rpc('me');assert.equal(state.status,'expired');assert.equal(state.enforcement_enabled,false);
  await db.exec('reset role');await db.query("update auth.users set raw_app_meta_data='{}' where id=$1",[admin]);await as(admin);await rejects(()=>rpc('list'),/仅管理员/);
  console.log('PASS: actual local PostgreSQL migration, default 72h trial, exemptions, admin-only writes/listing, role revocation, expiry, custom dates, optimistic version checks, audit, pagination, service-only payment and idempotency; no paywall enabled.');
 }finally{await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
