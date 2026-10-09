const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),assert=require('node:assert/strict');
const origin=process.env.GAME_TEST_ORIGIN||'http://127.0.0.1:8766';
async function setup(page){
 await page.goto(origin);await page.waitForFunction(()=>typeof App!=='undefined');
 await page.evaluate(async()=>{const c=SFCloud;c.user={id:'test-admin',email:'developer@example.test'};c.active=true;c.schedule=()=>{};c.client={auth:{getUser:async()=>({data:{user:{id:'test-admin',app_metadata:{site_admin:true}}},error:null})}};await c.verifyAdmin(c.user);await App.openLearningModal('games','three-kingdoms',1)});
 await page.waitForFunction(()=>document.querySelector('.floating-games iframe')?.contentDocument?.querySelectorAll('.episode-game-lobby .card').length===27);
 const frame=await (await page.locator('.floating-games iframe').elementHandle()).contentFrame();await frame.waitForFunction(()=>document.querySelectorAll('.card button:enabled').length===27);return frame;
}
async function boxes(frame){return frame.evaluate(()=>{const r=e=>{const b=e.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height,right:b.right,bottom:b.bottom}};return {width:innerWidth,height:innerHeight,body:document.body.className,screen:r(document.querySelector('.arcade-screen,.catch-canvas-wrap')||document.querySelector('.stage')),canvas:document.querySelector('canvas')?r(document.querySelector('canvas')):null,buttons:[...document.querySelectorAll('.arcade-controls button,.catch-controls button')].map(r),scrollWidth:document.documentElement.scrollWidth}})}
(async()=>{const browser=await chromium.launch({headless:true,channel:'msedge'});try{
 const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));const f=await setup(page);
 for(const size of [{width:390,height:844},{width:844,height:390},{width:320,height:568}]){
  await page.setViewportSize(size);
  for(let n=2;n<=28;n++){
   const id='G'+String(n).padStart(2,'0');await f.evaluate(id=>play(id),id);try{await f.waitForFunction(id=>round?.id===id&&document.body.classList.contains('mobile-playing'),id)}catch(e){console.log(await f.evaluate(()=>({round:round?.id,body:document.body.className,width:innerWidth,mobile:matchMedia('(max-width:640px), (pointer:coarse) and (max-width:1024px)').matches,scripts:[...document.scripts].map(s=>s.src),text:app.textContent.slice(0,400)})));throw e}await f.waitForFunction(()=>!document.querySelector('canvas')||document.querySelector('canvas').style.width!=='');
   const b=await boxes(f);assert.ok(b.scrollWidth<=b.width+1,`${id} horizontal overflow ${JSON.stringify(b)}`);
   if(b.canvas){assert.ok(b.canvas.w>100&&b.canvas.h>65,`${id} canvas too small ${JSON.stringify(b)}`);assert.ok(b.canvas.bottom<=b.height+1&&b.canvas.right<=b.width+1,`${id} canvas offscreen ${JSON.stringify(b)}`);assert.ok(Math.abs(b.canvas.w/b.canvas.h-(id==='G19'?900/520:1.5))<.03,id+' distorted canvas');for(const button of b.buttons)assert.ok(button.bottom<=b.height+1&&button.right<=b.width+1,`${id} offscreen control ${JSON.stringify(b)}`)}
   assert.equal(await f.locator('#mobile-game-fullscreen').count(),1);
  }
  console.log('All 27 mobile layouts fit:',size);
 }
 await page.setViewportSize({width:390,height:844});await f.evaluate(()=>play('G07'));await f.waitForFunction(()=>!!round?.arcade);await f.locator('#arcade-start').click();await f.locator('#arcade-pause').click();
 const before=await f.evaluate(()=>({round:round.start,words:round.arcade.pool.map(w=>w.en),elapsed:round.arcade.elapsed}));
 // Native fullscreen is entered by a real tap. Keep it optional if the headless provider denies it.
 await f.locator('#mobile-game-fullscreen').click();await f.waitForFunction(()=>document.fullscreenElement||document.querySelector('#mobile-game-fullscreen').textContent.includes('退出'));
 const native=await f.evaluate(()=>!!document.fullscreenElement);await f.locator('#mobile-game-fullscreen').click();await f.waitForFunction(()=>!document.fullscreenElement&&document.querySelector('#mobile-game-fullscreen').textContent.includes('全屏')&&!document.querySelector('#mobile-game-fullscreen').textContent.includes('退出'));
 assert.deepEqual(await f.evaluate(()=>({round:round.start,words:round.arcade.pool.map(w=>w.en),elapsed:round.arcade.elapsed})),before);
 // Exercise browsers without the API (e.g. iPhone embedded browsers).
 await f.evaluate(()=>{document.documentElement.requestFullscreen=undefined});await f.locator('#mobile-game-fullscreen').click();await page.waitForFunction(()=>document.querySelector('.floating-games').classList.contains('mobile-games-fullscreen'));
 assert.equal(await page.locator('.floating-header').isVisible(),false);await f.locator('#mobile-game-fullscreen').click();await page.waitForFunction(()=>!document.querySelector('.floating-games').classList.contains('mobile-games-fullscreen'));
 await page.setViewportSize({width:844,height:390});await page.waitForTimeout(200);
 await f.evaluate(()=>round.arcade.end(false,'测试结束'));await f.waitForFunction(()=>!document.body.classList.contains('mobile-canvas'));assert.ok(await f.locator('.result-banner').isVisible());
 await page.locator('.floating-close').click();await page.waitForFunction(()=>document.body.style.overflow!=='hidden');
 // Desktop bounding boxes must match the version with mobile resources removed.
 const rects=[];
 for(const baseline of [false,true]){const p=await browser.newPage({viewport:{width:1400,height:1000}});if(baseline)await p.route(/\/(?:arcade\/mobile\.(?:js|css)|(?:js|css)\/mobile-games\.(?:js|css))(?:\?|$)/,r=>r.fulfill({body:'',contentType:r.request().url().includes('.css')?'text/css':'application/javascript'}));const frame=await setup(p);await frame.evaluate(()=>play('G07'));await frame.waitForFunction(()=>!!round?.arcade);assert.equal(await frame.locator('#mobile-game-fullscreen').count(),0);assert.equal(await p.locator('.mobile-games-window').count(),0);rects.push(await boxes(frame));await p.close()}
 assert.deepEqual(rects[0],rects[1]);
 const paid=await context.newPage();paid.on('pageerror',e=>errors.push(e.message));await paid.goto(origin);
 await paid.evaluate(async()=>{App.isGuestRestrictedLevel=()=>false;App.isGuestEpisodeLimit=()=>false;App.canAccessEpisode=()=>true;const vocab=(await App.getJSON('data/three-kingdoms/vocabulary.json'))['1'];for(const w of vocab)App.recordTypingCorrect('three-kingdoms',1,w.word);App.addPoints(2-App.getPoints());await App.openLearningModal('games','three-kingdoms',1);document.querySelector('.episode-games-frame').gamePayload.ids=['G07','G03','G06']});
 await paid.waitForFunction(()=>document.querySelector('.episode-games-frame')?.contentDocument?.querySelector('.episode-game-lobby .card button:enabled')?.getAttribute('onclick').includes('G07'));
 const pf=await(await paid.locator('.episode-games-frame').elementHandle()).contentFrame();await pf.locator('.card button').first().click();await pf.waitForFunction(()=>round?.arcade?.id==='G07'&&document.body.classList.contains('mobile-playing'));
 assert.equal(await paid.evaluate(()=>App.getPoints()),0);const paidRound=await pf.evaluate(()=>round.start);
 await pf.evaluate(()=>{document.documentElement.requestFullscreen=undefined});await pf.locator('#mobile-game-fullscreen').click();await paid.waitForFunction(()=>!!document.querySelector('.mobile-games-fullscreen'));await pf.locator('#mobile-game-fullscreen').click();
 assert.equal(await paid.evaluate(()=>App.getPoints()),0);assert.equal(await pf.evaluate(()=>round.start),paidRound);await paid.close();
 assert.deepEqual(errors,[]);console.log('PASS: native fullscreen='+native+', fallback, no restart/elapsed change or extra charge, exit/close cleanup, results scrollable, desktop geometry unchanged.');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
