#!/usr/bin/env node
/* Import timing from Little Fox caption XML when both text and cue boundaries verify.
 * Use --lesson=three-kingdoms:13 or --manifest=subtitle-review/new-lessons.json;
 * --apply writes only verified VTT, --skip-unavailable keeps batch sync nonblocking.
 */
const fs=require('node:fs/promises'),path=require('node:path');
const root=path.resolve(__dirname,'..'),args=process.argv.slice(2),apply=args.includes('--apply'),skip=args.includes('--skip-unavailable');
const norm=s=>String(s||'').toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'');
const unescape=s=>String(s).replace(/&(?:amp|lt|gt|quot|apos|nbsp|#\d+|#x[0-9a-f]+);/gi,m=>{
 const k=m.toLowerCase(),known={'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&apos;':"'",'&nbsp;':' '};
 if(known[k])return known[k];
 const value=k.startsWith('&#x')?parseInt(k.slice(3,-1),16):parseInt(k.slice(2,-1),10);
 return Number.isInteger(value)&&value>0&&value<=0x10ffff?String.fromCodePoint(value):m;
});
const clean=s=>unescape(String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<[^>]*>/g,' ')).replace(/\s+/g,' ').trim();
const attrs=s=>Object.fromEntries([...s.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(m=>[m[1].toLowerCase().replace(/[-_]/g,''),m[2]??m[3]]));
const millis=(s,msNumbers)=>{s=String(s).replace(',','.');if(/^\d+(?:\.\d+)?$/.test(s))return Math.round(Number(s)*(msNumbers?1:1000));const p=s.split(':').map(Number);if((p.length!==2&&p.length!==3)||p.some(x=>!Number.isFinite(x)))return NaN;return Math.round((p.length===2?p[0]*60+p[1]:p[0]*3600+p[1]*60+p[2])*1000);};
function xmlCues(xml){
 if(xml.length>2500000||!xml.trim().startsWith('<')||/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('Invalid XML');
 const raw=[];
 for(const m of xml.matchAll(/<([A-Za-z][\w:-]*)([^<>]*)>/g)){
  if(m[0].endsWith('/>'))continue;
  const a=attrs(m[2]),start=a.begin??a.start??a.startms??a.starttime??a.stime,end=a.end??a.stop??a.endms??a.endtime??a.etime,dur=a.dur??a.duration;
  if(start==null||(end==null&&dur==null))continue;
  const close=xml.indexOf('</'+m[1]+'>',m.index+m[0].length);
  if(close<0)continue;
  const text=clean(xml.slice(m.index+m[0].length,close));
  if(text&&text.length<=800)raw.push({start,end,dur,text});
 }
 if(!raw.length)for(const m of xml.matchAll(/<(caption|item|subtitle|line|entry|p)\b[^>]*>([\s\S]*?)<\/\1>/gi)){
  const body=m[2];if(body.length>1500)continue;
  const take=names=>{for(const n of names){const v=body.match(new RegExp('<'+n+'(?:\\s[^>]*)?>([^<]+)</'+n+'>','i'));if(v)return clean(v[1]);}return null;};
  const start=take(['begin','start','start_ms','start_time']),end=take(['end','stop','end_ms','end_time']),text=take(['text','sentence','captiontext','caption_str']);
  if(start&&end&&text)raw.push({start,end,text});
 }
 if(raw.length<3||raw.length>1500)throw Error('Unrecognized official caption structure');
 const values=raw.flatMap(c=>[c.start,c.end,c.dur].filter(x=>x!=null));
 const msNumbers=values.some(s=>/^\d+$/.test(s)&&Number(s)>2000);
 const cues=raw.map(c=>{const startMs=millis(c.start,msNumbers);return {startMs,endMs:c.end!=null?millis(c.end,msNumbers):startMs+millis(c.dur,msNumbers),text:c.text};});
 if(cues.some((c,i)=>!Number.isFinite(c.startMs)||!Number.isFinite(c.endMs)||c.startMs<0||c.endMs<=c.startMs||c.endMs>7200000||(i&&c.startMs<cues[i-1].startMs)))throw Error('Invalid XML cue times');
 return cues;
}
function parseVtt(s){
 const cues=[];for(const b of s.replace(/\r/g,'').split(/\n\n+/)){
  const l=b.trim().split('\n'),i=l.findIndex(x=>x.includes('-->'));if(i<0)continue;
  const m=l[i].match(/(\d\d):(\d\d):(\d\d)\.(\d{3})\s*-->\s*(\d\d):(\d\d):(\d\d)\.(\d{3})/);
  if(!m)throw Error('Invalid VTT');
  const toMs=(a,b,c,d)=>((+a*60+ +b)*60+ +c)*1000+ +d;
  cues.push({startMs:toMs(...m.slice(1,5)),endMs:toMs(...m.slice(5,9)),text:l.slice(i+1).join(' ').trim()});
 }return cues;
}
function align(local,remote){
 if(local.length<3||norm(local.map(c=>c.text).join(''))!==norm(remote.map(c=>c.text).join('')))throw Error('Subtitle text differs; manual review required');
 let pos=0;const spans=remote.map(c=>{const begin=pos;pos+=norm(c.text).length;return {...c,begin,end:pos};});
 pos=0;const result=local.map(c=>{
  const n=norm(c.text).length,first=spans.find(x=>x.begin<=pos&&x.end>pos),last=spans.find(x=>x.begin<pos+n&&x.end>=pos+n);
  if(!first||!last)throw Error('Caption boundary mapping failed');pos+=n;
  return {...c,startMs:first.startMs,endMs:last.endMs};
 });
 if(result.some((c,i)=>c.endMs<=c.startMs||(i&&c.startMs<result[i-1].endMs-250)))throw Error('Incompatible cue segmentation');
 return result;
}
const stamp=n=>[Math.floor(n/3600000),Math.floor(n%3600000/60000),Math.floor(n%60000/1000)].map(x=>String(x).padStart(2,'0')).join(':')+'.'+String(n%1000).padStart(3,'0');
const toVtt=arr=>'WEBVTT\n\n'+arr.map((c,i)=>(i+1)+'\n'+stamp(c.startMs)+' --> '+stamp(c.endMs)+'\n'+c.text+'\n').join('\n');
async function main(){
 const tasks=new Map();
 for(const s of args.filter(x=>x.startsWith('--lesson='))){const [seriesId,id]=s.slice(9).split(':');if(!/^[a-z0-9-]+$/.test(seriesId)||!(/^[1-9]\d*$/.test(id)))throw Error('Invalid selector');tasks.set(seriesId+':'+id,{seriesId,episodeId:Number(id)});}
 for(const s of args.filter(x=>x.startsWith('--manifest='))){
  const doc=JSON.parse(await fs.readFile(path.resolve(s.slice(11)),'utf8'));
  for(const r of doc.lessons||[]){if(!/^[a-z0-9-]+$/.test(r.seriesId)||!Number.isInteger(r.episodeId)||r.episodeId<1)throw Error('Invalid manifest');tasks.set(r.seriesId+':'+r.episodeId,r);}
 }
 if(!tasks.size)throw Error('Expected --lesson or --manifest');
 for(const item of tasks.values())try{
  const dir=path.join(root,'data',item.seriesId),episodes=JSON.parse(await fs.readFile(path.join(dir,'episodes.json'),'utf8'));
  const contentId=episodes.find(x=>x.episodeId===item.episodeId)?.sourceContentId;
  if(!/^C\d{7}$/.test(contentId||''))throw Error('No verified episode content ID');
  const file=path.join(dir,'subtitles',String(item.episodeId).padStart(3,'0')+'.vtt'),before=await fs.readFile(file,'utf8');
  const calibrated=file.replace(/\.vtt$/,'.timing.json');
  if(await fs.access(calibrated).then(()=>true,()=>false)){
   console.log(JSON.stringify({lesson:item.seriesId+':'+item.episodeId,status:'skipped-previously-calibrated'}));
   continue;
  }
  const url='https://cdn.littlefox.co.kr/contents/caption/'+contentId+'.xml';
  const resp=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!resp.ok)throw Error('Caption source HTTP '+resp.status);
  const remote=xmlCues(await resp.text()),after=toVtt(align(parseVtt(before),remote));
  if(apply&&after!==before)await fs.writeFile(file,after);
  console.log(JSON.stringify({lesson:item.seriesId+':'+item.episodeId,contentId,cues:remote.length,updated:after!==before&&apply}));
 }catch(e){console.error(JSON.stringify({lesson:item.seriesId+':'+item.episodeId,status:'needs-review',reason:e.message}));if(!skip)process.exitCode=1;}
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={xmlCues,parseVtt,align,toVtt};
