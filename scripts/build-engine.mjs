// Generates src/engine/engine.js from the original 13 ordered classic scripts
// in legacy/js (01-config … 13-main).
//
// The original game was a set of classic <script> files that shared a single
// global scope. A bundler wants ES modules, so we concatenate the files, in the
// same order, into the body of a `createEngine()` factory. Concatenation keeps
// the shared scope exactly as it was, so the simulation, drawing and audio code
// is byte-for-byte unchanged.
//
// Only the DOM-facing boot code changed:
//   * module 12 no longer reads #screen or mutates the toolbar buttons itself —
//     it exposes state and actions for the React toolbar instead;
//   * module 13 no longer owns the responsive `fit()` layout or the #bar element —
//     React lays the picture and toolbar out;
//   * window/canvas listeners are named functions so createEngine() can be
//     disposed cleanly on unmount.
//
// Run with: node scripts/build-engine.mjs
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'legacy', 'js');
const OUT = join(root, 'src', 'engine', 'engine.js');

const FILES = [
  '01-config', '02-palette', '03-drawing', '04-train', '05-world', '06-terrain',
  '07-stations', '08-people', '09-journey', '10-drive-mode', '11-atmosphere',
  '12-ui-audio-input', '13-main',
];

const stripUseStrict = s => s.replace(/^'use strict';\r?\n(\r?\n)?/, '');

function replaceOnce(text, pattern, replacement, label) {
  if (!pattern.test(text)) throw new Error('build-engine: anchor not found → ' + label);
  return text.replace(pattern, replacement);
}

// --- module 12: UI, sound and input ---------------------------------------
function adaptUi(text) {
  text = replaceOnce(
    text,
    /const canvas = document\.getElementById\('screen'\);/,
    'const canvas = canvasEl;',
    '12 canvas',
  );

  // the toolbar no longer looks buttons up by id
  text = replaceOnce(
    text,
    /\nconst btn = id => document\.getElementById\(id\);\n/,
    '\n',
    '12 btn helper',
  );

  text = replaceOnce(
    text,
    /function syncButtons\(\) \{[\s\S]*?\n\nconst actions = \{/,
    `const listeners = new Set();
let revision = 0;

// The original toolbar mutated the DOM buttons here. The toolbar is now a
// React component (src/components/Toolbar.jsx), so this simply notifies the
// app's subscribers, which re-render from the live engine state below.
function syncButtons() {
  revision++;
  for (const fn of listeners) fn();
}

const actions = {`,
    '12 syncButtons',
  );

  text = replaceOnce(
    text,
    /for \(const \[id, act\] of \[\['b-mode'[\s\S]*?\n\}\n\nfunction skipToNextStation/,
    `// Toolbar taps, holds and the horn are wired up by React (Toolbar.jsx); the
// engine keeps the action table, the hold timer and the horn helpers.
let holdTimer = 0;
const endHold = () => { clearTimeout(holdTimer); holdTimer = 0; };

function skipToNextStation`,
    '12 toolbar wiring',
  );

  text = replaceOnce(
    text,
    /addEventListener\('keydown', e => \{[\s\S]*?addEventListener\('pointerdown', unlockAudio\);/,
    `function onKeyDown(e) {
  unlockAudio();
  const key = e.code;
  if (key === 'KeyF') input.fast = true;
  if (key === 'KeyH' && drive.on && !ui.title && !ui.paused) hornOn();
  if (e.repeat) { if (key === 'Space' || key.startsWith('Arrow')) e.preventDefault(); return; }
  if ((ui.title && titleKey(key)) || (drive.on && !ui.title && driveKey(key))) { e.preventDefault(); syncButtons(); return; }
  if (key === 'KeyD') input.debug = !input.debug;
  else if (key === 'KeyC') actions.mode();
  else if (key === 'KeyT') actions.time();
  else if (key === 'KeyM') setMuted(!audio.muted);
  else if (key === 'KeyW') actions.rain();
  else if (key === 'KeyN') actions.skip();
  else if (key === 'KeyP' || (key === 'Space' && !ui.complete)) { actions.pause(); e.preventDefault(); }
  else if (!drive.on && (key === 'Digit1' || key === 'Digit2' || key === 'Digit4')) ui.speed = +key.slice(5);
  else if (key === 'KeyR' || (ui.complete && (key === 'Enter' || key === 'Space'))) startJourney();
  syncButtons();
}
function onKeyUp(e) {
  if (e.code === 'KeyF') input.fast = false;
  if (e.code === 'KeyH') hornOff();
}
function onBlur() { input.fast = false; hornOff(); endHold(); }
addEventListener('keydown', onKeyDown);
addEventListener('keyup', onKeyUp);
addEventListener('blur', onBlur);
addEventListener('pointerdown', unlockAudio);`,
    '12 input listeners',
  );

  text = replaceOnce(
    text,
    /canvas\.addEventListener\('pointermove', e => \{[\s\S]*$/,
    `function onCanvasMove(e) {
  const [x, y] = toInternal(e), t = ui.title ? titleHit(x, y) : -1;
  if (t >= 0) ui.titleSel = t;
  const tt = ui.title ? titleTrainHit(x, y) : 0;
  ui.hover = buttonHit(x, y);
  canvas.style.cursor = ui.hover || t >= 0 || tt !== 0 ? 'pointer' : 'default';
}
function onCanvasDown(e) {
  const [x, y] = toInternal(e), t = ui.title ? titleHit(x, y) : -1;
  if (t >= 0) { beginTrip(t === 1); canvas.style.cursor = 'default'; }
  else if (ui.title && titleTrainHit(x, y) !== 0) { selectTrain(ui.train + titleTrainHit(x, y)); }
  else if (buttonHit(x, y)) { startJourney(); ui.hover = false; canvas.style.cursor = 'default'; }
  syncButtons();
}
canvas.addEventListener('pointermove', onCanvasMove);
canvas.addEventListener('pointerdown', onCanvasDown);`,
    '12 canvas listeners',
  );

  return text;
}

// --- module 13: main loop --------------------------------------------------
function adaptMain(text) {
  text = replaceOnce(
    text,
    /\/\/ --- layout: canvas and toolbar share the screen[\s\S]*?\nfit\(\);\n\n/,
    '',
    '13 layout block',
  );

  text = replaceOnce(
    text,
    /let acc = 0, last = 0, frames = 0;/,
    'let acc = 0, last = 0, frames = 0, rafId = 0, disposed = false;',
    '13 loop state',
  );

  text = replaceOnce(
    text,
    /function frame\(now\) \{\n  const dt/,
    'function frame(now) {\n  if (disposed) return;\n  const dt',
    '13 frame guard',
  );

  text = replaceOnce(
    text,
    /  requestAnimationFrame\(frame\);\n\}/,
    '  rafId = requestAnimationFrame(frame);\n}',
    '13 loop requestAnimationFrame',
  );

  text = replaceOnce(
    text,
    /requestAnimationFrame\(now => \{ last = now; render\(\); requestAnimationFrame\(frame\); \}\);/,
    'rafId = requestAnimationFrame(now => { last = now; render(); rafId = requestAnimationFrame(frame); });',
    '13 boot requestAnimationFrame',
  );

  return text;
}

const HEADER = `/* eslint-disable */
// =====================================================================
// ENGINE — Deshi Rail
// ---------------------------------------------------------------------
// AUTO-GENERATED by scripts/build-engine.mjs from legacy/js/01..13.
// Do not edit by hand: edit the sources in legacy/js and re-run
//   node scripts/build-engine.mjs
//
// The original game was 13 ordered classic scripts that shared one global
// scope. Here the same code, in the same order, lives inside the body of the
// createEngine() factory below, so the engine is one ES module the React app
// imports. Only the DOM boot, toolbar wiring and responsive layout changed —
// see the comments in scripts/build-engine.mjs.
// =====================================================================
export function createEngine(canvasEl, options = {}) {
// options lets the React layer choose a different line without a rebuild:
//   options.route    an ordered array of stations  (see ROUTE in 01-config)
//   options.terrain  the landscape sections        (see TERRAIN in 01-config)
//   options.bridge   the river bridge              (see BRIDGE in 01-config)
//   options.trains   the services on that line     (see TRAINS in 01-config)
//   options.bnName   the Bangla route name on the title card (see LINE_INFO)
// Anything omitted falls back to the built-in Dhaka - Khulna line below, so the
// original static site and the option-less tests behave exactly as before.
`;

const FOOTER = `
// =====================================================================
// PUBLIC API FOR THE REACT LAYER
// ---------------------------------------------------------------------
// The live state objects (sim / drive / ui / input / audio / weather) are
// mutated in place by the engine; call subscribe() to be told when the small
// bits the toolbar depends on have changed.
// =====================================================================
function invoke(name) { unlockAudio(); actions[name](); syncButtons(); }

// Tear the engine down (used on React unmount, e.g. StrictMode re-mounts).
function dispose() {
  disposed = true;
  cancelAnimationFrame(rafId);
  removeEventListener('keydown', onKeyDown);
  removeEventListener('keyup', onKeyUp);
  removeEventListener('blur', onBlur);
  removeEventListener('pointerdown', unlockAudio);
  canvas.removeEventListener('pointermove', onCanvasMove);
  canvas.removeEventListener('pointerdown', onCanvasDown);
  listeners.clear();
  endHold();
  if (audio.ctx && audio.ctx.close) audio.ctx.close().catch(() => {});
}

// The line this engine shipped with, as plain data, so the React layer can
// offer it in a route picker next to the lines it defines itself.
const DEFAULT_LINE = { ...LINE_INFO, route: ROUTE, terrain: TERRAIN, bridge: BRIDGE, trains: TRAINS };

return {
  sim, drive, ui, input, audio, weather, quality,
  LAST_STATION, TIME_MODES, RAIN_MODES, SPEEDS, ICONS,
  STATIONS, TRAINS, applyTrain, nextCallIdx, currentTrain, selectTrain, DEFAULT_LINE,
  actions, invoke, beginTrip, startJourney, syncButtons,
  unlockAudio, setMuted, hornOn, hornOff,
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  getRevision() { return revision; },
  dispose,
};
}
`;

async function main() {
  let body = '';
  for (const name of FILES) {
    let text = stripUseStrict(await readFile(join(SRC, name + '.js'), 'utf8'));
    if (name === '12-ui-audio-input') text = adaptUi(text);
    if (name === '13-main') text = adaptMain(text);
    body += `\n// ===== ${name} =====\n\n${text.trimEnd()}\n`;
  }

  const out = HEADER + body + FOOTER;
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, out, 'utf8');
  console.log(`build-engine: wrote ${OUT} (${out.split('\n').length} lines)`);
}

main().catch(err => { console.error(err); process.exit(1); });
