// Headless smoke test: boots the engine against a stubbed DOM/canvas and steps
// it a few frames, so we catch runtime errors (bad references, missing canvas
// APIs) without a browser. It does not check pixels — only that the simulation
// and every render pass run cleanly.
//
//   node scripts/smoke-test.mjs
import assert from 'node:assert';

// --- a 2D context good enough for the drawing code --------------------------
function makeContext(canvas) {
  const special = {
    canvas,
    createImageData: (w, h) => ({
      width: w,
      height: h,
      data: new Uint8ClampedArray(Math.max(1, w | 0) * Math.max(1, h | 0) * 4),
    }),
    getImageData: (x, y, w, h) => ({
      width: w,
      height: h,
      data: new Uint8ClampedArray(Math.max(1, w | 0) * Math.max(1, h | 0) * 4),
    }),
    createPattern: () => ({}),
    createRadialGradient: () => ({ addColorStop() {} }),
    createLinearGradient: () => ({ addColorStop() {} }),
  };
  return new Proxy(special, {
    get: (t, p) => (p in t ? t[p] : () => {}),
    set: (t, p, v) => ((t[p] = v), true),
  });
}

function fakeCanvas(w = 320, h = 180) {
  const c = { width: w, height: h, style: {}, dataset: {} };
  c.getContext = () => (c._ctx ||= makeContext(c));
  c.addEventListener = () => {};
  c.removeEventListener = () => {};
  c.getBoundingClientRect = () => ({ left: 0, top: 0, width: c.width, height: c.height });
  return c;
}

// --- minimal globals the engine touches -------------------------------------
globalThis.document = { createElement: () => fakeCanvas(1, 1), getElementById: () => fakeCanvas() };
globalThis.window = globalThis;
globalThis.matchMedia = () => ({ matches: false });
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.location = { hash: '' };
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.getComputedStyle = () => ({
  paddingLeft: '0px',
  paddingRight: '0px',
  paddingTop: '0px',
  paddingBottom: '0px',
});
globalThis.innerWidth = 1280;
globalThis.innerHeight = 800;

// Drive a few animation frames, then stop scheduling.
let frames = 0;
globalThis.requestAnimationFrame = cb => {
  const id = ++frames;
  if (frames <= 4) queueMicrotask(() => cb(performance.now()));
  return id;
};
globalThis.cancelAnimationFrame = () => {};

const { createEngine } = await import('../src/engine/engine.js');

const canvas = fakeCanvas();
const engine = createEngine(canvas);
assert.ok(engine, 'createEngine returned an API');
assert.equal(typeof engine.subscribe, 'function', 'subscribe exists');
assert.equal(typeof engine.dispose, 'function', 'dispose exists');

// Let the boot frame and a couple of loop frames run.
await new Promise(r => setTimeout(r, 60));

// Exercise the public actions the React toolbar calls.
for (const name of ['pause', 'pause', 'speed', 'time', 'rain', 'skip', 'mute']) engine.invoke(name);
engine.beginTrip(true); // jump straight into DRIVE
await new Promise(r => setTimeout(r, 60));

assert.equal(engine.drive.on, true, 'DRIVE mode engaged');
assert.ok(engine.ui.title === false, 'title card dismissed');

engine.invoke('engine'); // start engine (CRANK)
engine.invoke('power');
engine.invoke('brake');
engine.invoke('rev');
engine.invoke('light');
engine.invoke('doors');
engine.hornOn();
engine.hornOff();
await new Promise(r => setTimeout(r, 40));

// A subscriber must be notified by the engine.
let notified = 0;
const unsubscribe = engine.subscribe(() => { notified++; });
engine.invoke('pause');
assert.ok(notified > 0, 'subscriber was notified');
unsubscribe();

engine.dispose();

console.log('smoke-test: OK — engine booted, stepped, rendered and disposed cleanly');
