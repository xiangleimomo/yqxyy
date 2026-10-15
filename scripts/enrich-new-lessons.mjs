#!/usr/bin/env node

/*
 * Adds a public Little Fox Read lesson and deterministic practice material to
 * newly discovered XET episodes. No video is downloaded.
 * Usage: node scripts/enrich-new-lessons.mjs <series-directory> <episode-id> [...]
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const [directory, ...requestedIds] = process.argv.slice(2);
if (!directory || !requestedIds.length) throw new Error('Usage: enrich-new-lessons.mjs <series-directory> <episode-id> [...]');
const root = path.resolve('data', directory);
const ids = new Set(requestedIds.map(Number));
const stopWords = new Set('about after again also and are been but can come could did does from have into just like more not now out over said some that the their then there they this was were what when which will with would your you for our all one two who its her his she him them has had were are is a an of to in on at by as it or if than'.split(' '));

const decode = value => String(value || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/\s+/g, ' ').trim();
const sentences = text => text.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map(item => item.trim()).filter(Boolean) || [];
const wordsFor = text => {
  const all = (text.match(/[A-Za-z][A-Za-z'-]{2,}/g) || []).map(word => word.toLowerCase()).filter(word => !stopWords.has(word));
  const ranked = [...new Map(all.map(word => [word, all.filter(item => item === word).length])).entries()].sort((a, b) => b[1] - a[1]).map(([word]) => word).slice(0, 10);
  return ranked.map(word => ({ word, meaningZh: '请结合本集 Read 上下文理解', example: sentences(text).find(sentence => new RegExp(`\\b${word}\\b`, 'i').test(sentence)) || '', source: 'generated-from-public-read' }));
};
const quizFor = (episode, text, words) => {
  const questions = [];
  for (const [index, word] of words.slice(0, 3).entries()) {
    const sentence = sentences(text).find(value => new RegExp(`\\b${word.word}\\b`, 'i').test(value));
    const distractors = words.filter(item => item.word !== word.word).slice(0, 2).map(item => item.word);
    if (!sentence || distractors.length < 2) continue;
    questions.push({ id: `q${index + 1}`, type: 'single-choice', category: 'vocabulary', question: `Complete the sentence: ${sentence.replace(new RegExp(`\\b${word.word}\\b`, 'i'), '_____')}`, options: [{ key: 'A', text: word.word }, { key: 'B', text: distractors[0] }, { key: 'C', text: distractors[1] }], answer: 'A', explanation: `The word “${word.word}” appears in the Read lesson.`, source: 'generated-from-public-read' });
  }
  return questions.length ? { episodeId: episode.episodeId, title: `${episode.title} Quiz`, questions } : null;
};
async function officialRead(contentId) {
  const response = await fetch(`https://www.littlefox.com/hk/supplement/org/${encodeURIComponent(contentId)}`, { signal: AbortSignal.timeout(45000) });
  if (!response.ok) throw new Error(`Read page returned ${response.status}`);
  const html = await response.text();
  const box = html.match(/<div class="original_cont_box">([\s\S]*?)<div class="original_cont_box2"/i)?.[1] || '';
  const paragraphs = [...box.matchAll(/<div class='talk'><span>([\s\S]*?)<\/span><\/div>/gi)].map(match => decode(match[1])).filter(Boolean);
  if (!paragraphs.length) throw new Error('No public Read paragraphs found');
  return paragraphs;
}
const readJson = async name => JSON.parse(await fs.readFile(path.join(root, name), 'utf8'));
const writeJson = (name, value) => fs.writeFile(path.join(root, name), `${JSON.stringify(value, null, 2)}\n`);
const episodes = await readJson('episodes.json');
const readings = await readJson('reading-lessons.json');
const vocabulary = await readJson('vocabulary.json');
const quizzes = await readJson('quiz.json');
const report = { importedRead: [], failed: [] };
for (const episode of episodes.filter(item => ids.has(Number(item.episodeId)))) {
  try {
    const paragraphs = await officialRead(episode.sourceContentId);
    readings[String(episode.episodeId)] = { episodeId: episode.episodeId, title: episode.title, source: 'official-public-read', sourceId: episode.sourceContentId, paragraphs: paragraphs.map((text, index) => ({ id: `p${index + 1}`, text, translation: '' })) };
    const text = paragraphs.join(' ');
    const words = wordsFor(text);
    vocabulary[String(episode.episodeId)] = words;
    const quiz = quizFor(episode, text, words);
    if (quiz) quizzes[String(episode.episodeId)] = quiz;
    episode.modules = { ...(episode.modules || {}), read: true, words: Boolean(words.length), vocabulary: Boolean(words.length), quiz: Boolean(quiz) };
    report.importedRead.push(episode.episodeId);
  } catch (error) { report.failed.push({ episodeId: episode.episodeId, error: error.message }); }
}
await Promise.all([writeJson('episodes.json', episodes), writeJson('reading-lessons.json', readings), writeJson('vocabulary.json', vocabulary), writeJson('quiz.json', quizzes)]);
console.log(JSON.stringify(report));
