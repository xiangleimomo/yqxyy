# Harry Potter 1 movie study pilot

Only this film has a study course. The original full-film primary and backup
addresses in `data/movies/harry-potter/movies.json` remain unchanged. The full-film
page links to this course; the course links back to the complete film.

The existing primary source is the 158:50 extended version. The matching English
subtitle release is recorded in `alignment.json`. Five sampled audio anchors
across the film support a constant +0.30-second adjustment, with no observed
progressive drift. This is sampled alignment, not a frame-by-frame review.

The 24 English-titled chapters use whole original TS segments, split at subtitle
gaps within 30 seconds of the reviewed plot boundaries. Chapters are contiguous
from 00:00 to 150:41.7. Final credits remain available in the full-film player.
Each chapter contains six subtitle-evidenced vocabulary entries, two original
plot questions and three vocabulary questions. Original example sentences and
definitions are used. Games reuse the chapter vocabulary and existing platform
access rules. Listen and Read is disabled.

Full movie media and the external full subtitle transcript are not stored here.
The fixed-source Netlify subtitle function downloads the matching archive,
verifies its checksum, adjusts the timeline, and serves episode-local WebVTT.
It accepts only a chapter number, never an arbitrary external URL. An upstream
failure produces a visible subtitle-unavailable message without blocking video.
The source video also contains burned-in subtitles, which cannot be switched
off using the overlay controls.

## Rebuild and audit

Use locally saved copies of the original media playlist and the exact extended
English SRT identified in the manifest:

```sh
node scripts/build-movie-course.cjs /path/to/original.m3u8 /path/to/extended.srt
node tests/movie-study.test.cjs /path/to/extended.srt
node tests/movie-playback.test.cjs
node scripts/test-hls-playback.cjs
node --check js/app.js
git diff --check
```

`editorial.json` is the reviewed input for chapter titles, intended scene cuts,
vocabulary and comprehension questions. The builder rejects unsupported HLS
encryption/discontinuities instead of silently dropping their tags. A changed
source or subtitle release must be realigned and reviewed before rebuilding.
