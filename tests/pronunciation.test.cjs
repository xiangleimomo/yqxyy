const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function setup(options={}){
 const nodes={},audios=[],spoken=[],timers=new Map();let id=0,cancelled=0,resumed=0;
 const synth={paused:true,getVoices:()=>[{lang:'zh-CN'},{lang:'en-US'}],addEventListener(){},cancel(){cancelled++},resume(){resumed++},speak(u){spoken.push(u)}};
 class Audio{constructor(){audios.push(this)}play(){if(options.reject)return Promise.reject(Error('blocked'));return Promise.resolve()}pause(){this.paused=true}removeAttribute(){}load(){}}
 const context=vm.createContext({Audio,navigator:{onLine:!options.offline},setTimeout:fn=>{timers.set(++id,fn);return id},clearTimeout:id=>timers.delete(id),document:{getElementById:id=>nodes[id],createElement:()=>({setAttribute(){}}),body:{append:n=>nodes[n.id]=n}},window:{Audio:options.noAudio?undefined:Audio,speechSynthesis:options.noSpeech?undefined:synth,SpeechSynthesisUtterance:class{constructor(text){this.text=text}}},SpeechSynthesisUtterance:class{constructor(text){this.text=text}}});
 vm.runInContext(fs.readFileSync(require.resolve('../js/pronunciation.js'),'utf8'),context);
 return {api:context.window.WordPronunciation,audios,spoken,synth,timers,nodes,get cancelled(){return cancelled},get resumed(){return resumed}};
}
(async()=>{
 let s=setup();assert.equal(s.api.speak(''),false);assert.equal(s.audios.length,0);s.api.speak('romance');assert.equal(s.audios.length,1);assert.equal(s.audios[0].src,'https://dict.youdao.com/dictvoice?audio=romance&type=2');assert.equal(s.spoken.length,0);
 s.audios[0].onplaying();assert.ok(s.nodes['pronunciation-status'].textContent.includes('romance'));s.audios[0].onended();assert.equal(s.nodes['pronunciation-status'].hidden,true);
 s.api.speak('take advantage of');assert.ok(s.audios[1].src.includes('take%20advantage%20of'));
 const oldFailure=s.audios[1].onerror;s.api.speak('apple');oldFailure();assert.equal(s.spoken.length,0);assert.equal(s.audios[1].paused,true);
 s.audios[2].onerror();assert.equal(s.spoken.length,1);assert.equal(s.spoken[0].text,'apple');assert.equal(s.spoken[0].lang,'en-US');assert.equal(s.spoken[0].volume,1);assert.equal(s.resumed,1);s.spoken[0].onstart();s.spoken[0].onend();assert.equal(s.nodes['pronunciation-status'].hidden,true);
 s=setup({offline:true});s.api.speak('bridge');assert.equal(s.audios.length,0);assert.equal(s.spoken.length,1,'offline speech must be synchronous inside the tap');
 s=setup({reject:true});s.api.speak('cloud');await new Promise(resolve=>setImmediate(resolve));assert.equal(s.spoken.length,1,'rejected media playback falls back once');
 s=setup({noSpeech:true});s.api.speak('dragon');s.audios[0].onerror();assert.ok(s.nodes['pronunciation-status'].textContent.includes('暂时无法播放'));
 s=setup();s.api.speak('water');const timeout=[...s.timers.values()].at(-1);timeout();assert.equal(s.spoken.length,1);s.spoken[0].onerror({error:'voice-unavailable'});assert.ok(s.nodes['pronunciation-status'].textContent.includes('暂时无法播放'));
 s=setup();s.api.speak('tree');s.api.stop();assert.equal(s.audios[0].paused,true);assert.ok(s.cancelled>=2);
 console.log('PASS: online audio, phrase encoding, rapid-click cancellation, stale callbacks, offline synchronous English voice, rejected/error/timed-out audio fallback, visible failure and cleanup.');
})().catch(e=>{console.error(e);process.exitCode=1});
