const assert=require('node:assert/strict'),{recover}=require('../scripts/restore-xet-placeholder-text.cjs');
const source=Array.from({length:10},(_,i)=>({startMs:i*1000,endMs:i*1000+100+i,text:'Actual sentence '+i+'.'}));
const before=source.map((c,i)=>({...c,startMs:c.startMs+12345,endMs:c.endMs+12345,text:String.fromCharCode(97+i)}));
const result=recover(before,source,30000);assert.equal(result.offsetMs,12345);assert.equal(result.boundarySupport,1);assert.deepEqual(result.cues.map(c=>[c.startMs,c.endMs]),before.map(c=>[c.startMs,c.endMs]));assert.deepEqual(result.cues.map(c=>c.text),source.map(c=>c.text));
assert.throws(()=>recover(before,before,30000),/XET also/);
assert.throws(()=>recover(before,source.map((c,i)=>({...c,endMs:c.endMs+100*i})),30000),/stable offset/);
assert.throws(()=>recover(before,source,10000),/boundaries/);
console.log('PASS: restore exact English only with stable pre-existing boundaries; reject source placeholders, unstable offsets and overruns');
