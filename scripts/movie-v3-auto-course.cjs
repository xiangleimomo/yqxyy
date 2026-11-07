'use strict';
// yqxyy V3: catalog TMDB ID -> same-source HLS video/audio/English CC/optional Chinese.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'..'),DATA=path.join(ROOT,'data'),BASE='https://api.obj2.top/hls/movie/';
const CATALOG=JSON.parse(fs.readFileSync(path.join(DATA,'movie-hub-catalog.json'),'utf8'));
const STATUS=path.join(DATA,'movie-v3-status.json'),NOW=new Date().toISOString();
const LIMIT=Math.max(1,Math.min(24,Number(process.env.V3_BATCH_SIZE||8))),ONLY=process.env.V3_MOVIE_ID||'';
const round=n=>Math.round(n*1e6)/1e6;
const sec=s=>s.split(':').map(Number).reduce((a,b)=>a*60+b,0);
const ts=n=>{const t=Math.max(0,Math.round(n*1000));return String(Math.floor(t/3600000)).padStart(2,'0')+':'+String(Math.floor(t/60000)%60).padStart(2,'0')+':'+String(Math.floor(t/1000)%60).padStart(2,'0')+'.'+String(t%1000).padStart(3,'0');};
const exists=p=>fs.existsSync(p),read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const save=(p,s)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,s);},saveJSON=(p,v)=>save(p,JSON.stringify(v,null,2)+'\n');
function attributes(line){const o={},s=line.slice(line.indexOf(':')+1);for(const m of s.matchAll(/([A-Z][A-Z0-9-]*)=("[^"]*"|[^,]*)/g))o[m[1]]=m[2].replace(/^"|"$/g,'');return o;}
async function load(url){let error;for(let i=0;i<2;i++){try{
 const r=await fetch(url,{headers:{'User-Agent':'Mozilla/5.0','Accept':'*/*'},signal:AbortSignal.timeout(22000)});
 if(!r.ok)throw Error('HTTP '+r.status+' '+url);const t=await r.text();
 if(!t.trimStart().startsWith('#EXTM3U')&&!t.trimStart().startsWith('WEBVTT'))throw Error('Not HLS or VTT '+url);return t;
 }catch(e){error=e;if(/HTTP 403|HTTP 404/.test(e.message))break;if(i===0)await new Promise(ok=>setTimeout(ok,800));}}throw error;}
function parseMedia(text,url){
 assert(text.includes('#EXT-X-ENDLIST'),'Video source must be VOD');
 assert(!/#EXT-X-(MAP|BYTERANGE|DISCONTINUITY)(:|$)/m.test(text),'Complex HLS unsupported');
 const rows=[];let at=0,duration=null,key=null;const seq=Number(text.match(/#EXT-X-MEDIA-SEQUENCE:(\d+)/)?.[1]||0);
 for(const line of text.split(/\r?\n/).map(s=>s.trim())){if(line.startsWith('#EXT-X-KEY:')){const a=attributes(line);assert(a.METHOD==='AES-128'||a.METHOD==='NONE','Unsupported DRM');key=a.METHOD==='NONE'?null:line.replace(/URI="([^"]+)"/,(_,u)=>'URI="'+new URL(u,url).href+'"');}
 else if(line.startsWith('#EXTINF:'))duration=Number(line.slice(8).split(',')[0]);
 else if(line&&!line.startsWith('#')){assert(duration>0,'Bad segment');rows.push({start:at,end:at+duration,d:duration,key,seq:seq+rows.length,url:new URL(line,url).href});at+=duration;duration=null;}}
 assert(rows.length>=50,'Movie media missing');return {rows,total:at};
}
function playlist(rows,offset){
 const out=['#EXTM3U','#EXT-X-VERSION:3','#EXT-X-PLAYLIST-TYPE:VOD','#EXT-X-TARGETDURATION:'+Math.ceil(Math.max(...rows.map(r=>r.d))),'#EXT-X-MEDIA-SEQUENCE:'+rows[0].seq,'#EXT-X-START:TIME-OFFSET='+round(offset)+',PRECISE=YES'];
 let previous=null;for(const r of rows){if(r.key!==previous){out.push(r.key||'#EXT-X-KEY:METHOD=NONE');previous=r.key;}out.push('#EXTINF:'+r.d.toFixed(6)+',',r.url);}return out.concat('#EXT-X-ENDLIST','').join('\n');
}
function parseVtt(s,shift=0){
 const result=[];for(const block of s.replace(/^\uFEFF/,'').replace(/\r/g,'').split(/\n\s*\n/)){
 const lines=block.split('\n'),i=lines.findIndex(x=>x.includes('-->'));if(i<0)continue;
 const m=lines[i].match(/^\s*((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})\s+-->\s+((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})(.*)$/);if(!m)continue;
 const start=sec(m[1].replace(',','.'))+shift,end=sec(m[2].replace(',','.'))+shift,text=lines.slice(i+1).join('\n').trim();
 if(text&&end>start)result.push({start,end,text,settings:m[3]||''});}return result;
}
async function sourceSub(track,master){
 if(!track?.URI)return null;const url=new URL(track.URI,master).href,body=await load(url);let cues=[];
 if(body.trimStart().startsWith('WEBVTT'))cues=parseVtt(body);
 else{let elapsed=0,d=null;for(const line of body.split(/\r?\n/).map(s=>s.trim())){
 if(line.startsWith('#EXTINF:'))d=Number(line.slice(8).split(',')[0]);
 else if(line&&!line.startsWith('#')){const part=parseVtt(await load(new URL(line,url).href)),max=Math.max(0,...part.map(x=>x.end));
 const local=elapsed>0&&d>0&&max<d+6;cues.push(...part.map(c=>local?{...c,start:c.start+elapsed,end:c.end+elapsed}:c));elapsed+=d||0;d=null;}}}
 const seen=new Set();cues=cues.sort((a,b)=>a.start-b.start).filter(c=>{const k=round(c.start)+'|'+round(c.end)+'|'+c.text;if(seen.has(k))return false;seen.add(k);return true;});
 assert(cues.length>120,'Source track has insufficient captions');return {url,cues};
}
function track(master,language){
 const rows=master.split(/\r?\n/).filter(s=>s.startsWith('#EXT-X-MEDIA:TYPE=SUBTITLES')).map(attributes);
 if(language==='en'){const en=rows.filter(x=>/^(en|eng)(-|$)/i.test(x.LANGUAGE||'')||/^English/i.test(x.NAME||''));return en.find(x=>/\bCC\b/i.test(x.NAME||''))||en[0]||null;}
 return rows.filter(x=>/^(zh|zho|chi)(-|$)/i.test(x.LANGUAGE||'')||/chinese|中文/i.test(x.NAME||''))
 .sort((a,b)=>Number(/simplified|简体/i.test(b.NAME||''))-Number(/simplified|简体/i.test(a.NAME||'')))[0]||null;
}

function boundaries(cues,last,old,source){
 if(old.length>=4&&old[0].video?.originalHlsUrl===source){
 const vals=[old[0].video.originalStart,...old.map(x=>x.video.originalEnd)].map(Number);
 if(vals.every((n,i)=>Number.isFinite(n)&&(!i||n>vals[i-1]))&&vals.at(-1)<=last+105)return {points:vals,preserve:true};
 }
 // Locate conversational/scene pauses near regularly spaced chapter targets.
 const count=Math.min(26,Math.max(8,Math.round(last/400))),points=[0],options=[];
 for(let i=0;i<cues.length-1;i++){const c=cues[i],next=cues[i+1],gap=next.start-c.end;if(gap<.4||c.end<150||c.end>last-150)continue;
 options.push({t:(c.end+next.start)/2,score:Math.min(20,gap)*3+(/[.!?]["')\]]?$/.test(c.text.trim())?4:0)});}
 for(let i=1;i<count;i++){const ideal=last*i/count,min=points.at(-1)+140,max=last-(count-i)*140;
 const nearby=options.filter(x=>x.t>=Math.max(min,ideal-100)&&x.t<=Math.min(max,ideal+100));
 nearby.sort((a,b)=>(b.score-Math.abs(b.t-ideal)/5)-(a.score-Math.abs(a.t-ideal)/5));
 points.push(round(nearby[0]?.t||Math.max(min,Math.min(max,ideal))));}
 points.push(round(last));assert(points.every((x,i)=>!i||x>points[i-1]+80),'Chapter time boundaries invalid');
 return {points,preserve:false};
}
const clip=(cc,a,b)=>cc.filter(x=>x.end>a&&x.start<b).map(x=>({...x,start:Math.max(a,x.start),end:Math.min(b,x.end)})).filter(x=>x.end>x.start);
function matchChinese(en,zh){let best=null,score=0;for(const c of zh){if(c.end<en.start-1)continue;if(c.start>en.end+1)break;
 const overlap=Math.max(0,Math.min(en.end,c.end)-Math.max(en.start,c.start));if(overlap>score){score=overlap;best=c;}}
 return score>.12?best:null;
}
function writeVtt(cues,origin,zh){const result=['WEBVTT',''];for(const c of cues){const translated=zh.length?matchChinese(c,zh):null;
 result.push(ts(c.start-origin)+' --> '+ts(c.end-origin)+(c.settings||''),c.text+(translated?.text&&!c.text.includes(translated.text)?'\n'+translated.text:''),'');}return result.join('\n')+'\n';}
const dict=Object.fromEntries(
 'adventure|冒险;afraid|害怕;agree|同意;alone|独自;always|总是;amazing|惊人;angry|生气;answer|回答;appear|出现;arrive|到达;attack|攻击;away|离开;baby|婴儿;battle|战斗;beautiful|美丽;because|因为;become|成为;before|以前;begin|开始;believe|相信;better|更好;birthday|生日;brave|勇敢;bring|带来;brother|兄弟;care|关心;careful|小心;change|改变;child|孩子;children|孩子们;choose|选择;city|城市;close|靠近;come|来;coming|正在到来;could|能够;danger|危险;dark|黑暗;daughter|女儿;day|日子;dead|死亡;death|死亡;decide|决定;destroy|摧毁;different|不同;difficult|困难;dinner|晚餐;discover|发现;dream|梦想;easy|容易;enough|足够;escape|逃脱;ever|曾经;every|每个;everybody|大家;everyone|每个人;everything|一切;exactly|确实;excuse|原谅;expect|期待;explain|解释;face|面对;family|家庭;father|父亲;fight|战斗;finally|终于;find|找到;fire|火;first|首先;follow|跟随;food|食物;forget|忘记;found|发现了;free|自由;friend|朋友;friends|朋友们;future|未来;game|游戏;gave|给了;get|获得;girl|女孩;give|给予;glad|高兴;good|好;goodbye|再见;great|伟大;grow|成长;guess|猜测;happy|开心;hard|艰难;hate|讨厌;head|头;hear|听见;heard|听到了;heart|心;help|帮助;hero|英雄;hide|隐藏;home|家;hope|希望;house|房屋;important|重要;inside|里面;just|只是;keep|保持;kind|善良;king|国王;knew|知道了;know|知道;last|最后;later|稍后;laugh|笑;leave|离开;left|离开了;lesson|课程;life|生命;light|光;listen|听;little|小;live|生活;long|长;look|看;lost|迷路;love|爱;luck|运气;magic|魔法;make|制作;man|男人;many|很多;master|大师;maybe|也许;mean|意思;meet|遇见;mind|头脑;mistake|错误;moment|时刻;money|钱;morning|早上;mother|母亲;move|移动;name|名字;need|需要;never|从不;new|新的;night|夜晚;nobody|没有人;nothing|没有什么;now|现在;old|旧;once|曾经;only|仅仅;open|打开;order|命令;other|其他;outside|外面;over|结束;pain|疼痛;parents|父母;people|人们;perhaps|或许;place|地点;plan|计划;please|请;power|力量;protect|保护;question|问题;quick|快速;quiet|安静;ready|准备好;real|真实;really|真的;reason|原因;remember|记得;return|返回;right|正确;run|奔跑;safe|安全;save|拯救;saved|拯救了;scared|害怕;school|学校;see|看见;secret|秘密;seem|似乎;send|发送;serious|严肃;show|展示;sister|姐妹;sleep|睡觉;small|小的;someone|某人;something|某事;sorry|抱歉;sound|声音;special|特别;stay|停留;still|仍然;stop|停止;story|故事;strange|奇怪;strong|强壮;student|学生;sure|确定;surprise|惊喜;take|拿;talk|交谈;teach|教;tell|告诉;thank|感谢;thing|东西;think|思考;thought|想法;time|时间;today|今天;together|一起;tomorrow|明天;tonight|今晚;train|训练;training|训练;true|真实;trust|信任;truth|真相;try|尝试;turn|转弯;understand|理解;until|直到;wait|等待;walk|行走;want|想要;watch|观看;water|水;welcome|欢迎;well|良好;whole|整个;wish|愿望;woman|女人;wonder|好奇;word|单词;work|工作;world|世界;worry|担心;wrong|错误;year|年;years|多年;young|年轻'.split(';').map(x=>x.split('|')));
function spoken(c){const s=c.text.replace(/<[^>]+>/g,'').replace(/\[[^\]]+\]/g,'').replace(/\s+/g,' ').replace(/^[\s\-]+/,'').trim();
 return s.length>=19&&s.length<=120&&s.split(/\s+/).length>=4&&!/copyright|captioning|subtitl/i.test(s)?s:null;}
function words(cues,id,origin,courseId,zh){
 const selected=new Map();for(const cue of cues){for(const token of cue.text.match(/[a-zA-Z]{3,}/g)||[]){const w=token.toLowerCase();if(!dict[w])continue;
 const x=selected.get(w)||{count:0,cue};x.count++;selected.set(w,x);}}
 const best=[...selected].sort((a,b)=>Number(b[0].length>=6)-Number(a[0].length>=6)||b[1].count-a[1].count).slice(0,5);
 assert(best.length===5,'Less than five translatable words in episode');
 return best.map(([word,hit],j)=>({id:courseId+'-'+id+'-'+(j+1),word,partOfSpeech:'word',meaningZh:dict[word],
 definitionEn:'A word spoken in this scene.',example:spoken(hit.cue)||hit.cue.text.replace(/\n/g,' ').slice(0,150),
 exampleZh:matchChinese(hit.cue,zh)?.text||'',source:'Original movie English CC',evidence:{originalStart:round(hit.cue.start),localStart:round(hit.cue.start-origin)}}));
}
function fiveQuestions(cues,all,id,start){
 const lines=cues.map(spoken).filter(Boolean);
 assert(lines.length>=9,'Not enough spoken dialogue for 5 questions');
 const sceneSet=new Set(lines),out=all.filter(c=>c.end<start-160||c.start>cues.at(-1).end+160).map(spoken).filter(Boolean);
 const optionsFor=(correct,seed)=>{const list=[];for(let i=0;i<out.length&&list.length<3;i++){const s=out[(i*37+seed*17)%out.length];
 if(s!==correct&&!list.includes(s)&&!sceneSet.has(s))list.push(s);}assert(list.length===3,'Not enough outside dialogue choices');return list;};
 const prompts=['Which line is heard near the start of this episode?','Which statement appears in the story at this point?','Which sentence does a character say in this episode?','Which line is heard later in this episode?','Which line is heard near the end of this episode?'];
 const questions=prompts.map((question,i)=>{const correct=lines[Math.floor((lines.length-1)*[.12,.35,.54,.76,.90][i])],options=[correct,...optionsFor(correct,id*5+i)].map((text,index)=>({text,correct:index===0}));
 const shift=(id+i)%4;options.push(...options.splice(0,shift));
 return {id:'q'+(i+1),type:'single-choice',category:'comprehension',question,options:options.map((x,index)=>({key:'ABCD'[index],text:x.text})),answer:'ABCD'[options.findIndex(x=>x.correct)],explanation:'正确答案可从本集原生英文字幕中核对，其余对白来自影片其他片段。',source:'Native CC evidence: automated dialogue comprehension'};});
 return {episodeId:id,title:'Episode '+id+' · Quiz',questions};
}
