import test from 'node:test';
import assert from 'node:assert/strict';
import { TippyDialogue } from '../src/ui/dialogue.js';
import { TipBoxUI } from '../src/ui/tip-box.js';

function fixture({ reducedMotion = false } = {}) {
  const elements = new Map();
  const element = (selector) => {
    if (elements.has(selector)) return elements.get(selector);
    const classes = new Set();
    const node = { hidden: true, textContent: '', attributes: {}, handlers: {}, isConnected: true,
      classList: { add(...values) { values.forEach((value) => classes.add(value)); }, remove(...values) { values.forEach((value) => classes.delete(value)); }, toggle(value, active) { if (active) classes.add(value); else classes.delete(value); }, contains(value) { return classes.has(value); } },
      addEventListener(event, handler) { this.handlers[event] = handler; },
      setAttribute(key, value) { this.attributes[key] = value; },
      querySelector: element, contains(target) { return target === this || target === elements.get('#tippy-next'); },
      focus() { globalThis.document.activeElement = this; }
    };
    elements.set(selector, node);
    return node;
  };
  const oldDocument = globalThis.document;
  globalThis.document = { querySelector: element, activeElement: element('#previous-focus') };
  const states = [];
  const frames = [];
  const cancelled = [];
  const settings = { reducedMotion };
  const dialogue = new TippyDialogue({ settings, onActiveChange: (...args) => states.push(args), requestFrame(callback) { frames.push(callback); return frames.length; }, cancelFrame(id) { cancelled.push(id); } });
  return { dialogue, settings, states, frames, cancelled, element, restore() { dialogue.destroy(); globalThis.document = oldDocument; } };
}

test('Tippy writes left to right while paused; first click reveals and second advances', () => {
  const f = fixture();
  try {
    let finished = 0;
    let secondShown = 0;
    f.dialogue.show(['Watch behind you!', { text: 'Now sprint.', label: 'MOVEMENT / SHIFT', onShow() { secondShown += 1; } }], { blocking: true, onComplete() { finished += 1; } });
    assert.equal(f.dialogue.active, true);
    assert.deepEqual(f.states.at(-1), [true, true]);
    assert.equal(f.element('#tippy-shade').hidden, false);
    assert.equal(f.element('#tippy-text').textContent, '');
    assert.equal(f.element('#tippy-announcement').textContent, 'Watch behind you!');
    f.dialogue.update(.055);
    assert.equal(f.element('#tippy-text').textContent, 'Wat');
    f.dialogue.continue();
    assert.equal(f.element('#tippy-text').textContent, 'Watch behind you!');
    assert.equal(f.dialogue.index, 0);
    assert.equal(finished, 0);
    f.dialogue.continue();
    assert.equal(secondShown, 1);
    assert.equal(f.element('#tippy-label').textContent, 'MOVEMENT / SHIFT');
    assert.equal(f.element('#tippy-progress').textContent, '02 / 02');
    f.dialogue.continue();
    assert.equal(finished, 0);
    f.dialogue.continue();
    assert.equal(finished, 1);
    assert.equal(f.dialogue.active, false);
    assert.equal(f.element('#tippy-panel').hidden, true);
    assert.equal(f.element('#tippy-shade').hidden, true);
    assert.equal(globalThis.document.activeElement, f.element('#previous-focus'));
    f.dialogue.continue();
    assert.equal(finished, 1);
  } finally { f.restore(); }
});

test('replacing or hiding dialogue cancels stale completion callbacks and animation frames', () => {
  const f = fixture();
  try {
    let stale = 0;
    f.dialogue.show('Old room instruction', { onComplete() { stale += 1; } });
    f.dialogue.show('New room instruction');
    assert.equal(f.cancelled.length, 1);
    f.dialogue.hide();
    assert.equal(f.cancelled.length, 2);
    f.frames.forEach((frame) => frame(50));
    assert.equal(stale, 0);
    assert.equal(f.dialogue.active, false);
  } finally { f.restore(); }
});

test('reduced motion displays full dialogue immediately and keeps keyboard controls accessible', () => {
  const f = fixture({ reducedMotion: true });
  try {
    let completed = 0;
    f.dialogue.show('A complete sentence.', { blocking: true, onComplete() { completed += 1; } });
    assert.equal(f.frames.length, 0);
    assert.equal(f.element('#tippy-text').textContent, 'A complete sentence.');
    let prevented = 0;
    f.dialogue.keyHandler({ key: 'Enter', target: { tagName: 'BUTTON' }, preventDefault() { prevented += 1; }, stopImmediatePropagation() {} });
    assert.equal(prevented, 1);
    assert.equal(completed, 1);
  } finally { f.restore(); }
});

test('Tip Box starts onboarding only after a successful checkpoint save', () => {
  let saved = false;
  let callbacks = 0;
  const ui = Object.assign(Object.create(TipBoxUI.prototype), { game: { saveProgress() { return saved; }, story: { onCheckpointSaved() { callbacks += 1; } } }, render() {} });
  ui.handle('save');
  assert.equal(callbacks, 0);
  assert.equal(ui.messageOK, false);
  saved = true;
  ui.handle('save');
  assert.equal(callbacks, 1);
  assert.equal(ui.messageOK, true);
});
