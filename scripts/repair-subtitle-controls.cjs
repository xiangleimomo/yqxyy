/* Remove XET's non-speech caption-clear instructions, preserving speech times. */
const fs=require('node:fs'),path=require('node:path');
function repairText(raw){
 const blocks=raw.replace(/\r/g,'').trimEnd().split(/\n{2,}/);let removed=0;
 const kept=blocks.filter(b=>{const lines=b.split('\n'),i=lines.findIndex(x=>x.includes('-->'));if(i<0)return true;const text=lines.slice(i+1).join(' ').trim();if(/^\[caption_out@(?:\])?$/i.test(text)){removed++;return false;}return true;});
 let n=0;const text=removed?kept.map(b=>{const lines=b.split('\n'),i=lines.findIndex(x=>x.includes('-->'));return i<0?b:[String(++n),...lines.slice(i)].join('\n');}).join('\n\n')+'\n':raw;
 return {text,removed};
}
function main(){
 const apply=process.argv.includes('--apply');if(process.argv.slice(2).some(x=>!['--apply','--dry-run'].includes(x)))throw Error('Unknown option');let files=0,removed=0,changed=[];
 for(const entry of fs.readdirSync('data',{withFileTypes:true}).filter(x=>x.isDirectory())){const dir=path.join('data',entry.name,'subtitles');if(!fs.existsSync(dir))continue;for(const name of fs.readdirSync(dir).filter(x=>x.endsWith('.vtt'))){const file=path.join(dir,name),raw=fs.readFileSync(file,'utf8'),result=repairText(raw);files++;if(result.removed){if(apply)fs.writeFileSync(file,result.text);removed+=result.removed;changed.push({file,removed:result.removed});}}}
 console.log(JSON.stringify({mode:apply?'apply':'dry-run',scannedFiles:files,removedCues:removed,changed},null,2));
}
if(require.main===module)main();module.exports={repairText};
