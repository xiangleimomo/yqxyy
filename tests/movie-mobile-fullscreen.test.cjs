const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const app = fs.readFileSync('js/app.js','utf8');
const fullscreen = fs.readFileSync('js/mobile-caption-fullscreen.js','utf8');
const css = fs.readFileSync('css/style.css','utf8');

test('movie episode toolbar delegates fullscreen to the shared mobile-safe helper', () => {
  assert.match(app, /stage:root,player,trigger:fullscreenButton/);
  assert.match(app, /const isMovieEpisode=!!stage\.closest\('\.sf-movie-lesson-player'\)/);
  assert.match(app, /if\(!isMovieEpisode\)window\.SFCaptionFullscreen/);
  assert.doesNotMatch(app, /b\('fullscreen'\)\.onclick=\(\)=>\{const box=player\.closest\('\.video-wrap'\)/);
  assert.match(fullscreen, /if \(isMobile\) \{ enterPseudo\(\); return; \}/);
});

test('movie toolbar remains available and correctly labeled in fullscreen', () => {
  assert.match(fullscreen, /trigger\.matches\?\.\('\[data-act="fullscreen"\]'\)/);
  assert.match(fullscreen, /caption\.textContent = full \? '退出' : '全屏'/);
  assert.match(css, /\.direct-video-panel\.sf-movie-lesson-player:fullscreen/);
  assert.match(css, /\.direct-video-panel\.sf-movie-lesson-player\.subtitle-page-fullscreen/);
  assert.match(css, /\.direct-video-panel\.sf-movie-lesson-player\.subtitle-page-fullscreen>\.sf-lesson-toolbar/);
  assert.match(css, /\.sf-movie-lesson-player \.video-fullscreen-trigger\{display:none!important\}/);
  assert.match(css, /\.direct-video-panel\.sf-movie-lesson-player\.subtitle-page-fullscreen>\.sf-mobile-captions-outside\.is-mobile-external/);
});
