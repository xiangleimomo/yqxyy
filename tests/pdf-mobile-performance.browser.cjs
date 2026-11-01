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
 await page.locator(localInput).setInputFiles({name:'mobile-test.pdf',mimeType:'application/pdf',buffer:externalPdf?fs.readFileSync(externalPdf):samplePdf(6,[[200,160],[200,160],[160,300],[300,160]])});
 await page.waitForFunction(()=>pdfMetrics.first,null,{timeout:120000});
 const first=await page.evaluate(()=>pdfMetrics.first);console.log((baseline?'BASELINE':'MOBILE')+' first local page',JSON.stringify(first));
 if(!baseline){
  assert.equal(first.renders.length,1,'Show the current page before rendering neighbours');
  assert.equal(first.textCalls,0,'Text extraction must not block first paint');
  assert(first.renders[0].pixels<=1610000,'Keep mobile raster within the pixel budget');
  assert.equal(await page.evaluate(()=>BookReader.pageFlip.getOrientation()),'landscape','Phone pages open as a two-page book');
  const checkCompletePages=async pages=>{
    await page.waitForFunction(pages=>pages.every(n=>BookReader.mobileRenderedPages?.includes(n)),pages);
    await page.waitForTimeout(900); // Let the existing cover-centering animation finish.
    const fits=await page.evaluate(pages=>{
      const surface=document.querySelector('.pdf-flipbook-surface').getBoundingClientRect();
      return pages.every(n=>{
        const image=document.querySelector(`img[data-pdf-page="${n}"]`),rect=image.getBoundingClientRect();
        return rect.width>0&&rect.height>0&&rect.left>=surface.left-2&&rect.right<=surface.right+2&&rect.top>=surface.top-2&&rect.bottom<=surface.bottom+2&&image.naturalWidth>0;
      });
    },pages);
    assert(fits,'Every visible page must fit completely inside the reading surface');
  };
  await checkCompletePages([1]);
  const geometry=await page.locator('#ebookReader').evaluate(reader=>({width:reader.offsetWidth,height:reader.offsetHeight,rect:reader.getBoundingClientRect().toJSON()}));
  assert(geometry.width>geometry.height,'A portrait phone uses a landscape reader');
  assert(Math.abs(geometry.rect.width-390)<2&&Math.abs(geometry.rect.height-844)<2,'The rotated reader fills the phone viewport');
  await page.screenshot({path:path.join(process.env.TEMP,'yqxyy-phone-landscape.png')});
  const swipe=await page.evaluate(()=>{
    const ui=BookReader.pageFlip.getUI(),rect=ui.getDistElement().getBoundingClientRect();
    const point=ui.getMousePos(rect.left+rect.width*.5,rect.top+rect.height*.8);
    const image=document.querySelector('img[data-pdf-page="1"]').getBoundingClientRect();
    const x=image.left+image.width*.5,start=image.top+image.height*.8,end=image.top+image.height*.2;
    return {x,start,end,logicalX:point.x,expectedX:ui.getDistElement().offsetWidth*.8};
  });
  assert(Math.abs(swipe.logicalX-swipe.expectedX)<2,'Transform touch coordinates back to book coordinates');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:swipe.x,y:swipe.start}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:swipe.x,y:(swipe.start+swipe.end)/2}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:swipe.x,y:swipe.end}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.waitForFunction(()=>BookReader.pageFlip.getCurrentPageIndex()===1,null,{timeout:30000});
  await checkCompletePages([2,3]);
  assert.equal(await page.locator('#bookPageIndicator').innerText(),'2–3/6');
  await page.screenshot({path:path.join(process.env.TEMP,'yqxyy-phone-double-pages.png')});
  await page.setViewportSize({width:844,height:390});
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('#ebookReader')).transform==='none');
  assert.equal(await page.locator('#bookPageIndicator').innerText(),'2–3/6');
  await checkCompletePages([2,3]);
  await page.setViewportSize({width:390,height:844});
  await checkCompletePages([2,3]);
  await page.locator('#bookStagePrev').click();
  await page.waitForFunction(()=>BookReader.pageFlip.getCurrentPageIndex()===0,null,{timeout:30000});
  await page.setViewportSize({width:844,height:390});
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('#ebookReader')).transform==='none');
  assert(await page.locator('#ebookReader').evaluate(reader=>reader.offsetWidth>reader.offsetHeight),'Native landscape keeps the same reader orientation');
  assert.equal(await page.locator('#bookPageIndicator').innerText(),'1/6','Device rotation preserves the current page');
  await checkCompletePages([1]);
  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>{
    window.orientationLockAttempts=0;
    window.originalOrientationLock=screen.orientation.lock;
    screen.orientation.lock=async()=>{orientationLockAttempts++;throw new DOMException('Not supported','NotSupportedError');};
  });
  await page.locator('#bookFullscreen').click();
  await page.waitForFunction(()=>document.fullscreenElement?.id==='app'&&orientationLockAttempts===1);
  assert(await page.locator('#ebookReader').evaluate(reader=>reader.offsetWidth>reader.offsetHeight),'Keep landscape if native locking is rejected');
  await page.locator('#bookFullscreenBottom').click();
  await page.waitForFunction(()=>!document.fullscreenElement);
  await page.evaluate(()=>{screen.orientation.lock=window.originalOrientationLock;});
  await page.waitForTimeout(800);
  assert((await page.evaluate(()=>pdfMetrics.renders.length))<6,'Do not rasterize the entire book in the background');
  await page.locator('#bookProgress').evaluate(el=>{el.value='5';el.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.waitForFunction(()=>BookReader.mobileRenderedPages?.includes(6),null,{timeout:30000});
  assert.equal(await page.locator('#bookPageIndicator').innerText(),'6/6');
  assert((await page.evaluate(()=>BookReader.pdfObjectUrls.length))<=6,'Keep only the current and adjacent spreads in memory');
  await checkCompletePages([6]);
  await page.locator('#bookProgress').evaluate(el=>{el.value='0';el.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.waitForFunction(()=>BookReader.mobileRenderedPages?.includes(1),null,{timeout:30000});
  await page.evaluate(()=>document.querySelector('[data-tool="search"]').click());
  const input=page.locator('.pdf-tools-panel input[type=search]');await input.fill(externalPdf?'PDF':'Local PDF page 5');
  await page.waitForFunction(()=>BookReader.pdfTextIndexReady===true,null,{timeout:30000});
  assert((await page.evaluate(()=>pdfMetrics.textCalls))>0,'Build text index only when requested');
  if(!externalPdf){
   await page.locator('.pdf-tools-panel .pdf-tool-row').filter({hasText:'第 5 页'}).click();
   await page.waitForFunction(()=>BookReader.mobileRenderedPages?.includes(5),null,{timeout:30000});
   assert.equal(await page.locator('#bookPageIndicator').innerText(),'4–5/6','Search opens the spread containing the matched page');
   await checkCompletePages([4,5]);
  }
  await page.locator('.flipbook-back').click();await page.locator('.book-card').waitFor();
  assert.equal(await page.evaluate(()=>BookReader.pdfObjectUrls.length),0);
  assert.equal(await page.evaluate(()=>BookReader.pdfRenderTask),null);
  await page.evaluate(()=>location.hash='#/reader/local-pdf');
  const resume=externalPdf?1:5;
  await page.waitForFunction(number=>BookReader.mobileRenderedPages?.includes(number),resume,{timeout:30000});
  await page.waitForFunction(number=>document.querySelector('#bookPageIndicator')?.textContent===(number===5?'4–5/6':'1/6'),resume);
  await page.locator('#bookProgress').evaluate(el=>{el.value='2';el.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.locator('.flipbook-back').click();await page.locator('.book-card').waitFor();
  await page.waitForTimeout(250);
  assert.equal(await page.evaluate(()=>BookReader.pdfObjectUrls.length),0,'A cancelled background render must not retain images');
  await page.locator('.book-reading-tabs a[href="#/reading/local"]').click();
  await page.locator('.book-local-file').setInputFiles({name:'single-page.pdf',mimeType:'application/pdf',buffer:samplePdf(1)});
  await page.waitForFunction(()=>document.querySelector('#bookPageIndicator')?.textContent==='1/1');
  await checkCompletePages([1]);
  await page.locator('.flipbook-back').click();await page.locator('.book-card').waitFor();
 }
 if(!baseline){assert(components.length>=3);assert(components.every(url=>url.startsWith('https://yqxyy.netlify.app/assets/vendor/')),'Serve all reader components from the site');}
 assert.deepEqual(errors,[]);console.log('PASS: '+(baseline?'baseline captured':'phone landscape, touch page turns, device rotation, fullscreen fallback, bounded rendering, search, resume and cleanup'));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
