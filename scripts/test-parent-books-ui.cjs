const assert=require('node:assert/strict');
const {chromium}=require(process.env.STORYFOX_PLAYWRIGHT || 'C:/Users/lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
function samplePdf(){
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R 4 0 R 5 0 R 6 0 R] /Count 4 >>',...Array(4).fill('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 240 320] /Resources << >> /Contents 7 0 R >>'),'<< /Length 3 >>\nstream\nq Q\nendstream'];
 let pdf='%PDF-1.4\n',offsets=[0]; objects.forEach((obj,i)=>{offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${obj}\nendobj\n`;});
 const start=Buffer.byteLength(pdf);pdf+=`xref\n0 8\n0000000000 65535 f \n${offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
 return Buffer.from(pdf).toString('base64');
}
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try {
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  await page.addInitScript(()=>Object.defineProperty(window,'STORYFOX_SUPABASE',{get:()=>null,set:()=>{}}));
  await page.goto('http://127.0.0.1:8127/#/reading');
  await page.waitForSelector('.book-card');
  assert.equal(await page.getByRole('link',{name:'上传绘本',exact:true}).count(),1);
  await page.getByRole('link',{name:'上传绘本',exact:true}).click();
  await page.getByRole('heading',{name:'登录后使用个人图书功能'}).waitFor();
  await page.evaluate(()=>{
   window.testCalls=[];window.testPersonal={user_id:'parent-test',book_id:'test-book',favorite:true,category:'睡前故事',last_page:2,last_read_at:'2026-11-03T01:00:00Z'};
   SFCloud.user={id:'parent-test'};SFCloud.isAdmin=()=>false;
   SFCloud.client={rpc:async(name,args)=>{testCalls.push(args);return {data:args.p_action==='access'?{eligible:true,can_upload:true,nickname:'测试家长'}:{ok:true}};},from:table=>{
    const q={select(){return q;},eq(){return q;},order(){return q;},maybeSingle:async()=>({data:table==='book_personal'?testPersonal:null}),then(resolve,reject){return Promise.resolve({data:table==='book_personal'?[testPersonal]:[]}).then(resolve,reject);}};return q;
   }};
   BookReader.library=async()=>[{id:'test-book',title:'Test Book',titleZh:'测试绘本',format:'pdf',sourceUrl:'https://u.pone.rs/testbook.pdf',ownerId:'parent-test',uploaderNickname:'测试家长',audioUrl:'https://example.com/audio.mp3'}];
   return App.render();
  });
  await page.getByRole('heading',{name:'上传绘本',exact:true}).waitFor();
  assert.equal(await page.getByRole('link',{name:'管理绘本',exact:true}).count(),0);
  await page.locator('[name=title]').fill('Test Book');
  await page.locator('[name=pdf_url]').fill('https://u.pone.rs/testbook.pdf');
  page.once('dialog',d=>d.dismiss());
  await page.locator('#parentBookPublish').click();
  await page.waitForFunction(()=>document.querySelector('#parentBookStatus').textContent.includes('已取消重复上传'));
  assert.equal(await page.evaluate(()=>testCalls.filter(c=>c.p_action==='publish').length),0);
  page.once('dialog',d=>d.accept());
  await page.locator('#parentBookPublish').click();
  await page.waitForURL('**/#/reading/mine/uploads');
  await page.getByRole('button',{name:'申请修改',exact:true}).waitFor();
  assert.equal(await page.locator('.book-uploader').textContent(),'上传者：测试家长');
  await page.getByRole('button',{name:'收藏 / 分类',exact:true}).click();
  await page.locator('dialog [name=category]').fill('英语启蒙');
  await page.locator('dialog').getByRole('button',{name:'保存',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('dialog'));
  assert.equal(await page.evaluate(()=>testCalls.find(c=>c.p_action==='personal').p_payload.changes.category),'英语启蒙');
  await page.getByRole('link',{name:'最近阅读',exact:true}).first().click();
  await page.getByRole('link',{name:'继续阅读',exact:true}).waitFor();
  await page.evaluate(async()=>{await BookCommunity.restoreProgress({id:'test-book'});});
  assert.equal(await page.evaluate(()=>localStorage.getItem(BookCommunity.progressKey('test-book'))),'2');
  await page.evaluate(async bytes=>{
   const item={id:'test-book',title:'Test Book',format:'pdf',localFile:new File([Uint8Array.from(atob(bytes),c=>c.charCodeAt(0))],'test.pdf',{type:'application/pdf'})};
   BookReader.renderPdfReader(App,item);await BookReader.openPdfFlipbook(item);
  },samplePdf());
  assert.equal(await page.locator('.ebook-error').count(),0);
  assert.equal(await page.evaluate(()=>BookReader.pageFlip.getCurrentPageIndex()),1,'Desktop spread resumes with pages 2 and 3 visible');
  assert.equal(await page.evaluate(()=>localStorage.getItem(BookCommunity.progressKey('test-book'))),'2');
  await page.evaluate(async()=>{BookCommunity.record({id:'test-book'},3);await BookCommunity.flushProgress();});
  assert.equal(await page.evaluate(()=>testCalls.filter(c=>c.p_action==='personal').at(-1).p_payload.changes.page),3);
  await page.evaluate(()=>{SFCloud.user={id:'other-parent'};});
  assert.equal(await page.evaluate(()=>localStorage.getItem(BookCommunity.progressKey('test-book'))),null);
  await page.evaluate(()=>{SFCloud.user={id:'parent-test'};SFCloud.isAdmin=()=>true;location.hash='#/reading/admin';});
  await page.getByRole('heading',{name:/家长修改／删除申请/}).waitFor();
  await page.evaluate(()=>{SFCloud.isAdmin=()=>false;});
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>{SFCloud.user={id:'parent-test'};location.hash='#/reading';});
  await page.waitForSelector('.book-card');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Mobile page must not overflow');
  console.log('PASS: visible entry, login gate, parent upload, duplicate cancel/confirm, nickname, favorites/category, recent records, scoped progress, mobile layout.');
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
