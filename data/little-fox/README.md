# Little Fox subtitle data

This directory holds only the local, git-ignored import checkpoint. Published subtitle data is kept with its corresponding animation as one WebVTT file per episode: `data/little-fox-*/subtitles/001.vtt`.

The importer reads credentials only from `XET_ACCOUNT` and `XET_PASSWORD`; do not commit credentials or session cookies.

Run `node scripts/sync-little-fox.js --dry-run` to inspect the authorised XET
catalogue. Run `node scripts/sync-little-fox.js --apply` to refresh the public
video catalogue and write only changed subtitle/VTT files. New video courses are
created by the catalogue step; the subtitle step then attaches data to the
matching course folder when its `FSxxxx` id is known.
