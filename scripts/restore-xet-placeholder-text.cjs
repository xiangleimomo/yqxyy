/* Restore canonical English only when existing caption boundaries independently
 * establish the same XET cue timebase. This does not claim speech verification. */
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const {parse, vtt} = require('./repair-repeated-subtitle-cues.cjs');
const digest = s => crypto.createHash('sha256').update(s).digest('hex');
const norm = s => String(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
function placeholder(cues) { return cues.filter(c => /^[a-z0-9]$/i.test(c.text.trim())).length / Math.max(1,cues.length) > .8; }
function recover(before, source, duration) {
  if (!placeholder(before)) throw Error('Published captions are no longer placeholders');
  if (placeholder(source)) throw Error('XET also contains placeholders; independent speech alignment required');
  const candidates = new Map();
  for (const a of before) for (const b of source) {
    const delta = a.startMs-b.startMs;
    if (Math.abs((a.endMs-b.endMs)-delta)<=1) candidates.set(delta,(candidates.get(delta)||0)+1);
  }
  let best;
  for (const [offset,count] of [...candidates].sort((a,b)=>b[1]-a[1]).slice(0,10)) {
    let previous=-1, matched=0;
    for (const a of before) {
      const i=source.findIndex((b,i)=>i>previous&&Math.abs(a.startMs-b.startMs-offset)<=1&&Math.abs(a.endMs-b.endMs-offset)<=1);
      if(i>=0){previous=i;matched++;}
    }
    if(!best||matched>best.matched)best={offset,matched,support:matched/Math.max(before.length,source.length)};
  }
  if(!best||best.matched<5||best.support<.75||Math.abs(best.offset)>60000)throw Error('Existing/source cue boundaries do not establish a stable offset');
  const cues=source.map(c=>({...c,startMs:c.startMs+best.offset,endMs:c.endMs+best.offset}));
  if(cues.some((c,i)=>c.startMs<0||c.endMs>duration||c.endMs<=c.startMs||i&&c.startMs<cues[i-1].endMs))throw Error('Restored cue boundaries require independent speech review');
  return {cues,offsetMs:best.offset,matchedCueBoundaries:best.matched,boundarySupport:best.support};
}
function main(){
  const args=process.argv.slice(2),folder=args.find(a=>a.startsWith('--review-root='))?.slice(14),apply=args.includes('--apply');
  if(!folder)throw Error('Usage: --review-root=folder [--apply]');
  const report=JSON.parse(fs.readFileSync(path.join(folder,'review.json'))),restored=[],pending=[...(report.failures||[])];
  for(const row of report.lessons)try{
    const dir=path.join('data',row.seriesId),ep=JSON.parse(fs.readFileSync(path.join(dir,'episodes.json'))).find(e=>e.episodeId===row.episodeId);
    if(ep.sourceContentId!==row.sourceContentId||!row.sameVideoPath||!row.timelineMatchesRemote)throw Error('Source/media identity mismatch');
    const target=path.join(dir,'subtitles',String(row.episodeId).padStart(3,'0')+'.vtt'),raw=fs.readFileSync(target,'utf8').replace(/\r/g,'');
    const source=parse(fs.readFileSync(path.join(folder,'data',row.seriesId,'subtitles',path.basename(target)),'utf8'));
    const read=JSON.parse(fs.readFileSync(path.join(dir,'reading-lessons.json')))[row.episodeId];
    if(norm(read.paragraphs.map(p=>typeof p==='string'?p:p.text||'').join(' '))!==norm(row.officialParagraphs.join(' ')))throw Error('Read differs from verified official text');
    if(norm(source.map(c=>c.text).join(' '))!==norm(row.officialParagraphs.join(' ')))throw Error('XET wording differs from official Read');
    const {cues,...evidence}=recover(parse(raw),source,row.videoDurationMs),output=vtt(cues);
    const info={seriesId:row.seriesId,episodeId:row.episodeId,sourceContentId:row.sourceContentId,method:'canonical-XET-English+preserved-existing-cue-timebase',...evidence,mediaFingerprint:digest(new URL(ep.video.hlsUrl).pathname),durationMs:row.videoDurationMs,beforeSha256:digest(raw),vttSha256:digest(output),cueCount:cues.length};
    if(apply){fs.writeFileSync(target,output);fs.writeFileSync(target.replace(/\.vtt$/,'.source-repair.json'),JSON.stringify(info,null,2)+'\n');}
    restored.push(info);
  }catch(error){pending.push({seriesId:row.seriesId,episodeId:row.episodeId,error:error.message});}
  const result={method:'Exact canonical wording with independently matching old/new cue boundaries; preserves the existing offset, not a full audio audit.',restored,pending};
  if(apply)fs.writeFileSync('docs/placeholder-text-repairs-2026-10-28.json',JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({apply,restored:restored.length,pending:pending.length,samplePending:pending.slice(0,5)}));
}
if(require.main===module)main();
module.exports={recover,placeholder};
