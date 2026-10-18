'use strict';
const zlib=require('node:zlib');
function time(s){const p=s.replace(',','.').split(':').map(Number);return p[0]*3600+p[1]*60+p[2];}
function parseSrt(text){
  return String(text).replace(/^\uFEFF/,'').replace(/\r/g,'').split(/\n\s*\n/).flatMap(block=>{
    const lines=block.trim().split('\n'),i=lines.findIndex(l=>/^\d{2}:\d{2}:\d{2}[,.]\d{3}\s*-->/.test(l));
    if(i<0)return [];
    const match=lines[i].match(/(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/);
    if(!match)return [];
    const start=time(match[1]),end=time(match[2]);
    const caption=lines.slice(i+1).join('\n').replace(/<[^>]*>/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    return end>start&&caption?[{start,end,text:caption}]:[];
  });
}
function extractSrt(zip){
  if(zip.length>2*1024*1024)throw new Error('Subtitle archive too large');
  // Read central directory sizes, also supporting ZIP data descriptors.
  let eocd=-1;
  for(let i=zip.length-22;i>=Math.max(0,zip.length-65557);i--)if(zip.readUInt32LE(i)===0x06054b50){eocd=i;break;}
  if(eocd<0)throw new Error('Invalid subtitle archive');
  let cursor=zip.readUInt32LE(eocd+16),count=zip.readUInt16LE(eocd+10);
  for(let n=0;n<count;n++){
    if(cursor+46>zip.length||zip.readUInt32LE(cursor)!==0x02014b50)throw new Error('Invalid ZIP directory');
    const flags=zip.readUInt16LE(cursor+8),method=zip.readUInt16LE(cursor+10),size=zip.readUInt32LE(cursor+20),uncompressed=zip.readUInt32LE(cursor+24),nameLength=zip.readUInt16LE(cursor+28),extra=zip.readUInt16LE(cursor+30),comment=zip.readUInt16LE(cursor+32),offset=zip.readUInt32LE(cursor+42);
    const name=zip.subarray(cursor+46,cursor+46+nameLength).toString('utf8');cursor+=46+nameLength+extra+comment;
    if(!/\.srt$/i.test(name))continue;
    if(flags&1||uncompressed>2*1024*1024||offset+30>zip.length||zip.readUInt32LE(offset)!==0x04034b50)throw new Error('Unsupported subtitle ZIP entry');
    const dataStart=offset+30+zip.readUInt16LE(offset+26)+zip.readUInt16LE(offset+28);
    if(dataStart+size>zip.length)throw new Error('Truncated subtitle archive');
    const bytes=zip.subarray(dataStart,dataStart+size);
    const out=method===0?bytes:method===8?zlib.inflateRawSync(bytes,{maxOutputLength:2*1024*1024}):null;
    if(!out||out.length!==uncompressed)throw new Error('Invalid subtitle size');
    return out.toString('utf8');
  }
  throw new Error('No SRT in subtitle archive');
}
function stamp(seconds){const ms=Math.max(0,Math.round(seconds*1000));return `${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms/60000)%60).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')}.${String(ms%1000).padStart(3,'0')}`;}
function episodeVtt(cues,chapter,offset=.3,scale=1){
  const selected=cues.filter(c=>!/subtitles downloaded from|best watched using open subtitles|www\.opensubtitles\.org/i.test(c.text)).map(c=>({...c,start:c.start*scale+offset-chapter.start,end:c.end*scale+offset-chapter.start})).filter(c=>c.end>0&&c.start<chapter.end-chapter.start);
  return 'WEBVTT\n\n'+selected.map((c,i)=>`${i+1}\n${stamp(c.start)} --> ${stamp(Math.min(c.end,chapter.end-chapter.start))}\n${c.text}\n`).join('\n');
}
module.exports={parseSrt,extractSrt,episodeVtt,stamp};
