# V2 release quality gates

A course is publishable only when every applicable gate is \`passed\`. \`unknown\`, \`not_checked\`, and \`warning\` are not passes.

## A. Identity and source
- TMDB ID, media type, title, and year identify the exact work.
- For TV, season and episode identity is explicit; no episode 1 placeholder is treated as the whole series.
- HLS master is a real \`#EXTM3U\` document, not an HTML page.
- Video and audio renditions resolve and are associated correctly.
- The source is accessible without bypassing DRM or access controls.
- Source report records source URL, checked time, status, resolution, duration, codecs, track languages, encryption type, and limitations.

## B. Subtitle integrity
- Complete English subtitle track is acquired and normalized.
- Cue order, timestamps, duration, duplicates, empty cues, and coverage are checked.
- Opening, middle, and ending dialogue samples match the media version.
- Version status is \`matched\` or \`likely-matched\`; otherwise stop.
- External subtitle or ASR fallback is labelled with provenance and independently aligned.
- Chinese is either a verified native track or a translation generated cue-by-cue from English. It must never be mislabeled as native.

## C. Story segmentation
- Full transcript is read as one continuous narrative before episode count is chosen.
- Each episode has a distinct story purpose, coherent opening, completed event/turning point, and natural handoff.
- Every boundary includes start/end cue evidence, adjacent cue context, and a semantic reason.
- No equal-time, fixed-interval, subtitle-gap-only, or target-count segmentation.
- The full film timeline is covered; accidental gaps, duplicated spans, and mid-sentence cuts fail.
- Long and short episodes are reviewed for story integrity, not forced into a duration range.
- A separate critic pass checks over-splitting, under-splitting, cliffhanger/context loss, and unsupported plot claims.

## D. Learning content
- Episode title and synopsis match only that episode; no later-episode spoilers.
- Vocabulary is drawn from the episode's actual subtitle cues; examples cite cue IDs/timestamps.
- Exclude names, obvious function words, OCR/ASR errors, and low-value words.
- Quiz questions test plot comprehension, causal/sequence understanding, and vocabulary in context.
- Every answer is supported by episode evidence; distractors are plausible but unambiguously wrong.
- Explanations are short, age-appropriate, and factually supported.

## E. Subtitle deliverables
- English and bilingual VTT have the same cue count, IDs, and timestamps.
- Cue time origin matches the episode HLS timeline origin.
- No negative timestamps, invalid intervals, missing translations, or out-of-range cues.
- No word-level highlighting unless a separate forced-alignment process has passed validation.

## F. HLS and playback
- Per-episode master, video, and audio playlists exist.
- Video and audio segment selection is computed independently from their own EXTINF timelines.
- Media sequence, AES-128 key URI/IV semantics, MAP, BYTERANGE, and DISCONTINUITY are preserved when present.
- Unsupported HLS or DRM formats block the item rather than being stripped or guessed.
- Player clipStart/clipEnd and VTT offsets share the same origin.
- Structural validation plus actual sample playback checks cover first, middle, and final episodes; report exact tested devices, browsers, tracks, and intervals.

## G. Integration and release
- Existing yqxyy schema, routes, player, subtitle menu, vocabulary UI, quiz UI, and progress records remain compatible.
- Only the target course's required files change.
- A full backup and diff are available.
- All gates pass; no partial files or failed jobs are committed.
- Deployment ready is not equivalent to browser playback passed.
