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

## Completed speech review

Structural scanning also flagged long/overlapping cues. A scoped 56-lesson
manifest includes these suspects plus the recent releases. The manual speech
workflow extracts the actual published video audio with FFmpeg and uses local
faster-whisper word timestamps, retaining canonical text for comparison. Results
are review evidence, not automatic permission to replace wording. Source URLs,
audio files and model caches are not committed. Source-version and duration
checks from October 27 alone did not establish spoken-word alignment.


The scoped 56-lesson audit is complete: 2,802 cues now have per-media speech evidence, bounded non-overlapping timestamps and timing sidecars. Missing intro offsets (roughly 11–13 seconds on recent imports), long cues and alphabet placeholders in Spotlight 21 / Phonics II 23–25 were corrected. This is automated speech verification, not a claim that all 3,495 files received human listening review.

## Exact content bindings and repeated frames

Authenticated exact-ID/title comparisons found 291 mismatched Read bindings across eight legacy series. The repair preserves episode positions and reuses Read/vocabulary/quiz only from the matching original source ID; 292 videos across nine series were corrected, including South Street School 28. Space Patrol 94 required a newly fetched public Read. Red Magic 128 additionally restores one XET/audio-verified spoken line absent from its public Read. Reports list the exact scope and verified media fingerprints.

325 VTT files had duplicate highlight frames: 45,098 duplicate frames were merged only when the resulting complete transcript exactly matched the episode Read, preserving real spoken repetitions.

## Verification and future imports

The browser passed caption rendering at first/middle/last cues on all 56 reviewed lessons. Watch remains video-capable; Listen and Read remains audio-only with reading text. The source-binding guard passes 5,648 Read bindings and all 56 VTT/media fingerprints. Relevant unit tests, app syntax and diff whitespace checks pass. New automatic imports now run actual-audio alignment and source/VTT integrity checks before publishing.

## Extended placeholder recovery

A subsequent whole-site scan found 573 additional legacy files with mostly alphabet/numeric placeholders. A separate authenticated source audit is running against this explicit manifest. These are additional work, not part of the completed 56-lesson speech scope; the final recovery report will distinguish restored source wording and independently verified speech timing.
