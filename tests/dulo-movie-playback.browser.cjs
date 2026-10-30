const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{const browser=await chromium.launch({channel:'msedge',headless:true});try{
 const page=await browser.newPage(),retired=[];
 const mediaResponses=[];page.on('response',r=>{if(/workers\.dev|_movie-media/.test(r.url())&&mediaResponses.length<12)mediaResponses.push({host:new URL(r.url()).hostname,status:r.status(),type:r.headers()['content-type']});});
 await page.addInitScript(()=>{window.mediaErrors=[];document.addEventListener('error',e=>{if(e.target?.tagName==='VIDEO')window.mediaErrors.push({code:e.target.error?.code,message:e.target.error?.message});},true);});
 page.on('request',r=>{if(new URL(r.url()).hostname==='zcdn.bluevelvet.space')retired.push(r.url());});
 if(!process.env.PRODUCTION_SITE){
  await page.route('https://cdn.jsdelivr.net/**',r=>r.request().url().includes('supabase-js')?r.fulfill({contentType:'application/javascript',body:'window.supabase={createClient:()=>({auth:{onAuthStateChange(){},getSession:async()=>({data:{session:null}})}})};'}):r.continue());
  await page.route('https://yqxyy.netlify.app/**',r=>{
   const u=new URL(r.request().url()),file=path.resolve(root,'.'+decodeURIComponent(u.pathname==='/'?'/index.html':u.pathname));
   const types={'.js':'application/javascript','.css':'text/css','.json':'application/json'};
   return file.startsWith(root+path.sep)&&fs.existsSync(file)?r.fulfill({path:file,contentType:types[path.extname(file)]||'text/html'}):r.fulfill({status:404,body:''});
  });
 }
 for(const id of ['luca','harry-potter-philosophers-stone']){
  await page.goto('https://yqxyy.netlify.app/#/movie/'+id,{waitUntil:'domcontentloaded'});
  try{await page.waitForFunction(()=>document.querySelector('.movie-watch-frame video')?.readyState>=1,null,{timeout:45000});}
  catch(e){console.log('Playback diagnostics',JSON.stringify({id,mediaResponses,state:await page.evaluate(()=>({status:document.getElementById('moviePlayerStatus')?.textContent,host:document.querySelector('video')?.currentSrc?new URL(document.querySelector('video').currentSrc).hostname:'',ready:document.querySelector('video')?.readyState,errors:window.mediaErrors}))}));throw e;}
  const video=page.locator('.movie-watch-frame video');
  await video.evaluate(v=>{v.muted=true;return v.play();});
  await page.waitForFunction(()=>document.querySelector('.movie-watch-frame video')?.currentTime>1,null,{timeout:30000});
  const media=await video.evaluate(v=>({host:new URL(v.currentSrc).hostname,width:v.videoWidth,height:v.videoHeight,duration:v.duration,time:v.currentTime}));
  assert.equal(media.host,'zcdn1.6azt0hwr-cf9.workers.dev');assert(media.width>0&&media.height>0&&media.duration>60);
  console.log('PASS: '+(process.env.PRODUCTION_SITE?'production ':'local code with real media ')+id,JSON.stringify(media));
 }
 assert.equal(retired.length,0,'No media request may go to the retired host');
 await page.evaluate(()=>MovieClassroom.cleanup());
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
