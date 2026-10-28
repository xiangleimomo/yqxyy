const {spawnSync}=require('node:child_process'),path=require('node:path');
const lessons=(process.env.REVIEW_LESSONS||'').trim();let args;
if(lessons){const parts=lessons.split(',').map(x=>x.trim());if(parts.length>100||parts.some(x=>!/^[a-z0-9-]+:[1-9][0-9]*$/.test(x)))throw Error('Invalid lesson selector');args=parts.map(x=>'--lesson='+x);}
else args=['--manifest=scripts/subtitle-review/'+(process.env.REVIEW_MANIFEST==='bindings'?'2026-10-28-content-bindings.json':'2026-10-28-targets.json')];
const result=spawnSync(process.execPath,[path.join(__dirname,'import-recent-xet-vtt.cjs'),...args],{stdio:'inherit'});if(result.error)throw result.error;process.exitCode=result.status||0;
