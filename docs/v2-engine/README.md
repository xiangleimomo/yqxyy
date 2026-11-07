# yqxyy V2 quality-first course engine

## Non-negotiable operating rule

V3 is retired. No V3 batch, time-based subtitle slicing, equal-duration segmentation, or automatic publication based only on a successful script exit is allowed.

The V2 production standard is the saved skill \`yqxyy-subtitle-driven-film-course\` and the companion manual \`yqxyy-字幕驱动影视英语课程制作与上架手册.md\`. This repository implementation must preserve its order:

1. Discover a catalogue item and resolve the exact TMDB identity.
2. Find a playable, legally accessible source from existing project records or approved source providers.
3. Parse the actual HLS master, video/audio/subtitle renditions, encryption metadata, and media playlists.
4. Obtain the complete source English subtitle track; only use external subtitles or transcription as a clearly labelled fallback.
5. Verify the subtitle cut/version against the media duration and dialogue samples.
6. Read the complete subtitle transcript and construct the whole-film story map.
7. Determine natural story units and cue-anchored boundaries. Never divide by runtime, cue count, fixed interval, or a target episode count.
8. Produce episode titles, story summaries, vocabulary/phrases with source cue evidence, and comprehension-led quizzes.
9. Produce English and English-Chinese VTT tracks using the same per-episode timeline origin.
10. Build per-episode HLS master/video/audio playlists while preserving sequence numbers, key semantics, and supported HLS timeline tags.
11. Run all quality gates. A failed or uncertain gate blocks publication.
12. Integrate into the existing yqxyy episode-learning schema and player. Do not create a parallel player or change user learning records.

## Quality over throughput

- No batch-size target, throughput target, or equal episode-length target.
- One complete work item at a time unless independent tests prove concurrency is safe.
- Keep source reports, transcript checks, story-boundary evidence, manifests, and quality reports.
- A model response is a draft, not proof. Deterministic validators and independent review passes are required.
- If subtitle/media identity is uncertain, stop before final segmentation.
- If a source is inaccessible, protected by DRM, or cannot be lawfully processed, mark it blocked. Never bypass DRM or fabricate a source.
- Do not overwrite existing V2/manual course data until the replacement passes all gates and has a complete backup/diff.

## Current implementation phases

### Phase 0 — stop legacy V3
Remove the V3 GitHub Actions workflow from the active workflows directory. Keep historical V3 data and scripts as read-only archive material. Do not delete existing course files.

### Phase 1 — discovery and durable queue
Track film records from \`data/movie-hub-catalog.json\` and published TV/documentary records from Supabase \`public.movie_library\`. Deduplicate by stable catalogue keys. Preserve job state when metadata is refreshed.

### Phase 2 — source and subtitle acquisition
Resolve source candidates from existing per-course \`source-report.json\` / \`episodes.json\`, then approved source discovery. Verify the HLS structure and subtitle rendition before accepting a source.

### Phase 3 — story-first production
Use a reasoning-capable model through the OpenAI Responses API with structured outputs. Keep complete-transcript context or a lossless hierarchical transcript map; do not segment based on independently summarised, disconnected snippets. Run a separate critique pass over the proposed boundaries and episode learning content.

### Phase 4 — deterministic validation and publishing
Validate complete time coverage, no accidental gaps/overlaps, cue boundaries, bilingual cue parity, word evidence, quiz answer uniqueness, HLS audio association, media-sequence/key handling, and project schema compatibility. Publish only a complete, validated course.

## Runtime dependencies and one-time configuration

The catalogue scanner uses the public Supabase publishable key already present in \`js/supabase-config.js\`. It does not need a service-role key.

The production worker must have an OpenAI API key supplied as a GitHub Actions secret named \`OPENAI_API_KEY\`; API billing is separate from a ChatGPT subscription. The model ID is configurable as \`V2_MODEL\`; use \`gpt-6-astra\` for the highest-quality story reasoning by default. The worker must fail closed if the key is absent. Do not place API keys in source files, workflow YAML, logs, artifacts, or the browser.

TV episode expansion requires a TMDB API credential unless the complete season/episode metadata is already present in the catalogue. Source providers may also require individual credentials or user-authorized access. Missing credentials must produce a clear blocked status, not a guessed stream URL.

## State machine

\`queued → source_discovery → source_verified → subtitles_acquired → subtitles_verified → story_analysis → story_review → course_assets → hls_build → quality_gate → ready_to_publish → published\`

Recoverable failures use \`retry_wait\` with bounded exponential backoff. Missing source, missing matching subtitles, rights/DRM restrictions, or model-key absence use \`blocked\`. A quality failure returns to the relevant production stage; it never transitions directly to publication.

## Scanner scope

\`scripts/v2-catalog-scan.cjs\` is discovery-only. It must never generate episode boundaries, write course assets, or publish. The production worker is intentionally separate so catalogue discovery cannot accidentally publish unreviewed courses.
