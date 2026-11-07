# V2 engine one-time setup and operational boundaries

## Current branch

Implementation branch: \`feature/v2-quality-first-engine\`.

The V3 workflow has been removed from the active workflow directory. The old V3 script, status JSON, and generated course assets remain in the repository as historical data; they are not a V2 source of truth and must not be run by the V2 worker.

## Required one-time credential

The production reasoning/translation worker calls the OpenAI Responses API. Add a repository Actions secret:

- \`OPENAI_API_KEY\`: an API key with Responses API access.

This is separate billing from a ChatGPT subscription. Never paste it into chat, source code, a commit, workflow YAML, an artifact, or logs.

Recommended repository Actions variables:

- \`V2_MODEL=gpt-6-astra\`
- \`V2_REASONING_EFFORT=high\`

The model ID is configurable. The V2 production worker must fail closed when the API key is missing or the configured model is unavailable; it must not silently switch to a cheaper or lower-quality model.

TV season/episode enumeration should use the stored TMDB ID and verified season metadata. If a TMDB API credential is required for the selected endpoint, add it as \`TMDB_API_KEY\` in Actions secrets. Do not infer season/episode counts from a title or a first-episode placeholder.

## What the current branch does

- Adds a discovery-only scanner for the 82-film catalogue and the published TV/documentary rows in Supabase \`movie_library\`.
- Uses the public Supabase publishable key already present in \`js/supabase-config.js\`; it does not expose or require the service-role key.
- Stores stable, deduplicated work items in \`data/v2-engine-state.json\`.
- Preserves production status and completed work when a catalogue scan refreshes metadata.
- Runs discovery when the film catalogue changes and on a two-hour schedule after merge to \`main\`.
- Removes the V3 workflow from active GitHub Actions.

The scanner is not the production worker. It does not fetch streams, download subtitles, segment stories, create vocabulary/quiz data, build HLS, or publish. Those stages must be implemented and validated before enabling unattended production.

## Acceptance before unattended production

1. A source resolver can identify and verify the exact film or TV episode and returns a directly accessible HLS VOD URL. A TMDB ID alone is not a media URL.
2. The HLS parser supports the source's actual playlist features, or marks unsupported formats blocked.
3. The complete English subtitle track is acquired, version-checked, and aligned to the same cut.
4. Full-transcript story analysis creates cue-backed natural boundaries, followed by an independent critic pass.
5. Vocabulary and quiz content has cue-level evidence and deterministic checks.
6. English and bilingual VTT timelines are identical and match the per-episode media origin.
7. HLS master/video/audio playlists preserve required sequence, key, map, range, and discontinuity semantics.
8. The course passes the repository's existing schema and player integration tests.
9. Real browser playback passes for first, middle, and final episodes on desktop and mobile.
10. Only then may the worker atomically replace the target course and publish.

No production workflow should be enabled merely because discovery works.
