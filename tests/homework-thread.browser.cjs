const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'application/javascript',body:r.request().url().includes('supabase-js')?'window.supabase={createClient:()=>({auth:{onAuthStateChange(){},getSession:async()=>({data:{session:null}})}})};':'window.Hls={isSupported:()=>false};'}));
 await page.route('https://yqxyy.netlify.app/**',r=>{const u=new URL(r.request().url()),file=path.resolve(root,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));return !file.startsWith(root+path.sep)||!fs.existsSync(file)?r.fulfill({status:404,body:''}):r.fulfill({path:file,contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'text/html'});});
 await page.goto('https://yqxyy.netlify.app/#/homework');await page.locator('#familyLogin').waitFor();
 await page.evaluate(()=>{
  const profiles={parent:{role:'parent',name:'小韩爸爸'},child:{role:'child',name:'小韩'},new:null};
  const assignment={id:'task-1',kind:'general',parent_id:'parent',child_id:'child',parent_name:'小韩爸爸',child_name:'小韩',title:'完成数学同步练习第 2 页',note:'请完成第 2 页，做完后拍照或回复。',links:[{url:'https://pan.quark.cn/s/test'}],links_text:'网盘资料：https://pan.quark.cn/s/test\n提取码：abcd',attachments:[],modules:[],created_at:new Date().toISOString(),status:'assigned',feedback:'',due_on:null,submission:null};
  window.testFamily={profiles,assignment};
  SFCloud.client.rpc=async(name,{p_action:action,p_payload:p})=>{
   const uid=SFCloud.user.id;let data={ok:true};
   if(action==='dashboard')data={profile:profiles[uid]?{id:uid,...profiles[uid]}:null,links:uid==='new'?[]:[{parent_id:'parent',child_id:'child',name:uid==='parent'?profiles.child.name:profiles.parent.name,status:'active'}],assignments:uid==='new'?[]:[assignment]};
   else if(action==='profile'){if(profiles[uid]&&profiles[uid].role!==p.role)return {error:{message:'不能更改身份'}};profiles[uid]={role:p.role,name:p.name};}
   else if(action==='invite')data={code:'A'.repeat(32),expires_at:new Date(Date.now()+900000).toISOString()};
   else if(action==='submit'){assertRole(uid,'child');assignment.status='submitted';assignment.submitted_at=new Date().toISOString();assignment.submission={note:p.note,links:p.links,attachments:p.attachments,links_text:p.links_text};}
   else if(action==='review'){assertRole(uid,'parent');assignment.status=p.decision;assignment.feedback=p.feedback;}
   return {data:structuredClone(data),error:null};
  };
  function assertRole(actual,expected){if(actual!==expected)throw Error('Wrong action role');}
  window.switchFamily=async uid=>{SFCloud.user={id:uid,email:uid+'@example.invalid'};SFCloud.active=true;SFFamily.identitySwitch();SFCloud.updateHeader();await App.render();};
  return switchFamily('parent');
 });
 await page.locator('#familyAssignments .homework-request').waitFor();
 assert.equal(await page.locator('.utility-nav a[href="#/homework"]').count(),1);
 assert.equal(await page.locator('.main-tabs a').count(),3);
 assert.equal(await page.locator('.main-tab[href="#/parent"],.main-tab[href="#/child"]').count(),0);
 assert.equal(await page.locator('#app #familyInvite,#app #familyClaim,#app #familyProfile').count(),0);
 await page.locator('#accountLink').click();await page.locator('#familyInvite').waitFor();
 assert.equal(await page.locator('#familyProfile [name=role]').count(),0,'Existing role is tied to the account');
 await page.setViewportSize({width:390,height:850});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 if(process.env.HOMEWORK_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.HOMEWORK_SCREENSHOT_DIR,'homework-account-390.png')});
 await page.setViewportSize({width:1280,height:1000});
 await page.locator('#familyInvite').click();await page.locator('#familyCode input').waitFor();
 assert.equal((await page.locator('#familyCode input').inputValue()).length,32);
 await page.getByRole('button',{name:'刷新绑定',exact:true}).click();await page.locator('#familyInvite').waitFor();
 await page.locator('#accountClose').click();
 await page.evaluate(()=>switchFamily('child'));
 assert.equal(await page.locator('.homework-compose').count(),0);
 await page.locator('[data-child-note]').fill('第 2 页已完成。最后一题请爸爸再讲一次。');
 await page.locator('[data-submit]').click();await page.getByText('打卡已提交，等待家长确认。').waitFor();
 await page.locator('.homework-reply').waitFor();
 const request=await page.locator('.homework-request').boundingBox(),reply=await page.locator('.homework-reply').boundingBox();assert(request.y<reply.y,'Parent request above child reply');
 await page.evaluate(()=>switchFamily('parent'));
 await page.locator('[data-feedback]').fill('已收到，晚上一起看看最后一题。');await page.locator('[data-review=approved]').click();
 await page.locator('.homework-feedback').waitFor();
 assert((await page.locator('.homework-reply').innerText()).includes('第 2 页已完成'));
 assert((await page.locator('.homework-feedback').innerText()).includes('晚上一起看看'));
 for(const width of [1280,390]){await page.setViewportSize({width,height:1000});await page.evaluate(()=>scrollTo(0,0));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);if(process.env.HOMEWORK_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.HOMEWORK_SCREENSHOT_DIR,'homework-thread-'+width+'.png'),fullPage:true});}
 await page.evaluate(()=>switchFamily('new'));assert.equal(await page.locator('#app #familyProfile').count(),0);
 await page.getByRole('button',{name:'打开账号设置',exact:true}).click();await page.locator('#familyProfile').waitFor();
 await page.locator('#familyProfile [name=name]').fill('新家长');await page.locator('#familyProfile [value=parent]').check();await page.getByRole('button',{name:'保存身份',exact:true}).click();await page.getByText('当前身份：',{exact:false}).waitFor();
 assert.equal(await page.locator('#app #familyProfile').count(),0);
 assert.deepEqual(errors,[]);console.log('PASS: one homework navigation, account-only role/binding settings, fixed existing identity, child reply below parent request, feedback, new-profile setup and desktop/mobile layout');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
