#!/usr/bin/env node
// ---------------------------------------------------------------------------
// scripts/brand-assets.mjs — the project's favicon and its social card.
//
//   node scripts/brand-assets.mjs            write everything into public/
//   node scripts/brand-assets.mjs --ascii    print what it is about to draw
//
// The icon is hand-drawn on a 16x16 grid — the size a browser tab actually
// shows — and written out as SVG (crisp at any size), PNG and ICO.
//
// The social card is a real frame of the game, not a mock-up: the built-in
// Dhaka - Khulna line out of Kamalapur at midday, laid into a 400x210 sheet
// (upscaled 3x to 1200x630). The sheet is wider than the 320x180 frame, so the
// spare edges are filled by carrying the frame's outermost pixels outward,
// which for sky-over-ground art reads as a seamless extension. On top goes the
// same slate-and-ink panel, 3x5 pixel font and Bangla wordmark the game's own
// title card uses.
//
// The Bangla wordmark is the one thing that cannot be rasterised here: it needs
// a real text shaper. BN_ROWS below is that mask, baked once through the
// engine's own rule (white on a canvas at 20px, alpha >= 110, cropped) in a
// browser, and pasted in as 4-bit rows.
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, W, H, parseColor, pump, bootEngine, pngBuffer } from './lib/soft-canvas.mjs';

const OUT = path.join(ROOT, 'public');

// ---------------------------------------------------------------------------
// palette (the same 32 colours the game paints with)
// ---------------------------------------------------------------------------
const P = {
  ink: '#140c1c', navy: '#1b1f3b', slate: '#4a4f84', white: '#f4f4ec',
  grayLight: '#9a9aa8', gray: '#6c6c7a', grayDark: '#43434f', cream: '#ecdcae',
  glow: '#ffd65c', red: '#c23a30', blue: '#2a5a9c', green: '#2e7d3e',
  greenDeep: '#12382a',
};

// ---------------------------------------------------------------------------
// the icon: a Bo-Bo diesel in the game's livery — blue body, cream band, red
// line, lit headlight — on a bordered badge so it reads on light and dark tabs
// ---------------------------------------------------------------------------
const ICON_COLORS = {
  '.': null,                        // transparent (the four corners)
  k: P.ink, n: P.navy, b: P.blue, c: P.cream, r: P.red,
  d: P.grayDark,                    // underframe
  g: P.gray,                        // badge ring, wheels
  l: P.grayLight,                   // roof
  y: P.glow,                        // headlight
  w: P.white,                       // cab glass
  v: P.green, e: P.greenDeep,       // ground
};
const ICON_ART = [
  '.gggggggggggggg.',
  'gkkkkkkkkkkkkkkg',
  'gkkkkkddkkkkkkkg',
  'gkkkkkddkkkkkkkg',
  'gkklllllllllllkkg',
  'gkkbbbbbbbbbbbkkg',
  'gkkbbbbbbnwwwykkg',
  'gkkbbnbnbbbbbbkkg',
  'gkkccccccccccckkg',
  'gkkrrrrrrrrrrrkkg',
  'gkkdddddddddddkkg',
  'gkkggg...ggg..kkg',
  'gkkggg...ggg..kkg',
  'gvvvvvvvvvvvvvvg',
  'geeeeeeeeeeeeeeg',
  '.gggggggggggggg.',
];
const ICON_W = 16, ICON_H = 16;
ICON_ART.forEach((row, i) => {
  if (row.length !== ICON_W) throw new Error(`icon row ${i} is ${row.length} wide, want ${ICON_W}`);
  for (const ch of row) if (!(ch in ICON_COLORS)) throw new Error(`icon row ${i}: unknown colour '${ch}'`);
});
if (ICON_ART.length !== ICON_H) throw new Error(`icon is ${ICON_ART.length} rows, want ${ICON_H}`);

const iconRgba = () => {
  const d = new Uint8ClampedArray(ICON_W * ICON_H * 4);
  for (let y = 0; y < ICON_H; y++) {
    for (let x = 0; x < ICON_W; x++) {
      const rgb = ICON_COLORS[ICON_ART[y][x]];
      if (!rgb) continue;
      const [r, g, b] = parseColor(rgb);
      const i = (y * ICON_W + x) * 4;
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
    }
  }
  return d;
};

// SVG: one rect per horizontal run of one colour, so it stays tiny and crisp
function iconSvg() {
  const runs = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="16" height="16" shape-rendering="crispEdges">`];
  for (let y = 0; y < ICON_H; y++) {
    let x = 0;
    while (x < ICON_W) {
      const ch = ICON_ART[y][x];
      let n = 1;
      while (x + n < ICON_W && ICON_ART[y][x + n] === ch) n++;
      if (ICON_COLORS[ch]) runs.push(`  <rect x="${x}" y="${y}" width="${n}" height="1" fill="${ICON_COLORS[ch]}"/>`);
      x += n;
    }
  }
  runs.push('</svg>', '');
  return runs.join('\n');
}

// ICO: a directory of PNGs (16/32/48), which every modern browser and Windows
// itself understands
function icoFile(entries) {
  const head = Buffer.alloc(6 + 16 * entries.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(entries.length, 4);
  let offset = head.length;
  entries.forEach((e, i) => {
    const o = 6 + 16 * i;
    head[o] = e.size >= 256 ? 0 : e.size;          // width
    head[o + 1] = e.size >= 256 ? 0 : e.size;      // height
    head[o + 2] = 0; head[o + 3] = 0;              // palette, reserved
    head.writeUInt16LE(1, o + 4);                  // colour planes
    head.writeUInt16LE(32, o + 6);                 // bits per pixel
    head.writeUInt32LE(e.png.length, o + 8);
    head.writeUInt32LE(offset, o + 12);
    offset += e.png.length;
  });
  return Buffer.concat([head, ...entries.map(e => e.png)]);
}

// ---------------------------------------------------------------------------
// 3x5 pixel font — copied from the engine (legacy/js/03-drawing.js) so the card
// is set in the game's own type
// ---------------------------------------------------------------------------
const FONT = {
  ' ': '000 000 000 000 000', '.': '000 000 000 000 010', ':': '000 010 000 010 000',
  '-': '000 000 111 000 000', '/': '001 001 010 100 100', '>': '100 010 001 010 100',
  '!': '010 010 010 000 010', '+': '000 010 111 010 000', '%': '101 001 010 100 101',
  '[': '110 100 100 100 110', ']': '011 001 001 001 011',
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
const textWidth = (s, sc = 1) => s.length * 4 * sc - sc;

// ---------------------------------------------------------------------------
// "deshi rel" in Bangla, 81x22, 0 = paper 1 = ink, 4 bits per hex digit
// ---------------------------------------------------------------------------
const BN_ROWS = [
  '000000ffe000000000000', '000001c07800000000000', '000003801c00000000000',
  '000001800c00000000000', '000000ff8c00000000000', '000000018e00000000000',
  '1ffffe3dff807fffffff8', '383003ef8e00e00300060', '703001e78e00c00300060',
  '6030c3e78e01c00f00060', 'e031e7f38e01803f0ffe0', 'e037effb8e0180fb1dee0',
  'e03eeff98e0381e338c60', 'c03cc7f98e0381c338c60', 'c038c2318e0381e33f060',
  'e030c0018e03807b3f060', 'e030c0018e01801f1f060', 'ec00c0018e01b00f06060',
  '7e00c0018e01f8e700060', '7e00e0018e00f8e300060', '3c0060018e0078e300060',
  '000060000000000000000',
];
const BN_MASK = (() => {
  const w = 81, h = BN_ROWS.length;
  const on = new Uint8Array(w * h);
  BN_ROWS.forEach((row, y) => {
    if (row.length * 4 < w) throw new Error(`Bangla row ${y} is too short`);
    for (let x = 0; x < w; x++) {
      const nib = parseInt(row[x >> 2], 16);
      on[y * w + x] = (nib >> (3 - (x & 3))) & 1;
    }
  });
  return { w, h, on };
})();

// ---------------------------------------------------------------------------
// a tiny RGBA surface to compose on
// ---------------------------------------------------------------------------
const makeSurface = (w, h) => ({ w, h, d: new Uint8ClampedArray(w * h * 4) });

function setPx(s, x, y, c) {
  if (x < 0 || y < 0 || x >= s.w || y >= s.h) return;
  const i = (y * s.w + x) * 4;
  const r = c[0], g = c[1], b = c[2], a = c.length > 3 ? c[3] : 1;
  if (a >= 1) { s.d[i] = r; s.d[i + 1] = g; s.d[i + 2] = b; s.d[i + 3] = 255; return; }
  const da = s.d[i + 3] / 255;
  const out = a + da * (1 - a);
  s.d[i] = (r * a + s.d[i] * da * (1 - a)) / out;
  s.d[i + 1] = (g * a + s.d[i + 1] * da * (1 - a)) / out;
  s.d[i + 2] = (b * a + s.d[i + 2] * da * (1 - a)) / out;
  s.d[i + 3] = Math.round(out * 255);
}
function rect(s, x, y, w, h, col) {
  const c = typeof col === 'string' ? parseColor(col) : col;
  if (!c) throw new Error('bad colour ' + col);
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) setPx(s, xx, yy, c);
}
function stamp(s, ch, x, y, col, sc) {
  const rows = (FONT[ch] || FONT[' ']).split(' ');
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      if (rows[r][c] === '1') rect(s, x + c * sc, y + r * sc, sc, sc, col);
    }
  }
}
function text(s, str, x, y, col, sc = 1) {
  const up = str.toUpperCase();
  for (let i = 0; i < up.length; i++) {
    if (up[i] === ' ') continue;
    stamp(s, up[i], x + i * 4 * sc, y, col, sc);
  }
}
function mask(s, m, x, y, col) {
  const c = parseColor(col);
  for (let yy = 0; yy < m.h; yy++) {
    for (let xx = 0; xx < m.w; xx++) {
      if (m.on[yy * m.w + xx]) setPx(s, x + xx, y + yy, c);
    }
  }
}

// ---------------------------------------------------------------------------
// the social card: 400x210 design space, upscaled 3x to 1200x630
// ---------------------------------------------------------------------------
const CARD = { vw: 400, vh: 210, scale: 3, frameX: 40, frameY: 15 };
const PANEL = { w: 248, h: 84, y: 14 };
const BAR = { y: 174 };
const SCENE = { station: 'DHK', offset: 1500, hour: 12, timeMode: 1, train: 0 };

function cardBase(frame) {
  const s = makeSurface(CARD.vw, CARD.vh);
  for (let y = 0; y < s.h; y++) {
    for (let x = 0; x < s.w; x++) {
      // carry the frame's edge pixels outward: more sky, more ground
      const sx = Math.min(W - 1, Math.max(0, x - CARD.frameX));
      const sy = Math.min(H - 1, Math.max(0, y - CARD.frameY));
      const si = (sy * W + sx) * 4, di = (y * s.w + x) * 4;
      s.d[di] = frame[si]; s.d[di + 1] = frame[si + 1];
      s.d[di + 2] = frame[si + 2]; s.d[di + 3] = frame[si + 3];
    }
  }
  return s;
}

function cardText(eng) {
  const last = eng.STATIONS[eng.STATIONS.length - 1];
  return {
    title: 'DESHI RAIL',
    stats: `${eng.STATIONS.length} STATIONS  ${last.km} KM`,
    tagline: 'A PIXEL-ART TRAIN JOURNEY ACROSS BANGLADESH',
    url: 'DESHI-RAIL.VERCEL.APP',
  };
}

function buildCard(frame, eng) {
  const s = cardBase(frame);
  const t = cardText(eng);

  // the game's title panel: slate edge, ink field, green underline
  const px = (CARD.vw - PANEL.w) >> 1;
  rect(s, px, PANEL.y, PANEL.w, PANEL.h, P.slate);
  rect(s, px + 1, PANEL.y + 1, PANEL.w - 2, PANEL.h - 2, P.ink);
  rect(s, px + 1, PANEL.y + PANEL.h - 3, PANEL.w - 2, 1, P.green);

  text(s, t.title, (CARD.vw - textWidth(t.title, 4)) >> 1, PANEL.y + 9, P.glow, 4);
  mask(s, BN_MASK, (CARD.vw - BN_MASK.w) >> 1, PANEL.y + 34, P.white);
  text(s, t.stats, (CARD.vw - textWidth(t.stats)) >> 1, PANEL.y + 64, P.grayLight);

  // a soft bar along the bottom for the tagline and the address
  rect(s, 0, BAR.y, CARD.vw, 1, P.green);
  rect(s, 0, BAR.y + 1, CARD.vw, CARD.vh - BAR.y - 1, 'rgba(20,12,28,0.72)');
  text(s, t.tagline, (CARD.vw - textWidth(t.tagline, 2)) >> 1, BAR.y + 8, P.white, 2);
  text(s, t.url, (CARD.vw - textWidth(t.url)) >> 1, BAR.y + 23, P.grayLight);

  return s;
}

// ---------------------------------------------------------------------------
// --ascii: check the drawing without looking at a PNG
// ---------------------------------------------------------------------------
const RAMP = ' .:-=+*#%@';
function previewIcon() {
  console.log('icon (letters are palette keys, . is transparent):');
  const legend = Object.entries(ICON_COLORS).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`);
  console.log('  ' + ICON_ART.join('\n  '));
  console.log('  ' + legend.join(' '));
}
function previewCard(s) {
  const step = 4;
  console.log(`\ncard ${s.w}x${s.h} (luminance, 1 char per ${step}x${step} px):`);
  for (let y = 0; y < s.h; y += step) {
    let line = '';
    for (let x = 0; x < s.w; x += step) {
      const i = (y * s.w + x) * 4;
      const l = (s.d[i] * 299 + s.d[i + 1] * 587 + s.d[i + 2] * 114) / 255000;
      line += RAMP[Math.min(RAMP.length - 1, Math.floor(l * RAMP.length))];
    }
    console.log('  ' + line);
  }
}
function previewText(label, str, sc, col) {
  const missing = [...new Set([...s = str.toUpperCase()].filter(c => ch => false))];
  const w = Math.max(1, textWidth(str, sc)), h = 5 * sc;
  const s2 = makeSurface(w, 1 + 5 * sc);
  text(s2, str, 0, 0, col, sc);
  const lines = [];
  for (let y = 0; y < s.h; y++) {
    let line = '';
    for (let x = 0; x < s.w; x++) line += s.d[(y * s.w + x) * 4 + 3] ? '#' : '.';
    line = line.replace(/\.+$/, '');
    if (line) lines.push(line);
  }
  console.log(`\n${'title' in {} ? '' : ''}${''}`);
  console.log(`${'x'}`);
}
