'use strict';

// =====================================================================
// 7. PEOPLE
// =====================================================================
// Each person is a procedural "design" (clothes, skin, what they carry),
// painted into small sprites on demand and cached per lighting.
// Frames: 0-3 walk cycle, 4 sitting, 5/6 sipping tea, 7/8 waving a flag.
const SKINS = ['tan', 'brown', 'rust', 'brown'];
const SHIRTS = ['white', 'cream', 'skyLight', 'skyMid', 'grayLight', 'paddy', 'rose', 'orange', 'blue', 'tan'];
const TROUSERS = ['navy', 'grayDark', 'brown', 'gray', 'indigo'];
const LUNGIS = [['blue', 'navy'], ['green', 'greenDark'], ['purple', 'indigo'], ['skyMid', 'blue'],
                ['red', 'rust'], ['grayLight', 'white']];                         // checked cotton
const SARIS = [['red', 'glow'], ['rose', 'white'], ['orange', 'red'], ['purple', 'glow'], ['blue', 'skyLight'],
               ['green', 'glow'], ['glow', 'red'], ['skyMid', 'white'], ['amber', 'green']];  // [body, border]
const KAMEEZ = [['rose', 'white', 'skyMid'], ['skyMid', 'navy', 'white'], ['paddy', 'green', 'red'],
                ['purple', 'white', 'rose'], ['orange', 'cream', 'red'], ['green', 'white', 'glow']]; // [kameez, salwar, dupatta]
const BAGS = ['brown', 'ink', 'red', 'navy', 'grassLight'];
const PASSENGER_KINDS = ['lungi', 'lungi', 'trousers', 'trousers', 'trousers', 'sari', 'sari', 'kameez',
                         'kameez', 'child', 'child', 'elder'];
const PERSON_W = 13, PERSON_H = 20, PERSON_CX = 6, PERSON_FY = 19;   // sprite box, centre column, feet row
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];

let designId = 0;
function makeDesign(rng, kind) {
  kind = kind || pick(rng, PASSENGER_KINDS);
  const d = { id: ++designId, kind, skin: pick(rng, SKINS), hair: rng() < 0.85 ? 'ink' : 'brownDark', h: 12, carry: null };
  switch (kind) {
    case 'lungi':    d.top = pick(rng, SHIRTS); [d.cloth, d.cloth2] = pick(rng, LUNGIS); break;
    case 'trousers': d.top = pick(rng, SHIRTS); d.bottom = pick(rng, TROUSERS); break;
    case 'sari':     [d.cloth, d.accent] = pick(rng, SARIS); d.covered = rng() < 0.6; break;
    case 'kameez':   [d.top, d.bottom, d.accent] = pick(rng, KAMEEZ); break;
    case 'child':    d.h = 8; d.girl = rng() < 0.5; d.bottom = pick(rng, TROUSERS);
                     d.top = d.girl ? pick(rng, ['rose', 'red', 'glow', 'skyMid', 'purple']) : pick(rng, SHIRTS); break;
    case 'elder':    d.hair = 'white'; d.top = rng() < 0.6 ? 'white' : 'cream'; d.bottom = 'white'; break;
    case 'porter':   d.top = 'red'; d.cloth = 'grayLight'; d.cloth2 = 'white'; d.carry = 'case'; break;
    case 'vendor':   d.top = 'white'; [d.cloth, d.cloth2] = pick(rng, LUNGIS); d.carry = 'tray'; break;
    case 'guard':    d.top = 'white'; d.bottom = 'navy'; break;
  }
  if (['lungi', 'trousers', 'sari', 'kameez'].includes(kind)) {
    const r = rng();
    if (r < 0.3) d.carry = 'bag';
    else if (r < 0.42 && kind !== 'kameez') d.carry = kind === 'trousers' ? 'backpack' : 'bundle';
    d.bagColor = pick(rng, BAGS);
  }
  return d;
}

function paintPerson(g, d, p, frame) {
  const ox = PERSON_CX - 2, oy = PERSON_FY - d.h + 1;
  const P = (x, y, k) => { g.fillStyle = p[k]; g.fillRect(ox + x, oy + y, 1, 1); };
  const R = (x, y, w, h, k) => { g.fillStyle = p[k]; g.fillRect(ox + x, oy + y, w, h); };
  const s = d.skin, walk = frame < 4 ? frame : 0, stride = walk === 1 || walk === 3;

  if (d.kind === 'child') {                               // 8 px tall
    R(1, 0, 3, 1, d.hair); P(1, 1, d.hair); R(2, 1, 2, 1, s); R(1, 2, 3, 1, s);
    if (d.girl) {                                         // frock and a pigtail
      P(0, 1, d.hair); R(1, 3, 3, 4, d.top);
      if (stride) { P(0, 6, d.top); P(4, 6, d.top); }
    } else {
      R(1, 3, 3, 3, d.top);
      if (stride) { P(1, 6, d.bottom); P(3, 6, d.bottom); } else R(2, 6, 2, 1, d.bottom);
    }
    if (stride) { P(0, 7, s); P(4, 7, s); } else { P(2, 7, s); P(3, 7, s); }
    if (walk === 1) P(4, 4, s); else if (walk === 3) P(0, 4, s);
    return;
  }

  const sit = frame === 4, dy = sit ? 3 : 0, lean = d.kind === 'elder' && !sit ? 1 : 0;
  const cover = d.kind === 'sari' && d.covered ? d.cloth : d.kind === 'guard' ? 'navy' : d.hair;
  const longHair = d.kind === 'sari' || d.kind === 'kameez';
  // 3x3 head facing right; elders stoop forward a pixel
  R(1 + lean, dy, 3, 1, cover);
  P(1 + lean, dy + 1, cover); R(2 + lean, dy + 1, 2, 1, s);
  P(1 + lean, dy + 2, longHair ? cover : s); R(2 + lean, dy + 2, 2, 1, s);
  if (d.kind === 'guard') P(4, 0, 'navy');                // cap peak
  if (d.kind === 'elder') P(3 + lean, dy + 2, 'white');   // white beard

  const checked = d.kind === 'lungi' || d.kind === 'porter' || d.kind === 'vendor';
  const lower = (x, y) => checked ? ((x + y) & 1 ? d.cloth : d.cloth2) : (d.kind === 'sari' ? d.cloth : d.bottom);

  if (sit) {
    R(1, 6, 3, 3, d.kind === 'sari' ? d.cloth : d.top);
    if (d.kind === 'sari') P(1, 6, d.accent);
    if (d.kind === 'kameez') R(1, 6, 3, 1, d.accent);
    for (let x = 1; x <= 4; x++) P(x, 9, lower(x, 9));    // thighs along the seat
    P(4, 10, lower(4, 10));
    P(4, 11, s); P(5, 11, s);
    P(3, 8, s);                                          // hands in the lap
    return;
  }

  switch (d.kind) {
    case 'sari':                                         // drape to the ankles, pallu over the shoulder
      R(1, 3, 3, 8, d.cloth);
      R(1, 3, 1, 3, d.accent);
      R(1, 10, 3, 1, d.accent);
      if (stride) { P(0, 10, d.accent); P(4, 10, d.accent); }
      break;
    case 'kameez':                                       // long tunic, dupatta, salwar
      R(1, 3, 3, 6, d.top);
      R(1, 3, 3, 1, d.accent); R(1, 4, 1, 2, d.accent);
      if (stride) { P(1, 9, d.bottom); P(3, 9, d.bottom); P(0, 10, d.bottom); P(4, 10, d.bottom); }
      else R(2, 9, 2, 2, d.bottom);
      break;
    case 'elder':                                        // long panjabi
      R(1, 3, 3, 7, d.top);
      if (stride) { P(1, 10, d.bottom); P(3, 10, d.bottom); } else R(2, 10, 2, 1, d.bottom);
      break;
    case 'trousers': case 'guard':
      R(1, 3, 3, 4, d.top);
      R(1, 7, 3, 1, d.bottom);
      if (stride) { R(1, 8, 3, 1, d.bottom); P(1, 9, d.bottom); P(3, 9, d.bottom); P(0, 10, d.bottom); P(4, 10, d.bottom); }
      else R(2, 8, 2, 3, d.bottom);
      break;
    default:                                             // lungi (porter and vendor too)
      R(1, 3, 3, 4, d.top);
      for (let y = 7; y <= 10; y++) for (let x = 1; x <= 3; x++) P(x, y, lower(x, y));
      if (stride) { P(0, 10, lower(0, 10)); P(4, 10, lower(4, 10)); }
  }
  const shoe = d.kind === 'trousers' || d.kind === 'guard' ? 'ink' : s;
  if (stride) { P(0, 11, shoe); P(4, 11, shoe); } else { P(2, 11, shoe); P(3, 11, shoe); }
  if (shoe === 'ink') P(stride ? 5 : 4, 11, shoe);       // shoes point forward

  // arms and whatever they carry
  const hand = frame === 6 ? [4, 3] : frame === 5 ? [4, 5] : walk === 1 ? [4, 6] : walk === 3 ? [0, 6] : [3, 7];
  switch (d.carry) {
    case 'bag':      R(4, 7, 2, 2, d.bagColor); P(4, 6, s); break;
    case 'backpack': R(0, 3, 1, 4, d.bagColor); P(hand[0], hand[1], s); break;
    case 'bundle':   R(0, -2, 5, 2, d.bagColor); P(2, -3, d.bagColor); P(4, 0, s); P(4, 1, s); break;
    case 'case':     R(-1, -3, 6, 3, 'rust'); R(-1, -1, 6, 1, 'brownDark'); P(2, -4, 'ink');   // suitcase on the head
                     P(4, 3, d.top); P(4, 2, s); P(4, 1, s); break;
    case 'tray':     R(3, 5, 5, 1, 'tan'); P(4, 4, 'red'); P(5, 4, 'paddy'); P(6, 4, 'white'); P(3, 6, s); break;
    default:
      if (d.kind === 'elder') { R(5, 6, 1, 6, 'brown'); P(4, 6, s); }   // walking cane
      else if (d.kind !== 'guard') P(hand[0], hand[1], s);
  }
  if (frame === 5 || frame === 6) P(hand[0], hand[1] - 1, 'white');      // glass of tea
  if (d.kind === 'guard') {
    if (frame === 7) {                                   // flag out to the right
      P(4, 3, d.top); P(4, 2, s); R(5, -1, 1, 3, 'brownDark');
      R(6, -3, 3, 3, 'grassLight'); R(6, -1, 3, 1, 'greenDark');
    } else if (frame === 8) {                            // flag swung overhead
      P(4, 3, d.top); P(4, 2, s); R(4, -2, 1, 4, 'brownDark');
      R(0, -4, 4, 3, 'grassLight'); R(0, -2, 4, 1, 'greenDark');
    } else {                                             // rolled flag at his side
      P(4, 6, s); R(4, 7, 1, 3, 'grassLight');
    }
  }
}

function personSprite(v, d, frame, dir) {
  let set = v.people.get(d.id);
  if (!set) v.people.set(d.id, set = []);
  const key = frame * 2 + (dir < 0 ? 1 : 0);
  if (!set[key]) {
    const [c, g] = makeCanvas(PERSON_W, PERSON_H);
    if (dir < 0) { g.translate(PERSON_W, 0); g.scale(-1, 1); }   // exact pixel mirror
    paintPerson(g, d, v.p, frame);
    set[key] = c;
  }
  return set[key];
}

function personFrame(q) {
  if (q.walking) return Math.floor(q.anim) % 4;
  if (q.mode === 'sit') return 4;
  if (q.mode === 'sip') return q.t % 3.4 > 2.3 ? 6 : 5;
  if (q.mode === 'guard' && sim.state === 'STOPPED' && sim.station === q.st &&
      (sim.stopPhase === 'FLAG' || sim.stopPhase === 'HORN' || sim.stopPhase === 'CLEAR')) return 7 + (Math.floor(sim.clock * 4) & 1);
  return 0;
}

function drawPersonAt(g, v, q, off) {
  const spr = personSprite(v, q.d, personFrame(q), q.dir);
  const x = Math.round(q.x) + off - PERSON_CX, y = Math.round(q.y) - PERSON_FY;
  if (q.clip === null) { g.drawImage(spr, x, y); return; }
  // stepping through a doorway: only the part inside the door column shows
  g.save();
  g.beginPath();
  g.rect(q.clip + off, PLAT.DOOR_TOP, 4, PLAT.EDGE_Y - PLAT.DOOR_TOP + 1);
  g.clip();
  g.drawImage(spr, x, y);
  g.restore();
}

// --- behaviour ---------------------------------------------------------
// People follow a list of waypoints; a waypoint may clip them to a door
// column (climbing in or out) and may run a callback when reached.
const gone = q => { q.gone = true; };
const nearestDoor = x => DOORS.reduce((a, b) => Math.abs(b + 2 - x) < Math.abs(a + 2 - x) ? b : a);
const randWalkY = rng => PLAT.WALK_MIN + Math.floor(rng() * (PLAT.WALK_MAX - PLAT.WALK_MIN + 1));

function spawnPerson(st, d, x, y, dir, mode) {
  const speed = d.kind === 'elder' ? 7 : d.kind === 'child' ? 13 : 11 + Math.random() * 5;
  const q = { st: st.index, d, x, y, dir, mode, speed, path: [], anim: 0, t: Math.random() * 3,
              delay: 0, clip: null, hidden: false, walking: false, turnAt: 2 + Math.random() * 6 };
  sim.people.push(q);
  return q;
}

function populateStation(st) {
  sim.populated.add(st.index);
  const rng = mulberry32((Math.random() * 1e9) | 0);    // a different crowd every trip
  const [L, R] = st.platform;
  const seated = kind => { const d = makeDesign(rng, kind); d.carry = null; return d; };
  for (let i = 0; i < st.crowd; i++)                    // waiting to board, spread along the train
    spawnPerson(st, makeDesign(rng), 24 + rng() * 244, randWalkY(rng), rng() < 0.5 ? 1 : -1, 'wait');
  for (let i = 0; i < st.idle; i++) {                   // just standing about
    let x;
    do x = L + 10 + rng() * (R - L - 20); while (x > PLAT.STALL_X - 4 && x < PLAT.STALL_X + 34);
    spawnPerson(st, makeDesign(rng), x, randWalkY(rng), rng() < 0.5 ? 1 : -1, 'idle');
  }
  for (const it of st.layout)                           // someone resting on a bench
    if (it.type === 'bench' && rng() < 0.5)
      spawnPerson(st, seated(pick(rng, ['lungi', 'trousers', 'sari', 'kameez', 'elder'])), it.x + 3, it.y, rng() < 0.5 ? 1 : -1, 'sit');
  spawnPerson(st, seated(pick(rng, ['lungi', 'trousers'])), PLAT.STALL_X + 31, PLAT.STALL_Y + 2, -1, 'sip');
  const vendor = spawnPerson(st, makeDesign(rng, 'vendor'), 60 + rng() * 150, PLAT.WALK_MAX, 1, 'patrol');
  vendor.ax = Math.max(L + 20, -120);
  vendor.bx = Math.min(R - 46, 440);
  vendor.speed = 9;
  spawnPerson(st, makeDesign(rng, 'guard'), 14, 167, 1, 'guard');   // front of the platform, flag against concrete
  if (st.extras.includes('porter')) {
    const q = spawnPerson(st, makeDesign(rng, 'porter'), 300, 169, -1, 'porterWait');   // in front of the stall
    q.d2 = { ...q.d, id: ++designId, carry: null };     // same porter, luggage delivered
  }
}

// Doors are open: a few passengers step off, then the waiting ones board.
// A driver rarely stops exactly on the mark, so the doors stand at
// DOORS + sim.stopOffset in stop coordinates.
function startBoarding(st) {
  const terminus = st.index === LAST_STATION, o = Math.round(sim.stopOffset);
  // everyone gets off at the end of the line; a driver can't deliver more than they carry
  const alight = terminus ? Math.max(st.alight, Math.min(20, drive.pax)) : drive.on ? Math.min(st.alight, drive.pax) : st.alight;
  for (let i = 0; i < alight; i++) {
    const door = DOORS[Math.floor(Math.random() * DOORS.length)] + o, x = door + 2;
    const q = spawnPerson(st, makeDesign(Math.random), x, PLAT.DOOR_FLOOR, x - o < 150 ? -1 : 1, 'alight');
    const y = randWalkY(Math.random), exit = (x - o < 150 ? -24 : W + 24) + o;   // just off screen
    q.hidden = true;
    q.delay = i * (terminus ? 0.5 : 0.45) + Math.random() * 0.6;
    q.path = [{ x, y: PLAT.EDGE_Y, clip: door, speed: 18, then: passengerOut },
              { x: x + Math.sign(exit - x) * 4, y },
              { x: exit, y, then: gone }];
  }
  for (const q of sim.people) {
    if (q.st !== st.index) continue;
    if (q.mode === 'wait') {
      const door = nearestDoor(q.x - o) + o, x = door + 2;
      q.mode = 'board';
      q.delay = (st.alight ? 1.4 : 0.3) + Math.random() * 3;
      q.path = [{ x, y: q.y }, { x, y: PLAT.EDGE_Y }, { x, y: PLAT.DOOR_FLOOR, clip: door, speed: 18, then: passengerIn }];
    } else if (q.mode === 'porterWait') {
      const door = DOORS[9] + o, x = door + 2;
      q.mode = 'porter';
      q.delay = 0.5;
      q.path = [{ x, y: q.y }, { x, y: PLAT.EDGE_Y, then: r => { r.delay = 1.2; r.handed = true; } }];
    }
  }
}

function boardingDone(st) {
  return !sim.people.some(q => q.st === st.index &&
    (q.mode === 'board' || q.mode === 'porter' ||
     (q.mode === 'alight' && (q.hidden || q.path.length > 2))));
}

function moveAlong(q, dt) {
  const wp = q.path[0], dx = wp.x - q.x, dy = wp.y - q.y, dist = Math.hypot(dx, dy);
  const step = (wp.speed || q.speed) * dt;
  q.clip = wp.clip === undefined ? null : wp.clip;
  if (Math.abs(dx) > 0.01) q.dir = dx > 0 ? 1 : -1;
  q.walking = true;
  q.anim += Math.min(dist, step) / 3;
  if (dist <= step) {
    q.x = wp.x; q.y = wp.y;
    q.path.shift();
    q.clip = null;
    if (wp.then) wp.then(q);
  } else {
    q.x += dx / dist * step;
    q.y += dy / dist * step;
  }
}

function updatePerson(q, dt) {
  q.t += dt;
  q.walking = false;
  if (q.delay > 0) {
    q.delay -= dt;
    if (q.delay <= 0) q.hidden = false;
    return;
  }
  if (q.path.length) { moveAlong(q, dt); return; }
  switch (q.mode) {
    case 'idle': case 'wait': case 'porterWait':
      if (q.t > q.turnAt) { q.dir = -q.dir; q.turnAt = q.t + 2 + Math.random() * 6; }
      break;
    case 'patrol':                                       // tray vendor pacing the platform
      q.path = [{ x: q.x < (q.ax + q.bx) / 2 ? q.bx : q.ax, y: q.y }];
      q.delay = 1 + Math.random() * 2;
      break;
    case 'porter':                                       // case handed in at the door; head back
      if (q.handed) {
        forgetPerson({ d: q.d });
        q.d = q.d2;
        q.mode = 'leave';
        q.path = [{ x: q.x, y: 161 }, { x: W + 30 + Math.round(sim.stopOffset), y: 161, then: gone }];
      }
      break;
  }
}

function updatePeople(dt) {
  for (const st of STATIONS)
    if (!sim.populated.has(st.index) && Math.abs(st.dist - sim.dist) < 1000) populateStation(st);
  for (const q of sim.people) updatePerson(q, dt);
  let n = 0;
  for (const q of sim.people) {
    if (q.gone || Math.abs(STATIONS[q.st].dist - sim.dist) > 1200) { forgetPerson(q); continue; }
    sim.people[n++] = q;
  }
  sim.people.length = n;
}

function forgetPerson(q) {
  for (const k in VARIANTS) {
    VARIANTS[k].people.delete(q.d.id);
    if (q.d2) VARIANTS[k].people.delete(q.d2.id);
  }
}
