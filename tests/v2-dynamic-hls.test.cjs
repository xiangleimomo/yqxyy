'use strict';
const assert=require('node:assert/strict');
const {dynamicPlaylistUrl,assertEpisodeSource}=require('../scripts/v2-dynamic-hls.cjs');
const url=dynamicPlaylistUrl('https://yqxyy.netlify.app','tv-74313',7,'video');
assert.equal(url,'/.netlify/functions/v2-episode-hls?course=tv-74313&episode=7&kind=video');
assert.equal(assertEpisodeSource({video:{sourceDescriptor:{provider:'dulo',tmdbId:74313,mediaType:'tv',season:2,episode:7}}}).episode,7);
assert.throws(()=>assertEpisodeSource({video:{sourceDescriptor:{provider:'dulo',tmdbId:74313,mediaType:'tv',season:2}}}),/season\\/episode/);
assert.throws(()=>assertEpisodeSource({video:{sourceDescriptor:{provider:'other',tmdbId:74313,mediaType:'tv',season:2,episode:7}}}),/approved Dulo/);
console.log('V2 dynamic HLS descriptor tests passed');
