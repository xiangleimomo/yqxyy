const {chromium}=require('playwright');
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try{
    const page=await browser.newPage();
    await page.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'application/javascript',body:r.request().url().includes('supabase-js')?'window.supabase={createClient:()=>({auth:{onAuthStateChange(){},getSession:async()=>({data:{session:null}})}})};':'window.Hls={isSupported:()=>false};'}));
    await page.route('https://cdn.littlefox.co.kr/**',r=>r.abort());
    await page.route('https://yqxyy.netlify.app/**',r=>{
      const u=new URL(r.request().url()),file=path.resolve(root,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));
      const types={'.js':'application/javascript','.css':'text/css','.json':'application/json','.vtt':'text/vtt','.jpg':'image/jpeg'};
      return file.startsWith(root+path.sep)&&fs.existsSync(file)?r.fulfill({path:file,contentType:types[path.extname(file)]||'text/html'}):r.fulfill({status:404,body:''});
    });
    const enableLessons=()=>page.evaluate(()=>{
      App.canAccessEpisode=()=>true;App.isGuestRestrictedLevel=()=>false;App.isGuestEpisodeLimit=()=>false;
      window.SFCloud.schedule=()=>{};window.SFFamily.record=()=>{};
    });
    await page.goto('https://yqxyy.netlify.app/#/homework');
    await page.locator('#familyLogin').waitFor();await enableLessons();
    await page.evaluate(async()=>{location.hash='#/series/three-kingdoms';});
    await page.locator('.episode-side-item[data-ep="12"]').click();
    await page.locator('[data-go="watch"]').click();
    await page.locator('.floating-watch video').waitFor();
    await page.locator('.floating-watch video').evaluate(v=>v.dispatchEvent(new Event('ended')));
    await page.locator('.floating-watch .mark-complete').click();
    await page.locator('.floating-watch .floating-close').click();
    await page.evaluate(()=>App.render());
    assert.match(await page.locator('#episodeWorkspace h2').innerText(),/^Episode 12 /);
    assert.equal(await page.locator('.episode-side-item.active').getAttribute('data-ep'),'12');
    await page.locator('[data-go="listenRead"]').click();
    await page.locator('.floating-listenRead audio').waitFor();
    assert.equal(await page.locator('.floating-listenRead audio').count(),1);
    assert.equal(await page.locator('.floating-listenRead video').count(),0);
    await page.locator('.floating-listenRead .mark-complete').click();
    await page.locator('.floating-listenRead .floating-close').click();
    await page.evaluate(()=>{App.markComplete('three-kingdoms',12,'quiz');App.unlockNextEpisode('three-kingdoms',12);});
    assert.equal(await page.locator('.episode-side-item.active').getAttribute('data-ep'),'12');
    await page.reload();await page.waitForFunction(()=>typeof App!=='undefined'&&window.SFCloud);await enableLessons();
    await page.evaluate(()=>App.render());
    assert.match(await page.locator('#episodeWorkspace h2').innerText(),/^Episode 12 /);
    await page.evaluate(()=>App.renderSeries('journey-to-the-west'));
    await page.locator('.episode-side-item[data-ep="25"]').click();
    await page.evaluate(()=>App.renderSeries('three-kingdoms'));
    assert.equal(await page.locator('.episode-side-item.active').getAttribute('data-ep'),'12');
    for(const [series,id] of [['three-kingdoms','12'],['journey-to-the-west','25']]){
      await page.evaluate(s=>App.renderSeries(s),series);
      assert.equal(await page.locator('.episode-side-item.active').getAttribute('data-ep'),id);
      const cover=await page.locator('.series-hero img').evaluate(async img=>{await img.decode();return {src:img.getAttribute('src'),width:img.naturalWidth};});
      assert.equal(cover.src,`assets/covers/${series}-littlefox.jpg`);assert(cover.width>0);
    }
    await page.evaluate(()=>{window.SFCloud.user={id:'selection-test'};return App.renderSeries('three-kingdoms');});
    assert.equal(await page.locator('.episode-side-item.active').getAttribute('data-ep'),'1');
    await page.evaluate(()=>{window.SFCloud.user=null;App.canAccessEpisode=(_s,id)=>Number(id)===1;return App.renderSeries('three-kingdoms');});
    assert.equal(await page.locator('.episode-side-item.active').getAttribute('data-ep'),'1');
    console.log('PASS: Watch completion, audio-only Read, quiz completion, rerender/reload, per-series/account selection, locked fallback and official covers');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
