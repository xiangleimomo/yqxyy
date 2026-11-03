const assert=require('node:assert/strict');
const {chromium}=require(process.env.STORYFOX_PLAYWRIGHT||'C:/Users/lenovo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  const page=await browser.newPage();
  await page.addInitScript(()=>Object.defineProperty(window,'STORYFOX_SUPABASE',{get:()=>null,set:()=>{}}));
  await page.goto('http://127.0.0.1:8127/#/reading');await page.waitForSelector('.book-card');
  assert.equal(await page.locator('#bookSearchForm').count(),0);
  await page.evaluate(()=>{
   SFCloud.user={id:'parent'};SFCloud.isAdmin=()=>false;
   const personal=Array.from({length:7},(_,i)=>({book_id:'book-'+i,favorite:i<3,category:['睡前故事','英语启蒙',''][i]||'',last_read_at:new Date(Date.UTC(2026,10,3,10,i)).toISOString(),last_page:i}));
   SFCloud.client={from:table=>{const q={select(){return q;},eq(){return q;},order(){return q;},then(resolve,reject){return Promise.resolve({data:table==='book_personal'?personal:[]}).then(resolve,reject);}};return q;}};
   BookReader.library=async()=>personal.map((row,i)=>({id:row.book_id,title:'Book '+i,titleZh:'绘本 '+i,format:'pdf',sourceUrl:'https://u.pone.rs/testbook.pdf',uploaderNickname:'上传者',audioUrl:'https://u.pone.rs/audio.mp3'}));
   location.hash='#/reading/mine/recent';
  });
  await page.waitForFunction(()=>document.querySelectorAll('.book-card').length===5);
  assert.deepEqual(await page.locator('.book-card').evaluateAll(nodes=>nodes.map(node=>node.dataset.bookId)),['book-6','book-5','book-4','book-3','book-2']);
  assert.equal(await page.locator('.book-history-note,.book-request,.book-personal-tabs,.book-uploader').count(),0);
  assert.equal(await page.locator('.book-reading-tabs [aria-current=page]').getAttribute('href'),'#/reading/mine/recent');
  await page.getByRole('link',{name:'我的收藏',exact:true}).click();
  await page.waitForSelector('.book-category-shelf');
  assert.equal(await page.locator('.book-category-shelf').count(),3);
  assert.equal(await page.locator('.book-card:visible').count(),0);
  await page.locator('summary').filter({hasText:'睡前故事'}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.book-category-shelf[open]').length===1);
  assert.equal(await page.locator('.book-card:visible').getAttribute('data-book-id'),'book-0');
  await page.locator('summary').filter({hasText:'英语启蒙'}).click();
  await page.waitForFunction(()=>document.querySelectorAll('.book-category-shelf[open]').length===1 && document.querySelector('.book-category-shelf[open]').textContent.includes('英语启蒙'));
  assert.equal(await page.locator('.book-card:visible').getAttribute('data-book-id'),'book-1');
  assert.equal(await page.locator('.book-reading-tabs [aria-current=page]').getAttribute('href'),'#/reading/mine/favorites');
  await page.locator('#globalSearch').fill('Book 6');await page.locator('#globalSearch').press('Enter');
  await page.waitForURL('**/#/reading/search/Book%206');await page.waitForFunction(()=>document.querySelectorAll('.book-card').length===1);
  assert.equal(await page.locator('.book-card').getAttribute('data-book-id'),'book-6');
  assert.equal(await page.locator('#bookSearchForm,.book-media-results').count(),0);
  const routes=await page.evaluate(async()=>{
   const route=App.route,render=App.render;App.render=async()=>{};const results=[];
   for(const parts of [['home'],['movies'],['movie','film'],['series','movie-test'],['series-books','test'],['reader','book-6']]){App.route=()=>parts;document.getElementById('globalSearch').value='Fox';await App.globalSearch();results.push(location.hash);}
   App.route=route;App.render=render;location.hash='#/reading';return results;
  });
  assert.deepEqual(routes,['#/search/Fox','#/movies/Fox','#/movies/Fox','#/movies/Fox','#/reading/search/Fox','#/reading/search/Fox']);
  console.log('PASS: section-scoped header search, no duplicate search, exclusive category shelves, active favorites tab, clean cards and latest five books.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
