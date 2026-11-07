'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const ROOT='data/movie-kung-fu-panda-1',SRC=ROOT+'/.inspect/',U='https://api.obj2.top/hls/movie/9502/master.m3u8';
const R=f=>fs.readFileSync(f,'utf8'),W=(f,v)=>{fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,v);};
const round=x=>Math.round(x*1000000)/1000000,report=JSON.parse(R(SRC+'report.json')),editor=JSON.parse(R(ROOT+'/.build/editorial.json'));
function sec(t){const a=t.split(':').map(Number);return a.length===2?a[0]*60+a[1]:a[0]*3600+a[1]*60+a[2];}
function stamp(v){const n=Math.max(0,Math.round(v*1000));return String(Math.floor(n/3600000)).padStart(2,'0')+':'+String(Math.floor(n/60000)%60).padStart(2,'0')+':'+String(Math.floor(n/1000)%60).padStart(2,'0')+'.'+String(n%1000).padStart(3,'0');}
function parseVtt(s){const o=[];for(const b of s.replace(/^\uFEFF/,'').replace(/\r/g,'').split(/\n\s*\n/)){const a=b.split('\n'),i=a.findIndex(x=>x.includes('-->'));if(i<0)continue;const m=a[i].match(/((?:\d+:)?\d{1,2}:\d{2}\.\d{1,3})\s*-->\s*((?:\d+:)?\d{1,2}:\d{2}\.\d{1,3})(.*)/);if(!m)continue;const start=sec(m[1]),end=sec(m[2]),text=a.slice(i+1).join('\n').trim();if(end>start&&text)o.push({start,end,text,settings:m[3]||''});}return o.sort((a,b)=>a.start-b.start);}
const EN=parseVtt(R(SRC+'english-001.vtt')),ZH=parseVtt(R(SRC+'chinese-001.vtt'));assert(EN.length>500&&ZH.length>400);
function media(s,u){let t=0,d=null,key=null,seq=Number(s.match(/#EXT-X-MEDIA-SEQUENCE:(\d+)/)?.[1]||0),rows=[];assert(s.includes('#EXT-X-ENDLIST'));assert(!/#EXT-X-(MAP|BYTERANGE|DISCONTINUITY)(:|$)/m.test(s));for(const line of s.split(/\r?\n/).map(x=>x.trim())){if(line.startsWith('#EXT-X-KEY:'))key=line.replace(/URI="([^"]+)"/,(_,x)=>'URI="'+new URL(x,u).href+'"');else if(line.startsWith('#EXTINF:'))d=Number(line.slice(8).split(',')[0]);else if(line&&!line.startsWith('#')){assert(Number.isFinite(d)&&d>0);rows.push({start:t,end:t+d,dur:d,uri:new URL(line,u).href,seq:seq+rows.length,key});t+=d;d=null;}}return {rows,total:t};}
const VID=media(R(SRC+'video.m3u8'),report.selectedVideo),AUD=media(R(SRC+'audio.m3u8'),report.selectedAudio);assert(Math.abs(VID.total-AUD.total)<3);
function playlist(rows,offset){assert(rows.length);const o=['#EXTM3U','#EXT-X-VERSION:3','#EXT-X-PLAYLIST-TYPE:VOD','#EXT-X-TARGETDURATION:'+Math.ceil(Math.max(...rows.map(x=>x.dur))),'#EXT-X-MEDIA-SEQUENCE:'+rows[0].seq,'#EXT-X-START:TIME-OFFSET='+round(offset)+',PRECISE=YES'];let key=null;for(const s of rows){if(key!==s.key){if(s.key)o.push(s.key);key=s.key;}o.push('#EXTINF:'+s.dur.toFixed(6)+',',s.uri);}return o.concat('#EXT-X-ENDLIST','').join('\n');}
function chinese(c){let best=null,r=0;for(const z of ZH){if(z.end<c.start-2)continue;if(z.start>c.end+2)break;const overlap=Math.max(0,Math.min(c.end,z.end)-Math.max(c.start,z.start)),delta=Math.abs((z.start+z.end-c.start-c.end)/2),score=overlap>0?overlap+0.1/(1+delta):delta<1.2?0.03/(1+delta):0;if(score>r){best=z;r=score;}}return r>=0.12?best:null;}
function subtitles(cues,origin,bi){const o=['WEBVTT',''];for(const c of cues){let text=c.text;if(bi){const z=chinese(c);if(z&&!text.includes(z.text))text+='\n'+z.text;}o.push(stamp(c.start-origin)+' --> '+stamp(c.end-origin)+c.settings,text,'');}return o.join('\n')+'\n';}
const glossary={legendary:'传奇的',warrior:'勇士',dream:'梦想',noodles:'面条',tofu:'豆腐','kung fu':'功夫',tournament:'比武大会',destiny:'命运',palace:'宫殿',fireworks:'烟花',dragon:'龙',vision:'预言',master:'师父',scroll:'卷轴',sacred:'神圣的',power:'力量',impossible:'不可能的',mistake:'错误',training:'训练',ferocity:'凶猛',exercise:'练习',defeat:'击败',brave:'勇敢的',quit:'放弃',present:'当下',yesterday:'昨天',tomorrow:'明天',mystery:'谜团',prison:'监狱',escape:'逃脱',gift:'礼物',flexibility:'灵活性',combat:'战斗',darkness:'黑暗',heart:'内心',legend:'传说',believe:'相信',valley:'山谷',peach:'桃子',seed:'种子',tree:'树',control:'控制',guide:'引导',nurture:'培育',soup:'汤',ingredient:'配料',laugh:'笑',cookies:'饼干',hungry:'饥饿的',friends:'朋友',upset:'难过的',pool:'水池',tears:'眼泪',focus:'专注',harmony:'和谐',dumplings:'饺子',food:'食物',ready:'准备好的',fight:'战斗',bridge:'桥',scared:'害怕的',defeated:'被打败的',nerve:'神经',blank:'空白的',secret:'秘密',evacuate:'撤离',villagers:'村民',home:'家',weakness:'弱点',apology:'道歉',sorry:'对不起',angry:'生气的',hero:'英雄',panda:'熊猫',peace:'和平',victory:'胜利','secret ingredient':'秘制配方','Dragon Warrior':'神龙大侠','Tai Lung':'太郎'};
const candidates=[
['legendary','warrior','dream','noodles','tofu','kung fu','master','food'],
['tournament','destiny','palace','fireworks','Dragon Warrior','master','warrior','dragon'],
['warrior','scroll','sacred','power','impossible','mistake','master','Dragon Warrior'],
['training','ferocity','exercise','defeat','brave','quit','warrior','master','kung fu'],
['quit','present','yesterday','tomorrow','mystery','prison','escape','gift','warrior'],
['flexibility','combat','darkness','heart','legend','believe','valley','training','Tai Lung'],
['peach','seed','tree','control','believe','guide','nurture','master','destiny'],
['soup','ingredient','laugh','cookies','hungry','friends','upset','food','secret ingredient'],
['pool','tears','focus','harmony','dumplings','training','hungry','food','master'],
['defeat','fight','bridge','scared','ready','nerve','Tai Lung','warrior','master'],
['scroll','blank','secret','ingredient','evacuate','villagers','destiny','master'],
['home','master','scroll','apology','weakness','sorry','angry','power','Tai Lung'],
['panda','warrior','defeated','hero','secret','peace','victory','believe','power']
];
const matched=(word,text)=>new RegExp('(^|[^a-z])'+word.replace(/[^a-zA-Z0-9_]/g,'\\$&')+'(?=[^a-z]|$)','i').test(text);
const episodes=[],voc={},quiz={};let cuesTotal=0,biMatched=0;
for(let i=0;i<editor.chapters.length;i++){
 const c=editor.chapters[i],n=i+1,id=String(n).padStart(3,'0'),start=c.start,end=c.end;
 assert(end>start&&(i===0||Math.abs(start-editor.chapters[i-1].end)<0.01));
 const vs=VID.rows.filter(x=>x.end>start&&x.start<end);assert(vs.length);const origin=vs[0].start,videoEnd=vs.at(-1).end;
 const as=AUD.rows.filter(x=>x.end>origin&&x.start<videoEnd);assert(as.length);
 W(ROOT+'/hls/'+id+'.m3u8',['#EXTM3U','#EXT-X-VERSION:3','#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="English",LANGUAGE="eng",DEFAULT=YES,AUTOSELECT=YES,URI="'+id+'.audio.m3u8"','#EXT-X-STREAM-INF:BANDWIDTH=1800000,RESOLUTION=1280x720,CODECS="avc1.64001f,mp4a.40.2",AUDIO="aud"',id+'.video.m3u8',''].join('\n'));
 W(ROOT+'/hls/'+id+'.video.m3u8',playlist(vs,start-origin));W(ROOT+'/hls/'+id+'.audio.m3u8',playlist(as,start-as[0].start));
 const cues=EN.filter(x=>x.start<end&&x.end>start).map(x=>({...x,start:Math.max(start,x.start),end:Math.min(end,x.end)})).filter(x=>x.end>x.start);
 cuesTotal+=cues.length;biMatched+=cues.filter(x=>chinese(x)).length;
 const enPath='/data/movie-kung-fu-panda-1/subtitles/'+id+'.en.vtt',biPath='/data/movie-kung-fu-panda-1/subtitles/'+id+'.en-zh.vtt';
 W(ROOT+'/subtitles/'+id+'.en.vtt',subtitles(cues,origin,false));W(ROOT+'/subtitles/'+id+'.en-zh.vtt',subtitles(cues,origin,true));
 const words=[];
 for(const w of [...candidates[i],...candidates.flat(),...Object.keys(glossary)]){
  if(words.length>=5)break;
  if(!glossary[w]||words.some(x=>x.word.toLowerCase()===w.toLowerCase()))continue;
  const cue=cues.find(x=>matched(w,x.text)&&!(/^\[[^\]]+\]$/.test(x.text.trim())));
  if(!cue)continue;
  words.push({id:'movie-kung-fu-panda-1-'+n+'-'+(words.length+1),word:w,partOfSpeech:w.includes(' ')?'phrase':'word',meaningZh:glossary[w],definitionEn:'Used in the story to describe '+glossary[w]+'.',example:cue.text.replace(/\n/g,' ').slice(0,150),exampleZh:chinese(cue)?.text||'',source:'Verified source English subtitle',evidence:{originalStart:round(cue.start),localStart:round(cue.start-origin)}});
 }
 assert.equal(words.length,5,'Insufficient vocab, episode '+n);voc[String(n)]=words;
 assert.equal(c.questions.length,5);
 quiz[String(n)]={episodeId:n,title:c.titleEn+' · Quiz',questions:c.questions.map((q,j)=>{
  const raw=[q.correct,...q.distractors];assert(raw.length===4&&new Set(raw).size===4);
  const k=(i+j*3)%4,opt=raw.slice(k).concat(raw.slice(0,k));
  return {id:'q'+(j+1),type:'single-choice',category:'comprehension',question:q.question,options:opt.map((text,i)=>({key:'ABCD'[i],text})),answer:'ABCD'[opt.indexOf(q.correct)],explanation:q.explanation,source:'Original episode comprehension question'};
 })};
 episodes.push({episodeId:n,title:c.titleZh,titleZh:c.titleZh,titleEn:c.titleEn,summaryZh:c.summaryZh,summaryEn:c.summaryZh,status:'published',sourceType:'hls',video:{source:'hls',hlsUrl:'/data/movie-kung-fu-panda-1/hls/'+id+'.m3u8',subtitleUrl:enPath,originalHlsUrl:U,originalStart:start,originalEnd:end,timelineOrigin:round(origin),clipStart:round(start-origin),clipEnd:round(end-origin),duration:round(end-start)},subtitleTracks:{english:enPath,englishChinese:biPath,status:'native-english-and-simplified-chinese'},modules:{watch:true,read:false,words:true,vocabulary:true,quiz:true}});
}
assert(cuesTotal>=EN.filter(x=>x.start<editor.chapters.at(-1).end).length);
W(ROOT+'/series.json',JSON.stringify({seriesId:'movie-kung-fu-panda-1',seriesTitle:'Kung Fu Panda',seriesTitleZh:'功夫熊猫 · 剧情分集学习',level:3,language:'en',status:'completed',totalEpisodes:episodes.length,movieId:'kung-fu-panda-1',quizStatus:'ready',description:'字幕驱动的剧情分集课程，包含英文CC、原生简体中文双语字幕、词汇和剧情Quiz。'},null,2)+'\n');
W(ROOT+'/episodes.json',JSON.stringify(episodes,null,2)+'\n');W(ROOT+'/vocabulary.json',JSON.stringify(voc,null,2)+'\n');W(ROOT+'/quiz.json',JSON.stringify(quiz,null,2)+'\n');
console.log('COURSE_GENERATED '+JSON.stringify({episodes:episodes.length,words:Object.values(voc).flat().length,questions:Object.values(quiz).reduce((x,y)=>x+y.questions.length,0),EnglishCues:EN.length,ChineseCues:ZH.length,lessonCues:cuesTotal,matchedChinese:biMatched,videoDuration:VID.total,lastStoryEnd:editor.chapters.at(-1).end}));
