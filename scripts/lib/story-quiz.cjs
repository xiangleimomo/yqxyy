/* Reviewed story questions, bound to the exact episode and its public Read. */
const fs = require('node:fs');
const path = require('node:path');
const bankDir=path.join(__dirname,'../quiz-revisions');
const banks=fs.readdirSync(bankDir).filter(name=>/^[0-9]{4}-[0-9]{2}-[0-9]{2}[.]json$/.test(name)).sort().reverse().map(name=>JSON.parse(fs.readFileSync(path.join(bankDir,name),'utf8')));

function reviewedStoryQuiz(seriesId, episode, reading) {
  const bank=banks.find(value=>value.lessons.some(row=>row.seriesId===seriesId&&row.episodeId===Number(episode.episodeId)));
  const lesson = bank?.lessons.find(row => row.seriesId === seriesId && row.episodeId === Number(episode.episodeId));
  if (!lesson) return null;
  if (lesson.sourceContentId !== episode.sourceContentId || reading?.sourceId !== lesson.sourceContentId) {
    throw Error(`Quiz/Read source mismatch: ${seriesId}/${episode.episodeId}`);
  }
  if (lesson.questions.length !== 5) throw Error('A reviewed story quiz must contain five questions');
  const questions = lesson.questions.map((q, i) => {
    const evidence = q.evidence.paragraphIds.map(id => {
      const paragraph = reading.paragraphs.find(p => p.id === id);
      if (!paragraph) throw Error(`Missing evidence paragraph ${id}`);
      return paragraph.text;
    }).join(' ');
    if (!evidence.includes(q.evidence.quote)) throw Error(`Evidence changed: ${seriesId}/${episode.episodeId}/q${i + 1}`);
    if (q.options.length !== 3 || new Set(q.options).size !== 3 || !/^[ABC]$/.test(q.answer)) throw Error('Invalid story quiz options');
    if (/____|complete the sentence/i.test(q.question)) throw Error('Use story comprehension questions, not automatic cloze');
    return {
      id: `q${i + 1}`, type: 'single-choice', category: q.category,
      question: q.question,
      options: q.options.map((text, index) => ({key: 'ABC'[index], text})),
      answer: q.answer, explanation: q.explanation,
      source: 'editorial-public-read', evidence: q.evidence
    };
  });
  return {episodeId: episode.episodeId, title: `${episode.title} Quiz`, styleReference: 'journey-to-the-west', revision: bank.date, questions};
}

function selectStoryQuiz(seriesId, episode, reading, previous) {
  const reviewed = reviewedStoryQuiz(seriesId, episode, reading);
  if (reviewed) return reviewed;
  // Preserve official/editorial questions. Do not republish the old frequency-
  // based cloze generator as a story quiz when no reviewed questions exist yet.
  if (previous?.questions?.length && previous.questions.every(q => q.source !== 'generated-from-public-read')) return previous;
  return null;
}
module.exports = {reviewedStoryQuiz, selectStoryQuiz};
