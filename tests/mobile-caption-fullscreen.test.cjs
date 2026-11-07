const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

class FakeNode {
  constructor(name = 'div') {
    this.name = name;
    this.parentNode = null;
    this.children = [];
    this.dataset = {};
    this.attributes = {};
    this.listeners = {};
    this.textContent = '';
    this.style = {};
    this.controls = true;
    this.paused = true;
    this.muted = false;
    this.currentTime = 10;
    this.duration = 100;
    this.classNames = new Set();
    this.classList = {
      add: (...names) => names.forEach(name => this.classNames.add(name)),
      remove: (...names) => names.forEach(name => this.classNames.delete(name)),
      contains: name => this.classNames.has(name),
      toggle: (name, force) => force ? (this.classNames.add(name), true) : (this.classNames.delete(name), false)
    };
  }
  get isConnected() { return this.parentNode ? this.parentNode.isConnected : this.isDocumentRoot === true; }
  setAttribute(name, value) { this.attributes[name] = value; }
  getAttribute(name) { return this.attributes[name]; }
  removeAttribute(name) { delete this.attributes[name]; }
  addEventListener(name, listener) { (this.listeners[name] ||= []).push(listener); }
  dispatch(name) { (this.listeners[name] || []).forEach(listener => listener({type:name})); }
  appendChild(node) {
    if (node.parentNode) node.parentNode.children.splice(node.parentNode.children.indexOf(node), 1);
    this.children.push(node);
    node.parentNode = this;
    return node;
  }
  append(...nodes) { nodes.forEach(node => this.appendChild(node)); }
  replaceWith(node) {
    const index = this.parentNode.children.indexOf(this);
    const parent = this.parentNode;
    if (node.parentNode) node.parentNode.children.splice(node.parentNode.children.indexOf(node),1);
    parent.children[index] = node;
    node.parentNode = parent;
    this.parentNode = null;
  }
  remove() {
    if (!this.parentNode) return;
    this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1);
    this.parentNode = null;
  }
  querySelector(selector) { return selector === 'span' ? this.label || null : null; }
  matches() { return false; }
  closest() { return null; }
}

function makeHarness({touch = true, fullscreenAPI = false, agent = ''} = {}) {
  const body = new FakeNode('body');
  body.isDocumentRoot = true;
  const html = new FakeNode('html');
  html.isDocumentRoot = true;
  const window = {
    navigator: {maxTouchPoints: touch ? 5 : 0, userAgent: agent},
    matchMedia: () => ({matches: touch}),
    listeners: {},
    addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }
  };
  const document = {
    body,
    documentElement: html,
    fullscreenElement: null,
    listeners: {},
    createElement: name => new FakeNode(name),
    createComment: name => new FakeNode(name),
    addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); },
    dispatch(name) { (this.listeners[name] || []).forEach(fn => fn({key:name==='keydown'?'Escape':undefined,preventDefault(){}})); }
  };
  const floating = new FakeNode('floating-window');
  body.appendChild(floating);
  const stage = new FakeNode('subtitle-video-wrap');
  floating.appendChild(stage);
  const player = new FakeNode('video');
  stage.appendChild(player);
  const caption = new FakeNode('video-caption');
  stage.appendChild(caption);
  const trigger = new FakeNode('button');
  trigger.label = new FakeNode('span');
  trigger.appendChild(trigger.label);
  stage.appendChild(trigger);
  if (fullscreenAPI) {
    stage.requestFullscreen = async () => {
      document.fullscreenElement = stage;
      document.dispatch('fullscreenchange');
    };
    document.exitFullscreen = async () => {
      document.fullscreenElement = null;
      document.dispatch('fullscreenchange');
    };
  }
  vm.runInNewContext(fs.readFileSync('js/mobile-caption-fullscreen.js', 'utf8'), {window, document});
  const api = window.SFCaptionFullscreen.attach({stage,player,trigger,showControls(){}});
  return {stage,player,caption,trigger,floating,body,document,api};
}

test('iOS-style fallback portals the whole video and karaoke caption to body, then restores', async () => {
  const x = makeHarness({touch:true,fullscreenAPI:false});
  assert.equal(x.player.controls, false, 'mobile must not expose native video fullscreen control');
  assert.equal(x.stage.classNames.has('sf-caption-below'), true, 'mobile inline mode keeps caption below video');
  assert.equal(x.player.attributes.playsinline, '');
  assert.equal(x.stage.children.some(node => node.classNames.has('sf-touch-video-controls')), false);
  assert.equal(x.stage.children.some(node => node.className === 'sf-touch-video-controls'), true);
  assert.equal(x.stage.children.some(node => node.className === 'sf-touch-video-hitarea'), true);
  await x.api.toggle();
  assert.equal(x.api.isFull(), true);
  assert.equal(x.stage.parentNode, x.body);
  assert.equal(x.caption.parentNode, x.stage);
  assert.equal(x.player.parentNode, x.stage);
  assert.equal(x.stage.classNames.has('subtitle-page-fullscreen'), true);
  assert.equal(x.stage.classNames.has('sf-caption-below'), false, 'web fullscreen restores overlay arrangement');
  assert.equal(x.body.classNames.has('sf-caption-screen-locked'), true);
  assert.equal(x.trigger.label.textContent, '退出');
  await x.api.toggle();
  assert.equal(x.api.isFull(), false);
  assert.equal(x.stage.parentNode, x.floating);
  assert.equal(x.caption.parentNode, x.stage);
  assert.equal(x.body.classNames.has('sf-caption-screen-locked'), false);
  assert.equal(x.stage.classNames.has('sf-caption-below'), true, 'exiting fullscreen restores caption dock');
});

test('mobile bypasses Fullscreen API even if available (avoids native player handoff)', async () => {
  const x = makeHarness({touch:true,fullscreenAPI:true});
  x.stage.requestFullscreen = async () => { throw Error('Mobile should NEVER invoke fullscreen API'); };
  await x.api.toggle();
  assert.equal(x.document.fullscreenElement, null);
  assert.equal(x.stage.parentNode, x.body);
  assert.equal(x.caption.parentNode, x.stage);
  assert.equal(x.stage.classNames.has('sf-caption-below'), false);
  assert.equal(x.api.isFull(), true);
  await x.api.toggle();
  assert.equal(x.stage.parentNode, x.floating);
  assert.equal(x.api.isFull(), false);
  assert.equal(x.stage.classNames.has('sf-caption-below'), true);
});

test('mobile user agent triggers webpage video controls even if pointer is reported fine', async () => {
  const x = makeHarness({touch:false,fullscreenAPI:true,agent:'Mozilla/5.0 (Linux; Android 13) Quark/7.0 Mobile'});
  assert.equal(x.player.controls, false);
  assert.equal(x.stage.classNames.has('sf-caption-below'), true);
  assert.equal(x.stage.children.some(node => node.className === 'sf-touch-video-hitarea'), true);
  await x.api.toggle();
  assert.equal(x.document.fullscreenElement, null);
  assert.equal(x.stage.parentNode, x.body);
});

test('desktop stage fullscreen stays functional', async () => {
  const x = makeHarness({touch:false,fullscreenAPI:true,agent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/123'});
  assert.equal(x.stage.classNames.has('sf-caption-below'), false, 'desktop stays overlay mode');
  await x.api.toggle();
  assert.equal(x.document.fullscreenElement, x.stage);
  assert.equal(x.stage.parentNode, x.floating);
  assert.equal(x.caption.parentNode, x.stage);
  assert.equal(x.api.isFull(), true);
  await x.api.toggle();
  assert.equal(x.document.fullscreenElement, null);
  assert.equal(x.api.isFull(), false);
});

test('desktop retains native playback controls but uses wrapping stage fullscreen', async () => {
  const x = makeHarness({touch:false,fullscreenAPI:false});
  assert.equal(x.player.controls, true);
  assert.equal(x.stage.children.some(node => node.className === 'sf-touch-video-controls'), false);
  await x.api.toggle();
  assert.equal(x.caption.parentNode, x.stage);
  x.document.dispatch('keydown');
  assert.equal(x.api.isFull(), false);
});

test('Watch uses custom fullscreen helper; mobile receives nofullscreen controls hints', () => {
  const app = fs.readFileSync('js/app.js', 'utf8');
  assert.match(app, /SFCaptionFullscreen\?\.attach/);
  assert.match(app, /controlslist="nofullscreen noremoteplayback"/);
  assert.doesNotMatch(app, /else await stage\.requestFullscreen\(\)/);
});


test('only mobile inline Watch has a separate caption tray under the picture', () => {
  const app = fs.readFileSync('js/app.js', 'utf8');
  const css = fs.readFileSync('css/style.css', 'utf8');
  assert.match(app, /<div class="sf-mobile-caption-area"><div class="video-caption"/);
  assert.match(app, /classList\.contains\('sf-caption-below'\)/);
  assert.match(css, /\.sf-mobile-caption-area\{display:contents\}/);
  assert.match(css, /\.subtitle-video-wrap\.sf-caption-below \.sf-mobile-caption-area\{/);
  assert.match(css, /\.subtitle-video-wrap\.sf-caption-below \.video-caption\{/);
  assert.match(css, /\.subtitle-video-wrap\.sf-caption-below \.hls-video-player\{/);
  assert.match(css, /\.subtitle-video-wrap\.sf-caption-below \.sf-touch-video-controls\{/);
  assert.match(css, /min-height:68px/, 'caption tray reserves space in speech pauses');
  assert.doesNotMatch(css, /\.subtitle-video-wrap(?<!sf-caption-below) \.video-caption\{position:static/);
});
