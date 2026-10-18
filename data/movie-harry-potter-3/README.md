# Harry Potter and the Prisoner of Azkaban study course

23 plot chapters, 138 subtitle-evidenced vocabulary entries and 115 original
questions. Games reuse each chapter's six words; Listen and Read is disabled.
Long action passages are grouped with nearby story dialogue rather than being
published as empty vocabulary lessons.

Three reviewed dialogue anchors span approximately 11, 98 and 128 minutes.
A constant +2.20-second adjustment is applied to the matching English release.
The final chapter covers Lupin's farewell and the Firebolt ending through
129:45.7. The credits and their narrated map sequence remain available in the
full-film player. Promotional subtitle-download lines are omitted from overlay
display. Subtitle provenance and its checksum remain in `alignment.json`.

The original full-film primary and backup URLs are unchanged. All chapter
playlists reuse the original TS addresses, with contiguous boundaries in
subtitle gaps. Chrome playback, first-caption display and chapter durations
were checked for all 23 chapters; seeking near the ending was sampled in the
first, middle and final chapters.

```sh
node scripts/build-movie-course.cjs /path/to/original.m3u8 /path/to/english.srt data/movie-harry-potter-3/editorial.json
node scripts/register-movie-course.cjs movie-harry-potter-3
node tests/movie-study-catalog.test.cjs movie-harry-potter-3 /path/to/english.srt
```
