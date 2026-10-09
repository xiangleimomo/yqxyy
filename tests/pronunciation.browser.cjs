const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright'),assert=require('node:assert/strict');
const origin=process.env.GAME_TEST_ORIGIN||'http://127.0.0.1:8766';
(async()=>{const browser=await chromium.launch({headless:true,channel:'msedge'});try{
 for(const mobile of [false,true]){
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1400,height:1000},isMobile:mobile,hasTouch:mobile}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{const NativeAudio=window.Audio;window.testAudios=[];window.Audio=function(...args){const audio=new NativeAudio(...args);testAudios.push(audio);return audio}});
  await page.goto(origin);await page.waitForFunction(()=>typeof App!=='undefined');
  await page.evaluate(async()=>{App.isGuestRestrictedLevel=()=>false;App.isGuestEpisodeLimit=()=>false;App.canAccessEpisode=()=>true;await App.openLearningModal('words','three-kingdoms',1)});
  await page.locator('.floating-words .speak-word').first().click();
  await page.waitForFunction(()=>testAudios.some(a=>a.currentTime>0&&a.readyState>=2),{},{timeout:20000});
  assert.ok(await page.evaluate(()=>testAudios.at(-1).src.includes('audio=romance')));
  assert.equal(await page.locator('.floating-words .flip-card.flipped').count(),0,'speaker must not flip the card');
  await page.locator('.floating-words #nextWord').click();await page.locator('.floating-words .speak-word').first().click();
  await page.waitForFunction(()=>testAudios.at(-1).src.includes('audio=dynasty')&&testAudios.at(-1).currentTime>0,{},{timeout:20000});
  const practiceWord=await page.evaluate(()=>App.wordPractice.words[App.wordPractice.index].word);await page.locator('.floating-words #practiceSpeak').click();
  await page.waitForFunction(word=>testAudios.at(-1).src.includes('audio='+encodeURIComponent(word))&&testAudios.at(-1).currentTime>0,practiceWord,{timeout:20000});
  assert.ok(await page.evaluate(()=>testAudios.slice(0,-1).every(a=>a.paused)),'new pronunciation stops the previous audio');
  // Deterministic failure test, separate from the real decoded MP3 tests above.
  await page.route('https://dict.youdao.com/**',route=>route.abort());await page.evaluate(()=>{window.testSpoken=[];Object.defineProperty(speechSynthesis,'speak',{configurable:true,value:u=>testSpoken.push({text:u.text,lang:u.lang})})});
  await page.locator('.floating-words .speak-word').first().click();await page.waitForFunction(()=>testSpoken.length>0);assert.equal(await page.evaluate(()=>testSpoken.at(-1).text),'dynasty');
  assert.deepEqual(errors,[]);console.log(`PASS: ${mobile?'phone':'desktop'} real word/next-word/dictation MP3 decoded and advanced; no card flip, no audio overlap; network failure calls system English fallback.`);await context.close();
 }
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
