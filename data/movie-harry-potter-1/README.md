# Harry Potter 1 - 34 independent HLS lessons

Each episode uses its own hls/001.m3u8 through hls/034.m3u8 master, with separate video and English audio playlists. These reference only upstream segments covering the existing reviewed chapter boundaries. Original sequence numbers, AES-128 key URIs and IVs are preserved. Media and key bytes remain on the upstream service; availability still depends on it.

The 34 episode VTT files use the selected video segment range's local timeline. clipStart and clipEnd trim segment-edge padding through the existing player. originalStart, originalEnd and timelineOrigin retain the full-film mapping. EXT-X-START also supplies the desired starting offset. These are subtitle-dialogue-reviewed cuts, not frame-accurate re-encodes.

Rebuild with node scripts/split-hp1-hls.cjs. This reads the preserved chapter boundaries and subtitles/full-film.en.vtt, fetches the current source playlists, and regenerates the lesson playlists and subtitles. hls/manifest.json records segment selection. Repeated runs use original chapter times and full-film subtitles, never previously shifted VTT files.

The application entry is /#/series/movie-harry-potter-1. Existing learning module availability is preserved; retired 24-chapter vocabulary and quizzes remain disabled.
