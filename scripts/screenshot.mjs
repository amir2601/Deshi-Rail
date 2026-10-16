#!/usr/bin/env node
// ---------------------------------------------------------------------------
// scripts/screenshot.mjs — render a real frame of the game to a PNG.
//
// The game paints on a 320x180 canvas and lets the browser rasterise it. This
// script stands in for the browser: it implements the slice of the Canvas 2D
// API the engine actually uses (fillRect, drawImage, patterns, gradients, the
// ordered-dither composites, clipping and the little mirror transforms used
// when sprites are baked) on top of a plain RGBA buffer. It then boots the
// real engine against that canvas, drives it to a chosen spot on the line and
// writes the frame out as a nearest-neighbour upscaled PNG.
//
// Node's zlib does the encoding, so there is nothing to install.
//
//   node scripts/screenshot.mjs --list
//   node scripts/screenshot.mjs --scene bridge --time dusk --out docs/hero.png
//
// Options: --scene NAME (see --list) | --at CODE+N to aim anywhere on the line,
// --line ID (which selectable line; scenes say which they need, default the
// built-in), --time day|dusk|night|auto, --train N, --scale N (nearest-neighbour,
// default 3), --frames N, --out FILE, --title (draw the title card over the
// scene). Add --ascii to print the frame as a palette map (with --crop
// x0,y0,x1,y1 and --step N) — handy on a machine with no viewer.
// ---------------------------------------------------------------------------
import path from 'node:path';
// The software canvas, the DOM stubs, the frame pump, the PNG encoder and the
// engine boot live in ./lib/soft-canvas.mjs, shared with brand-assets.mjs.
import { ROOT, W, H, parseColor, installDom, pump, loadLines, bootEngine, writePng }
  from './lib/soft-canvas.mjs';

// ---------------------------------------------------------------------------
// --ascii: a headless preview. Each block of the frame is averaged and
// quantised to the game's own 32-colour palette, so the picture can be read
// (and roughly judged) on a terminal that cannot show the PNG.
// ---------------------------------------------------------------------------
const PALETTE = {
  ink: '#140c1c', navy: '#1b1f3b', indigo: '#2c2f5e', slate: '#4a4f84', purple: '#6b4a7d',
  rose: '#b85d6e', orange: '#e8875a', peach: '#f4c27a', skyDeep: '#3d7fc4', skyMid: '#6aaee0',
  skyLight: '#a8d8ef', white: '#f4f4ec', cloudShade: '#c4cedb', grayLight: '#9a9aa8', gray: '#6c6c7a',
  grayDark: '#43434f', brownDark: '#3e2a22', brown: '#6e4a32', tan: '#b08a5c', cream: '#ecdcae',
  glow: '#ffd65c', amber: '#f0a030', red: '#c23a30', rust: '#8c4a3a', greenDeep: '#12382a',
  greenDark: '#1e5a36', green: '#2e7d3e', grass: '#4f9a3c', grassLight: '#86c04a', paddy: '#c4c95a',
  haze: '#4f7f6c', blue: '#2a5a9c',
};
const PAL_KEYS = Object.keys(PALETTE);
const PAL_RGB = PAL_KEYS.map(k => parseColor(PALETTE[k]));
const PAL_CHARS = ['#', 'n', 'i', 's', 'p', 'R', 'O', 'P', 'B', 'b', 'l', 'W', 'c', 'G', 'g', 'd',
                   'D', 'w', 't', 'C', 'Y', 'A', 'r', 'u', 'E', 'e', 'v', 'V', 'L', 'y', 'H', 'K'];

function asciiPreview(rgba, w, h, step, x0 = 0, y0 = 0, x1 = w, y1 = h) {
  const used = new Map();
  const lines = [];
  const pad = String(y1).length;
  for (let by = y0; by < y1; by += step) {
    let line = '';
    for (let bx = x0; bx < x1; bx += step) {
      let r = 0, g = 0, b = 0, n = 0;
      for (let y = by; y < Math.min(by + step, y1); y++)
        for (let x = bx; x < Math.min(bx + step, x1); x++) {
          const i = (y * w + x) * 4;
          if (rgba[i + 3] < 128) continue;
          r += rgba[i]; g += rgba[i + 1]; b += rgba[i + 2]; n++;
        }
      if (!n) { line += ' '; continue; }
      r /= n; g /= n; b /= n;
      let best = 0, bd = Infinity;
      for (let k = 0; k < PAL_RGB.length; k++) {
        const c = PAL_RGB[k];
        const d = (c[0] - r) * (c[0] - r) + (c[1] - g) * (c[1] - g) + (c[2] - b) * (c[2] - b);
        if (d < bd) { bd = d; best = k; }
      }
      line += PAL_CHARS[best];
      used.set(best, (used.get(best) || 0) + 1);
    }
    lines.push(String(by).padStart(pad) + ' ' + line);
  }
  const legend = [...used.entries()].sort((a, b) => a[0] - b[0])
    .map(([k]) => PAL_CHARS[k] + ' ' + PAL_KEYS[k] + ' ' + PALETTE[PAL_KEYS[k]]).join('   ');
  return lines.join('\n') + '\n\n' + legend;
}

// ---------------------------------------------------------------------------
// scenes: a named spot on a line (most of them on the Dhaka - Sylhet line)
// ---------------------------------------------------------------------------
const SCENES = {
  bridge: { line: 'dhaka-sylhet', at: ['BRB', 600], note: 'the Meghna truss bridge, just past Bhairab Bazar' },
  kash: { line: 'dhaka-sylhet', at: ['BRB', 1400], note: 'kash phool white on the sandy chars' },
  tea: { line: 'dhaka-sylhet', at: ['SMG', -420], note: 'the Sreemangal tea gardens' },
  hills: { line: 'dhaka-sylhet', at: ['KUL', 400], note: 'the misty hills before Sylhet' },
  paddy: { at: ['DHK', 1500], note: 'paddy and tin roofs out of Kamalapur' },
  station: { line: 'dhaka-sylhet', at: ['NSD', 0], note: 'Narsingdi, with the tea stall on the platform' },
  jamuna: { at: ['BBE', 250], note: 'the Jamuna bridge, on the built-in line' },
};

const argv = process.argv.slice(2);
function arg(name, fallback) {
  const i = argv.indexOf('--' + name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
}
if (argv.includes('--list')) {
  for (const [k, v] of Object.entries(SCENES)) console.log(k.padEnd(9), v.note);
  process.exit(0);
}

const sceneName = arg('scene', 'bridge');
const scene = SCENES[sceneName];
if (!scene && !arg('at', null)) {
  console.error('unknown scene: ' + sceneName + ' (try --list)');
  process.exit(1);
}
// --at CODE+N overrides the named scene, so any point on the line can be shot
const atArg = arg('at', null);
const at = atArg ? [atArg.replace(/[+-]\d+$/, ''), Number((atArg.match(/[+-]\d+$/) || ['0'])[0])]
                 : scene.at;
const timeName = arg('time', 'day');
const trainIdx = Number(arg('train', 2));
const frames = Number(arg('frames', 90));
const scale = Number(arg('scale', 3));
const withTitle = argv.includes('--title');
const out = path.resolve(ROOT, arg('out', `docs/${sceneName}.png`));
const hour = timeName === 'auto' ? null : { day: 12, dusk: 18.3, night: 22.5 }[timeName];
if (hour === null && !(timeName in { auto: 1 })) {
  console.error('unknown time: ' + timeName + ' (day | dusk | night | auto)');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// drive the real engine and grab a frame
// ---------------------------------------------------------------------------
installDom();
const LINES = await loadLines();

// which line: --line wins, then the named scene's own, then the built-in (with
// --at, skip the default scene's line so the anchor decides)
const sceneGiven = argv.includes('--scene');
const lineId = arg('line', null) || (sceneGiven && scene && scene.line ? scene.line : null);
let line = lineId ? LINES.find(l => l.id === lineId) : null;
if (lineId && !line) { console.error('unknown line: ' + lineId); process.exit(1); }
let { eng, canvas } = await bootEngine(line || undefined);
// no line given and the anchor is not on the built-in: pick one that has it
if (!line && !eng.STATIONS.some(s => s.code === at[0])) {
  line = LINES.find(l => l.route.some(s => s.code === at[0])) || null;
  if (!line) throw new Error('no line has station ' + at[0]);
  eng.dispose();
  ({ eng } = await bootEngine(line, canvas));
}
eng.ui.title = withTitle;                   // title card, when asked for
eng.applyTrain(trainIdx);
if (hour !== null) {
  eng.ui.timeMode = { 12: 1, 18.3: 2, 22.5: 3 }[hour];   // pin the sky to a time button
  eng.sim.hour = hour;
}
const anchor = eng.STATIONS.find(s => s.code === at[0]);
if (!anchor) throw new Error('no station ' + at[0]);
const target = anchor.dist + at[1];

// Run it for real first (so smoke, cloud drift and the crowds warm up), pinning
// the camera to the spot; then pause so the sim stops while the terrain chunks
// for that exact position finish baking.
for (let i = 0; i < frames; i++) {
  eng.sim.dist = target;
  pump(1);
}
eng.ui.paused = true;
for (let i = 0; i < 40; i++) {
  eng.quality.low = false;
  eng.quality.ema = 0;
  pump(1);
}

const shot = writePng(out, canvas._d, W, H, scale);
const onScreen = eng.STATIONS.filter(s => s.platform[0] + (s.dist - eng.sim.dist) < W + 40 &&
                                          s.platform[1] + (s.dist - eng.sim.dist) > -40)
                            .map(s => `${s.code}${s.dist - eng.sim.dist >= 0 ? '+' : ''}${Math.round(s.dist - eng.sim.dist)}`);
console.log(`${at[0]}${at[1] >= 0 ? '+' : ''}${at[1]}` +
            `${scene && !atArg ? ' (' + sceneName + ': ' + scene.note + ')' : ''}  ` +
            `line ${line ? line.id : 'built-in'}  ` +
            `time ${timeName}${hour === null ? '' : ' (' + hour + ')'}  ` +
            `train ${eng.TRAINS[trainIdx].en}  hour ${eng.sim.hour.toFixed(2)}`);
console.log(`platform on screen: ${onScreen.length ? onScreen.join(', ') : '(none — open country)'}`);
console.log(`wrote ${path.relative(ROOT, shot.file)}  ${shot.width}x${shot.height}  ${(shot.bytes / 1024).toFixed(1)} kB`);
if (argv.includes('--ascii')) {
  const box = (arg('crop', '') || '').split(',').map(Number);
  const has = box.length === 4 && box.every(n => !Number.isNaN(n));
  console.log('\n' + asciiPreview(canvas._d, W, H, Number(arg('step', 3)),
                                   has ? box[0] : 0, has ? box[1] : 0, has ? box[2] : W, has ? box[3] : H));
}
