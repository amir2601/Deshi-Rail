'use strict';

// =====================================================================
// 8b. ATMOSPHERE: time of day, sky, weather, glow and effects
// =====================================================================
// --- time of day -------------------------------------------------------
// sim.hour eases towards its target - the trip's own clock (AUTO) or the
// hour picked with the time button - so it never jumps
function journeyHour() {
  const d0 = STATIONS[0].dist, d1 = STATIONS[LAST_STATION].dist;
  const p = Math.max(0, Math.min(1, (sim.dist - d0) / (d1 - d0)));
  return CONFIG.HOUR_START + p * (CONFIG.HOUR_END - CONFIG.HOUR_START);
}

function updateHour(dt) {
  // AUTO follows the distance travelled; a driver's day runs on the timetable clock
  const fixed = TIME_MODES[ui.timeMode][1];
  const target = fixed !== null ? fixed : drive.on ? tripHour(drive.tripT) : journeyHour();
  const diff = ((target - sim.hour + 36) % 24) - 12, step = CONFIG.HOUR_EASE * dt;   // shortest way round
  sim.hour = (sim.hour + Math.max(-step, Math.min(step, diff)) + 24) % 24;
  sim.night = nightAt(sim.hour);
}

const LIGHT_TMP = { a: 'day', b: 'day', f: 0 };
function lightingAt(h) {
  for (let i = 0; i < LIGHT_KEYS.length - 1; i++) {
    const k0 = LIGHT_KEYS[i], k1 = LIGHT_KEYS[i + 1];
    if (h >= k0[0] && h < k1[0]) {
      LIGHT_TMP.a = k0[1]; LIGHT_TMP.b = k1[1];
      LIGHT_TMP.f = k0[1] === k1[1] ? 0 : (h - k0[0]) / (k1[0] - k0[0]);
      return LIGHT_TMP;
    }
  }
  LIGHT_TMP.a = LIGHT_TMP.b = 'night'; LIGHT_TMP.f = 0;
  return LIGHT_TMP;
}

// 0 in daylight .. 1 at night: stars, lamps, fireflies
function nightAt(h) {
  if (h >= 7 && h <= 17.5) return 0;
  if (h > 17.5 && h < 20) return smoothstep((h - 17.5) / 2.5);
  if (h >= 4.5 && h < 7) return 1 - smoothstep((h - 4.5) / 2.5);
  return 1;
}

const hhmm = h => { const m = Math.floor(h * 60) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };

// Interpolate a table of [hour, ...hex colours] rows into out (RGB floats)
function hexRgbF(hex) { const [r, g, b] = hexToRgb(hex); return [r, g, b]; }
function keyedColours(keys, h, out) {
  let i = 0;
  while (i < keys.length - 2 && h >= keys[i + 1][0]) i++;
  const k0 = keys[i], k1 = keys[i + 1], t = smoothstep(Math.max(0, Math.min(1, (h - k0[0]) / (k1[0] - k0[0]))));
  for (let c = 0; c < out.length; c++) out[c] = k0[1][c] + (k1[1][c] - k0[1][c]) * t;
  return out;
}
// rows: [hour, [top rgb, mid rgb, horizon rgb] flattened]
const skyKey = (h, top, mid, hor) => [h, [...hexRgbF(top), ...hexRgbF(mid), ...hexRgbF(hor)]];
const SKY_KEYS = [
  skyKey(0, '#0c0e22', '#151a3a', '#262c58'), skyKey(4.6, '#0c0e22', '#151a3a', '#262c58'),
  skyKey(5.4, '#1b1f3b', '#3a3a6e', '#b85d6e'), skyKey(6.1, '#2c4a84', '#a87a9e', '#f4c27a'),
  skyKey(7.0, '#3d7fc4', '#8cc4e8', '#f2e2b8'), skyKey(8.5, '#3d7fc4', '#6aaee0', '#a8d8ef'),
  skyKey(15.6, '#3d7fc4', '#6aaee0', '#a8d8ef'), skyKey(17.0, '#3a6cb0', '#88b2d8', '#f4d08a'),
  skyKey(18.0, '#2c2f5e', '#b85d6e', '#e8875a'), skyKey(18.8, '#1b1f3b', '#4a4f84', '#b85d6e'),
  skyKey(19.8, '#0f1228', '#1b1f3b', '#2c2f5e'), skyKey(24, '#0c0e22', '#151a3a', '#262c58'),
];
// section moods (daylight only) and rain, as targets the sky leans towards
const SKY_DEEP = [...hexRgbF('#2a60b2'), ...hexRgbF('#4a92d8'), ...hexRgbF('#9ccff0')];
const SKY_MIST = [...hexRgbF('#8fb3cf'), ...hexRgbF('#b8c8d6'), ...hexRgbF('#d0d8e0')];
const SKY_RAIN_DAY = [...hexRgbF('#5d6577'), ...hexRgbF('#7d8596'), ...hexRgbF('#9aa1ad')];
const SKY_RAIN_NIGHT = [...hexRgbF('#14161e'), ...hexRgbF('#1c1f2a'), ...hexRgbF('#262a36')];

// The sky is a vertical gradient dithered to 4x4 Bayer steps, so it only
// varies with x & 3: a 4 px strip, repeated as a pattern
const sky = { strip: null, sg: null, img: null, pattern: null, key: -1, cols: new Float32Array(9), tmp: new Float32Array(9) };
function updateSky(g) {
  const d = sim.dist, day = 1 - sim.night, deep = sectionWeight('kash', d) * day, mist = sectionWeight('hills', d) * day;
  const rain = weather.level;
  const key = ((Math.round(sim.hour * 60) * 21 + Math.round(deep * 20)) * 21 + Math.round(mist * 20)) * 21 + Math.round(rain * 20);
  if (key === sky.key) return;
  sky.key = key;
  if (!sky.strip) { [sky.strip, sky.sg] = makeCanvas(4, H); sky.img = sky.sg.createImageData(4, H); }
  const c = keyedColours(SKY_KEYS, sim.hour, sky.cols), t = sky.tmp;
  for (let i = 0; i < 9; i++) {
    let v = c[i];
    v += (SKY_DEEP[i] - v) * deep;
    v += (SKY_MIST[i] - v) * mist * 0.7;
    t[i] = SKY_RAIN_NIGHT[i] + (SKY_RAIN_DAY[i] - SKY_RAIN_NIGHT[i]) * day;
    c[i] = v + (t[i] - v) * rain * 0.65;
  }
  const out = new Uint32Array(sky.img.data.buffer), Q = 6;
  for (let y = 0; y < H; y++) {
    const a = y < 60 ? 0 : 3, b = y < 60 ? 3 : 6, f = y < 60 ? y / 60 : Math.min(1, (y - 60) / 52);
    for (let x = 0; x < 4; x++) {
      const dz = (bayer(x, y) / 16 - 0.5) * Q;
      const r = Math.round((c[a] + (c[b] - c[a]) * f + dz) / Q) * Q, gg = Math.round((c[a + 1] + (c[b + 1] - c[a + 1]) * f + dz) / Q) * Q,
            bb = Math.round((c[a + 2] + (c[b + 2] - c[a + 2]) * f + dz) / Q) * Q;
      out[y * 4 + x] = (255 << 24 | Math.min(255, bb) << 16 | Math.min(255, gg) << 8 | Math.min(255, r)) >>> 0;
    }
  }
  sky.sg.putImageData(sky.img, 0, 0);
  sky.pattern = g.createPattern(sky.strip, 'repeat');
}

// --- sun, moon, stars, lightning bolt (behind everything) -----------------
const STARS = (() => {
  const rng = mulberry32(3), s = [];
  for (let i = 0; i < 110; i++) s.push({ x: randInt(rng, 0, W - 1), y: randInt(rng, 0, 100), th: rng(), ph: rng() * 6, big: rng() < 0.08 });
  return s;
})();

function celestialSprite(r, rim, core, coreR) {
  const [c, g] = makeCanvas(r * 2 + 1, r * 2 + 1);
  disc(g, r, r, r, rim);
  disc(g, r - (r > 5 ? 1 : 0), r - (r > 5 ? 1 : 0), coreR, core);
  return c;
}
const SUN_SPRITES = [celestialSprite(6, PALETTE.glow, PALETTE.white, 4),     // high
                     celestialSprite(7, PALETTE.amber, PALETTE.peach, 5),    // getting low
                     celestialSprite(8, PALETTE.orange, PALETTE.peach, 5)];  // on the horizon
const MOON = (() => {
  const [c, g] = makeCanvas(11, 11);
  disc(g, 5, 5, 5, PALETTE.cloudShade);
  disc(g, 6, 4, 4, PALETTE.white);
  for (const [x, y] of [[3, 6], [4, 3], [6, 7], [2, 4]]) px(g, x, y, PALETTE.grayLight);
  return c;
})();

const celestial = { sunX: 0, sunY: 0, sunLow: 0, sunUp: false, moonX: 0, moonY: 0, moonUp: false };
function placeCelestial() {
  const h = sim.hour;
  celestial.sunUp = h > 5.4 && h < 18.8;
  if (celestial.sunUp) {
    const t = (h - 5.6) / 13, s = Math.sin(Math.max(0, Math.min(1, t)) * Math.PI);
    celestial.sunX = Math.round(24 + t * (W - 48));
    celestial.sunY = Math.round(116 - s * 94);
    celestial.sunLow = 1 - s;
  }
  celestial.moonUp = h > 18.2 || h < 6.2;
  if (celestial.moonUp) {
    const t = ((h - 18.4 + 24) % 24) / 11.6, s = Math.sin(Math.max(0, Math.min(1, t)) * Math.PI);
    celestial.moonX = Math.round(30 + t * (W - 60));
    celestial.moonY = Math.round(110 - s * 84);
  }
}

function drawCelestial(g) {
  const n = sim.night * (1 - weather.level * 0.85), t = sim.clock;
  if (n > 0.02) {                                       // stars: fade in by threshold, some twinkle
    for (let i = 0; i < STARS.length; i++) {
      const s = STARS[i];
      if (s.th > n * 1.15 - 0.1) continue;
      const tw = Math.sin(t * 2.3 + s.ph);
      g.fillStyle = tw > 0.8 ? PALETTE.white : tw > -0.4 ? PALETTE.cloudShade : PALETTE.grayLight;
      g.fillRect(s.x, s.y, 1, 1);
      if (s.big && tw > 0.3) { g.fillRect(s.x - 1, s.y, 3, 1); g.fillRect(s.x, s.y - 1, 1, 3); }
    }
  }
  if (celestial.moonUp && n > 0.05) {
    g.globalAlpha = Math.min(1, n * 1.4);
    g.drawImage(MOON, celestial.moonX - 5, celestial.moonY - 5);
    g.globalAlpha = 1;
  }
  if (celestial.sunUp) {
    const low = celestial.sunLow, spr = SUN_SPRITES[low > 0.82 ? 2 : low > 0.55 ? 1 : 0], r = spr.width >> 1;
    g.globalAlpha = 1 - weather.level * 0.8;            // the sun hides behind rain clouds
    g.drawImage(spr, celestial.sunX - r, celestial.sunY - r);
    g.globalAlpha = 1;
  }
  if (weather.flash > 0 && weather.boltN) {            // a far-off bolt, behind the hills
    g.fillStyle = PALETTE.white;
    for (let i = 0; i < weather.boltN - 1; i++) {
      const x0 = weather.bolt[i * 2], y0 = weather.bolt[i * 2 + 1], x1 = weather.bolt[i * 2 + 2], y1 = weather.bolt[i * 2 + 3];
      for (let y = y0; y < y1; y++) g.fillRect(Math.round(x0 + (x1 - x0) * (y - y0) / (y1 - y0)), y, 1, 1);
    }
  }
}

// --- colour tint over the whole picture -----------------------------------
// [hour, multiply rgb, warm wash rgb + alpha]: a multiply darkens and cools
// the night, a thin warm wash gilds dawn, golden hour and sunset
const tintKey = (h, mul, wash, a) => [h, [...hexRgbF(mul), ...hexRgbF(wash), a * 255]];
const TINT_KEYS = [
  tintKey(0, '#7a84b4', '#1b1f3b', 0), tintKey(4.6, '#7a84b4', '#1b1f3b', 0),
  tintKey(5.6, '#c0a8bc', '#f4c27a', 0.08), tintKey(6.6, '#eadad2', '#f4c27a', 0.12),
  tintKey(7.6, '#ffffff', '#f4c27a', 0), tintKey(16.2, '#ffffff', '#f0a030', 0),
  tintKey(17.2, '#f8ecdc', '#f0a030', 0.1), tintKey(18.2, '#e6bcaa', '#e8875a', 0.14),
  tintKey(19.0, '#a496b8', '#b85d6e', 0.06), tintKey(20.0, '#7a84b4', '#1b1f3b', 0),
  tintKey(24, '#7a84b4', '#1b1f3b', 0),
];
const tint = { v: new Float32Array(7), mul: '', wash: '', washA: 0, key: -1 };
function applyTint(g) {
  const k = Math.round(sim.hour * 40) * 64 + Math.round(weather.level * 20);
  if (k !== tint.key) {                                 // rebuild the colour strings only when they change
    tint.key = k;
    const c = keyedColours(TINT_KEYS, sim.hour, tint.v), r = weather.level * 0.35;
    const m = i => Math.round(c[i] + (172 - c[i]) * r);   // rain greys things down
    tint.mul = 'rgb(' + m(0) + ',' + m(1) + ',' + m(2) + ')';
    tint.wash = 'rgb(' + Math.round(c[3]) + ',' + Math.round(c[4]) + ',' + Math.round(c[5]) + ')';
    tint.washA = (c[6] / 255) * (1 - weather.level);
    tint.plain = c[0] > 252 && c[1] > 252 && c[2] > 252 && r === 0;
  }
  if (!tint.plain) {
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = tint.mul;
    g.fillRect(-2, -2, W + 4, H + 4);
  }
  if (tint.washA > 0.004) {
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = tint.washA;
    g.fillStyle = tint.wash;
    g.fillRect(-2, -2, W + 4, H + 4);
    g.globalAlpha = 1;
  }
  g.globalCompositeOperation = 'source-over';
}

// --- glow: light sources added on top after dark ---------------------------
// Lamps and windows register themselves while the world is drawn; the glow
// pass then adds soft halos with the 'lighter' (additive) blend.
const LIGHT_LAMP = 0, LIGHT_WINDOW = 1, LIGHT_BULB = 2, LIGHT_MAX = 96;
const lights = { n: 0, collect: true, x: new Float32Array(LIGHT_MAX), y: new Float32Array(LIGHT_MAX), k: new Uint8Array(LIGHT_MAX) };
function addLight(x, y, kind) {
  if (!lights.collect || lights.n >= LIGHT_MAX || x < -20 || x > W + 20) return;
  lights.x[lights.n] = x; lights.y[lights.n] = y; lights.k[lights.n++] = kind;
}

function haloSprite(r, rgb, a0) {
  const [c, g] = makeCanvas(r * 2, r * 2);
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, 'rgba(' + rgb + ',' + a0 + ')');
  grad.addColorStop(0.35, 'rgba(' + rgb + ',' + a0 * 0.35 + ')');
  grad.addColorStop(1, 'rgba(' + rgb + ',0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, r * 2, r * 2);
  return c;
}

const GLOW = (() => {
  const warm = '255,196,96';
  const halos = [haloSprite(14, warm, 0.75), haloSprite(6, warm, 0.6), haloSprite(7, '255,214,120', 0.7)];   // by LIGHT_*
  // every lit carriage and cab window of the rake, pre-composed
  const [train, tg] = makeCanvas(W, 40), small = haloSprite(5, warm, 0.5), y0 = LAYER_Y.car - 10;
  tg.globalCompositeOperation = 'lighter';
  TRAIN.vehicles.forEach((veh, i) => {
    if (i === 0) { tg.drawImage(haloSprite(7, warm, 0.55), veh.x + 40 - 7, LAYER_Y.loco + 9 - 7 - y0); return; }
    for (let k = 0; k < 5; k++) tg.drawImage(small, veh.x + 9 + k * 5 - 5, 6 + 10 - 5);
  });
  // headlight: a cone of light thrown forward and down onto the track
  const [cone, cg] = makeCanvas(90, 50), lin = cg.createLinearGradient(0, 0, 90, 0);
  lin.addColorStop(0, 'rgba(255,236,170,0.55)');
  lin.addColorStop(0.5, 'rgba(255,226,150,0.2)');
  lin.addColorStop(1, 'rgba(255,220,140,0)');
  cg.fillStyle = lin;
  cg.beginPath(); cg.moveTo(0, 6); cg.lineTo(90, 2); cg.lineTo(90, 50); cg.lineTo(0, 9); cg.closePath(); cg.fill();
  return { halos, train, trainY: y0, cone, flare: haloSprite(9, '255,240,190', 0.9), door: haloSprite(8, warm, 0.6),
           fly: haloSprite(4, '220,255,120', 0.9), moon: haloSprite(22, '190,200,255', 0.35),
           sun: haloSprite(40, '255,170,90', 0.45), spark: haloSprite(3, '255,190,90', 0.9) };
})();

function drawGlow(g) {
  const n = sim.night, t = sim.clock;
  g.globalCompositeOperation = 'lighter';
  if (n > 0.02) {
    g.globalAlpha = n * 0.9;
    g.drawImage(GLOW.train, 0, GLOW.trainY);
    if (sim.doorOpen > 0.3) for (let i = 0; i < DOORS.length; i++) g.drawImage(GLOW.door, DOORS[i] + 2 - 8, PLAT.DOOR_TOP + 4 - 8);
    for (let i = 0; i < lights.n; i++) {
      const spr = GLOW.halos[lights.k[i]], r = spr.width >> 1;
      g.drawImage(spr, Math.round(lights.x[i]) - r, Math.round(lights.y[i]) - r);
    }
    g.globalAlpha = n;
    if (drive.engine !== 'OFF' && (drive.headlight || !drive.on)) {   // the headlight needs the engine
      g.drawImage(GLOW.cone, CONFIG.TRAIN_FRONT_X, LAYER_Y.loco);
      g.drawImage(GLOW.flare, CONFIG.TRAIN_FRONT_X - 8, LAYER_Y.loco - 3);
    }
    for (let i = 0; i < fireflyPool.n; i++) {
      const f = fireflyPool.items[i], b = Math.sin(f.age * f.rate + f.ph);
      if (b <= 0.1) continue;
      g.globalAlpha = n * b * Math.min(1, f.age, f.life - f.age);
      g.drawImage(GLOW.fly, Math.round(f.x) - 4, Math.round(f.y) - 4);
    }
    if (celestial.moonUp) { g.globalAlpha = n * (1 - weather.level); g.drawImage(GLOW.moon, celestial.moonX - 22, celestial.moonY - 22); }
  }
  if (celestial.sunUp && celestial.sunLow > 0.5) {      // the low sun blooms
    g.globalAlpha = (celestial.sunLow - 0.5) * 2 * (1 - weather.level);
    g.drawImage(GLOW.sun, celestial.sunX - 40, celestial.sunY - 40);
  }
  g.globalAlpha = 1;
  for (let i = 0; i < sparkPool.n; i++) {               // brake sparks
    const s = sparkPool.items[i], x = Math.round(s.x), y = Math.round(s.y), k = s.age / s.life;
    g.drawImage(GLOW.spark, x - 3, y - 3);
    g.fillStyle = k < 0.3 ? PALETTE.white : k < 0.7 ? PALETTE.glow : PALETTE.amber;
    g.fillRect(x, y, 1, 1);
    g.fillRect(Math.round(s.x - s.vx * 0.015), Math.round(s.y - s.vy * 0.015), 1, 1);
  }
  if (weather.flash > 0.01) {                           // lightning lights up everything for an instant
    g.globalAlpha = weather.flash * 0.45;
    g.fillStyle = '#9aa4d8';
    g.fillRect(-2, -2, W + 4, H + 4);
    g.globalAlpha = 1;
  }
  for (let i = 0; i < fireflyPool.n && n > 0.02; i++) { // firefly cores
    const f = fireflyPool.items[i];
    if (Math.sin(f.age * f.rate + f.ph) > 0.5) { g.fillStyle = PALETTE.glow; g.fillRect(Math.round(f.x), Math.round(f.y), 1, 1); }
  }
  g.globalCompositeOperation = 'source-over';
}

// --- fireflies ---------------------------------------------------------------
const fireflyPool = makePool(CONFIG.FIREFLY_MAX[0], () => ({ x: 0, y: 0, depth: 0, age: 0, life: 0, ph: 0, rate: 0 }));
function updateFireflies(dt) {
  const n = sim.night, rng = sim.fxRng;
  sim.flyAcc += 7 * Math.max(0, n - 0.4) * (1 - sectionWeight('river', sim.dist)) * (1 - weather.level) * dt;
  while (sim.flyAcc >= 1) {
    sim.flyAcc -= 1;
    const f = poolSpawn(fireflyPool, cap('FIREFLY_MAX'));
    if (!f) continue;
    f.x = rng() * (W + 40); f.y = 118 + rng() * 58; f.depth = 0.5 + rng() * 0.8;
    f.age = 0; f.life = 5 + rng() * 6; f.ph = rng() * 6; f.rate = 2 + rng() * 3;
  }
  for (let i = 0; i < fireflyPool.n; ) {
    const f = fireflyPool.items[i];
    f.age += dt;
    f.x += (-sim.speed * f.depth + Math.sin(f.age * 1.3 + f.ph) * 6) * dt;
    f.y += Math.cos(f.age * 1.1 + f.ph) * 4 * dt;
    if (f.age < f.life && f.x > -8) i++;
    else poolKill(fireflyPool, i);
  }
}

// --- brake sparks --------------------------------------------------------------
const sparkPool = makePool(CONFIG.SPARK_MAX[0], () => ({ x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 0 }));
function updateSparks(dt) {
  const effort = brakeEffort();                         // AUTO: hardest braking mid-way
  if (effort > 0 && sim.speed > 4) {
    sim.sparkAcc += 90 * effort * dt;
    while (sim.sparkAcc >= 1) {
      sim.sparkAcc -= 1;
      const s = poolSpawn(sparkPool, cap('SPARK_MAX'));
      if (!s) break;
      const veh = TRAIN.vehicles[(Math.random() * TRAIN.vehicles.length) | 0];
      s.x = veh.x + veh.wheels[(Math.random() * 4) | 0]; s.y = LAYER_Y.wheel + 6;
      s.vx = -(20 + Math.random() * 50); s.vy = -(15 + Math.random() * 45);
      s.age = 0; s.life = 0.15 + Math.random() * 0.3;
    }
  }
  for (let i = 0; i < sparkPool.n; ) {
    const s = sparkPool.items[i];
    s.age += dt;
    s.vy += 220 * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    if (s.age < s.life) i++;
    else poolKill(sparkPool, i);
  }
}

// --- camera shake: a jolt when the train starts or stops, a rumble on the bridge
const shake = { x: 0, y: 0 };
function updateShake(dt) {
  sim.shake = Math.max(0, sim.shake - dt * 2.5);
  const amp = sim.shake + (sim.onBridge ? 0.9 * sim.bridgeMix * Math.abs(sim.speed) / CONFIG.CRUISE_SPEED : 0);
  if (amp < 0.35) { shake.x = shake.y = 0; return; }
  shake.x = Math.round(Math.sin(sim.clock * 41.3) * amp);
  shake.y = Math.round(Math.abs(Math.sin(sim.clock * 29.7 + 1)) * amp * 0.8);
}

// --- weather: monsoon spells, rain, splashes, ripples, lightning ----------------
const weather = { level: 0, target: 0, timer: 0, acc: 0, flash: 0, flashT: 9, bolt: new Int16Array(24), boltN: 0, thunderIn: -1 };
const rainPool = makePool(CONFIG.RAIN_MAX[0], () => ({ x: 0, y: 0, vx: 0, vy: 0, depth: 0, gy: 0 }));
const splashPool = makePool(CONFIG.SPLASH_MAX[0], () => ({ x: 0, y: 0, age: 0, water: false }));

function resetWeather() {
  weather.level = weather.target = 0;
  weather.timer = CONFIG.RAIN_GAP[1] * 0.6;            // dry at Kamalapur; the first spell comes on the way
  weather.flash = 0; weather.flashT = 9; weather.thunderIn = -1;
  rainPool.n = splashPool.n = 0;
}

function updateWeather(dt) {
  const rng = sim.wxRng;
  if ((weather.timer -= dt) <= 0) {                     // next spell, or the end of this one
    const raining = weather.target > 0;
    weather.target = raining ? 0 : 0.55 + rng() * 0.45;
    weather.timer = raining ? randInt(rng, ...CONFIG.RAIN_GAP) : randInt(rng, ...CONFIG.RAIN_SPELL);
  }
  const target = ui.rainMode === 1 ? 1 : ui.rainMode === 2 ? 0 : weather.target;
  weather.level += Math.max(-0.2 * dt, Math.min(0.2 * dt, target - weather.level));

  weather.acc += weather.level * (quality.low ? 170 : 300) * dt;
  while (weather.acc >= 1) {
    weather.acc -= 1;
    const r = poolSpawn(rainPool, cap('RAIN_MAX'));
    if (!r) { weather.acc = 0; break; }
    r.depth = 0.5 + Math.random() * 0.8;
    r.x = -10 + Math.random() * (W + 30 + sim.speed * 0.8);
    r.y = -Math.random() * 30;
    r.vy = 170 + r.depth * 90;
    r.gy = r.depth > 0.95 ? 158 + (r.depth - 0.95) * 60 : 112 + r.depth * 40;
  }
  for (let i = 0; i < rainPool.n; ) {
    const r = rainPool.items[i];
    r.vx = -(sim.speed * r.depth * 0.8) - 30 * r.depth;  // wind plus the train's own speed
    r.x += r.vx * dt;
    r.y += r.vy * dt;
    if (r.y < r.gy && r.x > -12 && r.x < W + 24) { i++; continue; }
    if (r.y >= r.gy && r.depth > 0.95 && r.x >= 0 && r.x < W) {
      const s = poolSpawn(splashPool, cap('SPLASH_MAX'));
      if (s) { s.x = Math.round(r.x); s.y = Math.round(r.gy); s.age = 0; s.water = isWater(s.x, s.y); }
    }
    poolKill(rainPool, i);
  }
  for (let i = 0; i < splashPool.n; ) {
    const s = splashPool.items[i];
    s.age += dt;
    s.x -= sim.speed * PARALLAX.fg * dt;
    if (s.age < (s.water ? 0.5 : 0.25)) i++;
    else poolKill(splashPool, i);
  }

  // rare, distant lightning while it pours; thunder follows a moment later
  if (weather.level > 0.5 && rng() < CONFIG.LIGHTNING_RATE * weather.level * dt) {
    weather.flashT = 0;
    let x = randInt(rng, 30, W - 30), y = randInt(rng, 6, 30);
    weather.boltN = 0;
    while (y < 108 && weather.boltN < 12) {
      weather.bolt[weather.boltN * 2] = x; weather.bolt[weather.boltN * 2 + 1] = y; weather.boltN++;
      x += randInt(rng, -5, 5); y += randInt(rng, 6, 12);
    }
    weather.thunderIn = 1 + rng() * 2;
  }
  weather.flashT += dt;
  const ft = weather.flashT;                            // two quick pulses
  weather.flash = ft > 0.6 ? 0 : Math.max(0, 1 - ft / 0.12) + (ft > 0.18 ? Math.max(0, 1 - (ft - 0.18) / 0.3) * 0.7 : 0);
  if (weather.thunderIn > 0 && (weather.thunderIn -= dt) <= 0) playThunder(0.6 + weather.level * 0.4);
}

// Is this screen pixel open water in the near layer (river or a village pond)?
function isWater(x, y) {
  const u = sim.dist + (x - ANCHOR_X) / PARALLAX.fg, ly = y - LAYER_Y.fg;
  if (sectionWeight('river', u) > 0.5) return ly >= 12 + Math.max(3, bankRows(u));
  const D = TL.fg.data.village;
  if (!D || !D.ponds) return false;
  const lx = x + Math.floor(sim.dist * PARALLAX.fg);
  for (let i = 0; i < D.ponds.length; i++) {
    const pd = D.ponds[i];
    if (Math.abs(lx - pd.cx) <= pd.rx) { const k = pondPixel(pd, lx, ly); return k !== null && k.charCodeAt(0) === 115; }   // 's'ky...
  }
  return false;
}

// Rain streak sprites by slant (0..8) and length (short far, long near)
const RAIN_SPRITES = (() => {
  const out = [];
  for (let s = 0; s <= 8; s++)
    for (const len of [4, 7]) {
      const dx = Math.round(len * s / 8), [c, g] = makeCanvas(dx + 1, len);
      for (let i = 0; i < len; i++) px(g, dx - Math.round(dx * i / (len - 1 || 1)), i, i === len - 1 ? PALETTE.white : PALETTE.cloudShade);
      out.push(c);
    }
  return out;
})();

function drawRain(g) {
  if (!rainPool.n && !splashPool.n) return;
  g.globalAlpha = 0.75;
  for (let i = 0; i < rainPool.n; i++) {
    const r = rainPool.items[i], s = Math.min(8, Math.round(-r.vx / r.vy * 8)), spr = RAIN_SPRITES[s * 2 + (r.depth > 0.95 ? 1 : 0)];
    g.drawImage(spr, Math.round(r.x), Math.round(r.y) - spr.height);
  }
  g.globalAlpha = 1;
  for (let i = 0; i < splashPool.n; i++) {
    const s = splashPool.items[i], x = Math.round(s.x), y = s.y;
    if (s.water) {                                      // a ring spreading on the water
      const rr = 1 + s.age * 9;
      g.fillStyle = PALETTE.skyLight;
      for (let a = 0; a < 8; a++) g.fillRect(Math.round(x + Math.cos(a * 0.785) * rr), Math.round(y + Math.sin(a * 0.785) * rr * 0.35), 1, 1);
    } else {                                            // a little crown of droplets
      g.fillStyle = PALETTE.cloudShade;
      const k = s.age < 0.1 ? 1 : 2;
      g.fillRect(x - k, y - k, 1, 1); g.fillRect(x + k, y - k, 1, 1);
      if (k === 1) g.fillRect(x, y, 1, 1); else g.fillRect(x, y - 3, 1, 1);
    }
  }
}

function update(dt) {
  updateEngine(dt);
  updateJourney(dt);
  updatePeople(dt);
  updatePopups(dt);
  updateUI(dt);
  sim.clock += dt;
  sim.cloudDrift += dt * 1.5;
  const turn = Math.PI / 2;
  sim.wheelAngle = ((sim.wheelAngle + sim.speed * dt / CONFIG.WHEEL_R) % turn + turn) % turn;
  sim.swayPhase += sim.speed * dt * 0.09;
  sim.hornWave = Math.max(0, sim.hornWave - dt);
  updateSmoke(dt);
  updateBridge();
  updateBirds(dt);
  updateFluff(dt);
  updateFireflies(dt);
  updateSparks(dt);
  updateWeather(dt);
  trackSound(dt);
  villageHorn(dt);
}

// Now and then the driver sounds the horn passing a village
function villageHorn(dt) {                             // (a driver blows their own horn)
  if (sim.state !== 'TRAVELING' || sectionWeight('village', sim.dist) < 0.5) return;
  if ((sim.hornTimer -= dt) > 0) return;
  sim.hornTimer = 12 + sim.fxRng() * 14;
  playHorn(true);
}
