'use strict';

function padEpisode(value){return String(value).padStart(3,'0');}
function localPath(courseId,folder,name){return '/data/'+courseId+'/'+folder+'/'+name;}
function toProjectVocabulary(content){
  return content.words.map(word=>({
    word:word.lemma,
    surfaceForm:word.surfaceForm,
    meaningZh:word.meaningZh,
    partOfSpeech:word.partOfSpeech,
    definitionEn:word.explanationEn,
    example:word.exampleEn,
    exampleZh:word.exampleZh,
    exampleCueId:word.exampleCueId,
    source:'v2-cue-verified'
  }));
}
function toProjectQuiz(content,episode){
  return {
    episodeId:episode.episodeId,
    title:episode.titleEn+' · Quiz',
    questions:content.quiz.map((question,index)=>({
      id:'q'+(index+1),
      type:'single-choice',
      category:'comprehension',
      question:question.questionEn,
      questionZh:question.questionZh,
      options:question.options.map(option=>({key:option.key,text:option.text})),
      answer:question.answerKey,
      explanation:question.explanationZh,
      evidenceCueIds:question.evidenceCueIds,
      source:'v2-story-evidence'
    }))
  };
}
function toProjectEpisode(episode,{courseId,source,videoSelection,subtitleTracks,bilingualAvailable=true}={}){
  const number=padEpisode(episode.episodeId);
  const englishPath=localPath(courseId,'subtitles',number+'.en.vtt');
  const bilingualPath=bilingualAvailable?localPath(courseId,'subtitles',number+'.en-zh.vtt'):null;
  const hlsPath=localPath(courseId,'hls',number+'.m3u8');
  const dynamic=source?.requiresDynamicPlayback===true;
  const video={
    source:'hls',
    hlsUrl:dynamic?source.dynamicHlsUrl||null:hlsPath,
    subtitleUrl:englishPath,
    originalHlsUrl:dynamic?null:source?.sourceUrl||null,
    originalStart:episode.start,
    originalEnd:episode.end,
    timelineOrigin:videoSelection.timelineOrigin,
    clipStart:videoSelection.clipStart,
    clipEnd:videoSelection.clipEnd,
    duration:episode.durationSeconds
  };
  if(dynamic)video.sourceDescriptor=source.sourceDescriptor;
  return {
    episodeId:episode.episodeId,
    title:episode.titleZh,
    titleZh:episode.titleZh,
    titleEn:episode.titleEn,
    summaryEn:episode.summaryEn,
    summaryZh:episode.summaryZh,
    status:'draft',
    sourceType:'hls',
    video,
    subtitleTracks:{
      english:englishPath,
      englishChinese:bilingualPath,
      status:bilingualAvailable?'v2-verified-bilingual':'v2-english-only'
    },
    modules:{watch:!!video.hlsUrl,read:false,words:true,vocabulary:true,quiz:true}
  };
}
function toProjectSeries({seriesId,title,titleZh,level=5,movieId=null,coverImage='',episodes=[]}){
  return {
    seriesId,
    seriesTitle:title,
    seriesTitleZh:(titleZh||title)+' · 剧情分集学习',
    level,
    language:'en',
    status:'draft',
    totalEpisodes:episodes.length,
    description:'V2 quality-first story-based English learning course.',
    ...(coverImage?{coverImage}:{}),
    ...(movieId?{movieId}:{}),
    quizStatus:'draft',
    generation:'v2-quality-first'
  };
}
function buildVocabularyFile(rows){
  const output={};
  for(const row of rows)output[String(row.episodeId)]=toProjectVocabulary(row.content);
  return output;
}
function buildQuizFile(rows){
  const output={};
  for(const row of rows)output[String(row.episodeId)]=toProjectQuiz(row.content,row.episode);
  return output;
}
function validateProjectBundle({series,episodes,vocabulary,quiz}){
  if(!series||!Array.isArray(episodes)||!episodes.length)throw new Error('Project bundle is incomplete');
  if(series.totalEpisodes!==episodes.length)throw new Error('Series totalEpisodes does not match episode rows');
  for(let i=0;i<episodes.length;i++){
    const episode=episodes[i],id=String(i+1);
    if(episode.episodeId!==i+1)throw new Error('Project episode IDs must be continuous and one-based');
    if(!episode.video?.hlsUrl||!episode.video?.subtitleUrl)throw new Error('Episode '+id+' is missing its HLS or English subtitle URL');
    if(!episode.subtitleTracks?.englishChinese)throw new Error('Episode '+id+' is missing the bilingual subtitle track');
    if(!Array.isArray(vocabulary[id])||vocabulary[id].length<5)throw new Error('Episode '+id+' is missing its vocabulary set');
    if(!Array.isArray(quiz[id]?.questions)||quiz[id].questions.length!==5)throw new Error('Episode '+id+' is missing its five comprehension questions');
    if(quiz[id].questions.some(question=>question.category!=='comprehension'||question.type!=='single-choice'))throw new Error('Quiz schema is incompatible at episode '+id);
  }
  return true;
}
module.exports={padEpisode,localPath,toProjectVocabulary,toProjectQuiz,toProjectEpisode,toProjectSeries,buildVocabularyFile,buildQuizFile,validateProjectBundle};
