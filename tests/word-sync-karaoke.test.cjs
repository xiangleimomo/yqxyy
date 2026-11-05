const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function loadWordSync() {
  class FakeNode {
    constructor() {
      this.dataset = {};
      this.attrs = {};
      this.children = [];
      this.active = false;
      this.classList = {
        add: name => { if (name === 'is-karaoke-active') this.active = true; },
        remove: name => { if (name === 'is-karaoke-active') this.active = false; }
      };
    }
    setAttribute(key, value) { this.attrs[key] = value; }
    appendChild(child) { this.children.push(child); }
  }
  const context = {
    window: {},
    document: {
      createDocumentFragment: () => new FakeNode(),
      createTextNode: text => ({textContent: text}),
      createElement: () => new FakeNode()
    }
  };
  vm.runInNewContext(fs.readFileSync('js/word-sync.js', 'utf8'), context);
  return context.window.SFWordSync;
}

test('speech-timed words are clickable, receive indices, and clear highlight during silence', () => {
  const sync = loadWordSync();
  const cues = [{text: 'Hello brave world!', startMs: 1000, endMs: 3000}];
  const track = {
    cueCount: 1,
    cues: [{words: [
      {text: 'Hello', startMs: 1000, endMs: 1300, source: 'speech'},
      {text: 'brave', startMs: 1500, endMs: 1800, source: 'speech'},
      {text: 'world!', startMs: 1900, endMs: 2200, source: 'speech'}
    ]}]
  };
  const [row] = sync.prepare(cues, track);
  assert.equal(row.verified, true);
  const view = sync.render(row, true);
  assert.deepEqual(view.nodes.map(node => node.dataset.wordIndex), ['0', '1', '2']);
  assert.deepEqual(view.nodes.map(node => node.attrs.role), ['button', 'button', 'button']);
  sync.paint(view, 1100);
  assert.equal(view.nodes[0].active, true);
  sync.paint(view, 1450);
  assert.equal(view.nodes[0].active, false);
  assert.equal(view.nodes[1].active, false);
  sync.paint(view, 1590);
  assert.equal(view.nodes[1].active, true);
  sync.paint(view, 2250);
  assert.equal(view.nodes.every(node => !node.active), true);
});

test('out-of-date word files fall back to estimated timestamps rather than highlighting wrong text', () => {
  const sync = loadWordSync();
  const cues = [{text: 'This is correct.', startMs: 1000, endMs: 2200}];
  const stale = {
    cueCount: 1,
    cues: [{words: [
      {text: 'That', startMs: 1000, endMs: 1300, source: 'speech'},
      {text: 'is', startMs: 1400, endMs: 1600, source: 'speech'},
      {text: 'correct.', startMs: 1700, endMs: 2100, source: 'speech'}
    ]}]
  };
  const [row] = sync.prepare(cues, stale);
  assert.equal(row.verified, false);
  assert.equal(row.words.every(word => word.source === 'estimated'), true);
  const view = sync.render(row);
  assert.equal(view.nodes.every(node => node.attrs.role === undefined), true);
  sync.paint(view, 1500, false);
  assert.equal(view.nodes.every(node => !node.active), true);
});
