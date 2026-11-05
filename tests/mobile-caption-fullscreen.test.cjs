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
}

function makeHarness({touch = true, fullscreenAPI = false} = {}) {
  const body = new FakeNode('body');
  body.isDocumentRoot = true;
  const html = new FakeNode('html');
  html.isDocumentRoot = true;
  const window = {
    navigator: {maxTouchPoints: touch ? 5 : 0},
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
  assert.equal(x.player.attributes.playsinline, '');
  assert.equal(x.stage.children.some(node => node.classNames.has('sf-touch-video-controls')), false);
  assert.equal(x.stage.children.some(node => node.className === 'sf-touch-video-controls'), true);
  await x.api.toggle();
  assert.equal(x.api.isFull(), true);
  assert.equal(x.stage.parentNode, x.body);
  assert.equal(x.caption.parentNode, x.stage);
  assert.equal(x.player.parentNode, x.stage);
  assert.equal(x.stage.classNames.has('subtitle-page-fullscreen'), true);
  assert.equal(x.body.classNames.has('sf-caption-screen-locked'), true);
  assert.equal(x.trigger.label.textContent, '退出');
  await x.api.toggle();
  assert.equal(x.api.isFull(), false);
  assert.equal(x.stage.parentNode, x.floating);
  assert.equal(x.caption.parentNode, x.stage);
  assert.equal(x.body.classNames.has('sf-caption-screen-locked'), false);
});

test('standard element fullscreen uses stage, never the video itself', async () => {
  const x = makeHarness({touch:true,fullscreenAPI:true});
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
