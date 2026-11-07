'use strict';
const assert=require('node:assert/strict');
const {validatePlan,validateCueInput}=require('../scripts/v2-story-analysis.cjs');
const cues=[
 {start:0,end:2,text:'A family arrives at the station.'},
 {start:2.2,end:4,text:'They discover the train is leaving.'},
 {start:8,end:10,text:'A new character offers help.'},
 {start:10.2,end:12,text:'The group decides to follow.'}
];
const plan={
 logline:'A family begins an unexpected journey.',
 storyArc:'Arrival, obstacle, and a new plan.',
 episodes:[
  {titleEn:'A Sudden Departure',titleZh:'车站里的突发状况',summaryZh:'一家人抵达车站，却发现列车即将开走。',startCueId:1,endCueId:2,boundaryReason:'The immediate station problem is established and the group must change its plan.',storyPurpose:'Introduce the characters and the first obstacle.'},
  {titleEn:'An Offer of Help',titleZh:'新的帮助与决定',summaryZh:'一位新人物主动提出帮助，一家人决定跟随对方。',startCueId:3,endCueId:4,boundaryReason:'A new character changes the available choices and initiates the next story unit.',storyPurpose:'Move the story from the initial obstacle into a new plan.'}
 ]
};
const result=validatePlan(plan,cues,20);
assert.equal(result.episodes.length,2);
assert.equal(result.episodes[0].start,0);
assert.equal(result.episodes[0].end,8);
assert.equal(result.episodes[1].start,8);
assert.equal(result.episodes[1].end,20);
assert.equal(result.episodes[0].startCue,cues[0].text);
assert.throws(()=>validatePlan({...plan,episodes:[plan.episodes[0],{...plan.episodes[1],startCueId:4}]},cues,20),/cover cues exactly once/);
assert.throws(()=>validateCueInput([{start:1,end:0,text:'bad'},cues[1]],20),/timeline is invalid/);
console.log('V2 story boundary validator tests passed');
