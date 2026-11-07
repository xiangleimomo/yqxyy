const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:process.env.BROWSER_CHANNEL||'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.goto((process.env.TEST_ORIGIN||'http://127.0.0.1:8000')+'/#/mobile-me',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.SFMembership&&window.SFCloud&&typeof App!=='undefined');
  const setup=async(admin=true)=>page.evaluate(admin=>{
   SFMembership.reset();SFFamily.renderSettings=()=>{};
   SFCloud.user={id:admin?'admin-test':'normal-test',user_metadata:{display_name:'测试账号'}};
   SFCloud.isAdmin=()=>admin;SFCloud.configured=()=>true;
   window.membershipCalls=[];window.memberFixture={user_id:'target-test',email:'member@example.com',tier:'trial',version:0,status:'trial',trial_ends_at:'2026-11-10T12:00:00Z',trial_started_at:'2026-11-07T12:00:00Z',exempt:false};
   SFCloud.client={rpc:async(name,args)=>{
    if(name!=='sf_membership')return {data:null,error:null};
    membershipCalls.push(args);
    if(args.p_action==='me')return {data:{...memberFixture,user_id:SFCloud.user.id}};
    if(args.p_action==='list')return {data:{items:[memberFixture],has_more:false,page:0}};
    if(args.p_action==='set'){memberFixture={...memberFixture,...args.p_payload,version:memberFixture.version+1,status:'active',valid_until:args.p_payload.valid_until||'2027-11-07T12:00:00Z'};return {data:memberFixture};}
   }};SFCloud.mode('account');document.getElementById('accountDialog').hidden=false;
  },admin);
  await setup();await page.locator('#membershipAdmin summary').click();
  await page.locator('.membership-account').click();
  assert(await page.locator('#membershipExpiry').isHidden());
  await page.locator('#membershipEdit select').selectOption('monthly');
  assert(await page.locator('#membershipExpiry').isVisible());
  await page.locator('#membershipEdit [name=note]').fill('人工开通月卡');
  await page.locator('#membershipEdit button').click();
  await page.getByText('已保存账号类型与有效期。',{exact:true}).waitFor();
  let calls=await page.evaluate(()=>membershipCalls.filter(c=>c.p_action==='set'));
  assert.equal(calls[0].p_payload.tier,'monthly');assert.equal(calls[0].p_payload.version,0);assert.equal(calls[0].p_payload.valid_until,null);
  await page.locator('#membershipEdit select').selectOption('annual');
  await page.locator('#membershipEdit [name=valid_until]').fill('2028-01-01T12:00');
  await page.locator('#membershipEdit button').click();
  await page.getByText('已保存账号类型与有效期。',{exact:true}).waitFor();
  calls=await page.evaluate(()=>membershipCalls.filter(c=>c.p_action==='set'));assert.equal(calls[1].p_payload.tier,'annual');assert.equal(calls[1].p_payload.version,1);assert(calls[1].p_payload.valid_until);
  const bounds=await page.locator('#membershipAccountSettings').evaluate(el=>({left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right,width:innerWidth}));assert(bounds.left>=0&&bounds.right<=bounds.width);
  console.log('PASS mobile administrator monthly/annual edits, custom expiry, versions, save feedback and width');
  await page.setViewportSize({width:1280,height:900});await setup(false);
  await page.locator('#membershipSummary').waitFor();assert.equal(await page.locator('#membershipAdmin').count(),0);assert.match(await page.locator('#membershipSummary').innerText(),/体验用户/);
  console.log('PASS ordinary account sees own tier without administrator controls');
  await page.evaluate(()=>{SFCloud.client.rpc=async()=>({error:{code:'PGRST202'}});return SFMembership.render();});
  await page.getByText('会员服务尚未启用，请联系管理员完成配置。',{exact:true}).waitFor();
  console.log('PASS missing database migration produces explicit unavailable state');
  await page.evaluate(()=>{window.resolveMembership=null;SFCloud.client.rpc=()=>new Promise(r=>resolveMembership=r);SFMembership.render();});
  await page.waitForFunction(()=>window.resolveMembership);
  await page.evaluate(()=>{SFMembership.reset();SFCloud.user={id:'another-account'};resolveMembership({data:{tier:'annual',exempt:true}});});
  await page.waitForTimeout(100);assert.equal(await page.locator('#membershipAccountSettings').innerText(),'');
  console.log('PASS account switch rejects late membership data');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
