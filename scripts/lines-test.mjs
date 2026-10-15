// Headless test for the selectable lines: every line in src/lines.js, plus the
// engine's built-in Dhaka - Khulna line, must boot and be internally
// consistent. createEngine() runs buildTerrain() and applyTrain() eagerly, so a
// line with a bad terrain/bridge anchor throws here rather than at play time.
//
//   node scripts/lines-test.mjs
import assert from 'node:assert';

function makeContext(canvas) {
  const special = {
    canvas,
    createImageData: (w, h) => ({
      width: w, height: h,
      data: new Uint8ClampedArray(Math.max(1, w | 0) * Math.max(1, h | 0) * 4),
    }),
    getImageData: (x, y, w, h) => ({
      width: w, height: h,
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
globalThis.getComputedStyle = () => ({ paddingLeft: '0px', paddingRight: '0px', paddingTop: '0px', paddingBottom: '0px' });
globalThis.innerWidth = 1280;
globalThis.innerHeight = 800;

let clock = 0;
const pending = [];
globalThis.requestAnimationFrame = cb => { pending.push(cb); return pending.length; };
globalThis.cancelAnimationFrame = () => {};
function pump(n = 1) {
  for (let i = 0; i < n; i++) {
    clock += 1000 / 60;
    for (const cb of pending.splice(0, pending.length)) cb(clock);
  }
}

const { createEngine } = await import('../src/engine/engine.js');
const { LINES } = await import('../src/lines.js');

// The little Dhaka suburban halts no service is booked to call at: express
// trains pass them, and every mail here lists main stations only.
const MINOR_DHAKA = new Set(['TJG', 'BNI', 'DCN']);

// --- the catalogue itself ----------------------------------------------------
assert.ok(LINES.length >= 10, 'several lines are offered: ' + LINES.length);
assert.equal(new Set(LINES.map(l => l.id)).size, LINES.length, 'line ids are unique');
assert.equal(new Set(LINES.map(l => l.name)).size, LINES.length, 'line names are unique');
for (const l of LINES) {
  assert.ok(l.id && l.name, 'line has an id and a name');
  assert.ok(l.bnName, l.id + ' has a Bangla name for the title card');
  assert.ok(Array.isArray(l.route) && l.route.length >= 2, l.id + ' has a route');
  assert.ok(Array.isArray(l.terrain) && l.terrain.length >= 1, l.id + ' has terrain');
  assert.equal(l.terrain[0].at, undefined, l.id + ' terrain starts with an unbounded section');
  assert.ok(l.bridge && Array.isArray(l.bridge.at), l.id + ' has a bridge');
  assert.ok(Array.isArray(l.trains) && l.trains.length >= 1, l.id + ' has at least one service');
}

// --- boot and validate each line (null = the built-in Dhaka - Khulna line) ---
for (const line of [null, ...LINES]) {
  const canvas = fakeCanvas();
  const eng = createEngine(canvas, line || undefined);
  const { STATIONS, TRAINS, LAST_STATION } = eng;
  const codes = STATIONS.map(s => s.code);
  const id = line ? line.id : '(built-in)';

  assert.ok(STATIONS.length >= 2, id + ': at least two stations');
  assert.equal(new Set(codes).size, codes.length, id + ': station codes are unique');
  assert.equal(STATIONS[0].index, 0, id + ': first station is index 0');
  assert.equal(STATIONS[LAST_STATION].index, LAST_STATION, id + ': last station is the terminus');
  for (let i = 0; i < STATIONS.length; i++) {
    const s = STATIONS[i];
    assert.ok(s.en && s.bn && s.code, `${id}: station ${i} (${s.code}) is fully named`);
    assert.ok(s.bnMask, `${id}: station ${s.code} has a Bangla mask`);
    if (i > 0) {
      assert.ok(s.km > STATIONS[i - 1].km, `${id}: ${s.en} has a larger km than the one before`);
      assert.ok(s.dist - STATIONS[i - 1].dist >= 620, `${id}: ${s.en} leg >= MIN_LEG`);
    }
  }
  // a station that names its tea stall lays the shop sign out with the stall,
  // and the board it hangs over the awning still has to fit on the platform
  for (const s of STATIONS) if (s.stallName) {
    const it = s.layout.find(i => i.type === 'stallSign');
    assert.ok(it, `${id}: ${s.code} lays out its stall sign`);
    const bw = s.stallName.length * 4 + 7, left = it.x + 13 - (bw >> 1);
    assert.ok(left >= s.platform[0] && left + bw <= s.platform[1],
      `${id}: ${s.code} stall sign stays on the platform`);
  }

  // the origin loads the train (nobody gets off there); the terminus empties it
  assert.ok(STATIONS[0].crowd > 0, id + ': passengers wait to board at the origin');
  assert.equal(STATIONS[0].alight, 0, id + ': nobody gets off at the origin');
  assert.equal(STATIONS[LAST_STATION].crowd, 0, id + ': nobody waits to board at the terminus');
  assert.ok(STATIONS[LAST_STATION].alight > 0, id + ': passengers get off at the terminus');

  assert.ok(TRAINS.length >= 1, id + ': at least one service');
  for (const t of TRAINS) {
    assert.ok(t.no && t.en && t.bn, `${id}: service has number, name and Bangla name`);
    assert.ok(t.end > t.start, `${id}: ${t.no} arrives after it departs`);
    for (const c of t.stops) {
      assert.ok(codes.includes(c), `${id}: ${t.no} stop ${c} is a real station`);
      assert.notEqual(c, STATIONS[0].code, `${id}: ${t.no} should not list the origin in stops`);
      assert.notEqual(c, codes[LAST_STATION], `${id}: ${t.no} should not list the terminus in stops`);
      // every service, mails included, calls only at main stations
      assert.ok(!MINOR_DHAKA.has(c), `${id}: ${t.no} should not book the minor Dhaka halt ${c}`);
    }
    // every booked stop must resolve (buildCalls silently drops unknown codes)
    eng.applyTrain(TRAINS.indexOf(t));
    for (const c of t.stops) assert.ok(eng.sim.calls.includes(codes.indexOf(c)), `${id}: ${t.no} actually books ${c}`);
  }

  // run a few frames so a journey starts rendering, then shut down cleanly
  eng.applyTrain(0);
  pump(30);
  eng.dispose();
}

// --- the built-in line is offered by the engine for the picker ---------------
{
  const eng = createEngine(fakeCanvas());
  assert.ok(eng.DEFAULT_LINE, 'engine exposes DEFAULT_LINE');
  assert.equal(eng.DEFAULT_LINE.id, 'dhaka-khulna', 'built-in line has a stable id');
  assert.equal(eng.DEFAULT_LINE.name, 'Dhaka – Khulna', 'built-in line has a display name');
  assert.equal(eng.DEFAULT_LINE.bnName, 'ঢাকা থেকে খুলনা', 'built-in line has a Bangla name');
  assert.equal(eng.DEFAULT_LINE.route.length, 39, 'built-in route has 39 stations');
  eng.dispose();
}

// --- the one named tea stall, wherever a line happens to stop ---------------
{
  const named = [];
  for (const line of [null, ...LINES]) {
    const eng = createEngine(fakeCanvas(), line || undefined);
    for (const s of eng.STATIONS) if (s.stallName) named.push([s.code, s.stallName]);
    eng.dispose();
  }
  assert.ok(named.length, 'some station names its tea stall');
  assert.ok(named.every(([code]) => code === 'NSD'), 'only Narsingdi names its tea stall');
  assert.ok(named.every(([, name]) => name === 'RIFAT TEA STALL'), 'the stall keeps its name');
}

// --- re-creating engines on the SAME canvas (as the picker does) --------------
{
  const canvas = fakeCanvas();
  const a = createEngine(canvas);
  pump(10);
  a.dispose();
  const b = createEngine(canvas, LINES[0]);
  pump(10);
  b.dispose();
  const c = createEngine(canvas);
  pump(10);
  c.dispose();
  assert.equal(a.STATIONS.length, 39, 'built-in line has 39 stations');
  assert.equal(b.STATIONS.length, LINES[0].route.length, 'second engine uses the picked line');
  assert.equal(b.STATIONS[0].code, LINES[0].route[0].code, 'picked line starts where it says');
  assert.notEqual(b.STATIONS[b.LAST_STATION].code, a.STATIONS[a.LAST_STATION].code, 'the two lines really differ');
}

console.log(`lines-test: OK — ${LINES.length + 1} lines booted and validated (built-in + ${LINES.length} selectable)`);
