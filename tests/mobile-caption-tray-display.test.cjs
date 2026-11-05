const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function makeScene({mobile = true, hasCues = true, hiddenByUser = false, highlight = true} = {}) {
  const src = fs.readFileSync('js/app.js','utf8');
  const a = src.indexOf('  async bindSubtitleOverlay(player,d){');
  const b = src.indexOf('\n  async initializeHlsVideo(player){',a);
  assert(a >= 0 && b > a, 'Watch subtitle binding method exists');
  const method = src.slice(a,b).trim().replace(/,\s*$/,'');
  const listeners = {};
  const caption = {
    parentElement:null,dataset:{subtitleVisible:hiddenByUser?'false':'true'},
    isConnected:true,hidden:true,textContent:'',listeners:{},
    addEventListener(name,fn){this.listeners[name]=fn;},
    closest(selector){return mobile && selector === '.subtitle-video-wrap.sf-caption-below' ? {className:'sf-caption-below'} : null;},
    replaceChildren(fragment){this.fragment=fragment;}
  };
  const message={hidden:true,textContent:''};
  caption.parentElement={querySelector:selector=>selector === '.sf-mobile-caption-message'?message:null};
  const nativeTrack={mode:'disabled'};
  const player={
    parentElement:{querySelector:selector=>selector === '.video-caption'?caption:null},
    dataset:{},paused:true,currentTime:128,webkitDisplayingFullscreen:true,isConnected:true,
    closest:()=>null,
    addEventListener(name,fn){(listeners[name] ||= []).push(fn);},
    appendChild(track){this.track=track;}
  };
  const events={};
  const painted=[];
  const context={
    document:{
      fullscreenElement:null,
      createElement:()=>({track:nativeTrack,kind:'',label:'',src:''}),
      addEventListener(name,fn){events[name]=fn;}
    },
    window:{
      SFWordSync:highlight?{
        async load(){return [{verified:true}]},
        render(){return {fragment:{name:'word-fragment'},nodes:[{active:false}],words:[{startMs:127000,endMs:129000}]};},
        paint(view,now){painted.push(now);}
      }:null,
      SFKaraokePractice:null
    },
    fetch:async()=>({ok:true,text:async()=>'WEBVTT TEST'}),
    requestAnimationFrame:()=>1,
    cancelAnimationFrame:()=>{},
  };
  const methodObject = vm.runInNewContext('({' + method + '})',context);
  const app={
    subtitleVttUrl(){return 'data/journey-to-the-west/subtitles/048.vtt';},
    parseVtt(){return hasCues?[{startMs:127330,endMs:129961,text:'The Tang Monk scowled at the monkey.'}]:[];},
    subtitlePreferences(){return {visible:true,wordHighlight:highlight};}
  };
  const run=()=>methodObject.bindSubtitleOverlay.call(app,player,{seriesId:'journey-to-the-west',ep:{episodeId:48,video:{}}});
  const fire=name=>(listeners[name]||[]).forEach(fn=>fn());
  return {run,fire,player,caption,message,nativeTrack,painted};
}

test('mobile embedded browser native fullscreen flag does not suppress separate subtitle tray', async()=>{
  const s=makeScene();
  await s.run();
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(s.caption.hidden,false,'caption must be displayed below the embedded mobile video');
  assert.equal(s.nativeTrack.mode,'hidden','avoid native track duplicating custom site subtitles');
  assert.ok(s.caption.fragment,'word-level caption should render as interactive spans');
  assert.ok(s.painted.includes(128000),'word highlighting keeps following playback time');
  assert.equal(s.message.hidden,true);
});

test('mobile caption follows timeupdate and displays a hint during real subtitle gaps',async()=>{
  const s=makeScene({highlight:false});
  await s.run();
  assert.equal(s.caption.textContent,'The Tang Monk scowled at the monkey.');
  s.player.currentTime=131;
  s.fire('timeupdate');
  assert.equal(s.caption.hidden,true);
  assert.equal(s.message.hidden,false);
  assert.match(s.message.textContent,/下一句/);
  s.player.currentTime=128;
  s.fire('timeupdate');
  assert.equal(s.caption.hidden,false);
  assert.equal(s.message.hidden,true);
});

test('mobile subtitle preference disabled shows a useful message instead of blank tray',async()=>{
  const s=makeScene({hiddenByUser:true});
  await s.run();
  assert.equal(s.caption.hidden,true);
  assert.match(s.message.textContent,/字幕已关闭/);
  assert.equal(s.message.hidden,false);
});

test('mobile subtitle fetch/parse failure is visible in tray',async()=>{
  const s=makeScene({hasCues:false});
  await s.run();
  assert.match(s.message.textContent,/加载失败/);
  assert.equal(s.message.hidden,false);
});

test('desktop native fullscreen keeps its original fallback behavior',async()=>{
  const s=makeScene({mobile:false});
  await s.run();
  assert.equal(s.caption.hidden,true);
  assert.equal(s.nativeTrack.mode,'showing');
});

test('Watch has a mobile-only status line next to its clickable DOM caption',()=>{
  const app=fs.readFileSync('js/app.js','utf8');
  const css=fs.readFileSync('css/style.css','utf8');
  assert.match(app,/class="sf-mobile-caption-message"/);
  assert.match(app,/const isMobileCaptionTray=/);
  assert.match(css,/\.subtitle-video-wrap\.sf-caption-below \.sf-mobile-caption-message:not\(\[hidden\]\)/);
});
