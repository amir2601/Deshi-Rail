// Headless route test: checks the real Dhaka - Khulna line and the selectable
// services, then runs a whole AUTO journey with a synthetic clock to prove the
// train only stops at its booked stops. Like the smoke test it stubs the DOM.
//
//   node scripts/route-test.mjs
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

// A clock we control: each pump() is one animation frame.
let clock = 0;
const pending = [];
globalThis.requestAnimationFrame = cb => { pending.push(cb); return pending.length; };
globalThis.cancelAnimationFrame = () => {};
function pump(n = 1) {
  for (let i = 0; i < n; i++) {
    clock += 1000 / 60;
    const cbs = pending.splice(0, pending.length);
    for (const cb of cbs) cb(clock);
  }
  return n;
}

const { createEngine } = await import('../src/engine/engine.js');
const canvas = fakeCanvas();
const eng = createEngine(canvas);
const { STATIONS, TRAINS, LAST_STATION } = eng;
const codes = STATIONS.map(s => s.code);

// --- 1. the line itself -----------------------------------------------------
assert.equal(STATIONS.length, 39, 'the route has 39 active stations');
assert.equal(new Set(codes).size, 39, 'every station code is unique');
assert.equal(codes[0], 'DHK', 'the line starts at Kamalapur');
assert.equal(codes[LAST_STATION], 'KHL', 'the line ends at Khulna');
for (let i = 1; i < STATIONS.length; i++) {
  assert.ok(STATIONS[i].km > STATIONS[i - 1].km, STATIONS[i].en + ' has a larger km than the one before');
  assert.ok(STATIONS[i].dist - STATIONS[i - 1].dist >= 620, STATIONS[i].en + ' leg >= MIN_LEG');
}
for (const s of STATIONS) assert.ok(s.bn && s.en && s.code, 'station ' + s.index + ' is fully named');

// --- 2. the services --------------------------------------------------------
assert.equal(TRAINS.length, 3, 'three real services offered');
for (const t of TRAINS) {
  assert.ok(t.no && t.en && t.bn, 'service has number, name and Bangla name');
  assert.ok(t.end > t.start, t.no + ' arrives after it departs');
  for (const c of t.stops) assert.ok(codes.includes(c), t.no + ' stop ' + c + ' is a real station');
}

// --- 3. stop lists ----------------------------------------------------------
for (let k = 0; k < TRAINS.length; k++) {
  eng.applyTrain(k);
  const calls = eng.sim.calls.slice();
  assert.equal(calls[0], 0, 'every service calls at Kamalapur');
  assert.equal(calls[calls.length - 1], LAST_STATION, 'every service calls at Khulna');
  const expected = TRAINS[k].all
    ? STATIONS.length
    : new Set([0, LAST_STATION, ...TRAINS[k].stops.map(c => codes.indexOf(c))]).size;
  assert.equal(calls.length, expected, TRAINS[k].no + ' has the right number of stops');
  for (let i = 0; i < STATIONS.length - 1; i++) {
    const n = eng.nextCallIdx(i);
    assert.ok(n > i && n <= LAST_STATION, 'next stop after ' + i + ' moves forward');
    assert.ok(calls.includes(n), 'nextCallIdx returns a booked stop');
  }
  assert.equal(eng.nextCallIdx(LAST_STATION), LAST_STATION, 'next stop at the terminus is the terminus');
}

// --- 4. skip visits exactly the booked stops --------------------------------
eng.applyTrain(2);                                   // Khulna Mail: 12 stops
const mail = eng.sim.calls.slice();
eng.ui.title = false;
const visited = [];
let guard = 0;
while (eng.sim.station < LAST_STATION && guard++ < 200) {
  const before = eng.sim.station;
  eng.invoke('skip');
  assert.ok(eng.sim.station > before, 'skip advanced past ' + before);
  visited.push(eng.sim.station);
}
assert.deepEqual(visited, mail.filter(i => i > 0), 'skip stopped only at booked stops');

// --- 5. a whole AUTO journey ------------------------------------------------
eng.applyTrain(0);                                   // Sundarban: 6 stops
eng.startJourney();
eng.ui.title = false;
eng.ui.speed = 4;
eng.input.fast = true;
const stopsMade = new Set();
const announced = new Set();                         // stations the banner called out
let frames = 0;
const CAP = 120000;
while (!eng.ui.complete && frames < CAP) {
  pump(1);
  frames++;
  if (eng.ui.bannerY > 0) announced.add(eng.ui.bannerSt);
  if (eng.sim.state === 'STOPPED') {
    assert.ok(eng.sim.calls.includes(eng.sim.station),
      'a stopped train stands at a booked stop (was ' + STATIONS[eng.sim.station].code + ')');
    stopsMade.add(eng.sim.station);
  }
}
assert.ok(eng.ui.complete, 'the journey completed in AUTO (' + frames + ' frames)');
assert.deepEqual([...stopsMade].sort((a, b) => a - b), eng.sim.calls,
  'the train stopped at every booked stop and nowhere else');
for (const i of eng.sim.calls) if (i > 0) assert.ok(announced.has(i),
  'the banner announced the booked stop ' + STATIONS[i].code);
// the banner also calls out the majors the train runs past without stopping
for (const code of ['TGI', 'PRD', 'DRJ']) {
  const i = codes.indexOf(code);
  assert.ok(!eng.sim.calls.includes(i), code + ' is a major the Sundarban passes');
  assert.ok(announced.has(i), 'the banner announced ' + code + ' even though the train passes it');
}

// --- 6. a DRIVE shift: crank, open doors, close, power, pull away -----------
eng.ui.title = true;                                 // back to the title card
eng.invoke('mode');                                  // the DRIVE button
assert.ok(eng.drive.on, 'DRIVE mode engaged');
assert.equal(eng.drive.engine, 'OFF', 'the engine is cold for the driver');
pump(20);
eng.invoke('engine');                                // crank it
pump(400);
assert.equal(eng.drive.engine, 'ON', 'the engine started');
eng.invoke('doors');                                 // open at Kamalapur
pump(120);
eng.invoke('doors');                                 // and close up
pump(120);
for (let i = 0; i < 3; i++) eng.invoke('power');      // notch up
const drove = pump(900);
assert.ok(eng.sim.dist > STATIONS[0].dist + 50,
  'the train pulled out of Kamalapur under power (dist ' + Math.round(eng.sim.dist) + ')');
assert.ok(Number.isFinite(eng.drive.rpm) && eng.drive.rpm >= 0, 'engine rpm is sane');
assert.equal(drove, 900, 'every DRIVE frame rendered');

eng.dispose();
console.log('route-test: OK — 39 stations, 3 services, stops only where booked, AUTO journey and DRIVE shift ran');
