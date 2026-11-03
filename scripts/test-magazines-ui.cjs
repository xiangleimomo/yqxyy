const assert=require('node:assert/strict');
const {chromium}=require(process.env.STORYFOX_PLAYWRIGHT||'C:/Users/lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  await page.addInitScript(()=>Object.defineProperty(window,'STORYFOX_SUPABASE',{get:()=>null,set:()=>{}}));
  await page.goto('http://127.0.0.1:8127/#/magazines');await page.getByRole('link',{name:'线上期刊',exact:true}).waitFor();
  assert.equal(await page.locator('.main-tab[aria-current=page]').getAttribute('href'),'#/magazines');assert.equal(await page.locator('.book-card').count(),0);
  await page.evaluate(async()=>{
   SFCloud.user={id:'parent',user_metadata:{display_name:'期刊家长'}};SFCloud.isAdmin=()=>false;window.magazineCalls=[];
   window.magazineItems=[...Array.from({length:7},(_,i)=>({id:'magazine-'+i,kind:'magazine',title:'Fox Magazine '+i,titleZh:'期刊 '+i,format:'pdf',sourceUrl:'https://u.pone.rs/testmagazine.pdf',uploaderNickname:'期刊家长',ownerId:i===0?'parent':'other'})),{id:'example-book',kind:'book',title:'Fox Book',titleZh:'绘本',format:'pdf',sourceUrl:'https://u.pone.rs/testbook.pdf'}];
   window.magazineStates=magazineItems.map((book,i)=>({book_id:book.id,favorite:true,category:i%2?'科普':'英语',last_page:2,last_read_at:new Date(Date.UTC(2026,10,3,10,i)).toISOString()}));
   BookReader.library=async()=>magazineItems;
   SFCloud.client={from:table=>{const filters={};const rows=()=>table==='book_personal'?magazineStates.filter(r=>!filters.book_id||r.book_id===filters.book_id):[];const q={select(){return q;},eq(k,v){filters[k]=v;return q;},order(){return q;},maybeSingle:async()=>({data:rows()[0]||null}),then(resolve,reject){return Promise.resolve({data:rows()}).then(resolve,reject);}};return q;},rpc:async(name,args)=>{magazineCalls.push(args);if(args.p_action==='access')return {data:{eligible:true,can_upload:true,nickname:'期刊家长'}};if(args.p_action==='publish'){magazineItems.push({id:'new-magazine',kind:args.p_payload.content_kind,title:args.p_payload.title,format:'pdf',sourceUrl:args.p_payload.source_url,ownerId:'parent'});}return {data:{ok:true}};}};
   await App.render();
  });
  assert.equal(await page.locator('.book-card').count(),7);assert.equal(await page.locator('[data-book-id="example-book"]').count(),0);
  await page.locator('#globalSearch').fill('Fox');await page.locator('#globalSearch').press('Enter');await page.waitForURL('**/#/magazines/search/Fox');await page.waitForFunction(()=>document.querySelectorAll('.book-card').length===7);
  assert.equal(await page.locator('.book-card').first().locator('a').filter({hasText:'本站阅览器'}).getAttribute('href'),'#/magazine-reader/magazine-0');
  await page.getByRole('link',{name:'我的收藏',exact:true}).click();await page.waitForSelector('summary');assert.equal(await page.locator('.book-category-shelf').count(),2);assert.equal(await page.locator('[data-book-id="example-book"]').count(),0);
  await page.getByRole('link',{name:'最近阅读',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.book-card').length===5);assert.equal(await page.locator('.book-card').first().getAttribute('data-book-id'),'magazine-6');
  await page.getByRole('link',{name:'上传期刊',exact:true}).click();await page.getByRole('heading',{name:'上传期刊',exact:true}).waitFor();await page.locator('[name=title]').fill('New Science Issue');await page.locator('[name=pdf_url]').fill('https://u.pone.rs/newmagazine.pdf');await page.locator('#parentBookPublish').click();await page.waitForURL('**/#/magazines/mine/uploads');await page.waitForSelector('[data-book-id="new-magazine"]');assert.equal(await page.evaluate(()=>magazineCalls.find(c=>c.p_action==='publish').p_payload.content_kind),'magazine');
  await page.evaluate(()=>{BookReader.downloadPdf=async(app,item)=>BookReader.renderPdfReader(app,item);location.hash='#/magazine-reader/magazine-0';});await page.waitForSelector('.flipbook-topbar');assert.equal(await page.locator('.flipbook-back').getAttribute('href'),'#/magazines');assert.equal(await page.locator('.flipbook-topbar > span').textContent(),'期刊阅读');assert.equal(await page.locator('.main-tab[aria-current=page]').getAttribute('href'),'#/magazines');
  await page.evaluate(()=>{SFCloud.isAdmin=()=>true;location.hash='#/magazines/admin';});await page.getByRole('heading',{name:'管理期刊',exact:true}).waitFor();assert.equal(await page.locator('#bookAdminForm [name=existing] option[value="example-book"]').count(),0);
  await page.evaluate(()=>{location.hash='#/reading';});await page.waitForSelector('[data-book-id="example-book"]');assert.equal(await page.locator('.book-card').count(),1);
  await page.evaluate(()=>{location.hash='#/home';});await page.getByRole('link',{name:'全部动画',exact:true}).waitFor();await page.evaluate(()=>document.dispatchEvent(new CustomEvent('sf-access-change')));assert.ok(await page.getByRole('link',{name:'全部动画',exact:true}).isVisible());
  for(const width of [1280,850,390]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Navigation overflow at '+width);}
  console.log('PASS: magazine navigation, empty shelf, scoped search/favorites/history, parent publication type, reader return, admin isolation, animation navigation and responsive header.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
