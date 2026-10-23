# Little Fox Quiz revisions — 2026-10-23

Scope: the six episodes added by the four scheduled catalogue updates on
October 16, 19, 21 and 22. The October 15 bulk backfill is not changed.

Reference: `data/journey-to-the-west/quiz.json`. Each episode has five short
English questions, three parallel choices per question, and one correct answer.
Questions cover events, motivations, cause and effect, details and the ending;
distractors must be plausible but contradicted by the episode. Difficulty follows
the episode: simple wording for Nero, more inference for Red Magic. Avoid
frequency-based cloze questions, splitting names, invented events and claims that
these editorial questions are official Little Fox questions.

The reviewed question bank is `scripts/quiz-revisions/2026-10-23.json`.
Every question records paragraph IDs and an exact evidence excerpt from the local
public Read. The renderer continues using its existing three-choice UI, shuffled
options and Chinese explanations. Learners can retake the Quiz as before.

Repeat the scoped update:

```
node scripts/revise-recent-story-quizzes.cjs --dry-run
node scripts/revise-recent-story-quizzes.cjs --apply
node tests/recent-story-quizzes.test.cjs
```

The enrichment script now prefers these reviewed quizzes and preserves existing
official/editorial quizzes on subsequent imports. It no longer manufactures
word-frequency cloze questions. New lessons without reviewed questions continue
to receive video, public Read and vocabulary, but report `pendingQuiz` and keep
`modules.quiz` disabled until story questions are supplied. Existing unrelated
quizzes are not removed. The scheduled catalogue time is unchanged.
