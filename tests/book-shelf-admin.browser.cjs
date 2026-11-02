const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage();
  await page.setContent('<main id="app"></main>');
  await page.addScriptTag({path:path.resolve('js/book-admin.js')});
  await page.evaluate(()=>{
   window.rows=[];window.fail=false;window.admin=true;
   const books=['one','two','three'].map(id=>({id,title:id,sourceUrl:'https://u.pone.rs/test.pdf'}));
   window.BookReader={library:async()=>books,readingNavigation:()=>''};
   window.SFCloud={isAdmin:()=>window.admin,client:{auth:{getUser:async()=>({data:{user:{app_metadata:{site_admin:window.admin}}}}),getSession:async()=>({data:{session:{access_token:'test'}}})},from:()=>({upsert:batch=>({select:async()=>{if(window.fail)return {error:{message:'offline'}};window.rows.push(batch);return {data:batch};}})})}};
   window.testApp={el:()=>document.getElementById('app'),escapeHtml:value=>value.replace(/[&<>"']/g,'')};
   return BookAdmin.render(testApp);
  });
  const ids=()=>page.locator('.book-admin-shelf-card').evaluateAll(cards=>cards.map(card=>card.dataset.bookId));
  await page.locator('[data-book-id="one"] .book-drag-handle').dragTo(page.locator('[data-book-id="three"]'));
  await page.waitForFunction(()=>document.querySelector('.book-shelf-status').textContent.includes('顺序已保存'));
  assert.deepEqual(await ids(),['two','three','one']);
  assert.deepEqual(await page.evaluate(()=>rows[0]),[{id:'two',sort_order:0},{id:'three',sort_order:1},{id:'one',sort_order:2}]);
  await page.evaluate(()=>window.fail=true);
  await page.locator('[data-book-id="one"] .book-drag-handle').dragTo(page.locator('[data-book-id="two"]'));
  await page.waitForFunction(()=>document.querySelector('.book-shelf-status').textContent.includes('排序保存失败'));
  assert.deepEqual(await ids(),['two','three','one']);
  await page.evaluate(()=>window.fail=false);
  page.once('dialog',dialog=>dialog.dismiss());
  await page.locator('[data-book-id="two"] .book-delete').click();
  assert.equal(await page.locator('.book-admin-shelf-card').count(),3);
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('[data-book-id="two"] .book-delete').click();
  await page.waitForFunction(()=>document.querySelector('.book-shelf-status').textContent==='绘本已删除。');
  assert.deepEqual(await ids(),['three','one']);
  assert.deepEqual(await page.evaluate(()=>rows.at(-1)),[{id:'two',deleted:true}]);
  await page.evaluate(()=>{window.admin=false;return BookAdmin.render(testApp);});
  assert.equal(await page.locator('.book-delete,.book-drag-handle').count(),0);
  console.log('PASS: mouse drag, persisted order, save rollback, delete confirmation, cloud deletion, non-admin access');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
