const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const app = fs.readFileSync('js/app.js','utf8');
const css = fs.readFileSync('css/style.css','utf8');
const mobileCaptions = fs.readFileSync('js/mobile-external-caption.js','utf8');
const fullscreen = fs.readFileSync('js/mobile-caption-fullscreen.js','utf8');

test('shared HLS lesson player exposes a mobile-only CC toggle for stories and movie episodes', () => {
  assert.match(app, /class="mobile-cc-trigger"/);
  assert.match(app, /ccTrigger\?\.addEventListener\('click'/);
  assert.match(app, /save\(\{visible:this\.subtitlePreferences\(\)\.visible===false\}\)/);
  assert.match(app, /this\.subtitleControls\(\)/);
  assert.match(app, /d\.seriesId\?\.startsWith\('movie-'\)/);
  assert.match(css, /\.subtitle-video-wrap\.sf-caption-below \.mobile-cc-trigger/);
  assert.match(css, /\.subtitle-video-wrap\.subtitle-page-fullscreen \.mobile-cc-trigger/);
});

test('CC toggle updates the same preference consumed by mobile external captions', () => {
  assert.match(mobileCaptions, /const visible=prefs\.visible!==false/);
  assert.match(mobileCaptions, /player\.dispatchEvent\(new Event\('sfcaptionchange'\)\)/);
  assert.match(app, /player\?\.addEventListener\('sfcaptionchange',syncCC\)/);
});

test('CC is shown in the mobile page-level player, not native video controls', () => {
  assert.match(fullscreen, /player\.removeAttribute\('controls'\)/);
  assert.match(fullscreen, /SFCaptionFullscreen/);
  assert.match(css, /\.mobile-cc-trigger\{display:none\}/);
});
