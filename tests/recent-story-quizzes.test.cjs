const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {reviewedStoryQuiz, selectStoryQuiz} = require('../scripts/lib/story-quiz.cjs');
const bank = require('../scripts/quiz-revisions/2026-10-23.json');
const root = path.resolve(__dirname, '..');
const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const affected = new Map();
for (const lesson of bank.lessons) {
  const dir = `data/${lesson.seriesId}`;
  const episode = read(`${dir}/episodes.json`).find(row => row.episodeId === lesson.episodeId);
  const reading = read(`${dir}/reading-lessons.json`)[lesson.episodeId];
  const quiz = read(`${dir}/quiz.json`)[lesson.episodeId];
  assert.deepEqual(quiz, reviewedStoryQuiz(lesson.seriesId, episode, reading));
  assert.equal(quiz.questions.length, 5);
  assert(new Set(quiz.questions.map(q => q.category)).size >= 3, 'Cover different aspects of the story');
  for (const q of quiz.questions) {
    assert(q.question.endsWith('?'));
    assert(!/____|complete the sentence/i.test(q.question));
    assert.equal(q.options.filter(o => o.key === q.answer).length, 1);
    assert(q.explanation.length > 15);
  }
  assert.throws(() => reviewedStoryQuiz(lesson.seriesId, {...episode, sourceContentId: 'wrong-episode'}, reading), /source mismatch/);
  const edited = structuredClone(reading);
  for (const p of edited.paragraphs) p.text = 'Different story';
  assert.throws(() => reviewedStoryQuiz(lesson.seriesId, episode, edited), /Evidence changed/);
  if (!affected.has(dir)) affected.set(dir, new Set());
  affected.get(dir).add(String(lesson.episodeId));
}
// Preserve unrelated lessons; separately reviewed exact-ID migrations have their own provenance checks.
const rebindings = require('../docs/content-binding-repairs-2026-10-28.json').changes;
for (const [dir, ids] of affected) {
  const file = `${dir}/quiz.json`;
  const before = JSON.parse(execFileSync('git', ['show', `8dac086:${file}`], {cwd: root, encoding: 'utf8'}));
  const after = read(file);
  for (const [id, lesson] of Object.entries(before)) if (!ids.has(id) && !rebindings.some(r => `data/${r.seriesId}` === dir && String(r.episodeId) === id)) assert.deepEqual(after[id], lesson);
}
const official = read('data/journey-to-the-west/quiz.json')['1'];
const episode = {episodeId: 999, sourceContentId: 'future-release'};
assert.equal(selectStoryQuiz('unknown', episode, {}, official), official, 'Preserve official questions');
assert.equal(selectStoryQuiz('unknown', episode, {}, {questions:[{source:'generated-from-public-read'}]}), null, 'Reject old generated cloze');
assert.equal(selectStoryQuiz('unknown', episode, {}, undefined), null, 'Mark unreviewed releases pending');
console.log('PASS: 10 episodes / 50 story questions, source binding, original Read evidence, preserved unrelated/official quizzes and no cloze fallback');

// Exercise the actual enrichment entry point with a mocked public Read response.
const os = require('node:os');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'story-quiz-test-'));
try {
  const seriesId = 'three-kingdoms';
  const sourceDir = `data/${seriesId}`;
  const dir = path.join(temp, sourceDir);
  fs.mkdirSync(dir, {recursive: true});
  const original = read(`${sourceDir}/episodes.json`).find(row => row.episodeId === 11);
  const future = {...original, episodeId: 999, sourceContentId: 'future-release'};
  const reading = read(`${sourceDir}/reading-lessons.json`)['11'];
  const put = (name, value) => fs.writeFileSync(path.join(dir, name + '.json'), JSON.stringify(value));
  put('episodes', [original, future]); put('reading-lessons', {}); put('vocabulary', {});
  put('quiz', {'999': {questions:[{source:'generated-from-public-read'}]}});
  const escape = value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = '<div class="original_cont_box">' + reading.paragraphs.map(p => "<div class='talk'><span>" + escape(p.text) + '</span></div>').join('') + '<div class="original_cont_box2">';
  const mock = path.join(temp, 'mock-read.mjs');
  fs.writeFileSync(mock, `globalThis.fetch = async () => new Response(${JSON.stringify(html)});`);
  const output = execFileSync(process.execPath, ['--import', require('node:url').pathToFileURL(mock).href, path.join(root, 'scripts/enrich-new-lessons.mjs'), seriesId, '11', '999'], {cwd: temp, encoding: 'utf8'});
  const report = JSON.parse(output);
  assert.deepEqual(report.failed, []);
  assert.deepEqual(report.pendingQuiz, [999]);
  const quizzes = JSON.parse(fs.readFileSync(path.join(dir, 'quiz.json'), 'utf8'));
  assert.equal(quizzes['11'].questions[0].source, 'editorial-public-read');
  assert.equal(quizzes['999'], undefined);
  const episodes = JSON.parse(fs.readFileSync(path.join(dir, 'episodes.json'), 'utf8'));
  assert.equal(episodes[0].modules.quiz, true);
  assert.equal(episodes[1].modules.quiz, false);
  assert.equal(episodes[1].modules.read, true);
  console.log('PASS: actual enrichment preserves reviewed questions and imports Read while reporting future Quiz as pending');
} finally {
  const resolved = path.resolve(temp);
  assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
  assert(path.basename(resolved).startsWith('story-quiz-test-'));
  fs.rmSync(resolved, {recursive: true, force: true});
}
