const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
function samplePdf(){
 const objects=[
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 160] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R >>',
  '',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 160] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>',
  '',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
 ];
 for(const [index,page] of [[3,1],[5,2]]){const stream=`BT /F1 16 Tf 20 80 Td (Local PDF page ${page}) Tj ET`;objects[index]=`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;}
 let pdf='%PDF-1.4\n',offsets=[0];
 objects.forEach((obj,i)=>{offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${obj}\nendobj\n`;});
 const xref=Buffer.byteLength(pdf);pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
 for(const offset of offsets.slice(1))pdf+=String(offset).padStart(10,'0')+' 00000 n \n';
 pdf+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
 return Buffer.from(pdf);
}
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage({viewport:{width:1280,height:900}}),remotePdfs=[],errors=[];
 page.on('request',r=>{if(/u\.pone\.rs|\/book-source\//.test(r.url()))remotePdfs.push(r.url());assert(!['POST','PUT'].includes(r.method())||!String(r.headers()['content-type']).includes('multipart/form-data'),'Local PDFs must not be uploaded');});
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://cdn.jsdelivr.net/**',r=>r.request().url().includes('supabase-js')?r.fulfill({contentType:'application/javascript',body:'window.supabase={createClient:()=>({auth:{onAuthStateChange(){},getSession:async()=>({data:{session:null}})}})};'}):r.continue());
 if(!process.env.PRODUCTION_SITE)await page.route('https://yqxyy.netlify.app/**',r=>{
  const u=new URL(r.request().url()),file=path.resolve(root,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));
  const types={'.js':'application/javascript','.css':'text/css','.json':'application/json'};
  return file.startsWith(root+path.sep)&&fs.existsSync(file)?r.fulfill({path:file,contentType:types[path.extname(file)]||'text/html'}):r.fulfill({status:404,body:''});
 });
 await page.goto('https://yqxyy.netlify.app/#/reading',{waitUntil:'domcontentloaded'});
 await page.locator('.book-card').first().click();await page.locator('#bookLocalPdf').waitFor({state:'attached'});
 assert.equal(await page.locator('#bookDownload').getAttribute('href'),'https://u.pone.rs/zkaylinz.pdf');
 assert.equal(await page.locator('#bookDownload').getAttribute('target'),'_blank');
 assert.equal(await page.evaluate(()=>Boolean(window.pdfjsLib)),false,'Do not start PDF.js before file selection');
 assert.deepEqual(remotePdfs,[]);
 await page.screenshot({path:path.join(process.env.TEMP,'yqxyy-local-pdf-download.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.locator('#bookLocalPdf').setInputFiles({name:'notes.txt',mimeType:'text/plain',buffer:Buffer.from('Not a PDF')});
 assert.match(await page.locator('#bookLocalStatus').innerText(),/请选择/);
 await page.setViewportSize({width:1280,height:900});
 await page.locator('#bookLocalPdf').setInputFiles({name:'downloaded.pdf',mimeType:'application/pdf',buffer:samplePdf()});
 await page.waitForFunction(()=>window.BookReader?.pageFlip&&document.getElementById('bookPageIndicator')?.textContent==='1/2',null,{timeout:45000});
 assert.equal(await page.evaluate(()=>BookReader.pdfDocument.numPages),2);
 await page.locator('#bookProgress').evaluate(el=>{el.value='1';el.dispatchEvent(new Event('input',{bubbles:true}));});
 await page.waitForFunction(()=>document.getElementById('bookPageIndicator').textContent==='2/2');
 assert(await page.locator('.pdf-sharp-page img').first().evaluate(img=>img.naturalWidth>0));
 assert.deepEqual(remotePdfs,[],'All PDF bytes must come from the selected local File');
 await page.screenshot({path:path.join(process.env.TEMP,'yqxyy-local-pdf-reader.png')});
 await page.locator('.flipbook-back').click();await page.locator('.book-card').first().click();
 await page.waitForFunction(()=>document.getElementById('bookPageIndicator')?.textContent==='1/2');
 assert.equal(await page.locator('#bookLocalPdf').count(),0,'Reuse the file during this page session');
 await page.reload();await page.locator('#bookLocalPdf').waitFor({state:'attached'});
 assert.deepEqual(remotePdfs,[]);
 await page.locator('#bookLocalPdf').setInputFiles({name:'broken.pdf',mimeType:'application/pdf',buffer:Buffer.from('Not a valid PDF')});
 await page.getByText('暂时无法打开本地 PDF').waitFor();
 await page.locator('.flipbook-back').click();await page.locator('.book-card').first().click();await page.locator('#bookLocalPdf').waitFor({state:'attached'});
 // Leaving during component preparation must not create a late PDF document.
 await page.evaluate(()=>{BookReader.originalPdfLoader=BookReader.loadPdfLibraries;BookReader.loadPdfLibraries=()=>new Promise(resolve=>window.finishPdfSetup=resolve);});
 await page.locator('#bookLocalPdf').setInputFiles({name:'delayed.pdf',mimeType:'application/pdf',buffer:samplePdf()});
 await page.waitForFunction(()=>Boolean(window.finishPdfSetup));
 await page.locator('.flipbook-back').click();await page.locator('.book-card').waitFor();
 await page.evaluate(()=>{window.finishPdfSetup();BookReader.loadPdfLibraries=BookReader.originalPdfLoader;});
 assert.equal(await page.evaluate(()=>BookReader.pdfDocument),null);
 assert.equal(await page.locator('#pdfFlipbook').count(),0);
 assert.deepEqual(errors,[]);
 console.log('PASS: direct download entry, no remote PDF/proxy loads, invalid-file validation, real local PDF rendering/page turn, session reuse/refresh, corrupt-file retry, mobile layout and stale setup cancellation'+(process.env.PRODUCTION_SITE?' on production':''));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
