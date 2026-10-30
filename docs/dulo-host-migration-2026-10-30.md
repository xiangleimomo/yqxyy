# Dulo primary-source host migration

## Cause

79 of our 82 movie primaries point to `zcdn.bluevelvet.space`. On inspection,
existing manifests, our Netlify relay, and the old public `/cdn` lookup returned
HTTP 429 with Cloudflare error 1027: the upstream owner reached their plan limits.
This is an upstream domain failure, not an empty movie library or subtitle issue.

Dulo's public runtime files explain why its own watch pages still work:

- <https://dulo.mov/dulo-config.js?v=20261027> lists three interchangeable Workers,
  `zcdn1`, `zcdn2`, and `zcdn3` under `6azt0hwr-cf9.workers.dev`.
- <https://dulo.mov/dulo-worker-rewrite.js?v=20261027> rewrites retired hostnames to
  the configured service while preserving paths and existing tokens.
- A normal browser visit to <https://dulo.mov/watch/movie/109445> requested HLS
  manifests and media from the new `zcdn3` host successfully.

## Change

Use the published `zcdn1` replacement for existing movie playback and the source
explorer's public lookup. A shared fixed-host helper accepts only the old domain
and the three published mirrors under `/play/{token}/`; it preserves paths and
query strings. Original catalogue and backup URLs are unchanged. The existing
same-origin Netlify relay now targets the replacement, including relative HLS
playlists and media assets. Native playback remains direct where supported.

This does not import Dulo's rewrite script, protected bridge, runtime secrets,
cookies, or per-session rebind values. Existing provided catalogue tokens work at
the replacement domain without those mechanisms.

## Verification

- `node scripts/check-dulo-migration.cjs`: all 79 existing movie manifests returned
  valid HLS at the replacement. Results in `dulo-migration-check-2026-10-30.json`.
- Frozen master, variant, initialization MP4 and first fragment were fetched
  successfully; all playlist references tested were relative. Byte-range media
  responses returned 206.
- `node tests/dulo-source.browser.cjs`: real Luca video at 853×480 advanced beyond
  one second; direct native playback, relay fallback selection, mobile layout and
  cleanup passed.
- `node tests/dulo-host-migration.test.cjs`, `node tests/dulo-provider.test.cjs`,
  `node tests/movie-playback.test.cjs`: allowlist/path boundaries, fresh public
  lookup, ID binding and previous playback/fallback behavior passed.
- `tests/dulo-movie-playback.browser.cjs` checks actual Luca and Harry Potter 1
  playback, resolution, duration, advancing time and absence of requests to the
  retired domain. Set `PRODUCTION_SITE=1` to check the deployed app.

Workers are controlled by the upstream provider. A passing manifest check does not
guarantee every title's entire runtime or every viewer's regional network path.

The current Frozen manifests advertise HEVC (`hev1`); this headless browser could
fetch them but did not decode the video. Frozen therefore has manifest/fragment
verification only, not a confirmed full player test. No transcoding or change to
that film's catalogue source was made.

## Source-explorer follow-up

The deployed public lookup returned `ready: true`, but its URL now ends with an
opaque `~...` filename rather than `master.m3u8`. The explorer's old strict filter
discarded these valid results, so its detail API returned an empty episode list.
Accept both documented/observed URL forms only on the fixed Dulo host allowlist,
reject query strings and fragments, and treat Dulo URLs as HLS regardless of file
extension. Rebind values are still ignored and temporary links are not persisted.

`tests/dulo-source.browser.cjs` now obtains a fresh public lookup URL instead of
reusing a static link. Actual Luca playback advanced at 853×480; a controlled
HLS.js check also verifies relay selection for the extensionless HLS URL.
