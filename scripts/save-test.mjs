// Save / resume test: boots the engine headlessly, drives the journey to a
// mid-route point, snapshots it, then boots a *second* engine and restores the
// snapshot into it - checking the trip really carries on from there.
//
//   node scripts/save-test.mjs
import assert from 'node:assert';

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

let frames = 0;
globalThis.requestAnimationFrame = cb => {
  const id = ++frames;
  if (frames <= 6) queueMicrotask(() => cb(performance.now()));
  return id;
};
globalThis.cancelAnimationFrame = () => {};

const { createEngine } = await import('../src/engine/engine.js');
const { LINES } = await import('../src/lines.js');
const pause = ms => new Promise(r => setTimeout(r, ms));

// --- the journey we will save ------------------------------------------------
const saved = createEngine(fakeCanvas());
saved.beginTrip(false);                 // AUTO, engine on, train rolling
await pause(60);
saved.sim.dist = 42000;                 // somewhere down the line
saved.sim.hour = 17.5;
saved.ui.timeMode = 2;
saved.ui.paused = false;
saved.invoke('pause');                  // prove pause survives the round trip
await pause(40);

const snapshot = saved.exportProgress();
assert.equal(snapshot.v, 1, 'snapshot has a version');
assert.equal(snapshot.lineId, 'dhaka-khulna', 'snapshot records the line');
assert.equal(typeof snapshot.sim.dist, 'number', 'snapshot carries a position');
assert.ok(!Array.isArray(snapshot.sim.people), 'live crowd is not serialised');

// It must survive the trip through JSON, like localStorage would take it.
const wire = JSON.parse(JSON.stringify(snapshot));
assert.equal(typeof wire.sim.dist, 'number', 'position survives JSON');
assert.ok(!('people' in wire.sim), 'crowd was dropped by JSON, not carried as garbage');
assert.equal(wire.sim.state, snapshot.sim.state, 'state survives JSON');
saved.dispose();

// --- a fresh engine resumes it ----------------------------------------------
const resumed = createEngine(fakeCanvas());
await pause(40);
// New trip boots at the start; importing should move it to the saved spot.
assert.notEqual(resumed.sim.dist, snapshot.sim.dist, 'fresh engine starts elsewhere');
assert.equal(resumed.importProgress(wire), true, 'importProgress accepts the snapshot');
await pause(60);

assert.equal(resumed.sim.dist, snapshot.sim.dist, 'train resumed at the saved position');
assert.equal(resumed.sim.hour, snapshot.sim.hour, 'time of day restored');
assert.equal(resumed.ui.paused, snapshot.ui.paused, 'paused state restored');
assert.equal(resumed.ui.timeMode, snapshot.ui.timeMode, 'time mode restored');
assert.equal(resumed.sim.state, snapshot.sim.state, 'journey state restored');
assert.ok(resumed.sim.populated instanceof Set, 'populated came back as a Set');
assert.ok(resumed.sim.missedStations instanceof Set, 'missedStations came back as a Set');
assert.equal(typeof resumed.sim.fxRng, 'function', 'seeded RNG is still a function');

// Bad input is refused rather than crashing the engine.
assert.equal(resumed.importProgress(null), false, 'null is refused');
assert.equal(resumed.importProgress({ sim: 'nope' }), false, 'malformed payload is refused');
assert.equal(resumed.importProgress({ v: 99, sim: { dist: 1 } }), false, 'unknown version is refused');

resumed.dispose();

// A snapshot taken on another line records that line, so the app can boot
// there before resuming.
const otherLine = LINES.find(l => l.id !== 'dhaka-khulna');
if (otherLine) {
  const onOther = createEngine(fakeCanvas(), otherLine);
  await pause(30);
  assert.equal(onOther.exportProgress().lineId, otherLine.id, 'snapshot records the chosen line');
  onOther.dispose();
}

console.log('save-test: OK — progress exported, JSON-round-tripped and resumed on a fresh engine');
