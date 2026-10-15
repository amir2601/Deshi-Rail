'use strict';

// =====================================================================
// 5b. TERRAIN SECTIONS
// =====================================================================
// The far, mid and foreground layers are not repeating tiles: they are laid
// out once for the whole line from fixed seeds (so every trip looks the
// same), painted lazily in chunks per lighting, and overlaid every frame
// with live entities (swaying plants, boats, animals, fog, shimmer).
//
// A layer with parallax factor f shows layer column lx at screen
// x = lx - floor(dist * f), and that column stands for the world position
// u = (lx - ANCHOR_X) / f. So every layer agrees on what lies at the centre
// of the screen, and deeper layers see further ahead and behind.
//
// Ground pixels of two neighbouring sections are mixed with an ordered
// dither across the blend zone; objects are spawned with a probability
// equal to their section's weight, so they thin out instead of being cut.
const ANCHOR_X = W / 2;
const CHUNK_W = 64;                                 // multiple of 4: dither lines up across chunks; small = short builds

const TLAYERS = [
  { key: 'far', f: PARALLAX.far, y: LAYER_Y.far, h: 60, seed: 21, hiRows: null },
  { key: 'mid', f: PARALLAX.mid, y: LAYER_Y.mid, h: 80, seed: 42, hiRows: [16, 46] },
  { key: 'fg',  f: PARALLAX.fg,  y: LAYER_Y.fg,  h: 34, seed: 77, hiRows: [12, 34] },
];
const TL = Object.fromEntries(TLAYERS.map(L => [L.key, L]));
const uOf = (L, lx) => (lx - ANCHOR_X) / L.f;
const lxOf = (L, u) => Math.round(u * L.f + ANCHOR_X);

// Deterministic per-pixel noise in [0, 1)
function hash2(x, y) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function setupTerrain() {
  // a station may be named by its index or by its code
  const idx = k => typeof k === 'number' ? k : STATIONS.findIndex(s => s.code === k);
  const at = a => STATIONS[idx(a[0])].dist + a[1];
  TERRAIN.forEach((s, i) => { s.u = i ? at(s.at) : -Infinity; });
  BRIDGE.u0 = at(BRIDGE.at);
  BRIDGE.u1 = BRIDGE.u0 + BRIDGE.spans * BRIDGE.span;
}

// Sections at world position u: a, b are TERRAIN indices, t the weight of b.
// Writes into out (a shared scratch object unless one is passed), so read
// the result before the next call.
const TERRAIN_TMP = { a: 0, b: 0, t: 0 }, TERRAIN_SW = { a: 0, b: 0, t: 0 };
function terrainAt(u, out = TERRAIN_TMP) {
  const half = CONFIG.TERRAIN_BLEND / 2, n = TERRAIN.length;
  out.a = out.b = n - 1; out.t = 0;
  for (let i = 1; i < n; i++) {
    const b = TERRAIN[i].u;
    if (u < b - half) { out.a = out.b = i - 1; break; }
    if (u < b + half) { out.a = i - 1; out.b = i; out.t = smoothstep((u - b + half) / (2 * half)); break; }
  }
  return out;
}

function sectionWeight(id, u) {
  const w = terrainAt(u, TERRAIN_SW);
  return (TERRAIN[w.a].id === id ? 1 - w.t : 0) + (TERRAIN[w.b].id === id ? w.t : 0);
}

// Breeze: waves of wind sweeping back along the line, roughly -1..1
const windAt = (u, t) => Math.sin(u * 0.016 + t * 1.7) * 0.65 + Math.sin(u * 0.043 + t * 2.9 + 1.7) * 0.35;
// How far a plant at u leans right now: -1..2 (the breeze mostly blows one way)
const leanAt = (u, t) => Math.max(-1, Math.min(2, Math.round(windAt(u, t) * 1.7 + 0.4)));

// --- layout: run every section's spawner over its stretch of each layer --
function buildTerrain() {
  setupTerrain();
  const half = CONFIG.TERRAIN_BLEND / 2, last = TERRAIN.length - 1;
  for (const L of TLAYERS) {
    L.lx0 = Math.floor(STATIONS[0].dist * L.f) - 48;
    L.lx1 = Math.ceil(STATIONS[LAST_STATION].dist * L.f) + W + 48;
    L.statics = []; L.live = []; L.data = {};
    TERRAIN.forEach((s, i) => {
      const spec = SECTIONS[s.id][L.key];
      const from = i ? Math.max(L.lx0, lxOf(L, s.u - half)) : L.lx0;
      const to = i < last ? Math.min(L.lx1, lxOf(L, TERRAIN[i + 1].u + half)) : L.lx1;
      if (!spec || from >= to) return;
      const rng = mulberry32(L.seed * 1000 + i * 97);
      const weight = lx => sectionWeight(s.id, uOf(L, lx));
      L.data[s.id] = (spec.spawn && spec.spawn({
        L, rng, from, to, weight,
        ok: lx => rng() < weight(lx),
        stat: (x0, x1, z, draw) => L.statics.push({ x0, x1, z, draw }),   // baked into the chunks
        live: e => L.live.push(e),                                          // drawn every frame
      })) || {};
    });
    L.statics.sort((a, b) => a.z - b.z);
    L.live.sort((a, b) => a.x0 - b.x0);
    L.span = L.live.reduce((m, e) => Math.max(m, e.x1 - e.x0), 0);
  }
}

// --- chunks: ground pixels via ImageData, then the static objects --------
function groundCol(L, si, lx) {
  const id = TERRAIN[si].id, spec = SECTIONS[id][L.key];
  if (!spec || !spec.ground) return null;
  return { spec, c: spec.column ? spec.column(lx, L.data[id], uOf(L, lx)) : null };
}

function terrainChunk(v, L, k) {
  const cache = v.chunks[L.key];
  let ch = cache.get(k);
  if (ch) return ch;
  const x0 = k * CHUNK_W, w = CHUNK_W, h = L.h;
  const [c, g] = makeCanvas(w, h);
  const img = g.createImageData(w, h), out = new Uint32Array(img.data.buffer);
  let hi = null;
  for (let i = 0; i < w; i++) {
    const lx = x0 + i, tw = terrainAt(uOf(L, lx));
    const A = groundCol(L, tw.a, lx), B = tw.t > 0 ? groundCol(L, tw.b, lx) : A;
    for (let y = 0; y < h; y++) {
      const s = bayer(lx, y) < tw.t * 16 ? B : A;
      if (!s) continue;
      const key = s.spec.ground(s.c, y, lx);
      if (key) out[y * w + i] = v.rgba[key];
      const hk = key && s.spec.hl && s.spec.hl(s.c, y, lx);
      if (hk) (hi || (hi = new Uint32Array(w * h)))[y * w + i] = v.rgba[hk];
    }
  }
  g.putImageData(img, 0, 0);
  const statics = L.statics.filter(s => s.x1 >= x0 && s.x0 < x0 + w);
  for (const s of statics) s.draw(g, v.p, v.lit, -x0, 0);
  ch = { c, hi: null };
  if (hi) {
    let hg;
    [ch.hi, hg] = makeCanvas(w, h);
    const himg = hg.createImageData(w, h);
    new Uint32Array(himg.data.buffer).set(hi);
    hg.putImageData(himg, 0, 0);
    hg.globalCompositeOperation = 'destination-out';     // no wind highlights over props
    for (const s of statics) s.draw(hg, v.p, v.lit, -x0, 0);
  }
  cache.set(k, ch);
  return ch;
}

// --- per frame: chunks, wind-wave highlights, then live entities ---------
const liveScratch = [];
function drawTerrain(g, v, L, afterGround) {
  const cam = Math.floor(sim.dist * L.f), t = sim.clock;
  const k0 = Math.floor(cam / CHUNK_W), k1 = Math.floor((cam + W - 1) / CHUNK_W);
  for (let k = k0; k <= k1; k++) g.drawImage(terrainChunk(v, L, k).c, k * CHUNK_W - cam, L.y);
  if (afterGround) afterGround(g, v);
  if (L.hiRows) drawWindCrests(g, v, L, cam, k0, k1);
  const list = liveScratch, live = L.live;
  list.length = 0;
  let lo = 0, hi = live.length;
  const start = cam - L.span - 4;
  while (lo < hi) { const m = (lo + hi) >> 1; if (live[m].x0 < start) lo = m + 1; else hi = m; }
  for (let i = lo; i < live.length && live[i].x0 <= cam + W + 4; i++)
    if (live[i].x1 >= cam - 4 && !(live[i].lod && quality.low)) list.push(live[i]);
  list.sort(byZ);
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    e.draw(g, v, -cam, L.y, t);
    if (e.light) addLight(e.light[0] - cam, e.light[1] + L.y, LIGHT_WINDOW);
  }
}
const byZ = (a, b) => a.z - b.z;

// Pixels flagged by a section's hl() light up under the crests of the wind
// waves: strips of rows, each a little behind the one above, so the bands
// sweep diagonally across paddy, kash and tea.
const crestX = [], crestHi = [];
function drawWindCrests(g, v, L, cam, k0, k1) {
  crestX.length = crestHi.length = 0;
  for (let k = k0; k <= k1; k++) { const ch = terrainChunk(v, L, k); if (ch.hi) { crestX.push(k * CHUNK_W - cam); crestHi.push(ch.hi); } }
  if (!crestX.length) return;
  const [r0, r1] = L.hiRows, t = sim.clock;
  for (let y = r0; y < r1; y += 3) {
    const rows = Math.min(3, r1 - y);
    let run = -1;
    for (let x = 0; x <= W; x += 2) {
      const on = x < W && windAt(uOf(L, x + cam) - (y - r0) * 7, t) > 0.38;
      if (on && run < 0) run = x;
      else if (!on && run >= 0) {
        for (let j = 0; j < crestX.length; j++) {
          const cx = crestX[j], a = Math.max(run, cx), b = Math.min(x, cx + CHUNK_W);
          if (b > a) g.drawImage(crestHi[j], a - cx, y, b - a, rows, a, L.y + y, b - a, rows);
        }
        run = -1;
      }
    }
  }
}

// --- sprite helpers for live entities ------------------------------------
function cached(v, key, w, h, paint) {
  let c = v.sprites.get(key);
  if (!c) {
    let g;
    [c, g] = makeCanvas(w, h);
    paint(g, v.p, v.lit);
    v.sprites.set(key, c);
  }
  return c;
}

// A still object that has to sort by depth with the live ones (houses in
// front of swaying palms); painted once per lighting
function spriteEnt(lx, y, w, h, ax, ay, key, paint) {
  return { x0: lx - ax, x1: lx - ax + w, z: y, warm: v => cached(v, key, w, h, paint), draw(g, v, ox, oy) {
    g.drawImage(cached(v, key, w, h, paint), lx - ax + ox, y - ay + oy);
  } };
}

// A plant that leans with the passing wind waves (one sprite per lean)
function swayer(L, lx, y, kind, a = 0, b = 0) {
  const S = SWAY[kind], [w, h, ax, ay] = S.size(a, b), u = uOf(L, lx), key = kind + a + '|' + b;
  const frames = v => {                                // all four leans, painted together
    let f = v.sprites.get(key);
    if (!f) {
      f = [];
      for (let lean = -1; lean <= 2; lean++) {
        const [c, g] = makeCanvas(w, h);
        S.paint(g, v.p, lean, a, b, ax, ay);
        f.push(c);
      }
      v.sprites.set(key, f);
    }
    return f;
  };
  return { x0: lx - ax, x1: lx - ax + w, z: y, warm: frames, draw(g, v, ox, oy, t) {
    g.drawImage(frames(v)[leanAt(u - y * 4, t) + 1], lx - ax + ox, y - ay + oy);
  } };
}

// Each kind: size(a, b) -> [w, h, anchor x, anchor y]; paint(g, p, lean, a, b, ax, ay)
const KASH_BLADES = [[[-3, 4], [2, 5]], [[-2, 5], [3, 3], [1, 4]], [[3, 4], [-2, 3]]];
const SWAY = {
  coco: {                                             // coconut palm: a = height, b = trunk lean
    size: h => [23, h + 4, 11, h + 2],
    paint(g, p, lean, h, b, ax, ay) { palm(g, ax, ay, h, b + lean, p.brown, p.green, p.greenDark); },
  },
  betel: {                                            // betel-nut palm: tall, thin, ringed trunk
    size: h => [13, h + 5, 6, h + 4],
    paint(g, p, lean, h, b, ax, ay) {
      const bend = b + lean * 0.6;
      for (let i = 0; i < h; i++) px(g, ax + Math.round(bend * (i / h) ** 2), ay - i, i % 3 ? p.grayLight : p.gray);
      stamp(g, BETEL_CROWN, ax + Math.round(bend) - 3 + (lean > 1 ? 1 : 0), ay - h - 3,
            { a: p.green, b: p.greenDark, n: p.paddy });
    },
  },
  banana: {
    size: () => [13, 8, 6, 7],
    paint(g, p, lean, a, b, ax, ay) {
      const cols = { l: p.grassLight, d: p.grass, s: p.green, b: p.tan };
      BANANA2.forEach((row, r) => stamp(g, [row], ax - 4 + (r < 5 ? Math.round(lean * (5 - r) / 5) : 0), ay - 7 + r, cols));
    },
  },
  kash: {                                             // kash phool: a = height, b = variant
    size: h => [14, h + 2, 5, h + 1],
    paint(g, p, lean, h, v, ax, ay) {
      const stalk = k => ax + Math.round(lean * 1.5 * (k / h) ** 2);
      for (const [dx, bh] of KASH_BLADES[v]) for (let k = 0; k < bh; k++) px(g, ax + Math.round(dx * (k + 1) / bh), ay - k, k < bh - 2 ? p.green : p.grass);
      for (let k = 0; k < h - 4; k++) px(g, stalk(k), ay - k, p.tan);
      const hx = stalk(h - 4), hy = ay - h + 4;    // fluffy white head, drooping downwind
      for (let j = 0; j < 6; j++) {
        const x = hx + Math.round((lean + 0.5) * j / 4), y = hy - j;
        px(g, x, y, j === 5 ? p.cloudShade : p.white);
        if (j > 0 && j < 5) px(g, x - 1, y, lean >= 2 || (j + v) % 2 ? p.white : p.cloudShade);
        if (j > 1 && j < 4 && v !== 1) px(g, x + 1, y + 1, p.cloudShade);
      }
    },
  },
  bamboo: {                                           // bamboo clump: a = height, b = culms
    size: h => [23, h + 3, 11, h + 2],
    paint(g, p, lean, h, n, ax, ay) {
      for (let i = 0; i < n; i++) {
        const spread = (i - (n - 1) / 2) * 2.2, hh = Math.round(h - Math.abs(spread) * 1.5);
        for (let k = 0; k < hh; k++) {
          const x = ax + Math.round(spread * k / hh * 1.6 + (lean + 0.5) * (k / hh) ** 2 * 2.5);
          px(g, x, ay - k, k % 4 === 3 ? p.greenDark : p.grass);
          if (k > hh * 0.45 && k % 2 === (i & 1)) px(g, x + (k % 4 < 2 ? -1 : 1), ay - k + 1, p.green);
        }
      }
    },
  },
  fern: {
    size: () => [13, 7, 6, 6],
    paint(g, p, lean, a, b, ax, ay) {
      const arc = [1, 3, 4, 4, 3];
      for (const d of [-1, 1]) for (let k = 0; k < 5; k++)
        px(g, ax + d * (k + 1) + (k > 2 ? Math.round(lean * 0.7) : 0), ay - arc[k] + (k > 3 ? 1 : 0), k > 2 ? p.grass : p.green);
      rect(g, ax, ay - 2, 1, 3, p.greenDark);
    },
  },
};

// --- what each section paints and spawns ---------------------------------
// Per layer: spawn(ctx) lays out objects (returning data for the ground),
// column(lx, data, u) prepares one column, ground(col, y, lx) returns the
// palette key of a pixel, and hl(col, y, lx) the key it takes on under a
// wind crest. Ground rows: far 52, mid 34, fg 12 (all screen y 112 / 118 / 158).
const SECTIONS = {
  village: {
    name: 'VILLAGE', sky: 'normal', birds: ['egret', 0.06],
    far: { spawn: ctx => { treeLine(ctx); }, ground: (c, y) => y >= 52 ? 'haze' : null },
    mid: { spawn: villageMid, column: paddyColumn, ground: paddyGround },
    fg:  { spawn: villageFg, column: villageFgColumn, ground: villageFgGround, hl: villageFgHl },
  },
  river: {
    name: 'MEGHNA', sky: 'normal', birds: ['gull', 0.4],
    far: {
      spawn: ctx => { farBank(ctx, 44); },
      ground: (c, y, lx) => y < 44 ? null : y < 47 ? 'haze' : y === 47 ? (bayer(lx, y) < 8 ? 'tan' : 'haze')
        : y < 50 ? 'skyLight' : hash2(lx >> 3, y) < 0.14 ? 'skyLight' : 'skyMid',
    },
    mid: { spawn: riverMid, ground: (c, y, lx) => y < 34 ? null : riverWater(lx, y, 56) },
    fg:  { spawn: riverFg, column: (lx, D, u) => bankRows(u), ground: riverFgGround },
  },
  kash: {
    name: 'KASH PHOOL', sky: 'deep', birds: ['egret', 0.05],
    far: {
      spawn: ctx => { farBank(ctx, 46); },
      ground: (c, y, lx) => y < 46 ? null : y < 49 ? 'haze' : y === 49 ? 'tan'
        : y < 54 ? (y < 51 || hash2(lx >> 3, y) < 0.15 ? 'skyLight' : 'skyMid')
        : y === 54 ? (bayer(lx, y) < 8 ? 'cream' : 'tan')
        : bayer(lx, y) < 4 ? 'white' : hash2(lx, y) < 0.3 ? 'tan' : 'cream',          // distant kash
    },
    mid: { spawn: kashMid, column: lx => 28 + Math.floor(hash2(lx, 3) * 4), ground: kashMidGround,
           hl: (top, y, lx) => y < 34 && bayer(lx, y) < 9 ? 'white' : null },
    fg:  { spawn: kashFg, ground: (c, y, lx) => y < 12 ? null : y === 12 ? (bayer(lx, y) < 8 ? 'tan' : 'cream')
             : hash2(lx, y) < 0.04 ? 'white' : hash2(lx >> 1, y >> 1) < 0.25 ? 'tan' : 'cream' },
  },
  tea: {
    name: 'TEA GARDEN', sky: 'normal', birds: null,
    far: { spawn: teaFar, ground: (c, y) => y >= 52 ? 'haze' : null },
    mid: { spawn: teaMid, ground: (c, y, lx) => y < 34 ? null : teaHedge(lx, y, 34, 5, TEA_PROF_MID) || 'greenDark' },
    fg:  { spawn: ctx => { addTufts(ctx, 14, 13, 14); }, ground: teaFgGround,
           hl: (c, y, lx) => { if (y < 15) return null; const [rel, bump] = teaFgRow(lx, y); return rel === 2 - bump && bayer(lx, y) < 9 ? 'grassLight' : null; } },
  },
  hills: {
    name: 'SYLHET HILLS', sky: 'mist', birds: ['hawk', 0.05],
    far: { spawn: hillsFar, ground: (c, y) => y >= 52 ? 'haze' : null },
    mid: { spawn: hillsMid, ground: (c, y, lx) => y < 34 ? null : hash2(lx >> 1, y >> 1) < 0.3 ? 'greenDark' : bayer(lx, y) < 3 ? 'grass' : 'green' },
    fg:  { spawn: hillsFg, column: (lx, D) => D.streams.find(s => Math.abs(lx - s.cx) < s.w + 24) || null, ground: hillsFgGround },
  },
};

// --- shared spawners ------------------------------------------------------
// Distant tree line with coconut palms, all one haze colour (far layer)
function treeLine(ctx, base = 52) {
  const { rng } = ctx;
  for (let x = ctx.from; x < ctx.to; ) {
    if (rng() < 0.12) { x += randInt(rng, 8, 26); continue; }       // open gap
    const r = randInt(rng, 2, 6), cy = base - randInt(rng, 0, 5) - r + 1, cx = x;
    if (ctx.ok(cx)) ctx.stat(cx - r, cx + r, 0, (g, p, lit, ox) => {
      disc(g, cx + ox, cy, r, p.haze);
      rect(g, cx - r + 1 + ox, cy, 2 * r - 1, base - cy, p.haze);
    });
    if (rng() < 0.06) {
      const h = randInt(rng, 12, 18), lean = randInt(rng, -2, 2), tx = x + randInt(rng, -3, 3);
      if (ctx.ok(tx)) ctx.stat(tx - 8, tx + 8, 1, (g, p, lit, ox) => palm(g, tx + ox, base, h, lean, p.haze, p.haze, p.haze));
    }
    x += r + randInt(rng, 0, 3);
  }
}

// The low far shore of a wide river, tiny sails, shimmer on the open water
function farBank(ctx, y) {
  const { rng } = ctx, dashes = [];
  for (let x = ctx.from; x < ctx.to; x += randInt(rng, 2, 6)) {
    if (!ctx.ok(x)) continue;
    const r = randInt(rng, 1, 2), tx = x, isPalm = rng() < 0.08, h = randInt(rng, 5, 8);
    ctx.stat(tx - 7, tx + 7, 0, (g, p, lit, ox) =>
      isPalm ? palm(g, tx + ox, y + 1, h, 0, p.haze, p.haze, p.haze) : disc(g, tx + ox, y - r + 1, r, p.haze));
  }
  for (let x = ctx.from; x < ctx.to; x += randInt(rng, 4, 12))
    if (ctx.ok(x)) dashes.push([x, randInt(rng, y + 5, Math.min(59, y + 14)), randInt(rng, 2, 4), rng() * 6, 1 + rng() * 2]);
  chunkedShimmer(ctx, dashes, 0);
  for (let x = ctx.from + randInt(rng, 20, 80); x < ctx.to; x += randInt(rng, 70, 160))
    if (ctx.ok(x)) ctx.live(tinySailEnt(x, randInt(rng, y + 5, y + 9), rng));
}

function addTufts(ctx, every, y0, y1, tall = 7) {
  const { rng } = ctx;
  for (let x = ctx.from + randInt(rng, 0, every); x < ctx.to; x += randInt(rng, every >> 1, (every * 1.5) | 0)) {
    const base = randInt(rng, y0, y1), h = randInt(rng, 3, tall), blades = [];
    for (let b = randInt(rng, 3, 6); b > 0; b--) blades.push([randInt(rng, -2, 2), randInt(rng, Math.max(2, h - 3), h), randInt(rng, -2, 2), rng()]);
    const flower = rng() < 0.12 ? (rng() < 0.5 ? 'red' : 'white') : null, tx = x;
    if (!ctx.ok(x)) continue;
    ctx.stat(tx - 4, tx + 4, base, (g, p, lit, ox) => {
      for (const [dx, bh, lean, cr] of blades) {
        const col = cr < 0.3 ? p.greenDark : cr < 0.7 ? p.grass : p.grassLight;
        for (let k = 0; k < bh; k++) px(g, tx + ox + dx + Math.round(lean * k / bh), base - k, col);
      }
      if (flower) { const [dx, bh, lean] = blades[0]; px(g, tx + ox + dx + lean, base - bh, p[flower]); }
    });
  }
}

// Fog banks drifting slowly back and forth (pre-dithered sprites)
function fogBands(ctx, y0, y1, gap, dens) {
  const { rng } = ctx;
  for (let x = ctx.from; x < ctx.to; x += randInt(rng, gap, gap * 2)) {
    const w = randInt(rng, 60, 150), h = randInt(rng, 4, 8), y = randInt(rng, y0, y1), ph = rng() * 6, drift = randInt(rng, 20, 50), lx = x;
    if (!ctx.ok(x + (w >> 1))) continue;
    const key = 'fog' + w + '|' + h + '|' + dens;
    ctx.live({ x0: lx - drift, x1: lx + w + drift, z: 100 + y, warm: v => fogSprite(v, key, w, h, dens), draw(g, v, ox, oy, t) {
      g.drawImage(fogSprite(v, key, w, h, dens), Math.round(lx + Math.sin(t * 0.03 + ph) * drift) + ox, y + oy);
    } });
  }
}

function fogSprite(v, key, w, h, dens) {
  return cached(v, key, w, h, (g, p) => {
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const ex = Math.min(1, Math.min(x, w - 1 - x) / (w * 0.3)), ey = 1 - Math.abs((y + 0.5) / h * 2 - 1);
        if (bayer(x, y) < dens * ex * (0.4 + 0.6 * ey)) px(g, x, y, p.white);
      }
  });
}

// --- 1. village ------------------------------------------------------------
const CROPS = {                          // [base, row lines, tips lit by the wind]
  paddy:  ['paddy', 'grassLight', 'cream'],
  young:  ['grassLight', 'grass', 'paddy'],
  green:  ['grass', 'green', 'grassLight'],
  dark:   ['green', 'greenDark', 'grass'],
  fallow: ['tan', 'brown', 'paddy'],
};
const MID_BANDS = [[34, 5], [39, 7], [46, 9], [55, 11], [66, 14]];   // field bands, taller towards the viewer

// Plots along a row of fields: sorted start columns, one crop each
function plots(rng, from, to, wMin, wMax, crops) {
  const xs = [], cs = [];
  for (let x = from - wMax; x < to + wMax; x += randInt(rng, wMin, wMax)) { xs.push(x); cs.push(pick(rng, crops)); }
  return { xs, cs };
}
function plotAt(P, lx) {
  let lo = 0, hi = P.xs.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (P.xs[m] <= lx) lo = m; else hi = m - 1; }
  return lo;
}

function villageMid(ctx) {
  const { rng, L } = ctx, G = 34;
  const bands = MID_BANDS.map(() => plots(rng, ctx.from, ctx.to, 28, 90, ['paddy', 'young', 'green', 'young', 'dark', 'fallow', 'paddy']));
  for (let vx = ctx.from + randInt(rng, 10, 40); vx < ctx.to; ) {      // hamlets
    const cw = randInt(rng, 40, 100);
    for (let x = vx; x < vx + cw; x += randInt(rng, 6, 12)) {         // back row of trees
      const r = rng(), tx = x, h = randInt(rng, 14, 21), lean = randInt(rng, -2, 2);
      const rr = randInt(rng, 4, 7), th = randInt(rng, 2, 6), seed = randInt(rng, 1, 1e6);
      if (!ctx.ok(tx)) continue;
      if (r < 0.22) ctx.live(swayer(L, tx, G - 1, 'coco', h, lean));
      else if (r < 0.36) ctx.live(swayer(L, tx, G - 1, 'betel', h + 1, Math.sign(lean)));
      else ctx.stat(tx - rr - 2, tx + rr + 1, G - 1, (g, p, lit, ox) => roundTree(g, tx + ox, G - 1, rr, th, p, seed));
    }
    for (let i = randInt(rng, 0, 2); i >= 0; i--) {                    // banana plants
      const bx = vx + randInt(rng, 0, cw);
      if (ctx.ok(bx)) ctx.live(swayer(L, bx, G + 1, 'banana'));
    }
    for (let i = randInt(rng, 1, 3); i > 0; i--) {                     // houses in front
      const hx = vx + randInt(rng, 0, cw - 16), hw = randInt(rng, 10, 16), fence = rng() < 0.6 ? randInt(rng, 4, 10) : 0;
      const tin = rng() < 0.8, roll = rng();
      if (!ctx.ok(hx)) continue;
      const e = spriteEnt(hx, G + 2, hw + fence + 3, 10, 1, 10, 'house' + hx + '|' + hw,
        (g, p, lit) => house(g, 1, 10, hw, p, tin, lit && roll < 0.7, fence));
      if (roll < 0.7) e.light = [hx + hw - 4, G - 1];      // its window glows after dark
      ctx.live(e);
    }
    vx += cw + randInt(rng, 30, 110);
  }
  for (let x = ctx.from; x < ctx.to; x += randInt(rng, 14, 40)) {    // lone trees, palms, haystacks
    const kind = rng(), tx = x, r = randInt(rng, 3, 5), th = randInt(rng, 2, 4), seed = randInt(rng, 1, 1e6);
    const h = randInt(rng, 13, 20), lean = randInt(rng, -2, 2), y = randInt(rng, G + 6, G + 18);
    if (!ctx.ok(tx)) continue;
    if (kind < 0.3) ctx.stat(tx - r - 2, tx + r + 1, G + 1, (g, p, lit, ox) => roundTree(g, tx + ox, G + 1, r, th, p, seed));
    else if (kind < 0.5) ctx.live(swayer(L, tx, G + 1, 'coco', h, lean));
    else if (kind < 0.62) ctx.live(swayer(L, tx, G + 1, 'betel', h + 2, 0));
    else if (kind < 0.85) ctx.live(spriteEnt(tx, y, 5, 4, 2, 4, 'hay', (g, p) => stamp(g, HAYSTACK, 0, 0, { s: p.brown, h: p.paddy, d: p.tan })));
  }
  return { bands };
}

function paddyColumn(lx, D) {
  return D.bands.map(P => { const i = plotAt(P, lx); return [P.cs[i], P.xs[i] === lx]; });
}

function paddyGround(c, y, lx) {
  if (y < 34) return null;
  let i = MID_BANDS.length - 1;
  while (y < MID_BANDS[i][0]) i--;
  const by = MID_BANDS[i][0], [crop, bund] = c[i], C = CROPS[crop];
  if (bund || y === by) return 'green';
  return (y - by) % 2 === 1 && bayer(lx, y) < 6 ? C[1] : C[0];
}

// Near fields: embankment (rows 12-16), a dirt road here and there (17-20),
// paddy with ponds below it
function villageFg(ctx) {
  const { rng, L } = ctx;
  const D = { plots: plots(rng, ctx.from, ctx.to, 40, 120, ['paddy', 'young', 'young', 'green', 'paddy', 'dark']), roads: [], ponds: [] };
  for (let x = ctx.from + randInt(rng, 0, 200); x < ctx.to; ) {
    const len = randInt(rng, 260, 560), a = x;
    D.roads.push([a, a + len]);
    for (let n = randInt(rng, 1, 2); n > 0; n--)                      // rickshaw or bicycle on it
      if (ctx.ok(a + (len >> 1))) ctx.live(rickshawEnt(a, a + len, 20, rng, rng() < 0.4));
    x += len + randInt(rng, 140, 420);
  }
  for (let x = ctx.from + randInt(rng, 40, 160); x < ctx.to; x += randInt(rng, 160, 380)) {
    const pd = { cx: x, rx: randInt(rng, 12, 22), ry: randInt(rng, 4, 5), cy: randInt(rng, 26, 28) };
    if (!ctx.ok(x)) continue;
    D.ponds.push(pd);
    const dashes = [];
    for (let i = 0; i < pd.rx; i++) {
      const dy = randInt(rng, -pd.ry + 1, pd.ry - 1), w = randInt(rng, 2, 4);
      const half = Math.floor(pd.rx * Math.sqrt(1 - (dy / pd.ry) ** 2)) - w;
      if (half > 1) dashes.push([pd.cx + randInt(rng, -half, half - 1), pd.cy + dy, w, rng() * 6, 1.2 + rng() * 2]);
    }
    ctx.live(shimmerEnt(dashes, pd.cy - pd.ry));
    for (let n = randInt(rng, 1, 3); n > 0; n--) ctx.live(duckEnt(pd, rng));
  }
  const clear = (x, pad) => !D.ponds.some(pd => Math.abs(x - pd.cx) < pd.rx + pad);
  for (let x = ctx.from + randInt(rng, 30, 120); x < ctx.to; x += randInt(rng, 120, 300)) {
    const y = randInt(rng, 25, 32), cow = rng() < 0.55;
    if (!ctx.ok(x) || !clear(x, 12)) continue;
    if (cow) ctx.live(cowEnt(x, y, rng));
    else { const tx = x; ctx.stat(tx - 4, tx + 5, y, (g, p, lit, ox) => stamp(g, HAYSTACK_BIG, tx - 4 + ox, y - 6, { s: p.brown, h: p.paddy, d: p.tan })); }
  }
  addTufts(ctx, 10, 13, 16);
  return D;
}

function villageFgColumn(lx, D) {
  const i = plotAt(D.plots, lx);
  let road = -1, pond = null;
  for (const [a, b] of D.roads) if (lx >= a && lx < b) { road = Math.min(lx - a, b - 1 - lx); break; }
  for (const pd of D.ponds) if (Math.abs(lx - pd.cx) <= pd.rx + 2) { pond = pd; break; }
  return { crop: D.plots.cs[i], bund: D.plots.xs[i] === lx, road, pond };
}

// Pond: muddy far rim, the sky mirrored (pale near the far bank, deeper
// blue towards the viewer), a reflection of the bank along the top
function pondPixel(pd, lx, y) {
  const dx = (lx - pd.cx) / pd.rx, dy = (y - pd.cy) / pd.ry, d = dx * dx + dy * dy;
  if (d > 1.35) return null;
  if (d > 1) return dy < 0 ? 'brown' : 'greenDark';
  if (dy < -0.7) return bayer(lx, y) < 8 ? 'green' : 'skyLight';
  return dy < -0.2 ? (bayer(lx, y) < 10 ? 'skyLight' : 'skyMid') : dy < 0.4 ? 'skyMid' : bayer(lx, y) < 6 ? 'skyDeep' : 'skyMid';
}

function villageFgGround(c, y, lx) {
  if (y < 12) return null;
  if (y === 12) return bayer(lx, y) < 10 ? 'grass' : 'green';
  if (y < 16) return hash2(lx >> 1, y) < 0.18 ? 'greenDark' : hash2(lx, y) < 0.1 ? 'grass' : 'green';
  if (y === 16) return bayer(lx, y) < 8 ? 'greenDark' : 'green';
  if (c.road >= 0 && y <= 20) {
    if (y === 17 || y === 20) return bayer(lx, y) < (c.road < 6 ? 4 : 9) ? 'tan' : 'grass';
    return y === 19 && hash2(lx >> 2, 7) < 0.6 && bayer(lx, y) < 10 ? 'brown' : hash2(lx, y) < 0.06 ? 'cream' : 'tan';
  }
  const pk = c.pond && pondPixel(c.pond, lx, y);
  if (pk) return pk;
  if (y === 17 || c.bund) return 'green';
  const C = CROPS[c.crop];
  return y % 2 === 1 && bayer(lx, y) < 7 ? C[1] : C[0];
}

// Under a wind crest the rice tips catch the light and the row lines shift
function villageFgHl(c, y, lx) {
  if (y < 18 || c.bund || (c.road >= 0 && y <= 20) || (c.pond && pondPixel(c.pond, lx, y))) return null;
  const C = CROPS[c.crop];
  if (y % 2) return bayer(lx + 2, y) < 7 ? C[1] : bayer(lx, y) < 7 ? C[0] : null;
  return bayer(lx, y) < 5 ? C[2] : null;
}

// --- 2. Meghna river ------------------------------------------------------
function riverWater(lx, y, deep) {
  return hash2(lx >> 2, y) < 0.1 ? 'skyLight' : y > deep && bayer(lx, y) < 3 ? 'skyDeep' : 'skyMid';
}

function riverMid(ctx) {
  const { rng } = ctx, dashes = [];
  for (let x = ctx.from + randInt(rng, 30, 90); x < ctx.to; x += randInt(rng, 90, 200)) {
    const r = rng(), wl = randInt(rng, 29, 33);           // waterline just above the carriage roofs
    if (!ctx.ok(x)) continue;
    ctx.live(r < 0.6 ? noukaEnt(x, wl, rng, r < 0.4 ? 'sail' : 'hood') : fisherEnt(x, wl, rng, false));
  }
  for (let x = ctx.from; x < ctx.to; x += randInt(rng, 3, 8))
    if (ctx.ok(x)) dashes.push([x, randInt(rng, 35, 78), randInt(rng, 2, 6), rng() * 6, 1 + rng() * 2]);
  chunkedShimmer(ctx, dashes, 0);
}

// Rows of riverbank left beside the track: 5 on land, sloping away to none
// over the last 60 px before each abutment
function bankRows(u) {
  const out = Math.max(BRIDGE.u0 - u, u - BRIDGE.u1, 0);
  return Math.min(5, Math.round(out / 12));
}

function riverFgGround(bank, y, lx) {
  if (y < 12) return null;
  if (y < 12 + bank) return y === 12 ? (bayer(lx, y) < 10 ? 'grass' : 'green')
                          : y === 11 + bank ? (bayer(lx, y) < 8 ? 'tan' : 'cream') : 'green';
  if (y < 15) return null;                      // under the deck: the river further back shows through
  return hash2(lx >> 3, y) < 0.08 ? 'skyLight' : y > 24 && bayer(lx, y) < y - 24 ? 'skyDeep' : 'skyMid';
}

function riverFg(ctx) {
  const { rng, L } = ctx, dashes = [];
  for (let x = ctx.from; x < ctx.to; x += randInt(rng, 2, 6))
    if (ctx.ok(x)) dashes.push([x, randInt(rng, 18, 33), randInt(rng, 2, 7), rng() * 6, 0.8 + rng() * 2.2]);
  chunkedShimmer(ctx, dashes, 0, ['skyLight', 'white']);
  for (let x = ctx.from; x < ctx.to; x += randInt(rng, 30, 90))
    if (ctx.ok(x)) ctx.live(hyacinthEnt(x, randInt(rng, 19, 32), rng));
  for (let x = ctx.from + randInt(rng, 100, 300); x < ctx.to; x += randInt(rng, 380, 700))
    if (ctx.ok(x)) ctx.live(fisherEnt(x, randInt(rng, 28, 31), rng, true));
  const onBank = { ...ctx, ok: x => ctx.ok(x) && bankRows(uOf(L, x)) >= 4 };
  addTufts(onBank, 9, 13, 15);
}

// --- 3. kash phool chars -----------------------------------------------------
// Every other plant is skipped on low quality (the densest thing on screen)
let thinCount = 0;
const thinOut = e => { if (++thinCount & 1) e.lod = true; return e; };
function kashMid(ctx) {
  const { rng, L } = ctx;
  for (let row = 0; row < 2; row++)
    for (let x = ctx.from + randInt(rng, 0, 6); x < ctx.to; x += randInt(rng, 5, 11)) {
      const y = 34 + row * 3 + randInt(rng, 0, 1), h = randInt(rng, 9, 13), v = randInt(rng, 0, 2);
      if (ctx.ok(x)) ctx.live(thinOut(swayer(L, x, y, 'kash', h, v)));
    }
}

// The dense field seen from afar: a fuzz of plumes over the sand
function kashMidGround(top, y, lx) {
  if (y < top) return null;
  if (y < 34) return bayer(lx, y) < 9 ? 'cloudShade' : y > 31 ? 'tan' : null;
  if (y < 38) return bayer(lx, y) < 5 ? 'grass' : 'tan';
  return hash2(lx, y) < 0.3 ? 'tan' : 'cream';
}

function kashFg(ctx) {
  const { rng, L } = ctx;
  // nearer rows stand taller; the back row only just reaches the ballast
  for (const [base, hMin, hMax] of [[17, 8, 11], [22, 9, 13], [27, 10, 14], [32, 11, 16]])
    for (let x = ctx.from + randInt(rng, 0, 6); x < ctx.to; x += randInt(rng, 5, 10)) {
      const y = base + randInt(rng, -1, 1), h = randInt(rng, hMin, hMax), v = randInt(rng, 0, 2);
      if (ctx.ok(x)) ctx.live(thinOut(swayer(L, x, y, 'kash', h, v)));
    }
}

// --- 4. Srimangal tea gardens --------------------------------------------------
const TEA_PROF = [0, 1, 1, 1, 1, 1, 1, 0];          // bush outline across one period (fg)
const TEA_PROF_MID = [1, 2, 2, 2, 1, 0];

// Rows of clipped tea bushes: rows `gap` px apart starting at y0
function teaHedge(lx, y, y0, gap, prof) {
  const r = Math.floor((y - y0) / gap), ry = y0 + r * gap + gap - 2, n = prof.length;
  const h = prof[((lx + r * 4) % n + n) % n];
  if (y <= ry && y >= ry - h) return y === ry - h ? 'grass' : hash2(lx, y) < 0.15 ? 'greenDark' : 'green';
  return null;
}

// Near tea: 6-row bands of a red-earth path, then a clipped hedge whose top
// is scalloped into rounded bushes, then its shadow
function teaFgRow(lx, y) {
  const r = Math.floor((y - 15) / 6), rel = y - 15 - r * 6, n = TEA_PROF.length;
  return [rel, TEA_PROF[((lx + r * 3) % n + n) % n]];
}

function teaFgGround(c, y, lx) {
  if (y < 12) return null;
  if (y < 15) return y === 12 ? (bayer(lx, y) < 10 ? 'grass' : 'green') : hash2(lx >> 1, y) < 0.2 ? 'greenDark' : 'green';
  const [rel, bump] = teaFgRow(lx, y), top = 2 - bump;
  if (rel === 5) return 'greenDark';
  if (rel < top) return rel === 0 && bayer(lx, y) < 6 ? 'rust' : bump ? 'brown' : 'brownDark';
  if (rel === top) return 'grass';
  return hash2(lx, y) < 0.15 ? 'greenDark' : 'green';
}

function teaFar(ctx) {
  const { rng } = ctx;
  for (let x = ctx.from - 60; x < ctx.to; x += randInt(rng, 40, 90)) {
    const w = randInt(rng, 70, 150), h = randInt(rng, 10, 22), tx = x, back = h > 16;
    if (ctx.ok(x + (w >> 1))) ctx.stat(tx, tx + w, back ? 0 : 1, (g, p, lit, ox) =>
      hump(g, tx + ox, 53, w, h, back ? p.haze : p.greenDark, back ? null : p.green));
  }
  fogBands(ctx, 34, 48, 40, 7);
}

function teaMid(ctx) {
  const { rng } = ctx;
  for (let x = ctx.from - 100; x < ctx.to; x += randInt(rng, 90, 170)) {
    const H = { x0: x, w: randInt(rng, 150, 260), h: randInt(rng, 16, 30), seed: randInt(rng, 1, 1e6) };
    if (!ctx.ok(x + (H.w >> 1))) continue;
    ctx.stat(H.x0, H.x0 + H.w, -H.h, (g, p, lit, ox) => teaHill(g, p, H, ox));
    for (let n = randInt(rng, 1, 3); n > 0; n--) {
      const i = randInt(rng, 20, H.w - 20), d = 2 + 4 * randInt(rng, 0, Math.max(0, Math.floor(H.h / 4) - 2));
      if (humpTop(i, H.w, H.h, 36) + d < 34) ctx.live(pickerEnt(H, i, d, rng));
    }
  }
  fogBands(ctx, 10, 26, 60, 6);
}

// A tea hill: rows of bushes following the slope, tall thin shade trees
function teaHill(g, p, H, ox) {
  const rng = mulberry32(H.seed), base = 36, x = H.x0 + ox;
  const top = i => humpTop(i, H.w, H.h, base);
  for (let i = 0; i < H.w; i++) { const t = top(i); if (t < base) { rect(g, x + i, t, 1, base - t + 2, p.greenDark); px(g, x + i, t, p.green); } }
  for (let d = 2; d < H.h; d += 4)
    for (let i = 2; i < H.w - 2; i += 4) {
      const y = top(i) + d;
      if (y >= base) continue;
      rect(g, x + i - 1, y, 3, 1, p.grass);
      px(g, x + i, y - 1, p.grassLight);
    }
  for (let i = randInt(rng, 10, 30); i < H.w - 10; i += randInt(rng, 18, 34)) {
    const t = top(i), ct = t - randInt(rng, 11, 16), cw = randInt(rng, 5, 8), tx = x + i;
    rect(g, tx, ct + 2, 1, t + 2 - ct, p.grayLight);
    px(g, tx - 1, ct + 4, p.grayLight);
    rect(g, tx - cw + 2, ct, 2 * cw - 3, 1, p.green);
    rect(g, tx - cw + 1, ct + 1, 2 * cw - 1, 2, p.greenDark);
    ditherRect(g, tx - cw + 2, ct + 1, 2 * cw - 3, 1, p.green, 6);
  }
}

// --- 5. Sylhet hills -------------------------------------------------------
function hillsFar(ctx) {
  const { rng } = ctx;
  for (let x = ctx.from - 120; x < ctx.to; x += randInt(rng, 60, 120)) {      // tall blue-green range
    const w = randInt(rng, 140, 260), h = randInt(rng, 30, 46), tx = x;
    if (ctx.ok(x + (w >> 1))) ctx.stat(tx, tx + w, 0, (g, p, lit, ox) => hump(g, tx + ox, 53, w, h, p.haze, null, p.skyMid));
  }
  for (let x = ctx.from - 80; x < ctx.to; x += randInt(rng, 50, 100)) {       // nearer, greener ridges
    const w = randInt(rng, 90, 170), h = randInt(rng, 14, 26), tx = x;
    if (ctx.ok(x + (w >> 1))) ctx.stat(tx, tx + w, 1, (g, p, lit, ox) => hump(g, tx + ox, 53, w, h, p.greenDark, p.green));
  }
  fogBands(ctx, 24, 46, 36, 8);
}

function hillsMid(ctx) {
  const { rng, L } = ctx;
  for (let x = ctx.from - 80; x < ctx.to; x += randInt(rng, 70, 140)) {
    const w = randInt(rng, 110, 200), h = randInt(rng, 12, 24), x0 = x, seed = randInt(rng, 1, 1e6);
    const stream = rng() < 0.6 ? streamPath(rng, w, h) : null;
    if (!ctx.ok(x + (w >> 1))) continue;
    ctx.stat(x0, x0 + w, -h, (g, p, lit, ox) => forestHill(g, p, x0 + ox, w, h, seed, stream));
    if (stream) ctx.live(streamFlowEnt(stream.map(([i, y]) => [x0 + i, y]), rng));
  }
  for (let x = ctx.from; x < ctx.to; x += randInt(rng, 16, 40)) {
    const y = randInt(rng, 35, 38), bamboo = rng() < 0.6, h = randInt(rng, 16, 24), n = randInt(rng, 3, 5);
    if (ctx.ok(x)) ctx.live(bamboo ? swayer(L, x, y, 'bamboo', h, n) : swayer(L, x, y, 'betel', h, n - 4));
  }
  fogBands(ctx, 10, 28, 46, 7);
}

// A stream wandering down a hillside from near the crest: [i, y] points
function streamPath(rng, w, h, base = 37) {
  let i = randInt(rng, Math.floor(w * 0.35), Math.floor(w * 0.65));
  const pts = [];
  for (let y = humpTop(i, w, h, base) + 3; y < base; y++) {
    if (y > humpTop(i, w, h, base)) pts.push([i, y]);
    i += randInt(rng, -1, 1) + (rng() < 0.3 ? Math.sign(i - w / 2) : 0);
  }
  return pts;
}

function forestHill(g, p, x, w, h, seed, stream) {
  const rng = mulberry32(seed), base = 37;
  hump(g, x, base, w, h, p.green, p.grass);
  for (let i = 0; i < w * h / 14; i++) {                          // crowns all over the slope
    const j = randInt(rng, 3, w - 4), t = humpTop(j, w, h, base), y = randInt(rng, t + 1, base), r = randInt(rng, 1, 2);
    if (y >= base) continue;
    disc(g, x + j, y, r, p.greenDark);
    px(g, x + j - 1, y - 1, p.grass);
  }
  if (stream) for (const [j, y] of stream) { px(g, x + j, y, p.skyMid); px(g, x + j + 1, y, p.skyLight); }
}

function hillsFg(ctx) {
  const { rng, L } = ctx, streams = [];
  for (let x = ctx.from + randInt(rng, 60, 200); x < ctx.to; x += randInt(rng, 260, 520)) {
    const s = { cx: x, w: randInt(rng, 7, 12) };
    if (!ctx.ok(x)) continue;
    streams.push(s);
    const pts = [];
    for (let y = 14; y < 34; y++) pts.push([Math.round(s.cx + (y - 12) * 0.8) + randInt(rng, -2, 2), y]);
    ctx.live(streamFlowEnt(pts, rng));
  }
  const dry = { ...ctx, ok: x => ctx.ok(x) && !streams.some(s => Math.abs(x - s.cx - 8) < s.w + 14) };
  for (let x = ctx.from; x < ctx.to; x += randInt(rng, 10, 30)) {
    const y = randInt(rng, 15, 33), fern = rng() < 0.5, tx = x;
    if (!dry.ok(x)) continue;
    if (fern) ctx.live(swayer(L, tx, y, 'fern'));
    else ctx.stat(tx - 2, tx + 2, y, (g, p, lit, ox) => { rect(g, tx - 1 + ox, y - 1, 3, 2, p.gray); px(g, tx + ox, y - 1, p.grayLight); });
  }
  addTufts(dry, 12, 13, 16);
  return { streams };
}

// Grass, and a hill stream running out from a culvert under the track
function hillsFgGround(s, y, lx) {
  if (y < 12) return null;
  if (s) {
    const d = Math.abs(lx - (s.cx + (y - 12) * 0.8)), hw = s.w / 2 + (y - 12) * 0.12;
    if (d < hw) return y < 14 ? 'navy' : hash2(lx >> 1, y) < 0.12 ? 'skyLight' : 'skyMid';
    if (d < hw + 2) return hash2(lx, y) < 0.4 ? 'grayLight' : 'gray';
  }
  if (y === 12) return bayer(lx, y) < 10 ? 'grass' : 'green';
  return hash2(lx >> 1, y) < 0.16 ? 'greenDark' : hash2(lx, y + 99) < 0.05 ? 'grass' : 'green';
}

// --- live entities -----------------------------------------------------------
// Every entity: { x0, x1 (layer columns it may cover), z (draw order),
// draw(g, v, ox, oy, t) } with screen x = lx + ox and screen y = y + oy.

// Glints on water: [lx, y, w, phase, rate] dashes that wink on and off
function shimmerEnt(dashes, z, cols = ['skyLight', 'white']) {
  let x0 = Infinity, x1 = -Infinity;
  for (const d of dashes) { x0 = Math.min(x0, d[0]); x1 = Math.max(x1, d[0] + d[2] + 1); }
  return { x0, x1, z, draw(g, v, ox, oy, t) {
    for (const [x, y, w, ph, rate] of dashes) {
      const s = Math.sin(t * rate + ph);
      if (s > 0.35) rect(g, x + ox + (s > 0.8 ? 1 : 0), y + oy, w, 1, v.p[s > 0.8 ? cols[1] : cols[0]]);
    }
  } };
}

// Split a long run of dashes into entities of ~64 px so culling stays cheap
function chunkedShimmer(ctx, dashes, z, cols) {
  dashes.sort((a, b) => a[0] - b[0]);
  for (let i = 0; i < dashes.length; ) {
    const grp = [], end = dashes[i][0] + 64;
    while (i < dashes.length && dashes[i][0] < end) grp.push(dashes[i++]);
    ctx.live(shimmerEnt(grp, z, cols));
  }
}

// Water running downhill: bright points travel along the path
function streamFlowEnt(pts, rng) {
  const ph = rng() * 6;
  let x0 = Infinity, x1 = -Infinity;
  for (const [x] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x + 1); }
  return { x0, x1, z: 1, draw(g, v, ox, oy, t) {
    for (let k = 0; k < pts.length; k++)
      if ((((k - t * 6 + ph) % 5) + 5) % 5 < 1) px(g, pts[k][0] + ox, pts[k][1] + oy, v.p.white);
  } };
}

function tinySailEnt(lx, y, rng) {
  const ph = rng() * 6;
  return { x0: lx - 12, x1: lx + 12, z: y, draw(g, v, ox, oy, t) {
    const p = v.p, x = Math.round(lx + Math.sin(t * 0.04 + ph) * 8) + ox, yy = y + oy;
    rect(g, x - 2, yy, 5, 1, p.brownDark);
    rect(g, x, yy - 3, 1, 3, p.cream);
    px(g, x + 1, yy - 2, p.cream);
  } };
}

// Country boats (nouka): sails patched with odd bits of cloth, or a
// bamboo-hooded cargo boat poled along
const NOUKA = {
  sail: ['.....s......', '.....ss.....', '.....sps....', '.....ssqs...', '.....sspss..', '.....sssqss.',
         '.....m......', 'h....m.....h', 'hhhhhhhhhhhh', '.dddddddddd.'],
  hood: ['...tttt..b..', '..tttttt.b..', 'h.tttttt.b.h', 'hhhhhhhhhhhh', '.dddddddddd.'],
};

function noukaEnt(lx, wl, rng, type) {
  const tpl = NOUKA[type], ph = rng() * 6, drift = randInt(rng, 10, 26);
  return { x0: lx - drift - 7, x1: lx + drift + 8, z: wl, draw(g, v, ox, oy, t) {
    const p = v.p, x = Math.round(lx + Math.sin(t * 0.035 + ph) * drift) - 6 + ox;
    const y = wl + oy - tpl.length + 1 + (Math.sin(t * 1.3 + ph) > 0.75 ? 1 : 0);
    stamp(g, tpl, x, y, { s: p.cream, p: p.tan, q: p.rust, m: p.brownDark, t: p.tan, b: p.ink, h: p.brown, d: p.brownDark });
    if (type === 'sail' && Math.sin(t * 2.1 + ph) > 0.3) px(g, x + 11, y + 5, p.cream);   // the sail's edge flutters
    px(g, x - 1, wl + oy, p.skyLight);
    px(g, x + 12, wl + oy, p.skyLight);
  } };
}

// A fisherman in a small boat throwing a cast net (jal), on a loop:
// hold, swing it up, throw, let it sink, haul it back in
function fisherEnt(lx, wl, rng, big) {
  const ph = rng() * 7, dir = rng() < 0.5 ? 1 : -1, s = big ? 2 : 1;
  const d = big ? makeDesign(rng, 'lungi') : null;
  const shirt = pick(rng, ['white', 'skyLight', 'paddy', 'rose']), lungi = pick(rng, LUNGIS)[0];
  if (d) d.carry = null;
  const reach = 15 * s;
  return { x0: lx - reach, x1: lx + reach, z: wl, draw(g, v, ox, oy, t) {
    drawFisher(g, v, lx + ox, wl + oy, (t + ph) % 7, dir, s, d, shirt, lungi);
  } };
}

// Mirror painter for the small figures drawn live: set origin and facing
// once, then plot offsets in palette keys (no closures in the frame loop)
const MP = { g: null, p: null, x: 0, y: 0, dir: 1 };
function mpAt(g, p, x, y, dir) { MP.g = g; MP.p = p; MP.x = x; MP.y = y; MP.dir = dir; }
function mp(dx, dy, key) { MP.g.fillStyle = MP.p[key]; MP.g.fillRect(MP.x + dx * MP.dir, MP.y + dy, 1, 1); }
function mpRect(dx, dy, w, h, key) {
  MP.g.fillStyle = MP.p[key];
  MP.g.fillRect(MP.dir > 0 ? MP.x + dx : MP.x - dx - w + 1, MP.y + dy, w, h);
}

function drawFisher(g, v, x, y, c, dir, s, d, shirt, lungi) {
  mpAt(g, v.p, x, y, dir);
  const hl = 5 * s;
  mpRect(-hl, 0, 2 * hl + 1, 1, 'brownDark');                               // hull, raised at both ends
  mpRect(-hl + 1, -1, 2 * hl - 1, 1, 'brown');
  for (let e = -1; e <= 1; e += 2) { mp(e * (hl + 1), -1, 'brown'); mp(e * (hl + 1), -2, 'brown'); mp(e * (hl + 2), 1, 'skyLight'); }
  const phase = c < 2.5 ? 0 : c < 3.1 ? 1 : c < 3.8 ? 2 : c < 5.5 ? 3 : 4;   // hold, raise, throw, wait, haul
  const fx = -hl + 2 * s, up = phase === 1 || phase === 2;                   // he stands at the stern
  let hx, hy;                                                                // his hand
  if (d) {
    g.drawImage(personSprite(v, d, up ? 6 : 0, dir), x + fx * dir - PERSON_CX, y - 1 - PERSON_FY);
    hx = fx + (up ? 2 : 1); hy = up ? -10 : -5;          // hand position in personSprite frames 6 / 0
  } else {
    const bent = phase === 4;
    mp(fx, -2, lungi); mp(fx, -3, lungi); mp(fx, -4, shirt);
    mp(fx + (bent ? 1 : 0), -5, bent ? 'brown' : shirt);
    if (!bent) mp(fx, -6, 'brown');
    hx = fx + 1; hy = up ? -7 : -4;
    mp(hx, hy, 'brown');
  }
  const D = 9 * s, R = 4 * s;
  if (phase === 0) mp(hx, hy + 1, 'grayDark');
  else if (phase === 1) mp(hx, hy - 1, 'grayLight');
  else if (phase === 2) {
    const k = (c - 3.1) / 0.7;
    netRing(hx + k * (D - hx), hy * (1 - k) - Math.sin(k * Math.PI) * 4 * s, 1 + k * (R - 1), -1);
  } else {
    const k = phase === 3 ? 0 : (c - 5.5) / 1.5;
    const cx = Math.round(D + (hx - D) * k), r = Math.max(1, Math.round(R * (1 - k * 0.8)));
    netRing(cx, -1, r, phase === 3 ? (c - 3.8) / 1.7 : 0.9);
    for (let i = 1; i < 4; i++) mp(Math.round(hx + (cx - hx) * i / 4), Math.round(hy + (-1 - hy) * i / 4), 'grayDark');   // the line
  }
}

// The cast net as a half ellipse of knots; sink 0..1 dissolves it
function netRing(cx, cy, r, sink) {
  const n = Math.round(6 + r * 2);
  for (let i = 0; i < n; i++) {
    const a = Math.PI * i / (n - 1), qx = Math.round(cx + Math.cos(a) * r), qy = Math.round(cy - Math.sin(a) * r * 0.45);
    if (sink < 0 || bayer(qx + MP.x, qy + MP.y) >= sink * 12) mp(qx, qy, 'grayLight');
  }
}

function hyacinthEnt(lx, y, rng) {
  const w = randInt(rng, 3, 7), ph = rng() * 6, flower = rng() < 0.5;
  return { x0: lx - 6, x1: lx + w + 6, z: y, draw(g, v, ox, oy, t) {
    const p = v.p, x = Math.round(lx + Math.sin(t * 0.12 + ph) * 4) + ox, yy = y + oy;
    rect(g, x, yy, w, 1, p.greenDark);
    rect(g, x + 1, yy - 1, w - 2, 1, p.green);
    px(g, x + 2, yy - 2, p.grass);
    if (flower) px(g, x + w - 2, yy - 2, p.purple);
    px(g, x - 1, yy + 1, p.skyLight);
  } };
}

function duckEnt(pd, rng) {
  const ph = rng() * 6, sp = 0.15 + rng() * 0.2, range = pd.rx - 5, y = pd.cy + randInt(rng, -pd.ry + 2, pd.ry - 1), white = rng() < 0.6;
  return { x0: pd.cx - pd.rx, x1: pd.cx + pd.rx, z: y, draw(g, v, ox, oy, t) {
    const a = t * sp + ph, dir = Math.cos(a) >= 0 ? 1 : -1, body = white ? 'white' : 'tan';
    mpAt(g, v.p, Math.round(pd.cx + Math.sin(a) * range) + ox, y + oy - (Math.sin(t * 2.3 + ph) > 0.7 ? 1 : 0), dir);
    mp(1, -2, white ? body : 'greenDark');                                   // head
    mp(2, -2, 'orange');                                                     // bill
    mpRect(-1, -1, 3, 1, body);
    mp(-2, -2, body);                                                        // tail up
    if (Math.abs(Math.cos(a)) > 0.3) { mp(-3, 0, 'skyLight'); mp(-4, 1, 'skyLight'); }   // wake
  } };
}

// A zebu grazing: head down, chewing, now and then looking up; tail swishes
const COW_LEGS = [-4, -2, 2, 3];
function cowEnt(lx, y, rng) {
  const ph = rng() * 20, dir = rng() < 0.5 ? 1 : -1;
  const [c0, c1] = pick(rng, [['white', 'cloudShade'], ['tan', 'brown'], ['brown', 'brownDark'], ['white', 'grayDark']]);
  return { x0: lx - 9, x1: lx + 9, z: y, draw(g, v, ox, oy, t) {
    mpAt(g, v.p, lx + ox, y + oy, dir);
    mpRect(-4, -6, 8, 4, c0);
    mpRect(-3, -3, 6, 1, c1);
    mp(-2, -5, c1); mp(-1, -5, c1); mp(1, -6, c1);                            // patches
    mp(2, -7, c0); mp(3, -7, c0);                                            // hump
    for (let i = 0; i < 4; i++) mpRect(COW_LEGS[i], -2, 1, 2, c1);           // legs
    if (Math.sin(t * 0.35 + ph) > 0.6) {                                     // looking up
      mpRect(4, -7, 2, 2, c0); mp(6, -6, c0); mp(4, -8, c1); mp(5, -8, 'cream');
    } else {                                                                 // grazing, chewing
      const chew = Math.floor(t * 2 + ph) & 1;
      mp(4, -4, c0); mp(5, -4 + chew, c0); mp(4, -3 + chew, c0); mp(5, -2 + chew, c0); mp(5, -1 + chew, 'ink');
    }
    const swish = Math.floor(t * 3 + ph) % 7 === 0;
    mp(-5, -6, c1); mp(swish ? -6 : -5, -5, c1); mp(swish ? -7 : -5, -4, 'ink');
  } };
}

// Cycle rickshaw (painted hood, a passenger) or a bicycle, pedalling along
// the dirt road and turning round at its ends
function rickshawEnt(a, b, y, rng, bike) {
  const len = b - a - 30, ph = rng() * len * 2, sp = bike ? randInt(rng, 12, 18) : randInt(rng, 8, 12);
  const o = { bike, hood: pick(rng, ['red', 'blue', 'green', 'purple', 'orange']), shirt: pick(rng, SHIRTS),
              lungi: pick(rng, LUNGIS)[0], skin: pick(rng, SKINS), pax: !bike && rng() < 0.6,
              paxCol: pick(rng, SARIS)[0], cargo: bike && rng() < 0.4 };
  return { x0: a, x1: b, z: y, draw(g, v, ox, oy, t) {
    const s = (t * sp + ph) % (2 * len), fwd = s < len;
    drawRickshaw(g, v.p, Math.round(a + 15 + (fwd ? s : 2 * len - s)) + ox, y + oy, fwd ? 1 : -1, t, o);
  } };
}

const WHEEL_RING = [-1, -2, 0, -2, 1, -2, -2, -1, 2, -1, -2, 0, 2, 0, -2, 1, 2, 1, -1, 2, 0, 2, 1, 2];
function cycleWheel(cx, cy, spin) {
  for (let i = 0; i < WHEEL_RING.length; i += 2) mp(cx + WHEEL_RING[i], cy + WHEEL_RING[i + 1], 'ink');
  mp(cx, cy, 'grayLight');
  if (spin) { mp(cx, cy - 1, 'gray'); mp(cx, cy + 1, 'gray'); } else { mp(cx - 1, cy, 'gray'); mp(cx + 1, cy, 'gray'); }
}

function cycleRider(rx, o, pedal) {
  mpRect(rx, -11, 2, 4, o.shirt);
  mpRect(rx, -13, 2, 1, 'ink');
  mpRect(rx, -12, 2, 1, o.skin);
  mpRect(rx, -7, 2, 2, o.lungi);
  if (pedal) { mp(rx + 1, -5, o.skin); mp(rx, -4, o.skin); } else { mp(rx, -5, o.skin); mp(rx + 1, -4, o.skin); }
  mp(rx + 2, -10, o.skin);
}

function drawRickshaw(g, p, x, y, dir, t, o) {
  mpAt(g, p, x, y, dir);
  const spin = Math.floor(t * 8) & 1, pedal = Math.floor(t * 5) & 1;
  if (o.bike) {
    cycleWheel(-3, -2, spin); cycleWheel(4, -2, spin);
    mpRect(-2, -4, 6, 1, 'grayDark'); mp(0, -5, 'grayDark'); mpRect(3, -7, 1, 3, 'grayDark'); mp(4, -8, 'grayDark');
    if (o.cargo) { mpRect(-5, -6, 3, 2, 'grayLight'); mp(-4, -7, 'gray'); }   // milk cans on the carrier
    cycleRider(0, o, pedal);
  } else {
    cycleWheel(-4, -2, spin); cycleWheel(5, -2, spin);
    mpRect(-4, -4, 9, 1, 'grayDark'); mpRect(5, -9, 1, 6, 'grayDark'); mp(5, -10, 'grayDark');
    if (o.pax) { mp(-5, -11, 'ink'); mp(-5, -10, o.skin); mpRect(-6, -9, 2, 3, o.paxCol); }
    mpRect(-7, -6, 5, 1, o.hood); mpRect(-7, -5, 5, 1, 'ink'); mp(-5, -4, 'glow');    // seat and painted panel
    mpRect(-7, -13, 5, 1, o.hood); mpRect(-8, -12, 1, 6, o.hood); mp(-3, -12, 'glow'); // folded hood
    cycleRider(2, o, pedal);
  }
}

// Tea picker with a basket on her back, working slowly along a row and
// stooping now and then to pluck the leaves
function pickerEnt(H, i, d, rng) {
  const ph = rng() * 20, cloth = pick(rng, SARIS)[0], skin = pick(rng, SKINS), range = 8;
  return { x0: H.x0 + i - range - 3, x1: H.x0 + i + range + 3, z: 50, draw(g, v, ox, oy, t) {
    const a = t * 0.06 + ph, j = Math.round(i + Math.sin(a) * range);
    mpAt(g, v.p, H.x0 + j + ox, humpTop(j, H.w, H.h, 36) + d + oy, Math.cos(a) >= 0 ? 1 : -1);
    mpRect(0, -3, 1, 3, cloth);
    mp(-1, -5, 'tan'); mp(-1, -4, 'tan');                                    // basket
    if (Math.sin(t * 0.7 + ph * 3) > 0.2) { mp(1, -4, cloth); mp(2, -4, skin); mp(2, -3, skin); mp(0, -5, 'brown'); }
    else { mp(0, -4, cloth); mp(0, -5, skin); mp(0, -6, cloth); mp(1, -3, skin); mp(-1, -3, 'brown'); }
  } };
}

// --- the line: poles and ballast on land, the bridge over the Meghna -------
let bridgeX0 = 0, bridgeX1 = 0;                  // screen x of the abutments, set by bridgeX()
function bridgeX() {
  const cam = Math.floor(sim.dist);
  bridgeX0 = BRIDGE.u0 - cam + ANCHOR_X;
  bridgeX1 = BRIDGE.u1 - cam + ANCHOR_X;
}

// Clip to a band of screen columns; call g.restore() when it returns true
function clipBegin(g, xa, xb) {
  xa = Math.max(xa, -64); xb = Math.min(xb, W + 64);
  if (xb <= xa) return false;
  g.save();
  g.beginPath();
  g.rect(xa, 0, xb - xa, H);
  g.clip();
  return true;
}

function drawLand(g, v, d) {
  drawTiled(g, v.poles, d, LAYER_Y.poles);
  drawTiled(g, v.track, d, LAYER_Y.track);
}

function drawLine(g, v) {
  const d = sim.dist;
  bridgeX();
  const b0 = bridgeX0, b1 = bridgeX1;
  if (b1 <= -40 || b0 >= W + 40) { drawLand(g, v, d); return; }
  if (clipBegin(g, -64, b0)) { drawLand(g, v, d); g.restore(); }
  if (clipBegin(g, b1, W + 64)) { drawLand(g, v, d); g.restore(); }
  if (clipBegin(g, b0, b1)) { drawTiled(g, v.deck, d, LAYER_Y.track); g.restore(); }
  for (let k = 1; k < BRIDGE.spans; k++) g.drawImage(v.pier, b0 + k * BRIDGE.span - 5, PIER_Y);
  g.drawImage(v.abutment[0], b0 - 14, 147);
  g.drawImage(v.abutment[1], b1 - 2, 147);
  drawTruss(g, v, false);
}

// Far truss behind the train; near truss drawn over it, so the train runs
// behind the lattice
function drawTruss(g, v, near) {
  bridgeX();
  const spr = near ? v.trussNear : v.trussFar;
  for (let k = 0; k < BRIDGE.spans; k++) {
    const x = bridgeX0 + k * BRIDGE.span;
    if (x < W && x + spr.width > 0) g.drawImage(spr, x, near ? TRUSS_Y : TRUSS_Y - 4);
  }
}

// Wavy reflection of the train and bridge in the open water under the deck:
// rows above the axis are copied upside down and squashed 2:1 (so the
// carriage bodies show), each nudged sideways by a ripple, then a
// water-coloured dither knocks them back
function drawReflection(g, v) {
  const d = sim.dist, f = PARALLAX.fg;
  const xa = Math.max(0, Math.ceil(ANCHOR_X + (BRIDGE.u0 - d) * f));
  const xb = Math.min(W, Math.floor(ANCHOR_X + (BRIDGE.u1 - d) * f));
  if (xb <= xa) return;
  const y0 = LAYER_Y.fg + 15, top = REFLECT_AXIS - 2 * (H - y0);
  rctx.clearRect(0, 0, W, REFLECT_AXIS - top);
  rctx.drawImage(g.canvas, 0, top, W, REFLECT_AXIS - top, 0, 0, W, REFLECT_AXIS - top);   // one snapshot
  for (let y = y0; y < H; y++) {
    const wob = Math.round(Math.sin(y * 1.3 + sim.clock * 3.2) * (y - y0 + 4) / 9);
    g.drawImage(reflectBuf, xa, REFLECT_AXIS - 2 * (y - y0) - 1 - top, xb - xa, 1, xa + wob, y, xb - xa, 1);
  }
  g.fillStyle = v.waterTint;
  g.fillRect(xa, y0, xb - xa, H - y0);
  for (let i = 0; i < 12; i++) {                       // fade out towards the banks
    g.fillStyle = v.waterFade[16 - Math.round(i * 4 / 3)];
    if (xa > 0) g.fillRect(xa + i, y0, 1, H - y0);
    if (xb < W) g.fillRect(xb - 1 - i, y0, 1, H - y0);
  }
}

// How much of the train is on the bridge: onBridge as a flag, bridgeMix
// 0..1 so the rumble turns louder and more metallic as the rake runs on
function updateBridge() {
  const rear = sim.dist + TRAIN.vehicles[TRAIN.vehicles.length - 1].x - ANCHOR_X;
  const front = sim.dist + CONFIG.TRAIN_FRONT_X - ANCHOR_X;
  const over = Math.max(0, Math.min(front, BRIDGE.u1) - Math.max(rear, BRIDGE.u0));
  sim.bridgeMix = over / (front - rear);
  sim.onBridge = over > 0;
}

// --- screen-space visitors: birds crossing the sky, kash seed fluff -------
const birdPool = makePool(CONFIG.BIRD_MAX[0], () => ({ kind: '', x: 0, y: 0, vx: 0, depth: 0, age: 0, ph: 0 }));
const fluffPool = makePool(CONFIG.FLUFF_MAX[0], () => ({ x: 0, y: 0, vx: 0, depth: 0, age: 0, life: 0, ph: 0, big: false }));

function trySpawnBird(si, w, dt) {
  const b = SECTIONS[TERRAIN[si].id].birds, rng = sim.fxRng;
  if (!b || w <= 0 || rng() >= b[1] * w * dt) return;
  const q = poolSpawn(birdPool, cap('BIRD_MAX'));
  if (!q) return;
  const left = rng() < 0.3, sp = 14 + rng() * 22;
  q.kind = b[0]; q.x = left ? -6 : W + 6; q.y = 64 + rng() * 40; q.vx = left ? sp : -sp;
  q.depth = 0.4 + rng() * 0.3; q.age = 0; q.ph = rng() * 4;
}

function updateBirds(dt) {
  const here = terrainAt(sim.dist), a = here.a, b = here.b, t = here.t;
  trySpawnBird(a, 1 - t, dt);
  if (b !== a) trySpawnBird(b, t, dt);
  for (let i = 0; i < birdPool.n; ) {
    const q = birdPool.items[i];
    q.age += dt;
    q.x += (q.vx - sim.speed * q.depth) * dt;          // air is still relative to the ground
    q.y += Math.sin(q.age * 0.9 + q.ph) * 3 * dt;
    if (q.x > -12 && q.x < W + 12) i++;
    else poolKill(birdPool, i);
  }
}

const WING_LIFT = [-1, 0, 1, 0];
function drawBirds(g, v) {
  const p = v.p;
  for (let n = 0; n < birdPool.n; n++) {
    const q = birdPool.items[n], x = Math.round(q.x), y = Math.round(q.y), face = Math.sign(q.vx);
    const span = q.kind === 'egret' ? 3 : 2, rate = q.kind === 'hawk' ? 1.5 : q.kind === 'egret' ? 4 : 7;
    let f = Math.floor(q.age * rate + q.ph) % 4;
    if (q.kind === 'hawk' && f !== 2) f = 1;           // mostly gliding
    const lift = WING_LIFT[f];
    const body = q.kind === 'hawk' ? p.brownDark : p.white, tip = q.kind === 'gull' ? p.grayDark : q.kind === 'hawk' ? p.ink : p.white;
    for (let i = 1; i <= span; i++) {
      const yy = y + (i === span ? lift : Math.round(lift / 2));
      px(g, x - i, yy, i === span ? tip : body);
      px(g, x + i, yy, i === span ? tip : body);
    }
    px(g, x, y, body);
    px(g, x + face, y - (q.kind === 'egret' ? 1 : 0), body);
    if (q.kind === 'egret') { px(g, x + 2 * face, y - 1, p.amber); px(g, x - 2 * face, y + 1, p.ink); }
  }
}

function updateFluff(dt) {
  const rng = sim.fxRng;
  sim.fluffAcc += 9 * sectionWeight('kash', sim.dist) * dt;
  while (sim.fluffAcc >= 1) {
    sim.fluffAcc -= 1;
    const f = poolSpawn(fluffPool, cap('FLUFF_MAX'));
    if (!f) continue;
    f.depth = 0.5 + rng() * 0.8;                       // nearer seeds sail past faster and lower
    f.x = rng() * (W + 60); f.y = f.depth > 1 ? 140 + rng() * 34 : 100 + rng() * 22;
    f.vx = -(sim.speed * f.depth) - 6; f.age = 0; f.life = 4 + rng() * 5; f.ph = rng() * 6; f.big = rng() < 0.3;
  }
  for (let i = 0; i < fluffPool.n; ) {
    const f = fluffPool.items[i];
    f.age += dt;
    f.vx += (-(sim.speed * f.depth) - 6 - f.vx) * Math.min(1, dt * 1.5);
    f.x += f.vx * dt;
    f.y += (-3 + Math.sin(f.age * 1.7 + f.ph) * 7) * dt;
    if (f.age < f.life && f.x > -4 && f.x < W + 32 && f.y > -4) i++;
    else poolKill(fluffPool, i);
  }
}

function drawFluff(g, v) {
  for (let i = 0; i < fluffPool.n; i++) {
    const f = fluffPool.items[i], x = Math.round(f.x), y = Math.round(f.y);
    if (bayer(x, y) >= (f.life - f.age) * 16) continue;   // dissolves in its last second
    px(g, x, y, v.p.white);
    if (f.big) { px(g, x - 1, y, v.p.cloudShade); px(g, x + 1, y - 1, v.p.cloudShade); }
  }
}

// Kash section's big white cumulus, faded in with an ordered dither
function drawCumulus(g, v, weight) {
  const level = Math.round(weight * 16), off = sim.dist * 0.07 + sim.cloudDrift * 1.4;
  if (level <= 0) return;
  if (level >= 16) { drawTiled(g, v.cumulus, off, 2); return; }
  sctx.clearRect(0, 0, W, 64);
  drawTiled(sctx, v.cumulus, off, 2);
  sctx.globalCompositeOperation = 'destination-in';
  sctx.fillStyle = DITHER_MASKS[level];
  sctx.fillRect(0, 0, W, 64);
  sctx.globalCompositeOperation = 'source-over';
  g.drawImage(scratch, 0, 0, W, 64, 0, 0, W, 64);
}
