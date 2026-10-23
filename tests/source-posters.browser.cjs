const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:1280,height:1000}}), errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const providers=require('../source-lab/providers.json');
 const rows=providers.map((p,i)=>({id:String(i),providerId:p.id,providerName:p.name,title:['Frozen','Luca','Harry Potter','Coco','Paddington','Inside Out'][i],year:'2021',language:'unknown',languageLabel:'语言待核对',episodes:[],poster:i<2?'https://images.test/cover.svg':i<4?'https://images.test/missing.jpg':i===4?'javascript:alert(1)':'',websiteUrl:'https://example.test/movie'}));
 await page.route('https://images.test/**',r=>r.request().url().endsWith('cover.svg')?r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><rect width="400" height="600" fill="#173c66"/><circle cx="200" cy="230" r="110" fill="#87bad5"/><text x="200" y="450" text-anchor="middle" fill="white" font-size="40">FILM POSTER</text></svg>'}):r.fulfill({status:404,body:''}));
 await page.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'application/javascript',body:'window.Hls={isSupported:()=>false};'}));
 await page.route('https://classroom.test/**',async route=>{
  const u=new URL(route.request().url());
  if(u.pathname==='/.netlify/functions/source-explorer-api'){
   const b=route.request().postDataJSON();
   return route.fulfill({json:b.action==='providers'?{providers}:b.action==='search'?{outcomes:providers.map((p,i)=>({id:p.id,name:p.name,ok:true,list:[rows[i]]}))}:{item:rows.find(x=>x.id===b.id)}});
  }
  const file=path.resolve(root,'.'+decodeURIComponent(u.pathname.endsWith('/')?u.pathname+'index.html':u.pathname));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
  return route.fulfill({path:file,contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html'});
 });
 await page.goto('https://classroom.test/source-lab/');
 await page.locator('#query').fill('Movies');await page.locator('#searchButton').click();
 await page.waitForFunction(()=>document.querySelectorAll('.card').length===6);
 assert.equal(await page.locator('.result-poster').count(),6);
 await page.waitForFunction(()=>document.querySelectorAll('.result-poster img').length===2&&Array.from(document.querySelectorAll('.result-poster img')).every(i=>i.naturalWidth>0));
 assert((await page.locator('.card').first().innerText()).includes('Dulo'));
 assert.equal(await page.locator('.card button').count(),6);
 for(const width of [1280,390]){
  await page.setViewportSize({width,height:1000});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 }
 if(process.env.POSTER_TEST_SCREENSHOT) await page.screenshot({path:process.env.POSTER_TEST_SCREENSHOT,fullPage:true});
 await page.locator('.card').nth(2).getByRole('button').click();
 assert.equal(await page.locator('#watchTitle').innerText(),'Harry Potter');
 assert.deepEqual(errors,[]);
 console.log('PASS: six-source poster cards, loaded/missing/broken/unsafe images, Dulo priority, desktop/mobile layout and playback selection');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
