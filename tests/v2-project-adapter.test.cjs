'use strict';
const assert=require('node:assert/strict');
const adapter=require('../scripts/v2-project-adapter.cjs');
const episode={episodeId:1,titleEn:'A New Journey',titleZh:'新的旅程',summaryEn:'A family begins a journey.',summaryZh:'一家人开始旅程。',start:0,end:300,durationSeconds:300};
const content={
 words:[{lemma:'trust',surfaceForm:'trust',meaningZh:'信任',partOfSpeech:'verb',explanationEn:'to believe someone',exampleEn:'I trust you.',exampleZh:'我信任你。',exampleCueId:1}],
 quiz:[{questionEn:'Why do they leave?',questionZh:'他们为什么离开？',options:[{key:'A',text:'It is late.'},{key:'B',text:'It is early.'},{key:'C',text:'They are lost.'},{key:'D',text:'They are hungry.'}],answerKey:'A',explanationZh:'字幕说明天色已晚。',evidenceCueIds:[1],type:'cause_effect'}]
};
const vocab=adapter.toProjectVocabulary(content);
assert.equal(vocab[0].word,'trust');
assert.equal(vocab[0].source,'v2-cue-verified');
const quiz=adapter.toProjectQuiz(content,episode);
assert.equal(quiz.questions[0].category,'comprehension');
assert.equal(quiz.questions[0].type,'single-choice');
assert.equal(quiz.questions[0].answer,'A');
const series=adapter.toProjectSeries({seriesId:'movie-example',title:'Example Movie',episodes:[episode]});
const projected={...episode,video:{hlsUrl:'/data/movie-example/hls/001.m3u8',subtitleUrl:'/data/movie-example/subtitles/001.en.vtt'},subtitleTracks:{englishChinese:'/data/movie-example/subtitles/001.en-zh.vtt'}};
assert.throws(()=>adapter.validateProjectBundle({series,episodes:[projected],vocabulary:{'1':vocab},quiz:{'1':quiz}}),/vocabulary set/);
const fiveWords=Array.from({length:5},(_,i)=>({...vocab[0],word:'word'+i}));
const fiveQuestions=Array.from({length:5},(_,i)=>({...quiz.questions[0],id:'q'+(i+1)}));
assert.equal(adapter.validateProjectBundle({series,episodes:[projected],vocabulary:{'1':fiveWords},quiz:{'1':{questions:fiveQuestions}}}),true);
console.log('V2 project schema adapter tests passed');
