# XET synchronization and subtitle review — 2026-10-28

## Catalogue

Yesterday's scheduled run 40506645086 succeeded and added Nero 9 (Sneaking In)
and The Happy Prince 14 (To Catch a Thief), commit 74449d2. Today's manual live
comparison 40663358924 discovered Three Kingdoms 12 (The Seven-Star Dagger),
commit 0a66d01. These lessons have public Read, vocabulary and XET timed VTT.
Three reviewed quizzes / fifteen story questions have now been supplied; each
question has exact paragraph evidence. No word-frequency cloze questions are used.
The reviewed bank is `scripts/quiz-revisions/2026-10-28.json` and is selected by
future enrichment. Existing banks and official/editorial questions are retained.

```
node scripts/revise-recent-story-quizzes.cjs --bank=2026-10-28 --apply
node tests/oct28-sync.test.cjs
```

## Subtitle controls

The initial site scan covered 161 episode catalogues, 6,282 episode entries and
3,494 linked VTT files / 268,402 cues before today's new release was fetched.
A separate file scan after the update covered 3,495 VTT files. Eighty files
contained XET's control-only `[caption_out@` cue. These are instructions to clear
captions, not spoken dialogue. They have been removed from the files; every
remaining spoken cue and timestamp was compared against the previous Git version
and is unchanged. The importer now drops these instructions on future imports.
See `subtitle-control-repairs-2026-10-28.json` for the exact file scope.

```
node scripts/repair-subtitle-controls.cjs --dry-run
node tests/subtitle-controls.test.cjs
```

## Speech review in progress

Structural scanning also flagged long/overlapping cues. A scoped 56-lesson
manifest includes these suspects plus the recent releases. The manual speech
workflow extracts the actual published video audio with FFmpeg and uses local
faster-whisper word timestamps, retaining canonical text for comparison. Results
are review evidence, not automatic permission to replace wording. Source URLs,
audio files and model caches are not committed. Source-version and duration
checks from October 27 alone did not establish spoken-word alignment.
