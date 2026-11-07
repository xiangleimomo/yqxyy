'use strict';
// This checks chapter naming, not the factual quality of a lesson's contents.
function namedEpisode(episode){
 const title=String(episode?.title||'').trim();
 if(!title)return false;
 if(/^(?:第\s*\d+\s*[集章节段]\s*[·:：.\-]?\s*)?(?:剧情场景|剧情片段|场景|片段|未命名)$/u.test(title))return false;
 if(/^(?:episode|chapter|scene|part)\s*\d+(?:\s*[-·:]\s*(?:story\s+)?scene)?$/i.test(title))return false;
 if(/^第\s*\d+\s*[集章节段]$/u.test(title))return false;
 return true;
}
function namedCourse(episodes){return Array.isArray(episodes)&&episodes.length>0&&episodes.every(namedEpisode);}
module.exports={namedEpisode,namedCourse};
