const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),cp=require('child_process'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),baseline=process.env.BOOK_READER_BASELINE;
const {samplePdf}=require('./helpers/pdf-fixture.cjs');
// Optional real-file benchmark; the default six-page fixture is self-contained.
const externalPdf=process.env.PDF_PERF_FILE;
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true}),errors=[],components=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(/\/(pdf\.min\.js|pdf\.worker\.min\.js|page-flip\.browser\.js)(\?|$)/.test(r.url()))components.push(r.url());});
 await page.route('https://cdn.jsdelivr.net/**',r=>r.request().url().includes('supabase-js')?r.fulfill({contentType:'application/javascript',body:'window.supabase={createClient:()=>({auth:{onAuthStateChange(){},getSession:async()=>({data:{session:null}})}})};'}):r.continue());
 if(!process.env.PRODUCTION_SITE)await page.route('https://yqxyy.netlify.app/**',r=>{
  const u=new URL(r.request().url()),file=path.resolve(root,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));
  if(baseline&&u.pathname==='/js/books.js')return r.fulfill({contentType:'application/javascript',body:cp.execFileSync('git',['show',`${baseline}:js/books.js`],{cwd:root,encoding:'utf8'})});
  const types={'.js':'application/javascript','.css':'text/css','.json':'application/json'};
  return file.startsWith(root+path.sep)&&fs.existsSync(file)?r.fulfill({path:file,contentType:types[path.extname(file)]||'text/html'}):r.fulfill({status:404,body:''});
 });
 await page.goto('https://yqxyy.netlify.app/#/reading',{waitUntil:'domcontentloaded'});
 // Warm component loading so this measures processing a local file, not network.
 await page.evaluate(async()=>{
  await BookReader.loadPdfLibraries();
  const original=window.pdfjsLib,Flip=window.St.PageFlip;
  window.pdfMetrics={renders:[],textCalls:0};
  window.pdfjsLib={...original,getDocument(options){
   const task=original.getDocument(options);
   return {destroy:()=>task.destroy(),promise:task.promise.then(doc=>{
    const get=doc.getPage.bind(doc);
    doc.getPage=async number=>{const page=await get(number);if(!page._measured){
     page._measured=true;const render=page.render.bind(page),text=page.getTextContent.bind(page);
     page.render=options=>{pdfMetrics.renders.push({page:number,pixels:options.canvasContext.canvas.width*options.canvasContext.canvas.height});return render(options);};
     page.getTextContent=(...args)=>{pdfMetrics.textCalls++;return text(...args);};
    }return page;};return doc;
   })};
  }};
  window.St={...window.St,PageFlip:class extends Flip {constructor(...args){super(...args);this.on('init',()=>{pdfMetrics.first={ms:performance.now()-pdfMetrics.start,renders:pdfMetrics.renders.slice(),textCalls:pdfMetrics.textCalls};});}}};
 });
 const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
 const localInput=baseline?'.books-notice input[type=file]':'.book-local-file';
 if(!baseline)await page.locator('.book-reading-tabs a[href="#/reading/local"]').click();
 await page.locator(localInput).waitFor({state:'attached'});
 await page.evaluate(()=>pdfMetrics.start=performance.now());
 await page.locator(localInput).setInputFiles({name:'mobile-test.pdf',mimeType:'application/pdf',buffer:externalPdf?fs.readFileSync(externalPdf):samplePdf(6)});
 await page.waitForFunction(()=>pdfMetrics.first,null,{timeout:120000});
 const first=await page.evaluate(()=>pdfMetrics.first);console.log((baseline?'BASELINE':'MOBILE')+' first local page',JSON.stringify(first));
 if(!baseline){
  assert.equal(first.renders.length,1,'Show the current page before rendering neighbours');
  assert.equal(first.textCalls,0,'Text extraction must not block first paint');
  assert(first.renders[0].pixels<=1610000,'Keep mobile raster within the pixel budget');
  await page.waitForTimeout(800);
  assert((await page.evaluate(()=>pdfMetrics.renders.length))<6,'Do not rasterize the entire book in the background');
  await page.locator('#bookProgress').evaluate(el=>{el.value='5';el.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.waitForFunction(()=>BookReader.mobileRenderedPages?.includes(6),null,{timeout:30000});
  assert.equal(await page.locator('#bookPageIndicator').innerText(),'6/6');
  assert((await page.evaluate(()=>BookReader.pdfObjectUrls.length))<=5,'Evict distant mobile images');
  await page.locator('#bookProgress').evaluate(el=>{el.value='0';el.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.waitForFunction(()=>BookReader.mobileRenderedPages?.includes(1),null,{timeout:30000});
  await page.evaluate(()=>document.querySelector('[data-tool="search"]').click());
  const input=page.locator('.pdf-tools-panel input[type=search]');await input.fill(externalPdf?'PDF':'Local PDF page 5');
  await page.waitForFunction(()=>BookReader.pdfTextIndexReady===true,null,{timeout:30000});
  assert((await page.evaluate(()=>pdfMetrics.textCalls))>0,'Build text index only when requested');
  if(!externalPdf){
   await page.locator('.pdf-tools-panel .pdf-tool-row').filter({hasText:'第 5 页'}).click();
   await page.waitForFunction(()=>BookReader.mobileRenderedPages?.includes(5),null,{timeout:30000});
   assert.equal(await page.locator('#bookPageIndicator').innerText(),'5/6','Search unvisited pages and jump to a match');
  }
  await page.locator('.flipbook-back').click();await page.locator('.book-card').waitFor();
  assert.equal(await page.evaluate(()=>BookReader.pdfObjectUrls.length),0);
  assert.equal(await page.evaluate(()=>BookReader.pdfRenderTask),null);
  await page.evaluate(()=>location.hash='#/reader/local-pdf');
  const resume=externalPdf?1:5;
  await page.waitForFunction(number=>BookReader.mobileRenderedPages?.includes(number),resume,{timeout:30000});
  await page.waitForFunction(number=>document.querySelector('#bookPageIndicator')?.textContent===`${number}/6`,resume);
  await page.locator('#bookProgress').evaluate(el=>{el.value='2';el.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.locator('.flipbook-back').click();await page.locator('.book-card').waitFor();
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(()=>BookReader.pdfObjectUrls.length),0,'A cancelled background render must not retain images');
 }
 if(!baseline){assert(components.length>=3);assert(components.every(url=>url.startsWith('https://yqxyy.netlify.app/assets/vendor/')),'Serve all reader components from the site');}
 assert.deepEqual(errors,[]);console.log('PASS: '+(baseline?'baseline captured':'mobile first paint, bounded rendering/memory, jump/back navigation, lazy search, resume, cleanup and same-origin components'));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
