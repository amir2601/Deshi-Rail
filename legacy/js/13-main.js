'use strict';

// =====================================================================
// 10. MAIN LOOP
// =====================================================================
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

// second buffer for dithered cross-fades between lightings
const [bufB, bctx] = makeCanvas(W, H);
const [scratch, sctx] = makeCanvas(W, H);       // for dithered overlays inside a scene
const [reflectBuf, rctx] = makeCanvas(W, 48);   // rows mirrored in the river under the bridge
const DITHER_MASKS = [];
for (let level = 0; level <= 16; level++) {
  const [c, g] = makeCanvas(4, 4);
  for (let y = 0; y < 4; y++)
    for (let x = 0; x < 4; x++) if (bayer(x, y) < level) px(g, x, y, PALETTE.ink);   // alpha only
  DITHER_MASKS.push(bctx.createPattern(c, 'repeat'));
}

buildTerrain();
applyTrain(0);          // book the first service: its stops, clock and timetable
const VARIANTS = { day: buildVariant('day'), dusk: buildVariant('dusk'), night: buildVariant('night') };

// Everything that belongs to the landscape and lighting variant v. The sky
// is drawn once beforehand; this is drawn twice while two lightings blend.
function renderWorld(g, v) {
  const d = sim.dist;
  drawTiled(g, v.clouds, d * PARALLAX.clouds + sim.cloudDrift, LAYER_Y.clouds);   // 2. clouds
  drawCumulus(g, v, sectionWeight('kash', d));
  drawBackdrops(g, v, 'far');                                             //    Dhaka skyline
  drawTerrain(g, v, TL.far);                                              // 3. distant land
  drawTerrain(g, v, TL.mid);                                              // 4. fields, river, hills
  drawBirds(g, v);
  drawLine(g, v);                                                         // 5. poles, track, bridge
  drawTrain(g, v);
  drawSmoke(g, v);
  drawTruss(g, v, true);                                                  //    lattice over the train
  drawTerrain(g, v, TL.fg, drawReflection);                               // 6. near ground / water
  drawStationFront(g, v);                                                 //    platform, people
  drawFluff(g, v);
}

function render() {
  updateSky(ctx);
  placeCelestial();
  ctx.setTransform(1, 0, 0, 1, shake.x, shake.y);
  ctx.fillStyle = sky.pattern;                                           // 1. sky, sun, moon, stars
  ctx.fillRect(-2, -2, W + 4, H + 4);
  drawCelestial(ctx);
  const { a, b, f } = lightingAt(sim.hour), level = Math.round(f * 16);
  lights.n = 0;
  lights.collect = true;
  renderWorld(ctx, VARIANTS[level >= 16 ? b : a]);
  lights.collect = false;
  if (level > 0 && level < 16) {
    // keep lighting B only on pixels of the Bayer mask, then lay it over A
    bctx.setTransform(1, 0, 0, 1, shake.x, shake.y);
    bctx.clearRect(-2, -2, W + 4, H + 4);
    renderWorld(bctx, VARIANTS[b]);
    bctx.setTransform(1, 0, 0, 1, 0, 0);
    bctx.globalCompositeOperation = 'destination-in';
    bctx.fillStyle = DITHER_MASKS[level];
    bctx.fillRect(0, 0, W, H);
    bctx.globalCompositeOperation = 'source-over';
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(bufB, 0, 0);
    ctx.setTransform(1, 0, 0, 1, shake.x, shake.y);
  }
  drawRain(ctx);
  applyTint(ctx);                                                        // 7. time-of-day colour
  drawGlow(ctx);                                                         // 8. lamps, windows, sparks
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const driving = drive.on && !ui.title;
  ui.debugW = 0;
  if (driving) drawPopups(ctx);
  drawMap(ctx);
  if (driving) { drawDriveHUD(ctx); drawHint(ctx); }
  if (input.debug) drawDebug(ctx);
  drawBanner(ctx);
  if (driving) drawToasts(ctx);
  drawPanel(ctx);
  if (ui.title) drawTitle(ctx);
  else if (driving && ui.paused) drawPaused(ctx);
}

// Paint terrain chunks (and the sprites standing on them) a little before
// they scroll into view, at most one per frame, for every lighting that
// is on screen or about to be - so nothing is built mid-frame on demand
const PREFETCH_WANT = ['', '', '', ''];
function prefetchTerrain() {
  const now = lightingAt(sim.hour), na = now.a, nb = now.b;
  const soon = lightingAt((sim.hour + 0.6) % 24), sa = soon.a, sb = soon.b;
  const want = PREFETCH_WANT;
  want[0] = na; want[1] = nb; want[2] = sa; want[3] = sb;
  for (let w = 0; w < 4; w++) {
    if (want.indexOf(want[w]) !== w) continue;
    const v = VARIANTS[want[w]];
    for (const L of TLAYERS) {
      const cam = Math.floor(sim.dist * L.f), k0 = Math.floor(cam / CHUNK_W), k1 = Math.floor((cam + W - 1) / CHUNK_W) + 1;
      for (let k = k0; k <= k1; k++) if (!v.chunks[L.key].has(k)) { terrainChunk(v, L, k); warmChunk(v, L, k); return; }
    }
  }
}

// Paint every sprite of the live entities standing on a chunk
function warmChunk(v, L, k) {
  const x0 = k * CHUNK_W, x1 = x0 + CHUNK_W, live = L.live;
  let lo = 0, hi = live.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (live[m].x0 < x0 - L.span) lo = m + 1; else hi = m; }
  for (let i = lo; i < live.length && live[i].x0 < x1; i++) if (live[i].warm && live[i].x1 >= x0) live[i].warm(v);
}

// --- layout: canvas and toolbar share the screen --------------------------
// Portrait: toolbar under the picture (in two rows if it must). Wide
// screens: toolbar beside it. If neither leaves room, the toolbar floats
// over the bottom of the picture.
const bar = document.getElementById('bar');
function fit() {
  const cs = getComputedStyle(document.body);
  const aw = innerWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const ah = innerHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  let n = 0;
  for (const b of bar.children) if (!b.hidden) n++;
  const B = 48, GAP = 8, along = n * B + (n - 1) * 6;
  const rows = Math.ceil(n / Math.max(1, Math.floor((aw + 6) / (B + 6)))), tall = rows * B + (rows - 1) * 6;
  const below = rows <= 2 ? Math.min(aw / W, (ah - tall - GAP) / H) : 0;
  const side = along <= ah ? Math.min((aw - B - GAP) / W, ah / H) : 0;
  const over = Math.min(aw / W, ah / H);
  let mode = side >= below ? 'side' : 'below', s = Math.max(side, below);
  if (s < over * 0.8) { mode = 'overlay'; s = over; }
  document.body.className = mode;
  canvas.style.width = Math.floor(W * s) + 'px';
  canvas.style.height = Math.floor(H * s) + 'px';
}
addEventListener('resize', fit);
addEventListener('orientationchange', () => setTimeout(fit, 100));
fit();

// --- fixed-timestep loop ----------------------------------------------
let acc = 0, last = 0, frames = 0;
function frame(now) {
  const dt = Math.min(CONFIG.MAX_FRAME, (now - last) / 1000), t0 = performance.now();
  last = now;
  acc += dt * timeScale();
  let steps = 0;
  while (acc >= CONFIG.STEP && steps < 120) {
    update(CONFIG.STEP);
    acc -= CONFIG.STEP;
    steps++;
  }
  if (!steps && ui.paused) acc = 0;
  updateHour(dt);                                       // also eases while paused (time button)
  updateShake(steps ? dt : 0);
  updateAudioBeds(dt);
  updateToasts(dt);                                     // real time, so they fade while paused too
  render();
  prefetchTerrain();
  // phones and slow machines: drop to the light particle budgets
  const cost = performance.now() - t0;
  quality.ema = quality.ema * 0.95 + cost * 0.05;
  if (!quality.low && ++frames > 180 && quality.ema > CONFIG.LOW_QUALITY_MS) quality.low = true;
  requestAnimationFrame(frame);
}
startJourney();
// A link ending in #watch or #drive skips the title card
if (location.hash === '#watch' || location.hash === '#drive') beginTrip(location.hash === '#drive');
syncButtons();
requestAnimationFrame(now => { last = now; render(); requestAnimationFrame(frame); });