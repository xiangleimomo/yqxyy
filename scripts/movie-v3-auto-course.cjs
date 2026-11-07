'use strict';
// yqxyy V3: catalog TMDB ID -> same-source HLS video/audio/English CC/optional Chinese.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'..'),DATA=path.join(ROOT,'data'),BASE='https://api.obj2.top/hls/movie/';
const CATALOG=JSON.parse(fs.readFileSync(path.join(DATA,'movie-hub-catalog.json'),'utf8'));
const STATUS=path.join(DATA,'movie-v3-status.json'),NOW=new Date().toISOString();
const LIMIT=Math.max(1,Math.min(100,Number(process.env.V3_BATCH_SIZE||82))),ONLY=process.env.V3_MOVIE_ID||'';
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
function trackCandidates(master,language){
 const rows=master.split(/\r?\n/).filter(s=>s.startsWith('#EXT-X-MEDIA:TYPE=SUBTITLES')).map(attributes);
 if(language==='en')return rows.filter(x=>/^(en|eng)(-|$)/i.test(x.LANGUAGE||'')||/^English/i.test(x.NAME||''))
  .sort((a,b)=>Number(/\bCC\b/i.test(b.NAME||''))-Number(/\bCC\b/i.test(a.NAME||'')));
 return rows.filter(x=>/^(zh|zho|chi)(-|$)/i.test(x.LANGUAGE||'')||/chinese|中文/i.test(x.NAME||''))
  .sort((a,b)=>Number(/simplified|简体|zh-cn|zh-hans/i.test((b.NAME||'')+' '+(b.LANGUAGE||'')))-Number(/simplified|简体|zh-cn|zh-hans/i.test((a.NAME||'')+' '+(a.LANGUAGE||''))));
}
function track(master,language){return trackCandidates(master,language)[0]||null;}

function boundaries(cues,last,old,source){
 const sameSource=old.length>=4&&old[0].video?.originalHlsUrl===source;
 if(sameSource){
  const vals=[old[0].video.originalStart,...old.map(x=>x.video.originalEnd)].map(Number);
  if(vals.every((n,i)=>Number.isFinite(n)&&(!i||n>vals[i-1]))&&vals.at(-1)<=last+105)
   return {points:vals,preserve:true,migrated:false};
 }
 // When upgrading an existing film to its TMDB source, retain its episode count
 // and map the old chapter boundaries proportionally onto the new caption timeline.
 const migrated=old.length>=4,count=migrated?old.length:Math.min(26,Math.max(8,Math.round(last/400)));
 const oldEnd=migrated?Number(old.at(-1).video?.originalEnd||0):0;
 const points=[0],options=[];
 for(let i=0;i<cues.length-1;i++){
  const c=cues[i],next=cues[i+1],gap=next.start-c.end;
  if(gap<.4||c.end<150||c.end>last-150)continue;
  options.push({t:(c.end+next.start)/2,score:Math.min(20,gap)*3+(/[.!?]["')\]]?$/.test(c.text.trim())?4:0)});
 }
 for(let i=1;i<count;i++){
  const oldEndAt=migrated?Number(old[i-1].video?.originalEnd||0):0;
  const target=migrated&&oldEnd>0&&oldEndAt>0?last*oldEndAt/oldEnd:last*i/count;
  const min=points.at(-1)+140,max=last-(count-i)*140;
  const tolerance=migrated?Math.max(90,last/count*.32):100;
  const nearby=options.filter(x=>x.t>=Math.max(min,target-tolerance)&&x.t<=Math.min(max,target+tolerance));
  nearby.sort((a,b)=>(b.score-Math.abs(b.t-target)/5)-(a.score-Math.abs(a.t-target)/5));
  points.push(round(nearby[0]?.t||Math.max(min,Math.min(max,target))));
 }
 points.push(round(last));
 assert(points.every((x,i)=>!i||x>points[i-1]+80),'Chapter time boundaries invalid');
 return {points,preserve:false,migrated};
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
const extraWords=`abandon|抛弃;ability|能力;absolutely|绝对;accept|接受;accident|事故;accompany|陪伴;achieve|实现;action|行动;active|积极;admit|承认;advice|建议;affect|影响;afford|负担得起;allow|允许;amuse|逗乐;ancient|古代;announce|宣布;annoy|惹恼;approach|接近;argue|争论;arrange|安排;ashamed|羞愧;attempt|尝试;attend|参加;attract|吸引;available|可用;avoid|避免;awake|醒着;aware|意识到;balance|平衡;behave|表现;belief|信念;belong|属于;benefit|益处;blame|责怪;block|阻挡;borrow|借;branch|树枝;breathe|呼吸;bright|明亮;burn|燃烧;calm|平静;cancel|取消;capable|有能力;capture|捕获;career|职业;celebrate|庆祝;certain|确定;charge|收费;chase|追赶;cheer|欢呼;claim|声称;climb|攀爬;collect|收集;comfort|安慰;command|命令;communicate|交流;compare|比较;complain|抱怨;concern|担心;confident|自信;confuse|使困惑;connect|连接;consider|考虑;contain|包含;convince|说服;count|数数;cover|覆盖;crew|船员;cross|穿过;crowd|人群;cruel|残忍;damage|损害;declare|宣布;defend|防御;delay|延迟;deliver|递送;demand|要求;deny|否认;depend|依赖;deserve|值得;design|设计;desire|渴望;disappear|消失;disappoint|使失望;discuss|讨论;distance|距离;divide|分开;doubt|怀疑;effort|努力;emergency|紧急情况;emotion|情绪;employ|雇佣;encourage|鼓励;enormous|巨大的;entire|整个;environment|环境;establish|建立;event|事件;examine|检查;exist|存在;expert|专家;express|表达;extraordinary|非凡;feature|特点;fierce|凶猛;figure|人物;focus|集中;foreign|外国;forgive|原谅;freedom|自由;frighten|吓唬;function|功能;gather|聚集;general|一般;gentle|温柔;giant|巨人;gradually|逐渐;habit|习惯;handle|处理;harm|伤害;harmful|有害;honor|荣誉;human|人类;humor|幽默;identify|识别;immediate|立即;improve|改善;include|包括;increase|增加;indeed|确实;independent|独立;individual|个人;industry|行业;influence|影响;information|信息;injure|受伤;innocent|无辜;insist|坚持;instead|代替;intelligence|智力;intention|意图;interrupt|打断;introduce|介绍;investigate|调查;involve|涉及;judge|判断;knowledge|知识;leader|领导;legal|合法;limit|限制;local|当地;lonely|孤独;loyal|忠诚;major|主要;manage|管理;marriage|婚姻;measure|测量;mention|提到;method|方法;movement|运动;nervous|紧张;obey|服从;obvious|明显;occasion|场合;offer|提供;opinion|观点;opportunity|机会;organize|组织;otherwise|否则;owner|主人;particular|特别;perform|表演;permission|许可;physical|身体;pleasure|快乐;position|位置;practice|练习;prevent|阻止;process|过程;produce|生产;progress|进步;prove|证明;provide|提供;quality|质量;quietly|安静地;receive|收到;recent|最近;recommend|推荐;record|记录;reduce|减少;regular|定期;relationship|关系;release|释放;remove|移除;repair|修理;repeat|重复;replace|替换;report|报告;represent|代表;require|需要;respect|尊重;responsible|负责;reveal|揭示;ridiculous|荒谬;role|角色;rule|规则;scene|场景;search|搜索;serve|服务;service|服务;several|几个;similar|相似;solution|解决方案;spirit|精神;struggle|挣扎;suddenly|突然;suggest|建议;suspect|怀疑;symbol|象征;system|系统;talent|天赋;therefore|因此;threat|威胁;throughout|贯穿;tradition|传统;trouble|麻烦;typical|典型;unfair|不公平;unfortunately|不幸;unique|独特;unless|除非;unusual|不寻常;useful|有用;valuable|有价值;various|各种;victory|胜利;violence|暴力;violent|暴力;weapon|武器;whether|是否;within|在……之内;worth|值得;worthy|值得;accurate|准确;advantage|优势;atmosphere|气氛;attention|注意;attitude|态度;attractive|有吸引力;careless|粗心;challenge|挑战;characteristic|特点;comfortable|舒服;complicated|复杂;consequence|后果;conversation|谈话;creative|有创造力;creature|生物;curiosity|好奇心;dangerous|危险;decision|决定;disappointed|失望;discovery|发现;disguise|伪装;embarrassed|尴尬;encouragement|鼓励;entertain|娱乐;entertainment|娱乐;equipment|设备;especially|尤其;eventually|最终;excellent|优秀;excitement|兴奋;familiar|熟悉;fantastic|极好的;fearful|害怕;foolish|愚蠢;fortunate|幸运;fortunately|幸运地;frightened|受惊的;generous|慷慨;gentleman|绅士;grateful|感激;imagination|想象力;impressive|令人印象深刻;incredible|难以置信;intelligent|聪明;jealous|嫉妒;jealousy|嫉妒;magical|有魔力;meaningful|有意义;meaningless|无意义;misunderstand|误解;necessary|必要;nevertheless|然而;ordinary|普通;peaceful|和平;personality|个性;powerful|强大;precious|珍贵;previous|之前;proud|自豪;realistic|现实;reliable|可靠;responsibility|责任;scientific|科学;scientist|科学家;seriously|认真地;successful|成功;surprising|令人惊讶;terrified|恐惧;terrifying|可怕;uncomfortable|不舒服;unbelievable|难以置信;unfriendly|不友好;unimportant|不重要;unnecessary|不必要;unpleasant|不愉快;wonderful|精彩;worried|担心`;
for(const entry of extraWords.split(';')){const [word,meaning]=entry.split('|');if(word&&meaning)dict[word]=meaning;}
function spoken(c){const s=c.text.replace(/<[^>]+>/g,'').replace(/\[[^\]]+\]/g,'').replace(/\s+/g,' ').replace(/^[\s\-]+/,'').trim();
 return s.length>=6&&s.length<=150&&s.split(/\s+/).length>=2&&!/copyright|captioning|subtitl/i.test(s)?s:null;}
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
 assert(lines.length>=5,'Not enough spoken dialogue for 5 questions');
 const sceneSet=new Set(lines),out=all.filter(c=>c.end<start-160||c.start>cues.at(-1).end+160).map(spoken).filter(Boolean);
 const optionsFor=(correct,seed)=>{const list=[];for(let i=0;i<out.length&&list.length<3;i++){const s=out[(i*37+seed*17)%out.length];
 if(s!==correct&&!list.includes(s)&&!sceneSet.has(s))list.push(s);}assert(list.length===3,'Not enough outside dialogue choices');return list;};
 const prompts=['Which line is heard near the start of this episode?','Which statement appears in the story at this point?','Which sentence does a character say in this episode?','Which line is heard later in this episode?','Which line is heard near the end of this episode?'];
 const questions=prompts.map((question,i)=>{const correct=lines[Math.floor((lines.length-1)*[.12,.35,.54,.76,.90][i])],options=[correct,...optionsFor(correct,id*5+i)].map((text,index)=>({text,correct:index===0}));
 const shift=(id+i)%4;options.push(...options.splice(0,shift));
 return {id:'q'+(i+1),type:'single-choice',category:'comprehension',question,options:options.map((x,index)=>({key:'ABCD'[index],text:x.text})),answer:'ABCD'[options.findIndex(x=>x.correct)],explanation:'正确答案可从本集原生英文字幕中核对，其余对白来自影片其他片段。',source:'Native CC evidence: automated dialogue comprehension'};});
 return {episodeId:id,title:'Episode '+id+' · Quiz',questions};
}

function readStatus(){try{const s=read(STATUS);if(s?.films)return s;}catch{}return {version:3,films:{}};}
function completed(movie,source,dir){
 if(!movie.studyCourse?.seriesId||!exists(path.join(dir,'episodes.json')))return false;
 try{const e=read(path.join(dir,'episodes.json')),v=read(path.join(dir,'vocabulary.json')),q=read(path.join(dir,'quiz.json'));
 return e.length>0&&e.every(x=>x.video?.originalHlsUrl===source&&/native/i.test(x.subtitleTracks?.status||'')&&x.modules?.words&&x.modules?.quiz&&v[x.episodeId]?.length===5&&q[x.episodeId]?.questions?.length===5);
 }catch{return false;}
}
async function build(item){
 const {row,movie,group,source}=item,master=await load(source);
 assert(master.includes('#EXT-X-STREAM-INF:'),'Master has no video');
 const englishOptions=trackCandidates(master,'en');if(!englishOptions.length)throw Error('NO_ENGLISH_TRACK');
 const chinese=track(master,'zh');
 const lines=master.split(/\r?\n/).map(s=>s.trim()),variants=[];
 for(let i=0;i<lines.length;i++)if(lines[i].startsWith('#EXT-X-STREAM-INF:')){let j=i+1;while(j<lines.length&&!lines[j])j++;if(lines[j]&&!lines[j].startsWith('#'))variants.push({...attributes(lines[i]),url:new URL(lines[j],source).href});}
 assert(variants.length,'No video variants');
 const choice=variants.find(x=>x.RESOLUTION==='1280x720')||variants.find(x=>x.RESOLUTION==='1920x1080')||variants[0];
 const audioTracks=lines.filter(x=>x.startsWith('#EXT-X-MEDIA:TYPE=AUDIO')).map(attributes);
 const [vText,ZH]=await Promise.all([load(choice.url),chinese?sourceSub(chinese,source).catch(e=>{console.warn('V3_OPTIONAL_ZH_FAILED '+row.id+' '+e.message);return null;}):Promise.resolve(null)]);
 const video=parseMedia(vText,choice.url);
 assert(video.total>1800&&video.total<16000,'Unexpected movie length');
 let english=null,EN=null,lastEnglishError=null;
 for(const candidate of englishOptions){try{const parsed=await sourceSub(candidate,source);if(parsed.cues.length>120){english=candidate;EN=parsed;break;}}catch(e){lastEnglishError=e;}}
 if(!EN)throw Error('NO_VALID_ENGLISH_TRACK '+(lastEnglishError?.message||'all candidate tracks were empty'));
 let audioUrl=null,sound=null;
 const audioCandidates=audioTracks.filter(x=>!choice.AUDIO||x['GROUP-ID']===choice.AUDIO).sort((a,b)=>Number(b.DEFAULT==='YES')-Number(a.DEFAULT==='YES'));
 for(const candidate of audioCandidates){if(!candidate.URI)continue;const url=new URL(candidate.URI,source).href;try{const parsed=parseMedia(await load(url),url);if(Math.abs(video.total-parsed.total)<12){audioUrl=url;sound=parsed;break;}}catch(e){console.warn('V3_AUDIO_TRACK_SKIP '+row.id+' '+e.message);}}
 if(choice.AUDIO&&!sound)throw Error('Movie audio does not match video; no aligned audio track in selected audio group');
 const en=EN.cues,zh=ZH?.cues||[];
 assert(en[0].start<video.total*.15&&en.at(-1).end>video.total*.65&&en.at(-1).end<video.total+120,'Native English timeline differs from video');
 const relevant=en.filter(x=>!/captioned by|captioning made possible|copyright|www\./i.test(x.text));
 const last=Math.min(video.total,Math.max(relevant.at(-1).end+9,video.total*.75));
 const seriesId=movie.studyCourse?.seriesId||'movie-'+row.id,dir=path.join(DATA,seriesId);
 const previous=exists(path.join(dir,'episodes.json'))?read(path.join(dir,'episodes.json')):[];
 const layout=boundaries(en,last,previous,source),oldV=exists(path.join(dir,'vocabulary.json'))?read(path.join(dir,'vocabulary.json')):{};
 const oldQ=exists(path.join(dir,'quiz.json'))?read(path.join(dir,'quiz.json')):{};
 const output=new Map(),stage=(rel,text)=>output.set(path.join(dir,rel),text),stageJson=(rel,obj)=>stage(rel,JSON.stringify(obj,null,2)+'\n');
 const episodes=[],vocabulary={},quiz={};
 for(let i=0;i<layout.points.length-1;i++){
 const episodeId=i+1,id=String(episodeId).padStart(3,'0'),start=layout.points[i],end=layout.points[i+1],old=(layout.preserve||layout.migrated)?previous[i]:null;
 const vr=video.rows.filter(r=>r.end>start+1e-6&&r.start<end-1e-6),origin=vr[0]?.start;
 assert(vr.length,'No video segments in episode '+id);
 const ar=sound?.rows.filter(r=>r.end>origin+1e-6&&r.start<vr.at(-1).end-1e-6)||[];
 if(sound)assert(ar.length,'No audio segments in episode '+id);
 const captions=clip(en,start,end);
 assert(captions.length>=(layout.migrated?1:5),'Insufficient English captions in '+id);
 const keepPrevious=layout.preserve||layout.migrated;
 const previousWords=keepPrevious&&oldV[episodeId]?.length>=5?oldV[episodeId].slice(0,5):null;
 const previousQuiz=keepPrevious&&oldQ[episodeId]?.questions?.length===5&&oldQ[episodeId].questions.every(q=>q.options?.length>=3)?oldQ[episodeId]:null;
 vocabulary[episodeId]=previousWords||words(captions,episodeId,origin,seriesId,zh);
 quiz[episodeId]=previousQuiz||fiveQuestions(captions,en,episodeId,start);
 const titleZh=old?.titleZh||('第'+String(episodeId).padStart(2,'0')+'集 · 剧情场景');
 const titleEn=old?.titleEn||old?.title||spoken(captions.find(x=>spoken(x))||captions[0])?.slice(0,55)||'Story Scene '+episodeId;
 const enPath='/data/'+seriesId+'/subtitles/'+id+'.en.vtt',zhPath='/data/'+seriesId+'/subtitles/'+id+'.en-zh.vtt';
 stage('subtitles/'+id+'.en.vtt',writeVtt(captions,origin,[]));
 if(zh.length)stage('subtitles/'+id+'.en-zh.vtt',writeVtt(captions,origin,zh));
 stage('hls/'+id+'.video.m3u8',playlist(vr,start-origin));
 if(sound)stage('hls/'+id+'.audio.m3u8',playlist(ar,start-ar[0].start));
 const masterOut=['#EXTM3U','#EXT-X-VERSION:3'];
 if(sound)masterOut.push('#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="English",LANGUAGE="eng",DEFAULT=YES,AUTOSELECT=YES,URI="'+id+'.audio.m3u8"');
 masterOut.push('#EXT-X-STREAM-INF:BANDWIDTH='+Number(choice.BANDWIDTH||1800000)+(choice.RESOLUTION?',RESOLUTION='+choice.RESOLUTION:'')+(choice.CODECS?',CODECS="'+choice.CODECS+'"':'')+(sound?',AUDIO="aud"':''),id+'.video.m3u8','');
 stage('hls/'+id+'.m3u8',masterOut.join('\n'));
 episodes.push({episodeId,title:titleZh,titleZh,titleEn,
 summaryEn:old?.summaryEn||'Source-dialogue scene from '+row.title+'.',summaryZh:old?.summaryZh||'按电影原声对白中的自然停顿划分，保留字幕与本段剧情。',
 status:'published',sourceType:'hls',
 video:{source:'hls',hlsUrl:'/data/'+seriesId+'/hls/'+id+'.m3u8',subtitleUrl:enPath,originalHlsUrl:source,originalStart:round(start),originalEnd:round(end),timelineOrigin:round(origin),clipStart:round(start-origin),clipEnd:round(end-origin),duration:round(end-start)},
 subtitleTracks:{english:enPath,englishChinese:zh.length?zhPath:null,status:'native-v3'+(zh.length?'-bilingual':'-english')},
 modules:{watch:true,read:false,words:true,vocabulary:true,quiz:true}});
 }
 const oldSeries=exists(path.join(dir,'series.json'))?read(path.join(dir,'series.json')):{};
 stageJson('series.json',{...oldSeries,seriesId,seriesTitle:row.title,seriesTitleZh:(row.titleZh||row.title)+' · 剧情分集学习',level:oldSeries.level||3,language:'en',status:'completed',totalEpisodes:episodes.length,movieId:row.id,quizStatus:'ready',generation:'v3-native-source',coverImage:oldSeries.coverImage||movie.cover||null,description:'视频、英文CC和可选中文均取自同一M3U8；保留音效说明。'});
 stageJson('episodes.json',episodes);stageJson('vocabulary.json',vocabulary);stageJson('quiz.json',quiz);
 stageJson('v3-source.json',{movieId:row.id,tmdbId:row.tmdbId,source,englishUrl:EN.url,englishTrack:english.NAME,chineseUrl:ZH?.url||null,chineseTrack:ZH?chinese.NAME:null,videoUrl:choice.url,audioUrl,videoDuration:video.total,englishCues:en.length,chineseCues:zh.length,chapterCount:episodes.length,retainedOldChapters:layout.preserve,createdAt:NOW});
 assert(episodes.every(e=>vocabulary[e.episodeId].length===5&&quiz[e.episodeId].questions.length===5),'Invalid Words/Quiz batch');
 // Nothing is written until the complete film has passed source, timeline and chapter checks.
 for(const [file,content] of output)save(file,content);
 const moviePath=path.join(DATA,'movies',group,'movies.json'),movieData=read(moviePath),entry=movieData.sources.find(x=>x.id===row.id);
 assert(entry,'Movie vanished from published catalog');
 entry.studyCourse={seriesId,episodeCount:episodes.length};entry.tmdbId=row.tmdbId;saveJSON(moviePath,movieData);
 const config=path.join(ROOT,'netlify.toml'),rule='/data/'+seriesId+'/hls/*',current=fs.readFileSync(config,'utf8');
 if(!current.includes('for = "'+rule+'"'))save(config,current+'\n[[headers]]\n  for = "'+rule+'"\n  [headers.values]\n    Content-Type = "application/vnd.apple.mpegurl"\n');
 console.log('V3_FILM_DONE '+JSON.stringify({movie:row.id,seriesId,chapters:episodes.length,englishCues:en.length,chineseCues:zh.length,retainedChapterCuts:layout.preserve}));
 return {seriesId,chapters:episodes.length,source,englishCues:en.length,chineseCues:zh.length};
}
async function main(){
 assert(Array.isArray(CATALOG.films)&&CATALOG.films.length,'Missing movie-hub catalog');
 const movies=new Map();
 for(const group of fs.readdirSync(path.join(DATA,'movies'))){
 const p=path.join(DATA,'movies',group,'movies.json');if(!exists(p))continue;
 for(const movie of read(p).sources||[])movies.set(movie.id,{movie,group});}
 const state=readStatus();state.version=3;state.updatedAt=NOW;state.totalCatalog=CATALOG.films.length;
 const pending=[];
 for(const row of CATALOG.films){
 const found=movies.get(row.id);if(!found?.movie?.hlsUrl)continue;
 const id=Number(row.tmdbId);if(!Number.isSafeInteger(id)||id<=0){state.films[row.id]={state:'invalid_tmdb_id',at:NOW};continue;}
 const source=BASE+id+'/master.m3u8',seriesId=found.movie.studyCourse?.seriesId||'movie-'+row.id;
 if(completed(found.movie,source,path.join(DATA,seriesId))){state.films[row.id]={state:'completed',at:NOW,seriesId,source};continue;}
 const retry=Date.parse(state.films[row.id]?.retryAfter||'');
 if(!ONLY&&process.env.V3_RETRY_FAILED!=='1'&&retry>Date.now())continue;
 pending.push({...found,row,source,hasCourse:Boolean(found.movie.studyCourse)});}
 pending.sort((a,b)=>Number(b.hasCourse)-Number(a.hasCourse));
 const list=ONLY?pending.filter(x=>x.row.id===ONLY):pending.slice(0,LIMIT);
 if(ONLY&&!list.length)throw Error('Selected movie not pending or not published: '+ONLY);
 if(!list.length){console.log('V3_IDLE no eligible movies for this cycle');return;}
 const results=[];
 for(const item of list){try{
 const result=await build(item);state.films[item.row.id]={state:'completed',at:NOW,...result};results.push({id:item.row.id,state:'completed',chapters:result.chapters});}
 catch(e){const msg=String(e.message||e).slice(0,230),kind=/NO_ENGLISH_TRACK|NO_VALID_ENGLISH_TRACK/.test(msg)?'no_english':/HTTP 404/.test(msg)?'source_not_found':'source_error';
 state.films[item.row.id]={state:kind,error:msg,at:NOW,retryAfter:new Date(Date.now()+(kind==='source_error'?24:168)*3600000).toISOString()};
 console.warn('V3_FILM_SKIP '+JSON.stringify({id:item.row.id,state:kind,error:msg}));results.push({id:item.row.id,state:kind,error:msg});}}
 state.lastBatch=results;state.pendingEstimate=Math.max(0,pending.length-list.length);saveJSON(STATUS,state);
 const counts={};for(const item of Object.values(state.films))counts[item.state]=(counts[item.state]||0)+1;
 const summary={time:NOW,total:CATALOG.films.length,processed:results.length,pending:state.pendingEstimate,counts,results};
 console.log('V3_BATCH_SUMMARY '+JSON.stringify(summary));
 if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,'## yqxyy V3 movies\n\nCatalog: '+CATALOG.films.length+'\n\nProcessed: '+results.length+'\n\nPending: '+state.pendingEstimate+'\n\n'+results.map(x=>'- '+x.id+': '+x.state+(x.chapters?' / '+x.chapters+' episodes':'')+'\n').join(''));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
