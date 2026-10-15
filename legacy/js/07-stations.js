'use strict';

// =====================================================================
// 6. STATIONS
// =====================================================================
// Platforms are on the near side of the line, so passengers, benches and
// pillars stand in front of the train. Station content is laid out in
// "stop coordinates" - its screen x while the train stands there - so
//   screen x = stopX + station.dist - camera.

// Roof styles: y0/h of the roof sprite, pillarTop where pillars start
const ROOFS = {
  umbrella: { y0: 78, h: 14, pillarTop: 84 },            // Kamalapur's concrete umbrellas
  canopy:   { y0: 86, h: 7, pillarTop: 93, span: [30, 258] },
  shelter:  { y0: 93, h: 7, pillarTop: 100, span: [186, 266] },
};
const BOARD_TOP = 93;
// The tea stall: its awning top doubles as the foot of the sign a station with
// a `stallName` hangs over the shop.
const STALL_W = 27, STALL_H = 26, STALL_TOP = PLAT.STALL_Y - (STALL_H - 1);

// World position of each stop: cumulative, but every leg is at least MIN_LEG
// px so even the short real gaps leave room to accelerate, run and brake.
let _routeDist = 0;
for (let i = 0; i < ROUTE.length; i++) {
  if (i > 0) _routeDist += Math.max(CONFIG.MIN_LEG, Math.round((ROUTE[i].km - ROUTE[i - 1].km) * CONFIG.PX_PER_KM));
  ROUTE[i].dist = _routeDist;
}

const STATIONS = ROUTE.map((r, index) => {
  const st = { ...STATION_DEFAULTS, ...r, index };
  st.bnMask = textMask(st.bn, CONFIG.BN_SIZE);
  st.layout = layoutStation(st);
  return st;
});
const LAST_STATION = STATIONS.length - 1;

// Fixed furniture positions for one station (same in every lighting)
function layoutStation(st) {
  const rng = mulberry32(900 + st.index * 77);
  const [L, R] = st.platform, items = [];
  const clear = x => x > L + 6 && x < R - 12 && (x < PLAT.STALL_X - 10 || x > PLAT.STALL_X + 36) &&
                     Math.abs(x - PLAT.BOARD_X) > 34;              // keep the name board unobstructed
  const span = ROOFS[st.roof].span || [L, R];
  // roof pillars sit mid-carriage (41 px apart), clear of every door
  for (let x = Math.ceil((span[0] + 6) / 41) * 41; x <= span[1] - 6; x += 41) items.push({ type: 'pillar', x, y: 158 });
  const every = (start, step, fn) => { for (let x = start + step * Math.ceil((L - start) / step); x < R; x += step) fn(x); };
  every(30, 82, x => clear(x) && items.push({ type: 'lamp', x, y: 161 }));
  every(56, 82, x => clear(x) && clear(x + 10) && items.push({ type: 'bench', x, y: 166 }));
  every(76, 164, x => clear(x) && items.push({ type: 'bin', x, y: 164 }));
  items.push({ type: 'tap', x: 256, y: 165 });
  items.push({ type: 'stall', x: PLAT.STALL_X, y: PLAT.STALL_Y });
  if (st.stallName) items.push({ type: 'stallSign', x: PLAT.STALL_X, y: PLAT.STALL_Y });
  items.push({ type: 'board', x: PLAT.BOARD_X, y: 159 });
  if (st.extras.includes('fish'))
    for (const [x, y] of [[228, 160], [236, 165], [246, 161], [-40, 161], [-30, 166], [346, 162], [356, 167]])
      if (clear(x)) items.push({ type: 'basket', key: 'basket' + randInt(rng, 0, 2), x, y });
  if (st.extras.includes('chests'))
    for (const [x, y] of [[212, 159], [-16, 162], [-6, 166]])
      if (clear(x)) items.push({ type: 'chests', x, y });
  return items;
}

// --- shared furniture sprites; each has an anchor (ax, ay) at its foot --
function prop(w, h, ax, ay, paint) {
  const [c, g] = makeCanvas(w, h);
  paint(g);
  return { c, ax, ay };
}

function glowHalo(g, cx, cy, r0, r1, level) {
  const n = Math.ceil(r1);
  for (let y = -n; y <= n; y++)
    for (let x = -n; x <= n; x++) {
      const d = Math.hypot(x, y);
      if (d > r0 && d <= r1 && bayer(cx + x, cy + y) < level) px(g, cx + x, cy + y, PALETTE.glow);
    }
}

function buildProps(p, lit) {
  return {
    // lamp post: lantern head, warm dithered halo after dark
    lamp: prop(15, 64, 7, 63, g => {
      if (lit) glowHalo(g, 7, 8, 2, 7, 4);
      rect(g, 7, 9, 1, 52, p.grayDark);
      rect(g, 6, 61, 3, 3, p.gray);
      rect(g, 5, 6, 5, 1, p.grayDark);
      rect(g, 6, 7, 3, 2, lit ? PALETTE.glow : p.cloudShade);
      rect(g, 6, 9, 3, 1, p.grayDark);
    }),
    bench: prop(10, 5, 0, 4, g => {
      rect(g, 0, 0, 10, 1, p.brown);                     // backrest
      rect(g, 0, 1, 10, 1, p.brownDark);
      rect(g, 0, 2, 10, 1, p.tan);                       // seat
      rect(g, 1, 3, 1, 2, p.grayDark);
      rect(g, 8, 3, 1, 2, p.grayDark);
    }),
    bin: prop(4, 6, 1, 5, g => {
      rect(g, 0, 0, 4, 1, p.grayLight);
      rect(g, 0, 1, 4, 5, p.blue);
      rect(g, 3, 1, 1, 5, p.navy);
      px(g, 1, 2, p.white);
    }),
    // water tap: standpipe, spout, basin and a drip
    tap: prop(7, 9, 3, 8, g => {
      rect(g, 3, 1, 1, 6, p.grayDark);
      rect(g, 3, 0, 3, 1, p.gray);
      px(g, 5, 1, p.gray);
      px(g, 2, 0, p.red);
      px(g, 5, 3, p.skyLight);
      rect(g, 0, 7, 7, 1, p.grayLight);
      rect(g, 1, 8, 5, 1, p.gray);
    }),
    stall: prop(STALL_W, STALL_H, 0, STALL_H - 1, g => paintStall(g, p, lit)),
    basket0: fishBasket(p, 0), basket1: fishBasket(p, 1), basket2: fishBasket(p, 2),
    // plywood tea chests, banded and stencilled, waiting for the goods train
    chests: prop(11, 10, 5, 9, g => {
      for (const [x, y, w] of [[0, 5, 11], [2, 0, 7]]) {
        rect(g, x, y, w, 5, p.tan);
        rect(g, x, y, w, 1, p.cream);
        rect(g, x + w - 1, y, 1, 5, p.brown);
        rect(g, x, y + 2, w - 1, 1, p.brown);                 // metal band
        px(g, x + 2, y + 3, p.brownDark); px(g, x + 3, y + 3, p.brownDark);   // stencil
      }
      rect(g, 0, 9, 11, 1, p.brownDark);
    }),
  };
}

// Woven basket heaped with silver fish (Bhairab is a big fish market)
function fishBasket(p, v) {
  return prop(9, 6, 4, 5, g => {
    rect(g, 1, 2, 7, 1, p.brownDark);
    for (let y = 3; y < 6; y++) for (let x = 1 + (y === 5); x < 8 - (y === 5); x++) px(g, x, y, (x + y) & 1 ? p.tan : p.brown);
    const fish = [p.grayLight, p.white, p.skyLight, v === 2 ? p.rose : p.cloudShade];
    for (let x = 2; x < 7; x++) px(g, x, 1, fish[(x + v) % 4]);
    for (let x = 3 - (v === 1); x < 6 + (v === 1); x++) px(g, x, 0, fish[(x + v + 1) % 4]);
    px(g, 4, 1, p.ink);
  });
}

// Tea stall: striped awning, kettle on a clay stove, glass jars, bulb
function paintStall(g, p, lit) {
  rect(g, 2, 4, 23, 12, p.brownDark);                    // dim interior
  rect(g, 3, 8, 21, 1, p.brown);                         // back shelf
  for (const [x, k] of [[4, 'red'], [6, 'paddy'], [8, 'white'], [22, 'skyMid']]) px(g, x, 7, p[k]);
  stamp(g, ['yy', 'yyy', '.y'], 20, 5, { y: p.paddy });  // hanging banana bunch
  // the tea seller behind the counter
  rect(g, 14, 10, 3, 1, p.ink);
  px(g, 14, 11, p.ink); rect(g, 15, 11, 2, 2, p.brown);
  rect(g, 13, 13, 5, 3, p.white);
  // bare bulb on a cord
  rect(g, 11, 3, 1, 2, p.ink);
  if (lit) glowHalo(g, 11, 5, 1.2, 4.6, 5);
  px(g, 11, 5, lit ? PALETTE.glow : p.cloudShade);
  // striped awning and posts
  rect(g, 0, 0, 27, 1, p.rust);
  for (let x = 0; x < 27; x++) rect(g, x, 1, 1, 2, (x >> 1) & 1 ? p.cream : p.red);
  for (let x = 0; x < 27; x += 2) px(g, x, 3, p.red);
  rect(g, 1, 3, 1, 23, p.brown);
  rect(g, 25, 3, 1, 23, p.brown);
  // clay stove with a glowing fire, aluminium kettle with spout
  rect(g, 3, 14, 6, 2, p.rust);
  px(g, 5, 15, PALETTE.amber);
  rect(g, 4, 11, 4, 3, p.grayLight);
  rect(g, 5, 10, 2, 1, p.gray);
  rect(g, 5, 9, 2, 1, p.ink);
  px(g, 8, 12, p.grayLight);
  px(g, 9, 11, p.grayLight);
  // glass jars of biscuits and sweets
  for (const [x, k, lid] of [[10, 'tan', 'red'], [18, 'red', 'blue'], [21, 'paddy', 'green']]) {
    rect(g, x, 12, 3, 1, p[lid]);
    rect(g, x, 13, 3, 3, p.skyLight);
    rect(g, x + 1, 14, 1, 2, p[k]);
  }
  // counter
  rect(g, 0, 16, 27, 1, p.tan);
  rect(g, 1, 17, 25, 9, p.brown);
  rect(g, 2, 19, 23, 2, p.green);
  for (let x = 4; x < 24; x += 3) px(g, x, 20, p.cream);
  rect(g, 2, 23, 23, 1, p.brownDark);
}

// --- per-station sprites: platform slab, roof, name board -------------
function buildStationSprites(st, p) {
  const [L, R] = st.platform, roof = ROOFS[st.roof];
  const span = roof.span || [L, R];
  return {
    slab: buildSlab(p, R - L, st.index),
    roof: st.roof === 'umbrella' ? buildUmbrellaRoof(p, span[0], span[1])
                                 : buildTinRoof(p, span[1] - span[0], st.roofColor),
    roofX: span[0], roofY: roof.y0,
    board: buildBoard(p, st),
    stallSign: st.stallName ? buildStallSign(p, st) : null,
  };
}

// Raised concrete platform seen from slightly above: coping, yellow safety
// line along the track edge, paved surface, then the front face.
function buildSlab(p, w, seed) {
  const rng = mulberry32(300 + seed);
  const [c, g] = makeCanvas(w, 32);                      // screen y 148..179
  rect(g, 0, 0, w, 1, p.cloudShade);
  rect(g, 0, 1, w, 23, p.grayLight);
  rect(g, 0, 2, w, 1, p.glow);                           // safety line
  for (const y of [9, 16]) rect(g, 0, y, w, 1, p.gray);
  [[3, 6], [10, 6], [17, 7]].forEach(([y, h], r) => {
    for (let x = (r * 7) % 16; x < w; x += 16) rect(g, x, y, 1, h, p.gray);
  });
  for (let i = 0; i < w / 3; i++) px(g, randInt(rng, 0, w - 1), randInt(rng, 3, 23), rng() < 0.6 ? p.gray : p.cloudShade);
  rect(g, 0, 24, w, 1, p.cloudShade);
  rect(g, 0, 25, w, 7, p.gray);
  rect(g, 0, 29, w, 3, p.grayDark);
  for (let x = 5; x < w; x += 24) rect(g, x, 25, 1, 7, p.grayDark);
  rect(g, 0, 0, 1, 32, p.grayDark);
  rect(g, w - 1, 0, 1, 32, p.grayDark);
  return c;
}

// Kamalapur: a row of concrete umbrella shells, one per column, giving the
// roof its wavy outline
function buildUmbrellaRoof(p, L, R) {
  const w = R - L, [c, g] = makeCanvas(w, ROOFS.umbrella.h);
  for (let x = 0; x < w; x++) {
    const sx = x + L, cx = Math.round(sx / 41) * 41, t = (sx - cx) / 20.5;
    const top = 2 + Math.round(5 * t * t);
    px(g, x, top, p.white);
    rect(g, x, top + 1, 1, 2, sx < cx ? p.cloudShade : p.grayLight);
    px(g, x, top + 3, p.gray);
    const cap = 3 - Math.abs(sx - cx);                   // flared column capital
    if (cap > 0) rect(g, x, top + 4, 1, cap, p.grayLight);
  }
  return c;
}

function buildTinRoof(p, w, color) {
  const [c, g] = makeCanvas(w, 7);
  const base = p[color], dark = p[{ red: 'rust', blue: 'navy' }[color] || 'greenDark'];
  rect(g, 1, 0, w - 2, 1, dark);
  rect(g, 0, 1, w, 4, base);
  for (let x = 1; x < w; x += 3) rect(g, x, 1, 1, 4, dark);   // corrugations
  rect(g, 0, 5, w, 1, p.grayLight);
  rect(g, 0, 6, w, 1, p.grayDark);
  return c;
}

// Yellow name board on two posts: Bangla above English
function buildBoard(p, st) {
  const m = st.bnMask, ew = textWidth(st.en);
  const bw = Math.max(m.w, ew) + 8, bh = m.h + 13, h = 160 - BOARD_TOP;
  const [c, g] = makeCanvas(bw, h);
  for (const x of [3, bw - 5]) { rect(g, x, bh, 2, h - bh, p.grayDark); rect(g, x, bh, 1, h - bh, p.gray); }
  rect(g, 0, 0, bw, bh, p.ink);
  rect(g, 1, 1, bw - 2, bh - 2, p.glow);
  drawMask(g, m, (bw - m.w) >> 1, 3, p.ink);
  drawText(g, st.en, (bw - ew) >> 1, m.h + 6, p.ink);
  return c;
}

// The tea stall's shop sign: the station board's yellow face and font in
// miniature, standing over the awning on two posts (stations that name a stall)
function buildStallSign(p, st) {
  const name = String(st.stallName).toUpperCase();
  const tw = textWidth(name), bw = tw + 8, bh = 9, posts = (bw - STALL_W) >> 1;
  const [c, g] = makeCanvas(bw, bh + 2);                 // its last two rows stand on the awning
  rect(g, 0, 0, bw, bh, p.ink);
  rect(g, 1, 1, bw - 2, bh - 2, p.glow);
  rect(g, 1, bh - 2, bw - 2, 1, p.amber);                // shaded lower edge of the painted face
  drawText(g, name, 4, 2, p.ink);
  for (const x of [posts + 1, posts + STALL_W - 2]) {
    rect(g, x, bh, 2, 2, p.grayDark);
    rect(g, x, bh, 1, 2, p.gray);
  }
  return c;
}

// --- station backdrops: drawn in a parallax layer behind the line ------
// sx is the sprite's screen x while the train stands at the station.
const BACKDROPS = {
  city:  { layer: 'far', sx: -300, y: 62,  build: buildCity },    // Dhaka skyline
};

function buildCity(p, lit) {
  const TW = 540, TH = 52, rng = mulberry32(61);
  const [c, g] = makeCanvas(TW, TH);
  // two rows of blocks; the city thins out towards the right (the way out of Dhaka)
  for (const [col, side, win, hMax] of [[p.cloudShade, p.grayLight, p.grayLight, 46], [p.grayLight, p.gray, p.gray, 34]]) {
    for (let x = randInt(rng, 0, 6); x < TW - 12; ) {
      const w = randInt(rng, 8, 22), fade = Math.max(0, Math.min(1, (TW - 30 - x) / 220));
      const h = Math.max(4, Math.round(randInt(rng, 10, hMax) * (0.2 + 0.8 * fade))), top = TH - h;
      rect(g, x, top, w, h, col);
      rect(g, x + w - 1, top, 1, h, side);
      for (let yy = top + 2; yy < TH - 2; yy += 3)
        for (let xx = x + 2; xx < x + w - 2; xx += 3) {
          const on = rng() < 0.35, warm = rng() < 0.7;       // always roll: same city in every lighting
          px(g, xx, yy, lit && on ? (warm ? PALETTE.glow : PALETTE.amber) : win);
        }
      if (rng() < 0.2 && h > 24) { rect(g, x + (w >> 1), top - 5, 1, 5, p.grayDark); px(g, x + (w >> 1), top - 6, p.red); }
      x += w + randInt(rng, 0, 3) + (fade < 0.6 ? randInt(rng, 6, 18) : 0);
    }
  }
  // a mosque dome and minaret among the blocks
  const mx = 168, base = TH - 18;
  disc(g, mx, base, 7, p.white);
  rect(g, mx - 9, base, 19, 18, p.cloudShade);
  rect(g, mx, base - 10, 1, 3, p.glow);
  rect(g, mx + 13, TH - 40, 3, 40, p.white);
  rect(g, mx + 12, TH - 30, 5, 1, p.grayLight);
  rect(g, mx + 14, TH - 43, 1, 3, p.grayLight);
  return c;
}

function drawBackdrops(g, v, layer) {
  const f = PARALLAX[layer];
  for (const st of STATIONS)
    for (const key of st.backdrop) {
      const b = BACKDROPS[key];
      if (b.layer !== layer) continue;
      const spr = v.backdrops[key];
      const x = b.sx + Math.floor(st.dist * f) - Math.floor(sim.dist * f);   // same stepping as the tiles
      if (x < W && x + spr.width > 0) g.drawImage(spr, x, b.y);
    }
}

// --- near-side platform: slab, then furniture and people sorted by depth
const frontItems = [], byY = (a, b) => a.y - b.y;
function drawStationFront(g, v) {
  const cam = Math.floor(sim.dist);
  for (let i = 0; i < STATIONS.length; i++) {
    const st = STATIONS[i], off = st.dist - cam;
    if (st.platform[0] + off >= W + 40 || st.platform[1] + off <= -40) continue;
    const s = v.stations[i];
    g.drawImage(s.slab, st.platform[0] + off, PLAT.TOP);
    if (drive.on && !ui.title) drawStopMark(g, v, off);
    if (i === LAST_STATION) drawBuffer(g, v, off);
    frontItems.length = 0;
    for (let k = 0; k < st.layout.length; k++) frontItems.push(st.layout[k]);
    for (let k = 0; k < sim.people.length; k++) { const q = sim.people[k]; if (q.st === i && !q.hidden) frontItems.push(q); }
    frontItems.sort(byY);
    for (let k = 0; k < frontItems.length; k++) { const it = frontItems[k]; it.d ? drawPersonAt(g, v, it, off) : drawProp(g, v, st, it, off); }
    g.drawImage(s.roof, s.roofX + off, s.roofY);
  }
}

// Where a driver stops: a board at the platform edge, level with the
// loco's nose when the train stands on the mark
function drawStopMark(g, v, off) {
  const p = v.p, x = CONFIG.TRAIN_FRONT_X + 2 + off;
  if (x < -4 || x > W + 4) return;
  rect(g, x, 149, 1, 8, p.grayDark);
  rect(g, x - 2, 144, 5, 5, p.ink);
  rect(g, x - 1, 145, 3, 3, p.glow);
  px(g, x, 146, p.ink);
}

// The end of the line: a striped buffer beam on a braced frame
function drawBuffer(g, v, off) {
  const p = v.p, x = CONFIG.TRAIN_FRONT_X + BUFFER_O + 2 + off;
  if (x < -16 || x > W + 4) return;
  rect(g, x + 3, 131, 2, 15, p.grayDark);              // post with a lamp on top
  px(g, x + 3, 131, PALETTE.red);
  rect(g, x, 135, 3, 6, p.red);                        // buffer beam at the height of the loco's
  for (let y = 136; y < 141; y += 2) rect(g, x, y, 3, 1, p.white);
  for (let k = 0; k < 8; k++) px(g, x + 5 + k, 138 + k, p.gray);   // brace
  rect(g, x - 1, 146, 16, 1, p.grayDark);
}

function drawProp(g, v, st, it, off) {
  const p = v.p, x = it.x + off;
  if (it.type === 'pillar') {
    const top = ROOFS[st.roof].pillarTop, h = it.y - top + 1;
    if (st.roof === 'umbrella') {                        // round concrete column
      rect(g, x - 1, top, 3, h, p.cloudShade);
      rect(g, x + 1, top, 1, h, p.grayLight);
      rect(g, x - 2, it.y - 1, 5, 2, p.grayLight);
    } else {                                             // painted iron post with brackets
      rect(g, x, top, 2, h, p.grayDark);
      rect(g, x, top, 1, h, p.gray);
      px(g, x - 1, top, p.grayDark);
      px(g, x + 2, top, p.grayDark);
    }
  } else if (it.type === 'stallSign') {
    const s = v.stations[st.index].stallSign;            // null unless that station names its stall
    if (s) g.drawImage(s, x + (STALL_W >> 1) - (s.width >> 1), STALL_TOP - s.height);
  } else if (it.type === 'board') {
    const b = v.stations[st.index].board;
    g.drawImage(b, x - (b.width >> 1), BOARD_TOP);
  } else {
    const spr = v.props[it.key || it.type];
    g.drawImage(spr.c, x - spr.ax, it.y - spr.ay);
    if (it.type === 'lamp') addLight(x, it.y - 55, LIGHT_LAMP);
    else if (it.type === 'stall') { drawSteam(g, v, x + 9, it.y - 15); addLight(x + 11, it.y - 20, LIGHT_BULB); }
  }
}

// Steam curling up from the kettle spout: a few dithered wisps on a loop
function drawSteam(g, v, x, y) {
  for (let i = 0; i < 4; i++) {
    const ph = (sim.clock * 0.6 + i / 4) % 1;
    const sx = x + Math.round(Math.sin(ph * 6 + i * 2) * 1.2 + ph * 2), sy = y - Math.floor(ph * 11);
    if (bayer(sx, sy) < (1 - ph) * 22) px(g, sx, sy, v.p.white);
    if (ph < 0.45) px(g, sx + 1, sy - 1, v.p.cloudShade);
  }
}
