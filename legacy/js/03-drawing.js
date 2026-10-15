'use strict';

// =====================================================================
// 3. DRAWING HELPERS
// =====================================================================
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const bayer = (x, y) => BAYER4[((y & 3) << 2) | (x & 3)];

// Small seeded RNG so every lighting variant gets an identical layout
function mulberry32(seed) {
  return function () {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const randInt = (rng, a, b) => a + Math.floor(rng() * (b - a + 1));

// Object pools: items[0 .. n-1] are alive. Spawning reuses a dead slot and
// killing swaps the last live item into the hole, so nothing is allocated
// while the game runs.
function makePool(size, make) { return { items: Array.from({ length: size }, make), n: 0 }; }
function poolSpawn(pool, max) { return pool.n < Math.min(max, pool.items.length) ? pool.items[pool.n++] : null; }
function poolKill(pool, i) {
  const dead = pool.items[i];
  pool.items[i] = pool.items[--pool.n];
  pool.items[pool.n] = dead;
}

// Quality: phones start on the light settings; anything that averages too
// long per frame drops to them too (see frame())
const quality = { low: typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches, ema: 0 };
const cap = name => CONFIG[name][quality.low ? 1 : 0];

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return [c, g];
}

function rect(g, x, y, w, h, col) {
  g.fillStyle = col;
  g.fillRect(Math.floor(x), Math.floor(y), Math.floor(w), Math.floor(h));
}

function px(g, x, y, col) {
  g.fillStyle = col;
  g.fillRect(Math.floor(x), Math.floor(y), 1, 1);
}

// Filled pixel circle built from horizontal spans (no anti-aliasing)
function disc(g, cx, cy, r, col) {
  cx = Math.floor(cx); cy = Math.floor(cy);
  g.fillStyle = col;
  for (let dy = -r; dy <= r; dy++) {
    const hw = Math.floor(Math.sqrt((r + 0.5) * (r + 0.5) - dy * dy));
    g.fillRect(cx - hw, cy + dy, hw * 2 + 1, 1);
  }
}

// Ordered-dither fill: paints pixels whose Bayer value is below level (0..16)
function ditherRect(g, x, y, w, h, col, level) {
  g.fillStyle = col;
  for (let yy = y; yy < y + h; yy++)
    for (let xx = x; xx < x + w; xx++)
      if (bayer(xx, yy) < level) g.fillRect(xx, yy, 1, 1);
}

// Paint a character template: each char maps to a colour (or is skipped)
function stamp(g, tpl, x, y, colors) {
  for (let r = 0; r < tpl.length; r++)
    for (let c = 0; c < tpl[r].length; c++) {
      const col = colors[tpl[r][c]];
      if (col) px(g, x + c, y + r, col);
    }
}

// Run a draw call at -tw, 0 and +tw so shapes wrap across a tile seam
function wrapX(tw, fn) { fn(-tw); fn(0); fn(tw); }

// Repeat a pre-rendered tile across the screen at a scroll offset
function drawTiled(g, tile, offset, y) {
  const tw = tile.width;
  for (let x = -(((Math.floor(offset) % tw) + tw) % tw); x < W; x += tw) g.drawImage(tile, x, y);
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}

// 3x5 bitmap font (rows top to bottom) for the debug overlay and signs
const FONT = {
  ' ': '000 000 000 000 000', '.': '000 000 000 000 010', ':': '000 010 000 010 000',
  '-': '000 000 111 000 000', '/': '001 001 010 100 100', '>': '100 010 001 010 100',
  '!': '010 010 010 000 010', '+': '000 010 111 010 000', '%': '101 001 010 100 101',
  '[': '110 100 100 100 110', ']': '011 001 001 001 011',
  '↑': '010 111 010 010 010', '↓': '010 010 010 111 010',
  '←': '010 100 111 100 010', '→': '010 001 111 001 010',
  '0': '111 101 101 101 111', '1': '010 110 010 010 111', '2': '111 001 111 100 111',
  '3': '111 001 011 001 111', '4': '101 101 111 001 001', '5': '111 100 111 001 111',
  '6': '111 100 111 101 111', '7': '111 001 010 010 010', '8': '111 101 111 101 111',
  '9': '111 101 111 001 111',
  A: '010 101 111 101 101', B: '110 101 110 101 110', C: '011 100 100 100 011',
  D: '110 101 101 101 110', E: '111 100 110 100 111', F: '111 100 110 100 100',
  G: '011 100 101 101 011', H: '101 101 111 101 101', I: '111 010 010 010 111',
  J: '001 001 001 101 010', K: '101 101 110 101 101', L: '100 100 100 100 111',
  M: '101 111 111 101 101', N: '110 101 101 101 101', O: '010 101 101 101 010',
  P: '110 101 110 100 100', Q: '010 101 101 110 011', R: '110 101 110 101 101',
  S: '011 100 010 001 110', T: '111 010 010 010 010', U: '101 101 101 101 111',
  V: '101 101 101 101 010', W: '101 101 111 111 101', X: '101 101 010 101 101',
  Y: '101 101 010 010 010', Z: '111 001 010 100 111',
};

const glyphCache = new Map();
function glyph(ch, col) {
  const key = ch + col;
  let c = glyphCache.get(key);
  if (!c) {
    const bits = (FONT[ch] || FONT[' ']).replace(/ /g, '');
    let g;
    [c, g] = makeCanvas(3, 5);
    g.fillStyle = col;
    for (let i = 0; i < 15; i++) if (bits[i] === '1') g.fillRect(i % 3, (i / 3) | 0, 1, 1);
    glyphCache.set(key, c);
  }
  return c;
}

function drawText(g, str, x, y, col) {
  str = String(str).toUpperCase();
  for (let i = 0; i < str.length; i++)
    if (str[i] !== ' ') g.drawImage(glyph(str[i], col), x + i * 4, y);
}
const textWidth = s => s.length * 4 - 1;

// Same font at 2x: glyphs are scaled by drawImage with smoothing off
function drawText2x(g, str, x, y, col) {
  str = String(str).toUpperCase();
  for (let i = 0; i < str.length; i++)
    if (str[i] !== ' ') g.drawImage(glyph(str[i], col), x + i * 8, y, 6, 10);
}

// Bangla: rasterise with a Bengali-capable system font, then threshold
// the alpha to a hard 1-bit mask. The mask is painted in palette colours,
// so the text stays crisp and never introduces off-palette pixels.
const BN_FONT = '"Nirmala UI", Vrinda, "Shonar Bangla", "Kohinoor Bangla", ' +
                '"Bangla Sangam MN", "Noto Sans Bengali", sans-serif';

function textMask(str, size) {
  const [c, g] = makeCanvas(Math.ceil(size * str.length * 1.4) + 8, size * 3);
  g.font = size + 'px ' + BN_FONT;
  g.fillStyle = '#fff';                     // scratch canvas only, never shown
  g.fillText(str, 4, size * 2);
  const cw = c.width, data = g.getImageData(0, 0, cw, c.height).data;
  let x0 = cw, y0 = c.height, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y++)
    for (let x = 0; x < cw; x++)
      if (data[(y * cw + x) * 4 + 3] >= 110) {
        x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      }
  if (x1 < 0) return { w: 0, h: 0, bits: new Uint8Array(0) };   // no Bengali font available
  const w = x1 - x0 + 1, h = y1 - y0 + 1, bits = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) bits[y * w + x] = data[((y + y0) * cw + x + x0) * 4 + 3] >= 110 ? 1 : 0;
  return { w, h, bits };
}

function drawMask(g, m, x, y, col) {
  g.fillStyle = col;
  for (let yy = 0; yy < m.h; yy++)
    for (let xx = 0; xx < m.w; xx++) if (m.bits[yy * m.w + xx]) g.fillRect(x + xx, y + yy, 1, 1);
}
