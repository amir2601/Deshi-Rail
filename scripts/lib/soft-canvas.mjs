// ---------------------------------------------------------------------------
// scripts/lib/soft-canvas.mjs — the headless stand-in for a browser canvas.
//
// The game paints on a 320x180 canvas and lets the browser rasterise it. This
// module stands in for the browser: it implements the slice of the Canvas 2D
// API the engine actually uses (fillRect, drawImage, patterns, gradients, the
// ordered-dither composites, clipping and the little mirror transforms used
// when sprites are baked) on top of a plain RGBA buffer, and Node's zlib turns
// that buffer into a PNG. Nothing to install.
//
// It also carries the DOM stubs the engine expects, the requestAnimationFrame
// pump, and bootEngine()/loadLines(), so a script can drive the real engine.
//
// Used by scripts/screenshot.mjs (the README shots) and
// scripts/brand-assets.mjs (the favicon and the social card).
// ---------------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..', '..');
export const W = 320, H = 180;                 // the game's canvas

// ---------------------------------------------------------------------------
// colours
// ---------------------------------------------------------------------------
export function parseColor(s) {
  if (typeof s !== 'string') return null;
  const t = s.trim();
  if (t.charCodeAt(0) === 35) {                                  // #rgb / #rrggbb
    if (t.length === 4) return [17 * parseInt(t[1], 16), 17 * parseInt(t[2], 16), 17 * parseInt(t[3], 16), 1];
    if (t.length === 7) return [parseInt(t.slice(1, 3), 16), parseInt(t.slice(3, 5), 16), parseInt(t.slice(5, 7), 16), 1];
    return null;
  }
  if (t.startsWith('rgb')) {
    const p = t.slice(t.indexOf('(') + 1, -1).split(','), n = p.map(Number);
    return [n[0], n[1], n[2], p.length > 3 ? n[3] : 1];
  }
  return null;
}

class Gradient {
  constructor(kind, args) { this.kind = kind; this.args = args; this.stops = []; }
  addColorStop(t, c) { const rgba = parseColor(c); if (rgba) this.stops.push([t, rgba]); }
  sample(x, y) {
    const a = this.args, s = this.stops;
    if (!s.length) return [0, 0, 0, 0];
    let t;
    if (this.kind === 1) {                                       // linear
      const dx = a[2] - a[0], dy = a[3] - a[1], len = dx * dx + dy * dy;
      t = len ? ((x - a[0]) * dx + (y - a[1]) * dy) / len : 0;
    } else {                                                     // radial
      const dx = x - a[3], dy = y - a[4], len = a[5] - a[2];
      t = len ? (Math.sqrt(dx * dx + dy * dy) - a[2]) / len : 0;
    }
    if (t <= s[0][0]) return s[0][1];
    for (let i = 1; i < s.length; i++) {
      if (t <= s[i][0]) {
        const [t0, c0] = s[i - 1], [t1, c1] = s[i], f = t1 > t0 ? (t - t0) / (t1 - t0) : 1;
        return [c0[0] + (c1[0] - c0[0]) * f, c0[1] + (c1[1] - c0[1]) * f,
                c0[2] + (c1[2] - c0[2]) * f, c0[3] + (c1[3] - c0[3]) * f];
      }
    }
    return s[s.length - 1][1];
  }
}

// ---------------------------------------------------------------------------
// affine helpers (only mirrors + translations are ever used, but stay general)
// ---------------------------------------------------------------------------
const IDENTITY = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
const isIdentity = m => m.a === 1 && m.b === 0 && m.c === 0 && m.d === 1 && m.e === 0 && m.f === 0;
function multiply(m, n) {
  return { a: n.a * m.a + n.c * m.b, b: n.b * m.a + n.d * m.b,
           c: n.a * m.c + n.c * m.d, d: n.b * m.c + n.d * m.d,
           e: n.a * m.e + n.c * m.f + n.e, f: n.b * m.e + n.d * m.f + n.f };
}
function invert(m) {
  const det = m.a * m.d - m.b * m.c;
  if (!det) return IDENTITY;
  return { a: m.d / det, b: -m.b / det, c: -m.c / det, d: m.a / det,
           e: (m.c * m.f - m.d * m.e) / det, f: (m.b * m.e - m.a * m.f) / det };
}

// ---------------------------------------------------------------------------
// the software canvas
// ---------------------------------------------------------------------------
class SwCtx {
  constructor(canvas) {
    this.canvas = canvas;
    this.d = canvas._d;
    this.fillStyle = '#000000';
    this.strokeStyle = '#000000';
    this.globalAlpha = 1;
    this.globalCompositeOperation = 'source-over';
    this.imageSmoothingEnabled = false;
    this.font = '10px sans-serif';
    this.textAlign = 'start';
    this.textBaseline = 'alphabetic';
    this.lineWidth = 1;
    this.lineCap = 'butt';
    this.lineJoin = 'miter';
    this.miterLimit = 10;
    this.filter = 'none';
    this.shadowBlur = 0;
    this.shadowColor = 'rgba(0,0,0,0)';
    this._m = { ...IDENTITY };
    this._stack = [];
    this._clip = null;
    this._path = null;
  }

  // --- paths (rect clips and the headlight cone only) --------------------
  beginPath() { this._path = null; }
  closePath() { }
  moveTo() { }
  lineTo() { }
  arc() { }
  ellipse() { }
  rect(x, y, w, h) { this._path = { x, y, w, h }; }
  clip() {
    const p = this._path;
    if (!p) return;
    const r = { x0: p.x, y0: p.y, x1: p.x + p.w, y1: p.y + p.h };
    const c = this._clip;
    this._clip = c ? { x0: Math.max(c.x0, r.x0), y0: Math.max(c.y0, r.y0),
                       x1: Math.min(c.x1, r.x1), y1: Math.min(c.y1, r.y1) } : r;
  }
  fill() { }                                   // the night headlight cone
  stroke() { }
  measureText() { return { width: 0 }; }       // no fonts: Bangla masks come out empty
  fillText() { }
  strokeText() { }
  setLineDash() { }
  getLineDash() { return []; }

  // --- transform stack (save/restore pair with the clip) -----------------
  save() { this._stack.push([{ ...this._m }, this._clip]); }
  restore() {
    const s = this._stack.pop();
    if (s) { this._m = s[0]; this._clip = s[1]; }
  }
  setTransform(a, b, c, d, e, f) { this._m = { a, b, c, d, e, f }; }
  resetTransform() { this._m = { ...IDENTITY }; }
  translate(x, y) {
    this._m = multiply(this._m, { a: 1, b: 0, c: 0, d: 1, e: x, f: y });
  }
  scale(x, y) {
    this._m = multiply(this._m, { a: x, b: 0, c: 0, d: y, e: 0, f: 0 });
  }
  rotate(a) {
    const c = Math.cos(a), s = Math.sin(a);
    this._m = multiply(this._m, { a: c, b: s, c: -s, d: c, e: 0, f: 0 });
  }
  transform(a, b, c, d, e, f) { this._m = multiply(this._m, { a, b, c, d, e, f }); }

  // --- buffers -----------------------------------------------------------
  createImageData(w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; }
  getImageData(x, y, w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; }
  createPattern(src, repeat) { return src ? { __pattern: src, repeat: repeat || 'repeat' } : null; }
  createLinearGradient(x0, y0, x1, y1) { return new Gradient(1, [x0, y0, x1, y1]); }
  createRadialGradient(x0, y0, r0, x1, y1, r1) { return new Gradient(2, [x0, y0, r0, x1, y1, r1]); }

  putImageData(img, dx, dy) {
    const s = img.data, sw = img.width, sh = img.height, d = this.d;
    for (let y = 0; y < sh; y++) {
      const Y = dy + y;
      if (Y < 0 || Y >= this.canvas._h) continue;
      for (let x = 0; x < sw; x++) {
        const X = dx + x;
        if (X < 0 || X >= this.canvas._w) continue;
        const si = (y * sw + x) * 4, di = (Y * this.canvas._w + X) * 4;
        d[di] = s[si]; d[di + 1] = s[si + 1]; d[di + 2] = s[si + 2]; d[di + 3] = s[si + 3];
      }
    }
  }

  clearRect(x, y, w, h) { this._span(x, y, w, h, null); }

  fillRect(x, y, w, h) { this._span(x, y, w, h, this.fillStyle); }
  strokeRect() { }

  // --- the workhorse -----------------------------------------------------
  // Paint a user-space rectangle with `fill` (a colour string, gradient or
  // pattern; null clears), honouring the transform, the clip and the blend.
  _span(x, y, w, h, fill) {
    if (w < 0) { x += w; w = -w; }
    if (h < 0) { y += h; h = -h; }
    if (w === 0 || h === 0) return;
    const cw = this.canvas._w, ch = this.canvas._h;
    const id = isIdentity(this._m);
    let inv = null, x0, y0, x1, y1;
    if (id) {
      x0 = Math.floor(x); y0 = Math.floor(y); x1 = Math.ceil(x + w); y1 = Math.ceil(y + h);
    } else {
      inv = invert(this._m);
      const xs = [], ys = [];
      for (const [ux, uy] of [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]) {
        xs.push(this._m.a * ux + this._m.c * uy + this._m.e);
        ys.push(this._m.b * ux + this._m.d * uy + this._m.f);
      }
      x0 = Math.floor(Math.min(...xs)); x1 = Math.ceil(Math.max(...xs));
      y0 = Math.floor(Math.min(...ys)); y1 = Math.ceil(Math.max(...ys));
    }
    let cx0 = 0, cy0 = 0, cx1 = cw, cy1 = ch;
    if (this._clip) {
      cx0 = Math.max(cx0, Math.ceil(this._clip.x0)); cy0 = Math.max(cy0, Math.ceil(this._clip.y0));
      cx1 = Math.min(cx1, Math.ceil(this._clip.x1)); cy1 = Math.min(cy1, Math.ceil(this._clip.y1));
    }
    x0 = Math.max(x0, cx0); y0 = Math.max(y0, cy0);
    x1 = Math.min(x1, cx1); y1 = Math.min(y1, cy1);
    if (x1 <= x0 || y1 <= y0) return;
    const flat = !(fill instanceof Gradient) && !(fill && fill.__pattern) ? parseColor(fill) : null;
    if (!flat && !(fill instanceof Gradient) && !(fill && fill.__pattern)) return;
    const alpha = this.globalAlpha;
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) {
        let su = xx, sv = yy;
        if (!id) {
          su = inv.a * xx + inv.c * yy + inv.e;
          sv = inv.b * xx + inv.d * yy + inv.f;
          if (su < x || sv < y || su >= x + w || sv >= y + h) continue;
        }
        const c = flat || this._sample(fill, su, sv);
        if (!c) continue;
        const a = c[3] * alpha;
        const di = (yy * cw + xx) * 4;
        if (a === 0) continue;
        if (!fill) { this.d[di] = this.d[di + 1] = this.d[di + 2] = this.d[di + 3] = 0; continue; }
        this._blend(di, c[0], c[1], c[2], a);
      }
    }
  }

  _sample(fill, x, y) {
    if (fill instanceof Gradient) return fill.sample(x + 0.5, y + 0.5);
    const src = fill.__pattern, pw = src._w, ph = src._h, sd = src._d;
    const px = ((x % pw) + pw) % pw, py = ((y % ph) + ph) % ph, i = (py * pw + px) * 4;
    return [sd[i], sd[i + 1], sd[i + 2], sd[i + 3] / 255];
  }

  _blend(di, r, g, b, a) {
    const d = this.d;
    if (a <= 0) return;
    if (a > 1) a = 1;
    const op = this.globalCompositeOperation, da = d[di + 3] / 255;
    if (op === 'destination-in') { d[di + 3] = Math.round(d[di + 3] * a); return; }
    if (op === 'destination-out') { d[di + 3] = Math.round(d[di + 3] * (1 - a)); return; }
    if (op === 'lighter') {
      d[di] = Math.min(255, d[di] + r * a);
      d[di + 1] = Math.min(255, d[di + 1] + g * a);
      d[di + 2] = Math.min(255, d[di + 2] + b * a);
      d[di + 3] = Math.round(Math.min(1, da + a) * 255);
      return;
    }
    if (op === 'multiply') {
      const cr = (r * d[di]) / 255, cg = (g * d[di + 1]) / 255, cb = (b * d[di + 2]) / 255;
      const out = a + da * (1 - a);
      if (out <= 0) { d[di + 3] = 0; return; }
      d[di] = (cr * a + d[di] * da * (1 - a)) / out;
      d[di + 1] = (cg * a + d[di + 1] * da * (1 - a)) / out;
      d[di + 2] = (cb * a + d[di + 2] * da * (1 - a)) / out;
      d[di + 3] = Math.round(out * 255);
      return;
    }
    if (a >= 1) { d[di] = r; d[di + 1] = g; d[di + 2] = b; d[di + 3] = 255; return; }
    const out = a + da * (1 - a);
    d[di] = (r * a + d[di] * da * (1 - a)) / out;
    d[di + 1] = (g * a + d[di + 1] * da * (1 - a)) / out;
    d[di + 2] = (b * a + d[di + 2] * da * (1 - a)) / out;
    d[di + 3] = Math.round(out * 255);
  }

  drawImage(img, a1, a2, a3, a4, a5, a6, a7, a8) {
    const src = img && img._d;
    if (!src) return;
    let sx = 0, sy = 0, sw = img._w, sh = img._h, dx, dy, dw, dh;
    if (a3 === undefined) { dx = a1; dy = a2; dw = sw; dh = sh; }
    else if (a5 === undefined) { dx = a1; dy = a2; dw = a3; dh = a4; }
    else { sx = a1; sy = a2; sw = a3; sh = a4; dx = a5; dy = a6; dw = a7; dh = a8; }
    if (!(dw > 0) || !(dh > 0) || !(sw > 0) || !(sh > 0)) return;
    const cw = this.canvas._w, ch = this.canvas._h;
    const id = isIdentity(this._m);
    let inv = null, x0, y0, x1, y1;
    if (id) {
      x0 = Math.floor(dx); y0 = Math.floor(dy); x1 = Math.ceil(dx + dw); y1 = Math.ceil(dy + dh);
    } else {
      inv = invert(this._m);
      const xs = [], ys = [];
      for (const [ux, uy] of [[dx, dy], [dx + dw, dy], [dx, dy + dh], [dx + dw, dy + dh]]) {
        xs.push(this._m.a * ux + this._m.c * uy + this._m.e);
        ys.push(this._m.b * ux + this._m.d * uy + this._m.f);
      }
      x0 = Math.floor(Math.min(...xs)); x1 = Math.ceil(Math.max(...xs));
      y0 = Math.floor(Math.min(...ys)); y1 = Math.ceil(Math.max(...ys));
    }
    let cx0 = 0, cy0 = 0, cx1 = cw, cy1 = ch;
    if (this._clip) {
      cx0 = Math.max(cx0, Math.ceil(this._clip.x0)); cy0 = Math.max(cy0, Math.ceil(this._clip.y0));
      cx1 = Math.min(cx1, Math.ceil(this._clip.x1)); cy1 = Math.min(cy1, Math.ceil(this._clip.y1));
    }
    x0 = Math.max(x0, cx0); y0 = Math.max(y0, cy0);
    x1 = Math.min(x1, cx1); y1 = Math.min(y1, cy1);
    const alpha = this.globalAlpha;
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) {
        let ux = xx, uy = yy;
        if (!id) {
          ux = inv.a * xx + inv.c * yy + inv.e;
          uy = inv.b * xx + inv.d * yy + inv.f;
        }
        const fx = (ux - dx) / dw, fy = (uy - dy) / dh;
        if (fx < 0 || fy < 0 || fx >= 1 || fy >= 1) continue;
        const px = Math.min(sw - 1, Math.max(0, Math.floor(sx + fx * sw)));
        const py = Math.min(sh - 1, Math.max(0, Math.floor(sy + fy * sh)));
        const si = (py * img._w + px) * 4;
        const a = (src[si + 3] / 255) * alpha;
        if (a <= 0) continue;
        this._blend((yy * cw + xx) * 4, src[si], src[si + 1], src[si + 2], a);
      }
    }
  }
}

export class SwCanvas {
  constructor(w = 1, h = 1) {
    this._w = w; this._h = h;
    this._d = new Uint8ClampedArray(w * h * 4);
    this._ctx = null;
    this.style = {};
    this.dataset = {};
  }
  get width() { return this._w; }
  set width(v) { v = Math.max(1, v | 0); if (v !== this._w) { this._w = v; this._realloc(); } }
  get height() { return this._h; }
  set height(v) { v = Math.max(1, v | 0); if (v !== this._h) { this._h = v; this._realloc(); } }
  _realloc() {
    this._d = new Uint8ClampedArray(this._w * this._h * 4);
    if (this._ctx) this._ctx.d = this._d;
  }
  getContext() {
    if (!this._ctx) {
      const ctx = new SwCtx(this);
      this._ctx = new Proxy(ctx, {
        get: (t, p) => (p in t ? t[p] : () => {}),      // unknown calls are no-ops
        set: (t, p, v) => ((t[p] = v), true),
      });
    }
    return this._ctx;
  }
  addEventListener() { }
  removeEventListener() { }
  getBoundingClientRect() { return { left: 0, top: 0, width: this._w, height: this._h }; }
  toDataURL() { return ''; }
}

// ---------------------------------------------------------------------------
// DOM stubs the engine expects (the same shape the headless tests use) and the
// frame pump that drives its requestAnimationFrame loop
// ---------------------------------------------------------------------------
let installed = false, clock = 0;
const pending = [];

export function installDom() {
  if (installed) return;
  installed = true;
  globalThis.document = { createElement: () => new SwCanvas(1, 1), getElementById: () => new SwCanvas() };
  globalThis.window = globalThis;
  globalThis.matchMedia = () => ({ matches: false });
  globalThis.localStorage = { getItem: () => null, setItem: () => {} };
  globalThis.location = { hash: '' };
  globalThis.addEventListener = () => {};
  globalThis.removeEventListener = () => {};
  globalThis.getComputedStyle = () => ({ paddingLeft: '0px', paddingRight: '0px', paddingTop: '0px', paddingBottom: '0px' });
  globalThis.innerWidth = 1280;
  globalThis.innerHeight = 800;
  globalThis.requestAnimationFrame = cb => { pending.push(cb); return pending.length; };
  globalThis.cancelAnimationFrame = () => {};
}

// Run `n` animation frames. Callers drive the engine by pinning a field (e.g.
// sim.dist) inside the loop and pumping one frame at a time.
export function pump(n = 1) {
  for (let i = 0; i < n; i++) {
    clock += 1000 / 60;
    for (const cb of pending.splice(0, pending.length)) cb(clock);
  }
}

// The React layer's line registry, and the engine itself. Both are imported
// lazily: the engine reads the DOM stubs as it loads, so installDom() has to
// have run first.
export async function loadLines() {
  const { LINES } = await import(pathToFileURL(path.join(ROOT, 'src/lines.js')).href);
  return LINES;
}

export async function bootEngine(line, canvas = new SwCanvas(W, H)) {
  installDom();
  const { createEngine } = await import(pathToFileURL(path.join(ROOT, 'src/engine/engine.js')).href);
  return { eng: createEngine(canvas, line), canvas };
}

// ---------------------------------------------------------------------------
// PNG encoding (8-bit RGBA, no filter, nearest-neighbour upscale)
// ---------------------------------------------------------------------------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

// RGBA buffer -> PNG bytes, upscaled by an integer factor, nearest-neighbour
export function pngBuffer(rgba, w, h, scale = 1) {
  const W2 = w * scale, H2 = h * scale;
  const raw = Buffer.alloc((W2 * 4 + 1) * H2);
  let o = 0;
  for (let y = 0; y < H2; y++) {
    raw[o++] = 0;                                                // filter: none
    const sy = (y / scale) | 0;
    for (let x = 0; x < W2; x++) {
      const si = (sy * w + ((x / scale) | 0)) * 4;
      raw[o++] = rgba[si]; raw[o++] = rgba[si + 1]; raw[o++] = rgba[si + 2]; raw[o++] = rgba[si + 3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W2, 0); ihdr.writeUInt32BE(H2, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;   // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export function writePng(file, rgba, w, h, scale = 1) {
  const png = pngBuffer(rgba, w, h, scale);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, png);
  return { file, width: w * scale, height: h * scale, bytes: png.length };
}
