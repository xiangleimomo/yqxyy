/* Read-only guards against ordinal remapping and stale caption/media versions. */
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {parse}=require('./repair-repeated-subtitle-cues.cjs');
const digest=s=>crypto.createHash('sha256').update(s).digest('hex');
const errors=[];let checked=0,timings=0,recovered=0,vttFiles=0,cueCount=0;
for(const entry of fs.readdirSync('data',{withFileTypes:true}).filter(x=>x.isDirectory())){
  const dir=path.join('data',entry.name);let episodes,reads;
  try{episodes=JSON.parse(fs.readFileSync(path.join(dir,'episodes.json')));reads=JSON.parse(fs.readFileSync(path.join(dir,'reading-lessons.json')));}catch{continue;}
  if(!Array.isArray(episodes))continue;
  for(const ep of episodes){
    const reading=reads[ep.episodeId],label=`${entry.name}/${ep.episodeId}`;
    if(ep.sourceContentId&&reading?.sourceId){checked++;if(ep.sourceContentId!==reading.sourceId)errors.push(label+': Read content ID differs from video episode');}
    const file=path.join(dir,'subtitles',String(ep.episodeId).padStart(3,'0')+'.vtt');
    if(fs.existsSync(file)){
      const cues=parse(fs.readFileSync(file,'utf8'));vttFiles++;cueCount+=cues.length;
      if(!cues.length)errors.push(label+': Empty VTT');
      for(let i=0;i<cues.length;i++){
        const c=cues[i];
        if(!Number.isFinite(c.startMs)||!Number.isFinite(c.endMs)||c.startMs<0||c.endMs<=c.startMs||i&&c.startMs<cues[i-1].endMs)errors.push(label+': Invalid/overlapping VTT cue '+(i+1));
      }
    }
    for(const type of ['timing','source-repair']){
      const meta=file.replace(/\.vtt$/,'.'+type+'.json');if(!fs.existsSync(meta))continue;
      if(type==='timing')timings++;else recovered++;
      try{
        const m=JSON.parse(fs.readFileSync(meta)),raw=fs.readFileSync(file,'utf8').replace(/\r/g,''),cues=parse(raw);
        if(m.sourceContentId!==ep.sourceContentId)throw Error('Caption source content ID mismatch');
        if(m.mediaFingerprint!==digest(new URL(ep.video.hlsUrl).pathname))throw Error('Media version changed after caption verification');
        if(m.vttSha256!==digest(raw))throw Error('VTT changed without updating verification evidence');
        if(type==='source-repair'){
          const normalize=s=>String(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu,'');
          const text=(reading?.paragraphs||[]).map(p=>typeof p==='string'?p:p.text||'').join(' ');
          if(normalize(cues.map(c=>c.text).join(' '))!==normalize(text))throw Error('Recovered subtitle wording differs from its verified Read');
        }
        if(cues.length!==(m.afterCueCount??m.cueCount))throw Error('Verified cue count mismatch');
        if(type==='timing'&&(cues[0].startMs!==m.afterFirstMs||cues.at(-1).endMs!==m.afterLastMs))throw Error('Aligned cue boundaries mismatch');
        for(let i=0;i<cues.length;i++){
          const c=cues[i];if(c.startMs<0||c.endMs<=c.startMs||c.endMs>m.durationMs||i&&c.startMs<cues[i-1].endMs)throw Error('Overlapping or out-of-range cue');
        }
      }catch(error){errors.push(label+': '+error.message);}
    }
  }
}
if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}
else console.log(`PASS: ${checked} source-bound Reads; ${vttFiles} VTTs / ${cueCount} structurally valid cues; ${timings} speech-aligned VTTs and ${recovered} source-text recoveries with verified media fingerprints`);
