# Harry Potter and the Goblet of Fire — yqxyy course draft

- Source: `https://api.obj2.top/hls/movie/674/master.m3u8`
- Runtime: 9437.625 s (157m 17.625s)
- Video: 1080p H.264, AES-128, 2360 `.js` segments
- Audio: English external track, 2360 `.js` segments
- Subtitle: English [CC], 1808 cues; no Chinese track was present in the 14 source subtitle tracks.
- Story segmentation: 20 narrative episodes.
- Generated: 20 episode master playlists, 20 video playlists, 20 audio playlists, 20 cleaned English VTTs, 100 quiz questions (5 per episode; all story comprehension, 4 English options A-D, one correct answer, Chinese explanation; no vocabulary-definition questions), 100 vocabulary entries.
- Chinese subtitle: pending. This package does not fabricate a native Chinese track or claim full bilingual subtitle coverage.
- Playback verification: playlists are structurally generated; actual browser playback and full-film decode have not been verified in this runtime. Source segments retain `.js` URLs and AES-128 key URI/IV.

The episode master playlists reference English audio and English subtitles. The bilingual selector must only be enabled after a complete, reviewed Chinese translation track is generated and tested.


## Quiz standard
- Each episode has exactly 5 single-choice questions.
- All 5 questions assess understanding of the episode's story, characters, events, reasons, and actions; there are no vocabulary-definition questions.
- Each question is written in English and has four English options (A-D), exactly one correct answer, and a Chinese explanation.
- Vocabulary remains in the separate Words module and is not tested as a word-meaning question in Quiz.
