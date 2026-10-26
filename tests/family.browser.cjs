/* Optional real-backend integration test. Credentials must be disposable test
 * identities provisioned by the test operator; never use a real family's login. */
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const file=process.env.FAMILY_E2E_CREDENTIALS;
if(!file)throw Error('Set FAMILY_E2E_CREDENTIALS to a temporary test-only credential file.');
const credentials=JSON.parse(fs.readFileSync(file,'utf8'));
const source=fs.readFileSync(path.join(root,'js/family.js'),'utf8');
const appSource=fs.readFileSync(path.join(root,'js/app.js'),'utf8').replace(/App\.start\(\);\s*$/,'window.App=App;');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true}),errors=[];
 let parent,child;
 async function page(role){
  const context=await browser.newContext({viewport:{width:role==='child'?390:1280,height:1000}}),p=await context.newPage();
  p.on('pageerror',e=>errors.push(e.message));
  await p.route('https://yqxyy.netlify.app/**',async route=>{
   const u=new URL(route.request().url());
   if(u.pathname==='/')return route.fulfill({contentType:'text/html',body:'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><input id="globalSearch" hidden><main id="app" style="padding:16px"></main><div id="accountDialog" hidden><div id="familyAccountSettings"></div><button id="testCloseSettings">关闭账户设置</button></div></body></html>'});
   const local=path.resolve(root,'.'+decodeURIComponent(u.pathname));
   if(!local.startsWith(root+path.sep)||!fs.existsSync(local))return route.fulfill({status:404,body:''});
   return route.fulfill({path:local,contentType:local.endsWith('.json')?'application/json':'text/plain'});
  });
  await p.goto('https://yqxyy.netlify.app/#/'+role);
  await p.addStyleTag({content:fs.readFileSync(path.join(root,'css/style.css'),'utf8')});
  await p.addStyleTag({content:fs.readFileSync(path.join(root,'css/family.css'),'utf8')});
  await p.addScriptTag({content:appSource});await p.addScriptTag({content:source});
  await p.evaluate(({credentials,role})=>{
   const uid=credentials[role+'Id'],token=credentials[role+'Token'];
   window.SFCloud={user:{id:uid},storageKey:key=>'family_test_'+uid+'_'+key,schedule(){},client:{
    rpc:async(name,payload)=>{const r=await fetch(credentials.config.url+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:credentials.config.publishableKey,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(payload)});const d=await r.json();return r.ok?{data:d,error:null}:{data:null,error:d};},
    storage:{from:bucket=>({
     upload:async(object,file,options)=>{const r=await fetch(credentials.config.url+'/storage/v1/object/'+bucket+'/'+object.split('/').map(encodeURIComponent).join('/'),{method:'POST',headers:{apikey:credentials.config.publishableKey,Authorization:'Bearer '+token,'Content-Type':options.contentType},body:file});const d=await r.json();return r.ok?{data:d,error:null}:{data:null,error:d};},
     createSignedUrl:async(object,expiresIn)=>{const r=await fetch(credentials.config.url+'/storage/v1/object/sign/'+bucket+'/'+object.split('/').map(encodeURIComponent).join('/'),{method:'POST',headers:{apikey:credentials.config.publishableKey,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({expiresIn})});const d=await r.json();return r.ok?{data:{signedUrl:credentials.config.url+'/storage/v1'+d.signedURL},error:null}:{data:null,error:d};}
    })},
    functions:{invoke:async(name,{body})=>{const r=await fetch(credentials.config.url+'/functions/v1/'+name,{method:'POST',headers:{apikey:credentials.config.publishableKey,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();return r.ok?{data:d,error:null}:{data:d,error:d};}}
   }};
   SFCloud.open=()=>{document.getElementById('accountDialog').hidden=false;return SFFamily.renderSettings();};
   document.getElementById('testCloseSettings').onclick=()=>{document.getElementById('accountDialog').hidden=true;SFFamily.settingsVersion++;};
   SFFamily.init(App);return SFFamily.render(App);
  },{credentials,role});
  return p;
 }
 async function settings(p){await p.evaluate(()=>SFCloud.open());await p.locator('#familyProfile').waitFor();}
 async function closeSettings(p){await p.locator('#testCloseSettings').click();}
 async function onboard(p,role,name){
  await settings(p);
  if(await p.locator('#familyProfile').count()){
   await p.locator('#familyProfile [name=name]').fill(name);
   await p.locator(`#familyProfile [value=${role}]`).check();await p.getByRole('button',{name:'保存身份'}).click();
  }
  await p.locator('#familyRefresh').waitFor();await closeSettings(p);
 }
 async function refresh(p){await p.getByRole('button',{name:'刷新 / Refresh'}).click();await p.locator('#familyAssignments').waitFor();}
 async function complete(p,correct){
  const quiz=JSON.parse(fs.readFileSync(path.join(root,'data/journey-to-the-west/quiz.json'),'utf8'))['1'];
  const answers=Object.fromEntries(quiz.questions.map(q=>[q.id,correct?q.answer:q.options.find(o=>o.key!==q.answer).key]));
  await p.evaluate(async({answers,correct})=>{
   App.markComplete('journey-to-the-west',1,'watch');App.markComplete('journey-to-the-west',1,'read');App.markComplete('journey-to-the-west',1,'words');
   App.saveQuizScore('journey-to-the-west',1,correct?5:0,5,answers);await SFFamily.flush();
   if(SFFamily.queue(SFFamily.uid).length)throw Error(SFFamily.lastError||'Queue did not drain');
  },{answers,correct});
 }
 try{
  parent=await page('parent');child=await page('child');
  await onboard(parent,'parent','测试家长');await onboard(child,'child','测试孩子');console.log('Verified real Auth and role onboarding');
  await settings(parent);await parent.getByRole('button',{name:'生成 15 分钟绑定码'}).click();
  await parent.locator('#familyCode input').waitFor();const code=await parent.locator('#familyCode input').inputValue();
  await settings(child);await child.locator('#familyClaim [name=code]').fill(code);await child.getByRole('button',{name:'申请绑定'}).click();
  await child.getByText('等待家长确认',{exact:true}).waitFor();await closeSettings(child);
  await settings(parent);await parent.getByRole('button',{name:'确认绑定',exact:true}).click();await parent.getByText('已绑定',{exact:true}).waitFor();await closeSettings(parent);
  let form=parent.locator('#familyAssignmentForm');await form.waitFor();console.log('Verified two-sided family binding');
  assert.equal(await form.locator('[name=kind]').inputValue(),'general');
  await form.locator('[name=title]').fill('完成数学同步练习第 2 页');
  await form.locator('[name=note]').fill('完成第 2 页后拍照提交，不需要学习站内课程。');
  await form.locator('[name=links_text]').fill('资料链接：https://pan.quark.cn/s/family-test 提取码：abcd');
  await form.locator('[name=attachments]').setInputFiles({name:'数学练习.txt',mimeType:'text/plain',buffer:Buffer.from('数学同步练习：请完成第 2 页。')});
  await form.getByRole('button',{name:'发布作业'}).click();
  await parent.getByText('作业已发布，孩子刷新作业列表即可收到。').waitFor({timeout:40000});
  await refresh(child);
  assert.equal(await child.locator('.family-resource-link').getAttribute('href'),'https://pan.quark.cn/s/family-test');
  const parentFile=await child.locator('[data-file]').getAttribute('data-file');
  const canRead=await child.evaluate(async path=>{const r=await SFCloud.client.storage.from('family-homework').createSignedUrl(path,60);return !r.error&&!!r.data?.signedUrl;},parentFile);assert(canRead,'Bound child can read the homework attachment');
  await child.locator('[data-child-note]').fill('数学同步练习第 2 页已完成，请查看照片。');
  await child.locator('[name=child_attachments]').setInputFiles({name:'作业照片.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')});
  await child.locator('[data-submit]').click();await child.getByText('打卡已提交，等待家长确认。').waitFor({timeout:40000});
  await refresh(parent);await parent.locator('.family-submission [data-file]').waitFor();
  const childFile=await parent.locator('.family-submission [data-file]').getAttribute('data-file');
  assert(await parent.evaluate(async path=>{const r=await SFCloud.client.storage.from('family-homework').createSignedUrl(path,60);return !r.error&&!!r.data?.signedUrl;},childFile),'Parent can read the submitted photo');
  await parent.locator('[data-review=approved]').click();await parent.locator('.family-status.approved').waitFor();
  console.log('Verified free-text homework, share link/extraction code, private parent attachment, child photo submission and parent approval without course requirements');
  await parent.locator('.homework-compose>summary').click();form=parent.locator('#familyAssignmentForm');await form.locator('[name=kind]').selectOption('course');
  await parent.waitForFunction(()=>document.querySelector('[name=series_id]').options.length>1);

  await form.locator('[name=series_id]').selectOption('journey-to-the-west');
  await parent.waitForFunction(()=>document.querySelector('[name=episode_id]').options.length>1);
  await form.locator('[name=episode_id]').selectOption('1');
  await form.locator('[name=title]').fill('西游记第一集 · 今日任务');
  await form.locator('[name=note]').fill('读完故事，再完成 Quiz，加油！');
  await form.getByRole('button',{name:'发布作业'}).click();
  await parent.getByText('作业已发布，孩子刷新作业列表即可收到。').waitFor({timeout:40000});
  console.log('Verified real Edge course registration and assignment publishing');
  await refresh(child);await child.locator('[data-submit]').waitFor();
  await child.locator('[data-submit]').click();await child.getByText('还有任务未完成或 Quiz 未达标',{exact:true}).waitFor();
  await complete(child,true);await refresh(child);
  await child.locator('[data-child-note]').fill('我读懂了猴子从石头里出生的故事。');
  await child.locator('[data-submit]').click();await child.getByText('打卡已提交，等待家长确认。').waitFor();
  await refresh(parent);await parent.locator('[data-review=revision]').waitFor();
  await parent.locator('[data-feedback]').fill('请再复习一次，然后重新完成任务。');await parent.locator('[data-review=revision]').click();
  await refresh(child);await complete(child,false);await refresh(child);
  await child.locator('[data-submit]').click();await child.getByText('还有任务未完成或 Quiz 未达标',{exact:true}).waitFor();
  await complete(child,true);await refresh(child);await child.locator('[data-submit]').click();await child.getByText('打卡已提交，等待家长确认。').waitFor();
  await refresh(parent);await parent.locator('[data-review=approved]').click();
  await parent.locator('.family-assignment').filter({hasText:'西游记第一集 · 今日任务'}).locator('.family-status.approved').waitFor();
  await parent.locator('.homework-history>summary').click();await parent.locator('#familyRecordsChild').selectOption(credentials.childId);
  await parent.getByText('近期学习操作',{exact:true}).waitFor();
  assert((await parent.locator('#familyRecords').innerText()).includes('5/5'));
  assert((await parent.locator('#familyRecords').innerText()).includes('0/5'));
  await refresh(child);assert.equal(await child.locator('[data-submit]').count(),0);
  for(const p of [parent,child])assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  if(process.env.FAMILY_SCREENSHOT_DIR){await parent.screenshot({path:path.join(process.env.FAMILY_SCREENSHOT_DIR,'family-parent.png'),fullPage:true});await child.screenshot({path:path.join(process.env.FAMILY_SCREENSHOT_DIR,'family-child.png'),fullPage:true});}
  await parent.evaluate(childId=>SFFamily.rpc('unlink',{user_id:childId}),credentials.childId);
  assert(await child.evaluate(async path=>{const r=await SFCloud.client.storage.from('family-homework').createSignedUrl(path,60);return !!r.error;},parentFile),'Unlink revokes new signed download requests');
  assert.deepEqual(errors,[]);
  console.log('PASS: real Auth + database + Edge catalog; parent/child onboarding, invite/confirm, create assignment, module marks, answer grading, submit, revision without reusing best score, resubmit, approve, parent history, private attachments, unlink revocation and 390px layout');
 }catch(e){
  for(const [name,p]of [['parent',parent],['child',child]])if(p)console.error(name+' notice: '+await p.locator('#familyNotice').innerText().catch(()=>''));
  throw e;
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
