const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'../js/app.js'),'utf8').replace(/App\.start\(\);\s*$/,'globalThis.app=App;');
function environment({safari=false, supported=true, libraryFailure=false}={}){
 const timers=new Map();let tid=0;const instances=[];
 class Hls{
  static Events={ERROR:'error'};
  static isSupported(){return supported;}
  constructor(){this.events={};instances.push(this);}
  on(e,f){this.events[e]=f;}
  attachMedia(p){this.player=p;}
  loadSource(s){this.source=s;}
  destroy(){this.destroyed=true;}
 }
 const ctx={console,navigator:{userAgent:safari?'Version/17.0 Safari':'Chrome/154 Safari'},window:{Hls},setTimeout:(f)=>{timers.set(++tid,f);return tid;},clearTimeout:(id)=>timers.delete(id)};
 vm.runInNewContext(source,ctx);
 if(libraryFailure)ctx.app.loadHlsLibrary=async()=>{throw Error('CDN blocked');};
 const help={textContent:''};
 function player(){
  const listeners=new Map();
  return {dataset:{hlsSrc:'https://example.test/video.m3u8',fallbackSrc:'https://example.test/video.mp4'},paused:true,currentTime:0,readyState:0,duration:298,
   canPlayType:()=> 'maybe',closest:()=>({querySelector:()=>help}),
   addEventListener(e,f,o){if(!listeners.has(e))listeners.set(e,[]);listeners.get(e).push({f,once:o?.once});},
   removeEventListener(e,f){listeners.set(e,(listeners.get(e)||[]).filter(x=>x.f!==f));},
   emit(e){for(const x of [...(listeners.get(e)||[])]){if(x.once)this.removeEventListener(e,x.f);x.f();}},
   load(){this.loads=(this.loads||0)+1;},play(){this.plays=(this.plays||0)+1;this.paused=false;return Promise.resolve();}
  };
 }
 return {app:ctx.app,player,help,instances,timers};
}
(async()=>{
 let e=environment(),p=e.player();await e.app.initializeHlsVideo(p);
 assert.equal(e.instances.length,1,'Chrome must use HLS.js even if canPlayType says maybe');
 p.paused=false;p.currentTime=42;p.emit('play');
 e.instances[0].events.error('error',{fatal:false});assert.equal(p.src,undefined);
 e.instances[0].events.error('error',{fatal:true});
 assert.equal(p.src,p.dataset.fallbackSrc);assert(e.instances[0].destroyed);
 p.emit('loadedmetadata');assert.equal(p.currentTime,42);assert.equal(p.plays,1);
 p.emit('error');assert.equal(p.loads,1,'Fallback must not loop');
 e=environment({libraryFailure:true});p=e.player();await e.app.initializeHlsVideo(p);assert.equal(p.src,p.dataset.fallbackSrc);
 e=environment();p=e.player();await e.app.initializeHlsVideo(p);for(const f of [...e.timers.values()])f();assert.equal(p.src,p.dataset.fallbackSrc,'Metadata timeout must recover');
 e=environment({safari:true});p=e.player();await e.app.initializeHlsVideo(p);assert.equal(p.src,p.dataset.hlsSrc);assert.equal(e.instances.length,0);p.emit('error');assert.equal(p.src,p.dataset.fallbackSrc);
 e=environment();p=e.player();await e.app.initializeHlsAudio(p);p._disposeHls();assert(e.instances[0].destroyed);assert.equal(e.timers.size,0);
 e=environment();p=e.player();p.dataset.fallbackSrc='';await e.app.initializeHlsVideo(p);e.instances[0].events.error('error',{fatal:true});assert.match(e.help.textContent,/无法加载/);assert.equal(p.loads,undefined);
 const d={ep:{video:{hlsUrl:'hls',mp4Url:'mp4'}}};const html=e.app.hlsAudioPanel(d);assert.match(html,/<audio /);assert(!html.includes('<video'));assert.match(html,/data-fallback-src="mp4"/);
 console.log('PASS: Chrome, Safari, fatal/nonfatal errors, MP4 recovery, resume, timeout, disposal and audio-only rendering.');
})().catch(error=>{console.error(error);process.exitCode=1;});
