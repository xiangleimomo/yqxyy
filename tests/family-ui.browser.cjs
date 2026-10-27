const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{const b=await chromium.launch({channel:'msedge',headless:true});try{
 const p=await b.newPage({viewport:{width:390,height:900}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({contentType:'application/javascript',body:r.request().url().includes('supabase-js')?'window.supabase={createClient:()=>({auth:{onAuthStateChange(){},getSession:async()=>({data:{session:null}})}})};':'window.Hls={isSupported:()=>false};'}));
 await p.route('https://yqxyy.netlify.app/**',async r=>{
  const u=new URL(r.request().url()),file=path.resolve(root,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return r.fulfill({status:404,body:''});
  return r.fulfill({path:file,contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':file.endsWith('.json')?'application/json':'text/html'});
 });
 await p.goto('https://yqxyy.netlify.app/#/homework');await p.locator('#familyLogin').waitFor();
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.equal(await p.locator('.utility-nav #navHomework').getAttribute('aria-current'),'page');
 assert.equal(await p.locator('.main-tab[href="#/homework"]').count(),0);
 await p.locator('#familyLogin').click();assert.equal(await p.locator('#accountDialog').isVisible(),true);await p.locator('#accountClose').click();
 await p.goto('https://yqxyy.netlify.app/#/child');await p.locator('#familyLogin').waitFor();
 assert.equal(await p.locator('.utility-nav #navHomework').getAttribute('aria-current'),'page');
 assert.equal(await p.locator('.main-tab[href="#/homework"]').count(),0);
 assert.equal(await p.locator('.main-tab[href="#/parent"],.main-tab[href="#/child"]').count(),0);
 assert.deepEqual(errors,[]);
 if(process.env.FAMILY_GUEST_SCREENSHOT)await p.screenshot({path:process.env.FAMILY_GUEST_SCREENSHOT,fullPage:true});
 console.log('PASS: full site startup, new main navigation, guest login entry, unified homework tab and legacy links and 390px layout');
 }finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
