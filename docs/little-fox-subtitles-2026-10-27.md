# Recent Little Fox subtitles — 2026-10-27

Scope: Three Kingdoms 10–11; Red Magic 210–211; The Happy Prince 12–13;
Nero the Talking Dog 7–8; Daisy Dolittle 33–35. Eleven VTT files, 675 cues.

The authenticated XET episode endpoint provided the original millisecond cue
boundaries. Each episode was matched by content ID and title. XET italic markers
(`[i@…@i]`) were removed without redistributing text or changing cue times.
Every cue stream matches the local Read and Little Fox public Read in wording
(ignoring typography, punctuation and whitespace). Read required two typography
repairs: Three Kingdoms 11 p11 `me ?` → `me?`, Daisy 35 p31 `walk ,` → `walk,`.
No story words or quiz answers were changed.

All cues have positive duration, ordered non-overlapping boundaries and end before
the published video ends. Ten episodes already used the exact XET media path.
Three Kingdoms 10 used a different encode: same 355.792-second total and segment
count, but different segment boundaries. This alone does not prove a speech offset.
Its HLS source was replaced with the current XET version to match the subtitle
version, keeping the same story and runtime. The CDN candidate was verified locally
before updating only that episode's source. No guessed time offset was applied.

The browser suite loaded actual CDN video metadata for all 11 episodes, verified
its duration, rendered first/middle/last cues, and verified Watch has video while
Listen and Read has only audio and reading text. This checks source-version/timing
consistency and the player's subtitle binding; it is not a full human listening
review of every spoken word. Machine-readable results are in
`little-fox-subtitle-audit-2026-10-27.json`.

## Repeat and maintain

`import-recent-xet-vtt.cjs` defaults to this 11-episode batch. It exports sanitized
review data and VTT to ignored `subtitle-review/`. Use GitHub's manual **Review
recent Little Fox subtitles** workflow to run with the existing XET secrets.
Credentials/cookies are never exported. Optional selectors restrict a run:

```
node scripts/import-recent-xet-vtt.cjs --lesson=three-kingdoms:11 --apply
node tests/recent-littlefox-vtt.test.cjs
node tests/recent-littlefox-vtt.browser.cjs
```

Local authenticated imports need XET_ACCOUNT and XET_PASSWORD in the environment.
`--apply` publishes VTT only after all selected lessons pass wording and video
checks. Mismatches require review; it does not spread Read words over cue durations.
The old `reconcile-subtitles-with-read.js` is intentionally not used.

XET renamed `huiben01.php`–`huiben09.php` to `fox01.php`–`fox09.php`. The scheduled
catalogue collector now follows the current routes and imports validated timed VTT
after enriching each newly discovered lesson. Existing unrelated series and their
subtitles are not reimported. New Read extraction also removes stray spaces before
commas/questions caused by inline emphasis markup. The existing schedule is kept.
