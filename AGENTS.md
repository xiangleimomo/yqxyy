# Story Fox English — Codex Cloud guide

## Project

This is a static English-learning site. GitHub `main` is deployed automatically by Netlify; no build step is required. The site entry point is `index.html`.

## Important locations

- `js/app.js`: application flow, lesson windows, HLS video/audio playback, and learning progress.
- `css/style.css`: site and learning-window styling.
- `data/series-list.json`: catalogue and level grouping.
- `data/<series-id>/series.json`: series metadata.
- `data/<series-id>/episodes.json`: episode titles, modules, and media sources.
- `data/<series-id>/reading-lessons.json`: public reading text, keyed by episode number.
- `data/<series-id>/vocabulary.json`, `quiz.json`: optional learning content, keyed by episode number.
- `netlify.toml`: static-site deployment configuration.

## Working rules

1. Before editing, inspect the affected data shape and relevant UI code.
2. Preserve existing HLS, Bilibili, direct-link, and local-video behavior unless a request explicitly changes it.
3. `Listen and Read` uses the episode `video.hlsUrl` as an audio-only `<audio>` source; do not show a video frame there.
4. Do not mass-reformat JSON or modify unrelated series. Large data imports require an explicit user request and a repeatable script in `scripts/`.
5. Do not add access tokens, API keys, or private URLs to source control. Keep `.env` files untracked.
6. Keep the interface bilingual where the existing screen is bilingual.
7. Prefer a small, focused commit per user request. Do not force-push or overwrite remote work.

## Verification

Run the checks relevant to the change before committing:

```sh
node --check js/app.js
git diff --check
```

For a browser preview, run:

```sh
python3 -m http.server 8000
```

Open the forwarded port 8000. For player changes, verify that Watch remains video-capable and Listen and Read shows only the audio player plus reading text.

## Delivery

After tests pass, report changed files, verification results, and the commit or pull-request URL. Changes merged or pushed to `main` are automatically deployed by Netlify.
