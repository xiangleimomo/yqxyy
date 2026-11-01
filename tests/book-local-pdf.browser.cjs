const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const {samplePdf}=require('./helpers/pdf-fixture.cjs');

(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[],forbidden=[];
 const pdf=samplePdf();let requests=0,mode='hold',release;
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(/u\.pone\.rs|\/book-source\//.test(r.url()))forbidden.push(r.url());assert(!String(r.headers()['content-type']).includes('multipart/form-data'));});
 await page.route('https://cdn.jsdelivr.net/**',r=>r.request().url().includes('supabase-js')?r.fulfill({contentType:'application/javascript',body:'window.supabase={createClient:()=>({auth:{onAuthStateChange(){},getSession:async()=>({data:{session:null}})}})};'}):r.continue());
 if(!process.env.PRODUCTION_SITE)await page.route('https://yqxyy.netlify.app/**',r=>{
  const u=new URL(r.request().url()),file=path.resolve(root,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));
  const types={'.js':'application/javascript','.css':'text/css','.json':'application/json'};
  return file.startsWith(root+path.sep)&&fs.existsSync(file)?r.fulfill({path:file,contentType:types[path.extname(file)]||'text/html'}):r.fulfill({status:404,body:''});
 });
 await page.route('https://yqxyy.netlify.app/book-download/**',async r=>{
  requests++;assert.equal(r.request().headers().range,undefined,'Use one full-file request');
  const currentMode=mode;
  if(currentMode==='hold')await new Promise(resolve=>release=resolve);
  if(currentMode==='fail')return r.fulfill({status:503,body:'Unavailable'});
  if(currentMode==='html')return r.fulfill({status:200,body:'<html>Not PDF</html>'});
  try{await r.fulfill({status:200,contentType:'application/pdf',headers:{'content-length':String(pdf.length)},body:pdf});}catch{}
 });
 const waitReader=()=>page.waitForFunction(()=>BookReader.pageFlip&&document.getElementById('bookPageIndicator')?.textContent==='1/2',null,{timeout:45000});
 const shelf=async()=>{await page.locator('.flipbook-back').click();await page.locator('.book-card').waitFor();};
 const clearFile=()=>page.evaluate(async()=>{BookReader.localPdfFiles.clear();const cache=await caches.open('storyfox-pdf-files-v1');for(const key of await cache.keys())await cache.delete(key);});
 await page.goto('https://yqxyy.netlify.app/#/reading',{waitUntil:'domcontentloaded'});
 await page.locator('.book-card').first().click();await page.locator('#bookDownloadStatus').waitFor();
 await page.waitForFunction(()=>document.getElementById('bookDownloadStatus').textContent.includes('下载'));
 assert.equal(await page.locator('input[type=file]').count(),0,'No manual file selection on the normal path');
 assert.equal(await page.locator('iframe').count(),0,'No PDF preview tab/frame');
 assert.equal(await page.evaluate(()=>Boolean(BookReader.pdfDocument)),false,'Do not parse an incomplete file');
 assert.equal(page.context().pages().length,1);
 await page.screenshot({path:path.join(process.env.TEMP,'yqxyy-auto-pdf-download.png')});
 await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.setViewportSize({width:1280,height:900});
 while(!release)await new Promise(resolve=>setTimeout(resolve,20));release();mode='ok';
 await waitReader();assert.equal(requests,1);assert.equal(await page.evaluate(()=>BookReader.pdfDocument.numPages),2);
 await page.locator('#bookProgress').evaluate(el=>{el.value='1';el.dispatchEvent(new Event('input',{bubbles:true}));});
 await page.waitForFunction(()=>document.getElementById('bookPageIndicator').textContent==='2/2');
 assert(await page.locator('.pdf-sharp-page img').first().evaluate(img=>img.naturalWidth>0));
 await shelf();await page.locator('.book-card').click();await waitReader();assert.equal(requests,1,'Reuse in-memory file');
 await page.reload();await waitReader();assert.equal(requests,1,'Reuse complete browser-cached PDF after refresh');
 await shelf();await clearFile();
 await page.evaluate(()=>{BookReader.savedPdfLoader=BookReader.loadPdfLibraries;BookReader.loadPdfLibraries=async()=>{throw new Error('Temporary component failure');};});
 await page.locator('.book-card').click();await page.getByText('阅读组件暂时加载失败，请返回书架重试，已下载的文件会保留。').waitFor();
 const beforeComponentRetry=requests;
 await page.evaluate(()=>BookReader.loadPdfLibraries=BookReader.savedPdfLoader);
 await shelf();await page.locator('.book-card').click();await waitReader();assert.equal(requests,beforeComponentRetry,'Keep a complete PDF when only the component fails');
 await shelf();await clearFile();mode='fail';
 await page.locator('.book-card').click();await page.locator('#bookDownloadRetry').waitFor();
 assert.match(await page.locator('#bookDownloadStatus').innerText(),/503/);
 mode='ok';await page.locator('#bookDownloadRetry').click();await waitReader();assert.equal(requests,beforeComponentRetry+2);
 await shelf();await clearFile();mode='html';
 await page.locator('.book-card').click();await page.locator('#bookDownloadRetry').waitFor();
 assert.match(await page.locator('#bookDownloadStatus').innerText(),/不是有效 PDF/);
 assert.equal(await page.evaluate(async()=>(await (await caches.open('storyfox-pdf-files-v1')).keys()).length),0);
 mode='hold';release=null;await page.locator('#bookDownloadRetry').click();
 while(!release)await new Promise(resolve=>setTimeout(resolve,20));
 await page.getByRole('link',{name:'取消并返回书架'}).click();await page.locator('.book-card').waitFor();
 release();mode='ok';await page.evaluate(()=>new Promise(resolve=>setTimeout(resolve,50)));
 assert.equal(await page.evaluate(()=>BookReader.pdfDocument),null);assert.equal(await page.locator('#pdfFlipbook').count(),0);
 // Local file selection remains available as an independent fallback.
 await page.locator('.books-notice input[type=file]').setInputFiles({name:'local.pdf',mimeType:'application/pdf',buffer:pdf});
 await waitReader();await shelf();
 assert.deepEqual(forbidden,[]);assert.deepEqual(errors,[]);
 console.log('PASS: one-click full download then local rendering, no preview/manual selection, cached reopen/refresh, retry, invalid response rejection, cancellation, page turns, mobile layout and local-file fallback'+(process.env.PRODUCTION_SITE?' on production with controlled download fixtures':''));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
