# Harry Potter 1 · 34-episode time-bounded playback

The published `episodes.json` contains 34 sequential clips. Each `video.hlsUrl` points at the same original VOD playlist; `clipStart` and `clipEnd` define the playable portion in the source timeline. No per-episode M3U8 is generated, downloaded or hosted in this directory. Seeking is allowed inside a chapter only; reaching its end pauses playback. The original movie source is not modified.

The 34 chapter boundaries are subtitle-dialogue-reviewed, but the source is not frame-by-frame scene-verified. The old 24-chapter derived HLS files and their separate test pages were retired. Their historical alignment/editorial manifest is not used to drive these 34 episodes. Legacy chapter vocabulary and quizzes are not applicable to the new 34-way split, so those modules remain disabled until rebuilt and checked; the existing learning history is not erased.

The main application is `/#/series/movie-harry-potter-1`; `js/app.js` implements playback bounds. To check structure run `node tests/movie-study.test.cjs` and `node scripts/test-hls-playback.cjs`. Actual playback, mobile fullscreen and cross-origin HLS availability require an online browser check.
