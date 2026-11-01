const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'../netlify/edge-functions/book-download.js'),'utf8').replace('export default async function','async function').replace('export const config','const config');
(async()=>{
 let calls=[],status=200;
 const run=vm.runInNewContext(source+';bookDownload',{URL,Headers,Response,fetch:async(url,options)=>{calls.push({url,options});return new Response(options.method==='HEAD'?null:'%PDF-test',{status,headers:{'content-type':'application/pdf','content-length':'9'}});}});
 let r=await run(new Request('https://site.test/book-download/pdf-reading-test.pdf',{headers:{range:'bytes=0-20',cookie:'private'}}));
 assert.equal(r.status,200);assert.equal(await r.text(),'%PDF-test');
 assert.equal(calls[0].url,'https://u.pone.rs/zkaylinz.pdf');assert.equal(calls[0].options.headers,undefined,'Never forward Range or credentials');
 assert.equal(r.headers.get('content-type'),'application/pdf');
 r=await run(new Request('https://site.test/book-download/pdf-reading-test.pdf',{method:'HEAD'}));assert.equal(await r.text(),'');
 const before=calls.length;
 assert.equal((await run(new Request('https://site.test/book-download/unknown.pdf'))).status,404);
 assert.equal((await run(new Request('https://site.test/book-download/pdf-reading-test.pdf',{method:'POST'}))).status,405);assert.equal(calls.length,before);
 status=206;assert.equal((await run(new Request('https://site.test/book-download/pdf-reading-test.pdf'))).status,502);
 console.log('PASS: fixed-source complete download, no forwarded Range/cookies, HEAD, unknown book/method rejection and partial-upstream failure');
})().catch(e=>{console.error(e);process.exitCode=1;});
