const {chromium}=require('playwright');const fs=require('fs'),path=require('path'),assert=require('assert/strict');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const origin='https://classroom.test';
 const response=await fetch('https://zcdn1.6azt0hwr-cf9.workers.dev/cdn?tmdb=508943&type=movie',{signal:AbortSignal.timeout(20000)});
 const lookup=await response.json(),url=require('../source-lab/dulo-provider.cjs').mediaUrl(lookup.url);
 assert(lookup.ready&&url,'The current public lookup must return an accepted HLS URL');
 const row={id:'movie:508943:tt12801262',providerId:'dulo',providerName:'Dulo · 主资源',title:'Luca',year:'2021',language:'unknown',languageLabel:'语言待核对',remarks:'电影 · 原站直连线路',episodes:[],websiteUrl:'https://dulo.mov/watch/movie/508943'};
 await page.route('https://cdn.jsdelivr.net/npm/hls.js@*/dist/hls.min.js',r=>r.fulfill({contentType:'application/javascript',body:'window.Hls={isSupported:()=>false};'}));
 await page.route(origin+'/**',async route=>{
  const u=new URL(route.request().url());
  if(u.pathname==='/.netlify/functions/source-explorer-api'){
   const b=route.request().postDataJSON();let data;
   if(b.action==='providers')data={providers:require('../source-lab/providers.json')};
   else if(b.action==='search')data={outcomes:[{name:'Other',ok:true,list:[{...row,id:'other',providerId:'other',providerName:'Other',language:'en',languageLabel:'英语'}]},{name:'Dulo',ok:true,list:[row]}]};
   else if(b.action==='detail')data={item:{...row,episodes:[{url,label:'正片',line:'Dulo'}]}};
   else data={configured:false,list:[]};
   return route.fulfill({json:data});
  }
  const requested=decodeURIComponent(u.pathname.endsWith('/')?u.pathname+'index.html':u.pathname);
  const file=path.resolve('.'+requested);
  if(!file.startsWith(process.cwd()+path.sep))return route.fulfill({status:403,body:''});
  if(!fs.existsSync(file))return route.fulfill({status:404,body:''});
  return route.fulfill({path:file,contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'text/html'});
 });
 await page.goto(origin+'/source-lab/');
 await page.locator('#query').fill('Luca');await page.locator('#searchButton').click();
 await page.waitForFunction(()=>document.querySelectorAll('.card').length===2);
 assert((await page.locator('.card').first().innerText()).includes('Dulo · 主资源'));
 await page.locator('#includeUnknown').uncheck();assert.equal(await page.locator('.card').count(),1);
 await page.locator('#includeUnknown').check();
 await page.locator('.card').first().getByRole('button').click();
 await page.waitForFunction(()=>document.querySelector('video').videoWidth>0&&document.querySelector('video').currentTime>1,null,{timeout:40000});
 const media=await page.locator('video').evaluate(v=>({src:v.currentSrc,width:v.videoWidth,height:v.videoHeight,time:v.currentTime,crossorigin:v.getAttribute('crossorigin')}));
 assert.equal(media.crossorigin,null);assert(media.src.startsWith('https://zcdn1.6azt0hwr-cf9.workers.dev/play/'));
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.locator('video').evaluate(v=>v.dispatchEvent(new Event('error')));
 await page.waitForFunction(()=>document.querySelector('video').src.includes('/_movie-media/bluevelvet/'));
 assert.equal(await page.locator('video').getAttribute('crossorigin'),'anonymous');
 await page.locator('#closePlayer').click();assert(await page.locator('#watch').isHidden());
 await page.evaluate(()=>{
  HTMLMediaElement.prototype.canPlayType=()=>'';
  window.Hls=class {static isSupported(){return true;}static Events={LEVEL_LOADED:'level',ERROR:'error'};on(){}loadSource(url){window.duloLoadedHls=url;}attachMedia(){}destroy(){}};
 });
 await page.locator('.card').first().getByRole('button').click();
 await page.waitForFunction(()=>window.duloLoadedHls?.includes('/_movie-media/bluevelvet/'));
 assert.equal(await page.evaluate(()=>window.duloLoadedHls),'/_movie-media/bluevelvet/'+new URL(url).pathname.slice('/play/'.length));
 await page.locator('#closePlayer').click();
 const {src,...safeMedia}=media;
 assert.deepEqual(errors,[]);console.log('PASS: fresh public Dulo lookup, first-result ordering, language filter, real direct native HLS, opaque HLS via relay/HLS.js, mobile layout and cleanup',JSON.stringify({host:new URL(src).hostname,...safeMedia}));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
