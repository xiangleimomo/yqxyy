const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage(),origin=process.env.TEST_ORIGIN||'http://127.0.0.1:8000';
  await page.goto(origin+'/#/home',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>typeof App!=='undefined'&&window.MediaShelf);
  await page.evaluate(()=>{MovieLibrary.published=async()=>[];App.isGuestRestrictedLevel=()=>false;App.isGuestEpisodeLimit=()=>false;App.canAccessEpisode=()=>true;});
  for(const width of [1280,390]){
   await page.setViewportSize({width,height:844});await page.waitForTimeout(300);
   await page.evaluate(async()=>{location.hash='#/movies/episodes';await App.render();});
   await page.locator('[data-media-key="film-course-movie-harry-potter-1"]').waitFor().catch(async()=>{await page.waitForFunction(()=>document.querySelectorAll('.book-card').length===6);});
   const hrefs=await page.locator('.media-catalog .book-card a[href^="#/series/"]').evaluateAll(links=>links.map(a=>a.getAttribute('href')));
   assert.equal(new Set(hrefs).size,6);assert(!hrefs.some(href=>/fantastic-beasts/.test(href)));
   await page.evaluate(()=>App.renderSeries('movie-fantastic-beasts-1'));await page.getByRole('heading',{name:'本课程暂未开放'}).waitFor();assert.equal(await page.locator('.module-card').count(),0);
   await page.evaluate(()=>App.renderLesson('movie-fantastic-beasts-1',1));await page.getByRole('heading',{name:'本课程暂未开放'}).waitFor();
   await page.evaluate(()=>App.openLearningModal('watch','movie-fantastic-beasts-1',1));assert.equal(await page.locator('.floating-watch').count(),0);
   await page.evaluate(()=>App.renderSeries('movie-harry-potter-1'));await page.locator('.module-card[data-go="watch"]').waitFor();assert.match(await page.locator('#episodeWorkspace h2').innerText(),/大难不死的男孩/);
   console.log('PASS shelf, draft series/lesson/modal guards and retained course at width',width);
  }
  const preserved=await page.evaluate(async()=>{const library=await MovieClassroom.getLibrary(App);return library.playableById.has('fantastic-beasts-1');});assert(preserved);
  console.log('PASS removed course remains available in the full-movie playback catalogue');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
