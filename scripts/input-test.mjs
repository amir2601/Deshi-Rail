// Keyboard test: the engine listens on window, so it must ignore keys typed
// into a form field (the login card). Typing a name like "Riad" used to trip
// shortcuts - the D toggled the old debug overlay - so this guards the leak.
//
//   node scripts/input-test.mjs
import assert from 'node:assert';
import { installDom, SwCanvas, W, H } from './lib/soft-canvas.mjs';

installDom();
// Capture the engine's window listeners so we can fire events at them.
const handlers = new Map();
globalThis.addEventListener = (type, fn) => {
  if (!handlers.has(type)) handlers.set(type, []);
  handlers.get(type).push(fn);
};
globalThis.removeEventListener = () => {};

const { createEngine } = await import('../src/engine/engine.js');
const engine = createEngine(new SwCanvas(W, H));

const fire = (type, code, target) => {
  let prevented = false;
  for (const fn of handlers.get(type) || []) {
    fn({ code, target, repeat: false, preventDefault: () => { prevented = true; } });
  }
  return prevented;
};

const field = { tagName: 'INPUT' };
const page = { tagName: 'BODY' };
const editable = { tagName: 'DIV', isContentEditable: true };

// --- while a field has focus, the game stays out of the way -----------------
assert.equal(fire('keydown', 'Enter', field), false, 'Enter in a field is not swallowed');
assert.equal(engine.ui.title, true, 'Enter in a field does not start the trip');
assert.equal(fire('keydown', 'Space', field), false, 'Space in a field is not swallowed');
assert.equal(engine.ui.paused, false, 'Space in a field does not pause');
fire('keydown', 'KeyP', field);
assert.equal(engine.ui.paused, false, 'P in a field does not pause');
fire('keydown', 'KeyC', field);
assert.equal(engine.ui.title, true, 'C in a field does not start a drive');
fire('keydown', 'KeyT', field);
assert.equal(engine.ui.timeMode, 0, 'T in a field does not change time mode');
fire('keydown', 'KeyR', field);
fire('keydown', 'KeyN', field);
fire('keydown', 'KeyF', field);
assert.equal(engine.input.fast, false, 'F in a field does not fast-forward');
fire('keydown', 'KeyP', editable);
assert.equal(engine.ui.paused, false, 'P in a contenteditable does not pause');

// --- on the page itself, shortcuts still work -------------------------------
fire('keydown', 'KeyP', page);
assert.equal(engine.ui.paused, true, 'P pauses when not typing');
fire('keydown', 'KeyT', page);
assert.equal(engine.ui.timeMode, 1, 'T changes time mode when not typing');
fire('keydown', 'KeyF', page);
assert.equal(engine.input.fast, true, 'F fast-forwards when not typing');
fire('keyup', 'KeyF', page);
assert.equal(engine.input.fast, false, 'F is released on keyup');
fire('keydown', 'KeyP', page);            // leave it unpaused for the drive test
assert.equal(engine.ui.paused, false, 'P toggles back');

// --- the debug overlay is gone for good -------------------------------------
assert.equal(engine.input.debug, undefined, 'no debug flag on the input state');
assert.equal(engine.ui.debugW, undefined, 'no debug width on the ui state');
fire('keydown', 'KeyD', page);
assert.equal(engine.input.debug, undefined, 'D no longer switches on a debug overlay');

engine.dispose();
console.log('input-test: OK — typing in a field never trips a game shortcut, debug box is gone');
