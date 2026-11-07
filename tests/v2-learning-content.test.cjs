'use strict';
const assert=require('node:assert/strict');
const {validateLearningContent,buildEpisodeVtt,formatVttTime}=require('../scripts/v2-learning-content.cjs');
const cues=[
 {start:0,end:2,text:'I trust you, my friend.'},
 {start:2,end:4,text:'We must leave before sunrise.'},
 {start:4,end:6,text:'The map is hidden under the table.'},
 {start:6,end:8,text:'She decides to help the group.'},
 {start:8,end:10,text:'They finally reach the old bridge.'}
];
const episode={episodeId:1,startCueId:1,endCueId:5,start:0,end:10,titleEn:'A New Journey',titleZh:'新的旅程',summaryZh:'他们决定离开并寻找地图。'};
const content={
 words:[
  {surfaceForm:'trust',lemma:'trust',partOfSpeech:'verb',meaningZh:'信任',explanationEn:'to believe someone is honest',exampleCueId:1,exampleEn:'I trust you',exampleZh:'我信任你'},
  {surfaceForm:'leave',lemma:'leave',partOfSpeech:'verb',meaningZh:'离开',explanationEn:'to go away',exampleCueId:2,exampleEn:'We must leave',exampleZh:'我们必须离开'},
  {surfaceForm:'sunrise',lemma:'sunrise',partOfSpeech:'noun',meaningZh:'日出',explanationEn:'the time when the sun appears',exampleCueId:2,exampleEn:'before sunrise',exampleZh:'日出之前'},
  {surfaceForm:'hidden',lemma:'hide',partOfSpeech:'verb',meaningZh:'藏起来',explanationEn:'kept out of sight',exampleCueId:3,exampleEn:'The map is hidden',exampleZh:'地图被藏了起来'},
  {surfaceForm:'decides',lemma:'decide',partOfSpeech:'verb',meaningZh:'决定',explanationEn:'to make a choice',exampleCueId:4,exampleEn:'She decides to help',exampleZh:'她决定帮忙'}
 ],
 quiz:[
  {type:'story',questionEn:'What problem makes the group leave?',questionZh:'什么原因促使大家离开？',options:[{key:'A',text:'They must leave before sunrise.'},{key:'B',text:'They lost their food.'},{key:'C',text:'The bridge is closed.'},{key:'D',text:'They missed a letter.'}],answerKey:'A',explanationZh:'第二条字幕说明他们必须在日出前离开。',evidenceCueIds:[2]},
  {type:'detail',questionEn:'Where is the map?',questionZh:'地图在哪里？',options:[{key:'A',text:'Under the table.'},{key:'B',text:'On the bridge.'},{key:'C',text:'In a bag.'},{key:'D',text:'By the river.'}],answerKey:'A',explanationZh:'字幕直接说明地图藏在桌子下面。',evidenceCueIds:[3]},
  {type:'cause_effect',questionEn:'What does “trust” mean here?',questionZh:'这里的 trust 是什么意思？',options:[{key:'A',text:'To believe someone.'},{key:'B',text:'To leave quickly.'},{key:'C',text:'To hide something.'},{key:'D',text:'To arrive somewhere.'}],answerKey:'A',explanationZh:'trust 表示信任某人。',evidenceCueIds:[1]},
  {type:'inference',questionEn:'Why might the group need to act quickly?',questionZh:'为什么大家可能需要尽快行动？',options:[{key:'A',text:'They have a time limit before sunrise.'},{key:'B',text:'They have already crossed the bridge.'},{key:'C',text:'The map has disappeared.'},{key:'D',text:'No one wants to help.'}],answerKey:'A',explanationZh:'他们必须在日出前离开，说明时间有限。',evidenceCueIds:[2]},
  {type:'story',questionEn:'What does the group do after finding the map?',questionZh:'找到地图相关线索后，人物做了什么？',options:[{key:'A',text:'They decide to help the group.'},{key:'B',text:'They return home.'},{key:'C',text:'They destroy the bridge.'},{key:'D',text:'They wait until night.'}],answerKey:'A',explanationZh:'第四条字幕说明她决定帮助大家。',evidenceCueIds:[4]}
 ]
};
assert.equal(validateLearningContent(content,episode,cues),content);
const translations={1:'我信任你，我的朋友。',2:'我们必须在日出前离开。',3:'地图藏在桌子下面。',4:'她决定帮助大家。',5:'他们终于到达了古老的桥。'};
const vtt=buildEpisodeVtt({cues,episode,translations,timelineOrigin:0,bilingual:true});
assert.match(vtt,/00:00:00\.000 --> 00:00:02\.000/);
assert.match(vtt,/我信任你，我的朋友。/);
assert.equal(formatVttTime(61.25),'00:01:01.250');
assert.throws(()=>validateLearningContent({...content,quiz:content.quiz.slice(0,4)},episode,cues),/exactly five/);
assert.throws(()=>buildEpisodeVtt({cues,episode,translations:{},timelineOrigin:0,bilingual:true}),/Missing Chinese translation/);
console.log('V2 learning content tests passed');
