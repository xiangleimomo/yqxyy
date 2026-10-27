const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {clean,norm,stamp,vtt}=require('../scripts/import-recent-xet-vtt.cjs');
assert.equal(clean('"Just [i@walk@i], okay?"'),'"Just walk, okay?"');
assert.equal(clean('[b@Hello@b][n@world'),'Hello world');
assert.equal(stamp(62123),'00:01:02.123');
assert(vtt([{startMs:47,endMs:1234,text:'Hello.'}]).includes('00:00:00.047 --> 00:00:01.234'));
const context={window:{},document:{},localStorage:{getItem:()=>null}};
vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/app.js'),'utf8').replace('App.start();','globalThis.app=App;'),context);
const report=JSON.parse(fs.readFileSync(path.join(__dirname,'../docs/little-fox-subtitle-audit-2026-10-27.json')));
assert.equal(report.lessons.length,11);let count=0;
for(const row of report.lessons){
 const dir=path.join(__dirname,'../data',row.seriesId),ep=JSON.parse(fs.readFileSync(path.join(dir,'episodes.json'))).find(e=>e.episodeId===row.episodeId);
 assert.equal(ep.sourceContentId,row.sourceContentId);assert.equal(ep.title,row.title);
 const raw=fs.readFileSync(path.join(dir,'subtitles',String(row.episodeId).padStart(3,'0')+'.vtt'),'utf8');
 assert(raw.startsWith('WEBVTT\n'));assert(!/\[(?:i|b|u|n)@|@(?:i|b|u)\]/.test(raw));
 const cues=context.app.parseVtt(raw);assert.equal(cues.length,row.cueCount);
 for(const [i,c]of cues.entries()){assert(c.endMs>c.startMs&&c.startMs>=0);if(i)assert(c.startMs>=cues[i-1].endMs);}
 assert.equal(cues[0].startMs,row.firstMs);assert.equal(cues.at(-1).endMs,row.lastMs);assert(cues.at(-1).endMs<=row.videoDurationMs);
 const read=JSON.parse(fs.readFileSync(path.join(dir,'reading-lessons.json')))[String(row.episodeId)];
 assert.equal(norm(cues.map(c=>c.text).join(' ')),norm(read.paragraphs.map(p=>p.text||p).join(' ')),row.seriesId+'/'+row.episodeId+' Read text');
 assert(row.readMatchesOfficial&&row.subtitleMatchesOfficial&&row.timelineMatchesRemote);assert(row.maxBoundaryDriftMs<=42);count+=cues.length;
}
console.log('PASS: '+report.lessons.length+' episodes / '+count+' cues, exact IDs, public Read wording, millisecond timestamps, no overlaps/overruns and matched HLS timelines');
