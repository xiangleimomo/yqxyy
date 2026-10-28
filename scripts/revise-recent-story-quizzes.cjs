#!/usr/bin/env node
/* Repeatable, scoped repair: only replace the reviewed Quiz entries. */
const fs = require('node:fs');
const path = require('node:path');
const {reviewedStoryQuiz} = require('./lib/story-quiz.cjs');
const root = path.resolve(__dirname, '..');
const dateArg=process.argv.find(a=>a.startsWith('--bank='))?.slice(7)||'2026-10-23';
if(!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(dateArg))throw Error('Invalid reviewed bank date');
const bank = require('./quiz-revisions/'+dateArg+'.json');
const args = process.argv.slice(2);
if (args.some(arg => !['--apply', '--dry-run'].includes(arg)&&!arg.startsWith('--bank='))) throw Error('Usage: node scripts/revise-recent-story-quizzes.cjs [--dry-run|--apply]');
const apply = args.includes('--apply');
const updates = new Map();
// Validate every lesson before writing any file.
for (const lesson of bank.lessons) {
  const dir = path.join(root, 'data', lesson.seriesId);
  const read = name => JSON.parse(fs.readFileSync(path.join(dir, name + '.json'), 'utf8'));
  const episode = read('episodes').find(row => row.episodeId === lesson.episodeId);
  if (!episode) throw Error('Episode not found: ' + lesson.seriesId);
  const quiz = reviewedStoryQuiz(lesson.seriesId, episode, read('reading-lessons')[lesson.episodeId]);
  if (!updates.has(dir)) updates.set(dir, read('quiz'));
  updates.get(dir)[lesson.episodeId] = quiz;
  console.log(`${apply ? 'Apply' : 'Preview'}: ${lesson.seriesId}/${lesson.episodeId} · ${quiz.questions.length} story questions`);
}
if (apply) for (const [dir, quizzes] of updates) {fs.writeFileSync(path.join(dir, 'quiz.json'), JSON.stringify(quizzes, null, 2) + '\n');const eps=JSON.parse(fs.readFileSync(path.join(dir,'episodes.json'),'utf8'));for(const e of eps)if(bank.lessons.some(l=>path.basename(dir)===l.seriesId&&e.episodeId===l.episodeId))e.modules.quiz=true;fs.writeFileSync(path.join(dir,'episodes.json'),JSON.stringify(eps,null,2)+'\n');}
