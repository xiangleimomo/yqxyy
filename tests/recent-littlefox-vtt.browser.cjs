const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),reportPath=process.env.SUBTITLE_REPORT||path.join(root,'docs/little-fox-subtitle-audit-2026-10-27.json');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://cdn.jsdelivr.net/**',r=>r.request().url().includes('supabase-js')?r.fulfill({contentType:'application/javascript',body:'window.supabase={createClient:()=>({auth:{onAuthStateChange(){},getSession:async()=>({data:{session:null}})}})};'}):process.env.LIVE_MEDIA?r.continue():r.fulfill({contentType:'application/javascript',body:'window.Hls={isSupported:()=>false};'}));
 await page.route('https://yqxyy.netlify.app/**',r=>{const u=new URL(r.request().url()),file=path.resolve(root,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));return !file.startsWith(root+path.sep)||!fs.existsSync(file)?r.fulfill({status:404,body:''}):r.fulfill({path:file,contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':file.endsWith('.vtt')?'text/vtt':'text/html'});});
 if(!process.env.LIVE_MEDIA)await page.route('https://cdn.littlefox.co.kr/**',r=>r.abort());
 await page.goto('https://yqxyy.netlify.app/#/homework');await page.locator('#familyLogin').waitFor();
 await page.evaluate(()=>{App.canAccessEpisode=()=>true;App.isGuestRestrictedLevel=()=>false;App.isGuestEpisodeLimit=()=>false;});
 for(const row of JSON.parse(fs.readFileSync(reportPath)).lessons){
  const file=path.join(root,'data',row.seriesId,'subtitles',String(row.episodeId).padStart(3,'0')+'.vtt');
  const cues=await page.evaluate(s=>App.parseVtt(s),fs.readFileSync(file,'utf8'));
  await page.evaluate(async r=>{App.activeLessonTab='watch';await App.renderLesson(r.seriesId,r.episodeId);},row);
  await page.waitForFunction(()=>document.querySelector('video')?.textTracks?.[0]?.cues?.length>0);
  assert.equal(await page.locator('#lessonPanel video').count(),1);
  if(process.env.LIVE_MEDIA){await page.waitForFunction(()=>document.querySelector('#lessonPanel video').readyState>=1,{},{timeout:35000});const d=await page.locator('video').evaluate(v=>v.duration*1000);assert(Math.abs(d-(row.videoDurationMs||row.durationMs))<1000,'Decoded video duration '+row.sourceContentId);}
  for(const c of [cues[0],cues[Math.floor(cues.length/2)],cues.at(-1)]){
   await page.locator('video').evaluate((v,c)=>{const time=(c.startMs+c.endMs)/2000;if(v.readyState>=1)v.currentTime=time;else Object.defineProperty(v,'currentTime',{configurable:true,get:()=>time});v.dispatchEvent(new Event('timeupdate'));},c);
   await page.waitForFunction(text=>document.querySelector('.video-caption')?.textContent===text,c.text);
   assert.equal(await page.locator('.video-caption').isVisible(),true);
  }
  console.log('PASS: Watch VTT first/middle/last cues '+row.seriesId+'/'+row.episodeId+(process.env.LIVE_MEDIA?' and live decoded video metadata':''));
  await page.evaluate(async r=>{App.activeLessonTab='listenRead';await App.renderLesson(r.seriesId,r.episodeId);},row);
  assert.equal(await page.locator('#lessonPanel audio.hls-audio-player').count(),1);assert.equal(await page.locator('#lessonPanel video').count(),0);
  await page.evaluate(()=>App.disposeHlsPlayers(App.el()));
 }
 assert.deepEqual(errors,[]);console.log('PASS: all selected Watch captions and audio-only Listen and Read');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
