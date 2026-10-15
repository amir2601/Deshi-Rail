'use strict';

// =====================================================================
// 4. TRAIN
// =====================================================================
// Bangladeshi intercity rake: Bo-Bo diesel locomotive + 5 carriages,
// heading right. The whole train stays fixed on screen.
const TRAIN = (() => {
  const locoX = CONFIG.TRAIN_FRONT_X - CONFIG.LOCO_W;
  const vehicles = [{ x: locoX, w: CONFIG.LOCO_W, y: LAYER_Y.loco, wheels: [6, 14, 31, 39] }];
  let x = locoX;
  for (let i = 0; i < CONFIG.CAR_COUNT; i++) {
    x -= CONFIG.CAR_GAP + CONFIG.CAR_W;
    vehicles.push({ x, w: CONFIG.CAR_W, y: LAYER_Y.car, wheels: [5, 13, 25, 33] });
  }
  return {
    vehicles,
    centerX: (x + CONFIG.TRAIN_FRONT_X) / 2,
    stackX: locoX + 15, stackY: LAYER_Y.loco - 1,   // exhaust stack on the roof
  };
})();

// 7x7 wheel with four spokes; frames cover a quarter turn (spoke symmetry)
function buildWheels(p) {
  const frames = [];
  for (let f = 0; f < CONFIG.WHEEL_FRAMES; f++) {
    const [c, g] = makeCanvas(7, 7);
    for (let y = 0; y < 7; y++)
      for (let x = 0; x < 7; x++) {
        const d = Math.hypot(x - 3, y - 3);
        if (d <= 3.4) px(g, x, y, d > 2.4 ? p.ink : p.grayDark);
      }
    const base = (f / CONFIG.WHEEL_FRAMES) * Math.PI / 2;
    for (let k = 0; k < 4; k++) {
      const a = base + k * Math.PI / 2;
      for (const r of [1, 2]) px(g, 3 + Math.round(Math.cos(a) * r), 3 + Math.round(Math.sin(a) * r), p.grayLight);
    }
    px(g, 3, 3, p.gray);
    frames.push(c);
  }
  return frames;
}

// Locomotive body, 48x28. Row 23 is the underframe (screen y 139).
function buildLoco(p, lit) {
  const [c, g] = makeCanvas(48, 28);
  // roof equipment: radiator fan housing, exhaust stack, twin-trumpet horn
  rect(g, 4, 1, 8, 2, p.grayDark);
  rect(g, 5, 1, 6, 1, p.gray);
  for (let x = 5; x < 11; x += 2) px(g, x, 2, p.ink);
  rect(g, 15, 0, 2, 3, p.grayDark);
  rect(g, 15, 0, 2, 1, p.ink);
  rect(g, 37, 2, 2, 1, p.grayDark);
  rect(g, 35, 1, 5, 1, p.grayLight);
  rect(g, 40, 0, 1, 3, p.grayLight);
  // roof and gutter, rounded towards the nose
  rect(g, 1, 3, 41, 1, p.grayLight);
  rect(g, 0, 4, 43, 1, p.gray);
  // boxy body
  rect(g, 0, 5, 44, 1, p.blue);
  rect(g, 0, 6, 45, 17, p.blue);
  rect(g, 0, 5, 1, 18, p.navy);
  rect(g, 0, 22, 45, 1, p.navy);
  // livery: cream band and thin red line (lines up with the carriages)
  rect(g, 1, 14, 44, 2, p.cream);
  rect(g, 1, 16, 44, 1, p.red);
  // hood louvres
  for (const [x0, x1] of [[3, 13], [17, 29]]) {
    rect(g, x0 - 1, 6, x1 - x0 + 3, 1, p.navy);
    for (let x = x0; x <= x1; x += 2) rect(g, x, 7, 1, 5, p.navy);
  }
  rect(g, 32, 5, 1, 9, p.navy);                       // hood / cab seam
  // cab door, door window and grab rail
  rect(g, 33, 6, 3, 1, p.navy);
  rect(g, 33, 6, 1, 16, p.navy);
  rect(g, 35, 6, 1, 16, p.navy);
  px(g, 34, 8, p.skyLight);
  px(g, 34, 9, p.indigo);
  rect(g, 36, 12, 1, 9, p.grayLight);
  // small cab window (warm cab light after dark)
  rect(g, 37, 6, 6, 6, p.navy);
  if (lit) {
    rect(g, 38, 7, 4, 4, PALETTE.amber);
    rect(g, 38, 7, 4, 1, PALETTE.glow);
  } else {
    rect(g, 38, 7, 4, 4, p.indigo);
    rect(g, 38, 7, 4, 1, p.skyLight);
    px(g, 38, 8, p.skyLight);
  }
  rect(g, 44, 6, 1, 5, p.skyLight);                   // windscreen edge
  // headlight housing on the nose
  rect(g, 45, 5, 2, 3, p.grayDark);
  px(g, 45, 6, PALETTE.glow);
  px(g, 46, 6, PALETTE.white);
  // warning stripes on the nose, number plate
  for (let y = 17; y <= 21; y++) px(g, 44, y, y % 2 ? p.amber : p.ink);
  rect(g, 20, 18, 7, 3, p.cream);
  for (const x of [21, 22, 24, 25]) px(g, x, 19, p.ink);
  // underframe, fuel tank, buffer beam and pilot
  rect(g, 1, 23, 43, 1, p.grayDark);
  rect(g, 18, 24, 11, 1, p.gray);
  rect(g, 18, 25, 11, 1, p.grayDark);
  rect(g, 19, 26, 9, 1, p.ink);
  rect(g, 0, 23, 2, 1, p.red);
  rect(g, 41, 23, 5, 1, p.red);
  px(g, 46, 23, p.ink);
  rect(g, 42, 24, 4, 1, p.grayDark);
  rect(g, 43, 25, 4, 1, p.grayDark);
  rect(g, 44, 26, 3, 1, p.ink);
  return c;
}

function windowPane(g, p, lit, x, y, w, h) {
  if (lit) {
    rect(g, x, y, w, h, PALETTE.glow);
    rect(g, x, y + h - 1, w, 1, PALETTE.amber);
  } else {
    rect(g, x, y, w, h, p.indigo);
    px(g, x, y, p.skyLight);
  }
}

// Passenger carriage, 39x19. Row 0 is the roof (screen y 121).
function buildCar(p, lit, seed) {
  const rng = mulberry32(100 + seed);
  const w = CONFIG.CAR_W;
  const [c, g] = makeCanvas(w, 19);
  rect(g, 3, 0, w - 6, 1, p.grayLight);               // roof crown
  rect(g, 1, 1, w - 2, 1, p.gray);                    // roof
  rect(g, 0, 2, w, 1, p.grayDark);                    // rain gutter
  rect(g, 0, 3, w, 13, p.green);                      // green body
  rect(g, 0, 9, w, 2, p.cream);                       // cream stripe
  rect(g, 0, 11, w, 1, p.red);                        // thin red line
  rect(g, 0, 15, w, 1, p.greenDark);
  rect(g, 0, 3, 1, 13, p.greenDark);
  rect(g, w - 1, 3, 1, 13, p.greenDark);
  // a door at each end
  for (const dx of [1, w - 5]) {
    rect(g, dx, 4, 4, 1, p.greenDark);
    rect(g, dx, 4, 1, 12, p.greenDark);
    rect(g, dx + 3, 4, 1, 12, p.greenDark);
    windowPane(g, p, lit, dx + 1, 5, 2, 2);
    px(g, dx === 1 ? dx + 2 : dx + 1, 12, p.grayLight);
  }
  // row of small windows, some with passengers
  for (let i = 0; i < 5; i++) {
    const wx = 8 + i * 5;
    windowPane(g, p, lit, wx, 5, 3, 3);
    if (rng() < 0.7) {
      const hx = wx + randInt(rng, 0, 2), col = lit ? PALETTE.rust : p.ink;
      px(g, hx, 6, col);
      const x0 = Math.max(wx, hx - 1), x1 = Math.min(wx + 2, hx + 1);
      rect(g, x0, 7, x1 - x0 + 1, 1, col);
    }
  }
  // underframe and equipment box between the bogies
  rect(g, 1, 16, w - 2, 1, p.grayDark);
  rect(g, 2, 17, w - 4, 1, p.ink);
  rect(g, 17, 17, 5, 2, p.grayDark);
  return c;
}
function drawBogie(g, p, a, b) {
  rect(g, a - 3, 143, b - a + 7, 1, p.gray);          // side frame
  rect(g, a - 2, 144, b - a + 5, 1, p.grayDark);
  const m = (a + b) >> 1;
  rect(g, m - 1, 140, 3, 3, p.ink);                   // bolster spring
  px(g, m, 141, p.grayDark);
}

// Body bounce relative to the bogies: -1, 0 or +1 px, only while moving
function swayOffset(i) {
  const k = Math.min(1, Math.abs(sim.speed) / CONFIG.CRUISE_SPEED);
  if (k < 0.05) return 0;
  const s = (Math.sin(sim.swayPhase + i * 2.1) + 0.6 * Math.sin(sim.swayPhase * 2.3 + i * 1.3)) * k;
  return s > 1.05 ? -1 : s < -1.3 ? 1 : 0;
}

function drawTrain(g, v) {
  const p = v.p, vehicles = TRAIN.vehicles;
  const totalFrames = CONFIG.WHEEL_FRAMES;
  const frameIdx = ((Math.floor(sim.wheelAngle / (Math.PI / 2) * totalFrames) % totalFrames) + totalFrames) % totalFrames;
  const wf = v.wheels[frameIdx] || v.wheels[0];
  // couplings (behind bodies): gangway bellows between carriages + coupler
  for (let i = 0; i < vehicles.length - 1; i++) {
    const gx = vehicles[i + 1].x + vehicles[i + 1].w;
    if (i > 0) rect(g, gx, 125, CONFIG.CAR_GAP, 11, p.grayDark);
    rect(g, gx - 1, 137, CONFIG.CAR_GAP + 2, 1, p.ink);
  }
  vehicles.forEach((veh, i) => {
    for (const wx of veh.wheels) g.drawImage(wf, veh.x + wx - 3, LAYER_Y.wheel);
    for (let k = 0; k < veh.wheels.length; k += 2) drawBogie(g, p, veh.x + veh.wheels[k], veh.x + veh.wheels[k + 1]);
    g.drawImage(i === 0 ? v.loco : v.cars[i - 1], veh.x, veh.y + swayOffset(i));
  });
  drawDoors(g, v);
  if (sim.hornWave > 0) drawHornWaves(g, p);
}

// Left pixel column of every carriage door (two per carriage)
const DOORS = TRAIN.vehicles.slice(1).flatMap(c => [c.x + 1, c.x + CONFIG.CAR_W - 5]);

// Doors slide open into the body: the 4 px doorway is revealed column by column
function drawDoors(g, v) {
  const k = Math.round(sim.doorOpen * 4), p = v.p;
  if (!k) return;
  for (const dx of DOORS) {
    rect(g, dx, PLAT.DOOR_TOP, k, PLAT.DOOR_FLOOR - PLAT.DOOR_TOP + 1, p.ink);
    if (v.lit) rect(g, dx, PLAT.DOOR_TOP, k, 1, PALETTE.amber);         // ceiling light
    if (k < 4) rect(g, dx + k, PLAT.DOOR_TOP, 1, PLAT.DOOR_FLOOR - PLAT.DOOR_TOP + 1, p.greenDark);
    if (k >= 3) rect(g, dx, 138, 4, 1, p.grayLight);                    // folding step
  }
}

function drawHornWaves(g, p) {
  const hx = TRAIN.vehicles[0].x + 42, hy = LAYER_Y.loco + 1;
  const ph = Math.floor(sim.clock * 8) % 3;
  for (let i = 0; i < 3; i++) {
    if ((i + ph) % 3 === 2) continue;                                   // flicker outward
    const r = 2 + i * 3;
    for (let a = -2; a <= 2; a++) px(g, hx + r + (Math.abs(a) === 2 ? -1 : 0), hy + a - i, p.white);
  }
}

// --- exhaust smoke -----------------------------------------------------
// Puffs live in screen space. Air is still relative to the world, so a
// puff's x velocity relaxes towards -speed: faster train, faster drift.
const smokePool = makePool(CONFIG.SMOKE_MAX[0], () => ({ x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 0, r0: 0, grow: 0, shade: 0 }));

function emitPuff(heavy) {
  const s = poolSpawn(smokePool, cap('SMOKE_MAX'));
  if (!s) return;
  s.x = TRAIN.stackX + Math.random(); s.y = TRAIN.stackY;
  s.vx = 0; s.vy = -(heavy ? 26 : 16) - Math.random() * 8;
  s.age = 0; s.life = (heavy ? 3.2 : 2.2) + Math.random();
  s.r0 = heavy ? 1.5 : 0.8; s.grow = (heavy ? 2.4 : 1.6) + Math.random();
  s.shade = heavy ? 0 : 1;
}

function updateSmoke(dt) {
  const st = sim.state, e = drive.engine;
  // idling engine puffs gently; it revs up (darker smoke) for the horn and departure.
  // A cold engine makes none; the driver's notch sets the rate in DRIVE mode.
  let rate = 0, revving = false;
  if (e === 'CRANK') rate = 2.5;
  else if (e === 'SHUTDOWN') rate = 0.6;
  else if (e === 'ON' && drive.on) { rate = 1.5 + Math.max(0, drive.rpm - 0.3) * 16; revving = drive.rpm > 0.72; }
  else if (e === 'ON') {
    revving = st === 'DEPARTING' || sim.stopPhase === 'HORN';
    rate = revving ? 12 : st === 'TRAVELING' ? 5 : st === 'ARRIVING' ? 3
         : sim.stopPhase === 'TERMINUS' ? 0.8 : 1.5;
  }
  sim.smokeAcc += rate * dt;
  while (sim.smokeAcc >= 1) { sim.smokeAcc -= 1; emitPuff(revving); }
  const windX = -(sim.speed + 4), kx = Math.min(1, dt * 2.2), ky = Math.min(1, dt * 1.5);
  for (let i = 0; i < smokePool.n; ) {
    const s = smokePool.items[i];
    s.age += dt;
    s.vx += (windX - s.vx) * kx;
    s.vy += (-5 - s.vy) * ky;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    if (s.age < s.life && s.x > -16 && s.x < W + 32 && s.y > -16) i++;
    else poolKill(smokePool, i);
  }
}

const SMOKE_SHADES = ['grayDark', 'gray', 'grayLight', 'cloudShade'];

// Dithered puff sprites, cached per lighting / radius / density / shade
function puffSprite(v, r, dens, shade) {
  const key = (r * 17 + dens) * 4 + shade;
  let c = v.puffs[key];
  if (!c) {
    let g;
    [c, g] = makeCanvas(r * 2 + 1, r * 2 + 1);
    g.fillStyle = v.p[SMOKE_SHADES[shade]];
    for (let y = -r; y <= r; y++)
      for (let x = -r; x <= r; x++)
        if (x * x + y * y <= (r + 0.5) * (r + 0.5) && bayer(x + r, y + r) < dens) g.fillRect(x + r, y + r, 1, 1);
    v.puffs[key] = c;
  }
  return c;
}

function drawSmoke(g, v) {
  for (let i = 0; i < smokePool.n; i++) {
    const s = smokePool.items[i], t = s.age / s.life;
    const r = Math.min(7, Math.floor(s.r0 + s.age * s.grow));
    const dens = 16 - Math.min(3, Math.floor(t * 4)) * 4;          // 16, 12, 8, 4 -> fades out
    const shade = Math.min(3, s.shade + Math.floor(t * 3));
    g.drawImage(puffSprite(v, r, dens, shade), Math.round(s.x) - r, Math.round(s.y) - r);
  }
}
