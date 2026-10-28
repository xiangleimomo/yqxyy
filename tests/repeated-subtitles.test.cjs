const assert=require('node:assert/strict'),{repair}=require('../scripts/repair-repeated-subtitle-cues.cjs');
const a={startMs:100,endMs:500,text:'Hello, Eddy!'},b={startMs:501,endMs:900,text:'Hello, Eddy!'};
assert.deepEqual(repair([a,b],'Hello, Eddy!'),[{...a,endMs:900}]);
assert.equal(repair([a,b],'Hello, Eddy! Hello, Eddy!'),null,'Preserve genuine repeated dialogue in Read');
assert.equal(repair([a,b],'A different story.'),null,'Fail closed on Read mismatch');
assert.equal(repair([a,{...b,startMs:900,endMs:1200}],'Hello, Eddy!'),null,'Do not bridge a separate utterance');
assert.equal(a.endMs,500,'Do not mutate original cue evidence');
console.log('PASS: merge highlight duplicates only with exact Read agreement; preserve real repetition, timing bounds and unrelated text');
