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
