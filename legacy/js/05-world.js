'use strict';

// =====================================================================
// 5. WORLD LAYERS
// =====================================================================
// Every layer is a pre-rendered tile whose width is a multiple of 4, so
// Bayer dither patterns line up across the seam and it repeats forever.

// --- scenery props ---------------------------------------------------
const PALM = [
  '...aaa.aaa...',
  '.aa...a...aa.',
  'a...bbabb...a',
  '...b.....b...',
  '..b.......b..',
  '.b.........b.',
];
const HAYSTACK = [
  '..s..',
  '.hhh.',
  'hhhhd',
  'hhhdd',
];
const HAYSTACK_BIG = [
  '....s....',
  '...hhh...',
  '..hhhhh..',
  '.hhhhhhd.',
  'hhhhhhhdd',
  'hhhhhhddd',
  '.hhhhhdd.',
];
const BANANA2 = [                        // l/d leaves, s stem, b a dried leaf hanging down
  'l.......l',
  '.l.....l.',
  'd.l...l.d',
  '.d.lsl.d.',
  '..d.s.d..',
  '...bs....',
  '...bs....',
  '....s....',
];
const BETEL_CROWN = [                    // supari palm: small crown, a bunch of nuts
  '.a...a.',
  'a.aba.a',
  '..bbb..',
  '.a.n.a.',
];

function palm(g, x, base, h, lean, trunk, leaf, leafDark) {
  for (let i = 0; i < h; i++) px(g, x + Math.round(lean * (i / h) ** 2), base - i, trunk);
  stamp(g, PALM, x + lean - 6, base - h - 2, { a: leaf, b: leafDark });
}

function roundTree(g, x, base, r, trunkH, p, seed) {
  const rng = mulberry32(seed), cy = base - trunkH - r;
  rect(g, x, cy, 1, base - cy, p.brownDark);
  disc(g, x, cy, r, p.greenDark);
  disc(g, x - 1, cy - 1, Math.max(1, r - 2), p.green);
  for (let i = 0; i < r * 2; i++) {
    const a = rng() * Math.PI * 2, d = rng() * (r - 1) * 0.7;
    px(g, Math.round(x - 2 + Math.cos(a) * d), Math.round(cy - 2 + Math.sin(a) * d), p.grass);
  }
}

// Village house: woven bamboo (bera) walls, corrugated tin (or rusty) gable
// roof, and optionally a bamboo fence running off to the right
function house(g, x, base, w, p, tin, lightOn, fence = 0) {
  const wallH = 6, top = base - wallH;
  for (let yy = top; yy < base; yy++)
    for (let xx = x; xx < x + w; xx++) px(g, xx, yy, (xx + (yy >> 1)) & 1 ? p.tan : p.cream);
  rect(g, x, top + 2, w, 1, p.brown);                 // tie beam
  rect(g, x, base - 1, w, 1, p.brown);                // mud plinth
  for (let xx = x + w + 1; xx <= x + w + fence; xx++) if ((xx - x) % 2) rect(g, xx, base - 3, 1, 3, p.tan);
  if (fence) rect(g, x + w + 1, base - 2, fence, 1, p.brown);
  rect(g, x + 2, base - 4, 2, 3, p.brownDark);
  rect(g, x + w - 5, base - 4, 2, 2, lightOn ? PALETTE.glow : p.brownDark);
  const rh = 4, roof = tin ? p.grayLight : p.rust, ridge = tin ? p.gray : p.brown;
  for (let r = 0; r < rh; r++) {
    const inset = rh - 1 - r, x0 = x - 1 + inset, rw = w + 2 - inset * 2;
    rect(g, x0, top - rh + r, rw, 1, r === 0 ? ridge : roof);
    if (r > 0) for (let xx = x0 + 1; xx < x0 + rw; xx += 2) px(g, xx, top - rh + r, ridge);
  }
}

// Bell-shaped hill: top row of column i, and the filled silhouette
const humpTop = (i, w, h, base) => base - Math.round(h * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / w)));

function hump(g, x, base, w, h, col, ridge, tint) {
  for (let i = 0; i < w; i++) {
    const t = humpTop(i, w, h, base);
    if (t >= base) continue;
    rect(g, x + i, t, 1, base - t, col);
    if (tint) for (let y = t; y < Math.min(base, t + 6); y++) if (bayer(x + i, y) < 7 - (y - t)) px(g, x + i, y, tint);
    if (ridge && bayer(x + i, t) < 10) px(g, x + i, t, ridge);
  }
}

// --- 2. far clouds (0.05x) -------------------------------------------
function buildClouds(p) {
  const TW = 640, TH = 64, rng = mulberry32(7);
  const [c, g] = makeCanvas(TW, TH);
  for (let i = 0; i < 8; i++) {
    const x0 = i * 80 + randInt(rng, 0, 40), base = randInt(rng, 14, 54), n = randInt(rng, 3, 6);
    const puffs = [];
    let x = x0;
    for (let j = 0; j < n; j++) {
      const mid = 1 - Math.abs(j - (n - 1) / 2) / n;
      const r = Math.max(2, Math.round((3 + rng() * 4) * (0.6 + mid * 0.6)));
      puffs.push([x, base - r + 2, r]);
      x += r + randInt(rng, 1, 3);
    }
    wrapX(TW, o => {
      for (const [cx, cy, r] of puffs) disc(g, cx + o, cy, r, p.cloudShade);
      g.clearRect(x0 - 12 + o, base + 2, x - x0 + 24, 12);            // flat underside
      for (const [cx, cy, r] of puffs) disc(g, cx - 1 + o, cy - 1, r - 1, p.white);
    });
  }
  for (let i = 0; i < 6; i++) {                                         // thin high streaks
    const x = randInt(rng, 0, TW - 1), y = randInt(rng, 2, 20), w = randInt(rng, 12, 30);
    wrapX(TW, o => { rect(g, x + o, y, w, 1, p.white); rect(g, x + 4 + o, y + 1, w - 6, 1, p.cloudShade); });
  }
  return c;
}

// Big, bright cumulus for the kash section's autumn sky (0.07x)
function buildCumulus(p) {
  const TW = 576, TH = 60, rng = mulberry32(13);
  const [c, g] = makeCanvas(TW, TH);
  for (let i = 0; i < 5; i++) {
    const x0 = i * 115 + randInt(rng, 0, 50), base = randInt(rng, 34, 54), n = randInt(rng, 4, 6);
    const puffs = [];
    let x = x0;
    for (let j = 0; j < n; j++) {
      const mid = 1 - Math.abs(j - (n - 1) / 2) / n;
      const r = Math.max(4, Math.round((6 + rng() * 6) * (0.5 + mid * 0.7)));
      puffs.push([x, base - r + 2, r]);
      x += r + randInt(rng, 0, 3);
    }
    wrapX(TW, o => {
      for (const [cx, cy, r] of puffs) disc(g, cx + o, cy, r, p.cloudShade);
      for (const [cx, cy, r] of puffs) disc(g, cx + o, cy - 1, r, p.white);   // shade only on the underside
      g.clearRect(x0 - 16 + o, base + 2, x - x0 + 32, 20);
    });
  }
  return c;
}

// --- 5a. telegraph poles with sagging wires (1.0x) --------------------
function buildPoles(p) {
  const TW = 192, TH = 56, SPACING = 96, TOP = 6, FOOT = 51, SAG = 5;
  const [c, g] = makeCanvas(TW, TH);
  for (let x = 48; x < TW; x += SPACING) {
    for (const ax of [-4, 5]) {                                         // catenary to the next pole
      for (let i = 0; i <= SPACING; i++) {
        const t = i / SPACING, y = TOP + Math.round(SAG * 4 * t * (1 - t));
        wrapX(TW, o => px(g, x + ax + i + o, y, p.grayDark));
      }
    }
    rect(g, x, TOP, 2, FOOT - TOP, p.brown);
    rect(g, x + 1, TOP, 1, FOOT - TOP, p.brownDark);
    rect(g, x - 4, TOP + 1, 10, 1, p.brownDark);                        // cross-arm
    px(g, x - 4, TOP, p.cloudShade);
    px(g, x + 5, TOP, p.cloudShade);                                    // insulators
  }
  return c;
}

// --- 5b. track: gravel bed, wooden sleepers, two rails (1.0x) ---------
function buildTrack(p) {
  const TW = 192, TH = 20, rng = mulberry32(5);
  const [c, g] = makeCanvas(TW, TH);
  rect(g, 0, 3, TW, 12, p.gray);                                        // ballast top
  rect(g, 0, 15, TW, 3, p.grayDark);                                    // ballast shoulder
  for (let i = 0; i < TW * 8; i++) {
    const x = randInt(rng, 0, TW - 1), y = randInt(rng, 3, 17), r = rng();
    px(g, x, y, y >= 15 ? (r < 0.5 ? p.gray : p.brownDark)
                        : r < 0.4 ? p.grayLight : r < 0.8 ? p.grayDark : p.brown);
  }
  for (let x = 0; x < TW; x++) if (bayer(x, 3) < 8) px(g, x, 3, p.grayLight);
  for (let x = 2; x < TW; x += 8) {                                     // sleepers
    rect(g, x, 5, 4, 9, p.brown);
    rect(g, x + 3, 5, 1, 9, p.brownDark);
    rect(g, x, 13, 4, 1, p.brownDark);
    px(g, x, 5, p.tan);
  }
  rect(g, 0, 6, TW, 1, p.grayLight); rect(g, 0, 7, TW, 1, p.grayDark);  // far rail
  rect(g, 0, 11, TW, 1, p.grayLight); rect(g, 0, 12, TW, 1, p.grayDark); // near rail (y 151)
  return c;
}

// --- 5c. Meghna bridge: open deck, piers, abutments, truss spans (1.0x) --
// Same sleeper spacing as the track tile, but nothing under the sleepers
// except steel and, far below, the river.
function buildDeck(p) {
  const TW = 192, [c, g] = makeCanvas(TW, 20);
  rect(g, 0, 4, TW, 10, p.blue);
  ditherRect(g, 0, 4, TW, 10, p.skyDeep, 5);
  for (const y of [8, 10]) rect(g, 0, y, TW, 1, p.grayDark);           // rail-bearing stringers
  for (let x = 2; x < TW; x += 8) {
    rect(g, x, 5, 4, 9, p.brown);
    rect(g, x + 3, 5, 1, 9, p.brownDark);
    px(g, x, 5, p.tan);
  }
  rect(g, 0, 6, TW, 1, p.grayLight); rect(g, 0, 7, TW, 1, p.grayDark);
  rect(g, 0, 11, TW, 1, p.grayLight); rect(g, 0, 12, TW, 1, p.grayDark);
  rect(g, 0, 14, TW, 1, p.grayDark);
  rect(g, 0, 15, TW, 1, p.ink);
  return c;
}

const TRUSS_Y = 96, PIER_Y = 155, REFLECT_AXIS = 158;

// One camelback through-truss span. The far truss sits behind the train
// (darker, a little higher); the near one is drawn over it.
function buildTruss(p, near) {
  const S = BRIDGE.span, P = 6, pw = S / P, bot = 57;
  const [c, g] = makeCanvas(S + 1, 62);
  const col = near ? p.gray : p.grayDark, hi = near ? p.grayLight : p.gray, dark = near ? p.grayDark : p.navy;
  const top = i => 4 + Math.round(6 * ((i - P / 2) / (P / 2 - 1)) ** 2);
  const line = (x0, y0, x1, y1, k) => {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let s = 0; s <= n; s++) px(g, Math.round(x0 + (x1 - x0) * s / n), Math.round(y0 + (y1 - y0) * s / n), k);
  };
  rect(g, 0, bot, S + 1, 2, col);                                       // bottom chord
  rect(g, 0, bot + 2, S + 1, 1, dark);
  for (let i = 1; i < P - 1; i++) {                                     // polygonal top chord
    line(i * pw, top(i), (i + 1) * pw, top(i + 1), hi);
    line(i * pw, top(i) + 1, (i + 1) * pw, top(i + 1) + 1, col);
  }
  line(0, bot, pw, top(1), hi); line(1, bot, pw + 1, top(1) + 1, col);  // inclined end posts
  line(S, bot, S - pw, top(P - 1), col); line(S - 1, bot, S - pw - 1, top(P - 1) + 1, dark);
  for (let i = 1; i < P; i++) rect(g, i * pw, top(i) + 2, 1, bot - top(i) - 2, col);   // verticals
  for (let i = 1; i < P - 1; i++) {                                     // diagonals slope down to mid-span
    if (i < P / 2) line(i * pw + 1, top(i) + 2, (i + 1) * pw - 1, bot - 1, col);
    else line((i + 1) * pw - 1, top(i + 1) + 2, i * pw + 1, bot - 1, col);
  }
  for (let i = 0; i <= P; i++) {                                        // gusset plates
    rect(g, i * pw - 1, bot - 1, 3, 3, dark);
    if (i > 0 && i < P) rect(g, i * pw - 1, top(i), 3, 2, dark);
  }
  if (near) for (let x = 3; x < S; x += 6) px(g, x, bot, p.grayLight);  // rivets
  return c;
}

// Concrete pier under a span joint, its foot in the water
function buildPier(p) {
  const [c, g] = makeCanvas(11, 8);
  rect(g, 0, 0, 11, 1, p.grayLight);
  rect(g, 1, 1, 9, 7, p.cloudShade);
  rect(g, 8, 1, 2, 7, p.gray);
  rect(g, 1, 5, 9, 1, p.grayDark);                                     // waterline stain
  px(g, 0, 7, p.skyLight); px(g, 10, 7, p.skyLight);
  return c;
}

// Brick abutment where the embankment meets the river (mirrored for the far bank)
function buildAbutment(p, flip) {
  const [c, g] = makeCanvas(16, 15);
  if (flip) { g.translate(16, 0); g.scale(-1, 1); }
  rect(g, 0, 0, 16, 1, p.cloudShade);
  rect(g, 0, 1, 16, 14, p.rust);
  for (let y = 3; y < 15; y += 3) {
    rect(g, 0, y, 16, 1, p.brown);
    for (let x = (y % 6 ? 1 : 4); x < 16; x += 6) px(g, x, y - 1, p.brown);
  }
  rect(g, 14, 1, 2, 14, p.brownDark);                                  // face towards the water
  return c;
}

// 4x4 ordered-dither pattern of one colour; with lines, every other row is
// fourth row is filled solid as well (the ripple lines of a reflection)
function tintPattern(col, level, lines) {
  const [c, g] = makeCanvas(4, 4);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if (bayer(x, y) < level || (lines && y === 3)) px(g, x, y, col);
  return g.createPattern(c, 'repeat');
}

// --- lighting variants: every sprite and tile, once per lighting -----
function buildVariant(name) {
  const def = LIGHTING[name], p = {}, rgba = {};
  for (const k in PALETTE) p[k] = PALETTE[def.map[k] || k];
  for (const k in p) {                                    // ImageData words (little-endian ABGR)
    const [r, gr, b] = hexToRgb(p[k]);
    rgba[k] = ((255 << 24) | (b << 16) | (gr << 8) | r) >>> 0;
  }
  const backdrops = {};
  for (const key in BACKDROPS) backdrops[key] = BACKDROPS[key].build(p, def.lit);
  return {
    name, lit: def.lit, p, rgba, puffs: [], people: new Map(),
    sprites: new Map(),                                   // terrain sprites, painted on first use
    chunks: { far: new Map(), mid: new Map(), fg: new Map() },
    clouds: buildClouds(p),
    cumulus: buildCumulus(p),
    poles: buildPoles(p),
    track: buildTrack(p),
    deck: buildDeck(p),
    pier: buildPier(p),
    abutment: [buildAbutment(p, false), buildAbutment(p, true)],
    trussNear: buildTruss(p, true),
    trussFar: buildTruss(p, false),
    waterTint: tintPattern(p.skyMid, 3, true),
    waterFade: Array.from({ length: 17 }, (_, l) => tintPattern(p.skyMid, l)),
    loco: buildLoco(p, def.lit),
    cars: Array.from({ length: CONFIG.CAR_COUNT }, (_, i) => buildCar(p, def.lit, i)),
    wheels: buildWheels(p),
    backdrops,
    props: buildProps(p, def.lit),
    stations: STATIONS.map(st => buildStationSprites(st, p)),
  };
}
