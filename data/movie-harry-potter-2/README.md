# Harry Potter and the Chamber of Secrets study course

28 plot chapters from the current 174:24 extended source. Four reviewed dialogue
anchors span the beginning to the final confrontation; a constant +0.15-second
display adjustment is used with no observed progressive drift. The observations
are sampled audio onset estimates, not frame-by-frame certification.

Each chapter contains six words evidenced in its actual subtitle interval,
original bilingual examples, two plot questions and three vocabulary questions.
Games use the same six words. Listen and Read is disabled. Chapter endpoints use
original TS boundaries within subtitle gaps. The last chapter includes the final
reunion and the castle shot through 165:07.7. Credits and the post-credit scene
remain available through the original full-film player.

The full-film primary and backup URLs are unchanged. The external English
subtitle release, checksum, timeline and segment ranges are in `alignment.json`.
The shared subtitle endpoint selects only registered reviewed course manifests;
it does not accept external URLs from the client.

Rebuild using local audited inputs:

```sh
node scripts/build-movie-course.cjs /path/to/original.m3u8 /path/to/english.srt data/movie-harry-potter-2/editorial.json
node scripts/register-movie-course.cjs movie-harry-potter-2
node tests/movie-study-catalog.test.cjs movie-harry-potter-2 /path/to/english.srt
```
