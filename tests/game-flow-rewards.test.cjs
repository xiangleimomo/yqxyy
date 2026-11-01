const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8');
const elements=new Map();
const appContext=vm.createContext({document:{getElementById(id){if(!elements.has(id))elements.set(id,{value:'',focus(){},select(){}});return elements.get(id)}}});
vm.runInContext(read('js/app.js').replace(/App\.start\(\);\s*$/,'globalThis.app=App;'),appContext);
const app=appContext.app;let earned=0;
app.addPoints=n=>earned+=n;app.recordTypingCorrect=()=>{};
app.wordPractice={words:[{word:'apple'}],index:0,checked:false,seriesId:'test',episodeId:1};
appContext.document.getElementById('practiceInput').value='wrong';app.checkWordPractice();assert.equal(earned,0);
elements.get('practiceInput').value='apple';app.checkWordPractice();assert.equal(earned,5);
app.checkWordPractice();assert.equal(earned,5);assert.match(elements.get('practiceFeedback').innerHTML,/\+5/);
let next,finished=0,launched=0;const screens=[];
const c=vm.createContext({words:['apple','bridge','cloud','dragon'].map(en=>({en,zh:'词'})),ArcadeRules:{normalize:x=>x},Arcade:{start:()=>({pool:[]})},games:[['G07','Game']],performance:{now:()=>0},clearTimeout(){},cancelAnimationFrame(){},esc:s=>s,
 document:{createElement:()=>({}),querySelector:()=>({after(){}})},on:(el,event,fn)=>{next=fn},stopRound(){},
 beginRound(){c.round={done:false,start:0,jobs:[],frame:0}},play(){launched++;c.round={done:false,start:0,jobs:[],frame:0}},finish(){finished++},shell:(id,title,content)=>screens.push(content)});
vm.runInContext(read('arcade/campaign.js'),c);c.play('G07');
let steps=0;
while(c.ArcadeCampaign.current()&&steps++<20){if(!c.round.done)c.finish('G07',10,'win');else {const callback=next;next=null;assert.ok(callback);callback();}}
assert.equal(finished,1);assert.equal(launched,3);assert.ok(!screens.some(s=>/campaign-review|词汇核验/.test(s)));
console.log('PASS: wrong answers earn zero; correct words earn five exactly once; all three game levels finish without a word quiz.');
