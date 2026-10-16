'use strict';

// =====================================================================
// 9. UI, SOUND AND INPUT
// =====================================================================
const canvas = document.getElementById('screen');
const ui = { bannerY: -40, bannerSt: 1, bannerHold: 0, complete: false, panelY: -150, hover: false, debugW: 0,
             paused: false, speed: 1, timeMode: 0, rainMode: 0,      // toolbar state
             title: true, titleSel: 1, train: 0 };                    // title card: 0 WATCH, 1 DRIVE
const input = { debug: false, fast: false };

// The station the banner announces: the first one ahead that is either booked
// (sim.calls) or a major station. It is asked by distance — sim.station only
// moves when the train actually stops (or a driver misses a booked stop), so
// an express passing a major it does not serve would otherwise never announce
// it. Returns -1 once the train is past the last one.
function bannerTarget() {
  for (let i = 0; i < STATIONS.length; i++)
    if (STATIONS[i].dist > sim.dist && (isCall(i) || STATIONS[i].major)) return i;
  return -1;
}

function updateUI(dt) {
  const next = bannerTarget();
  const moving = sim.state === 'ARRIVING' || sim.state === 'TRAVELING' || sim.state === 'DRIVING';
  let show = next >= 0 && moving && STATIONS[next].dist - sim.dist < 900;
  // When two notable stations sit close together the banner stays wanted for
  // both; retract it for a moment so the new name reads as a fresh call.
  if (ui.bannerHold > 0) { ui.bannerHold = Math.max(0, ui.bannerHold - dt); show = false; }
  else if (show && ui.bannerSt !== next && ui.bannerY > -8) { ui.bannerHold = 0.35; show = false; }
  if (show) ui.bannerSt = next;                           // latched while it slides out
  // slides out under the route map (under the driver's panels in DRIVE)
  ui.bannerY += ((show ? (drive.on ? 50 : 19) : -40) - ui.bannerY) * Math.min(1, dt * 5);
  ui.panelY += ((ui.complete ? (drive.final ? 24 : 44) : -150) - ui.panelY) * Math.min(1, dt * 4);
}

// "NEXT STATION: <bangla> / <english>", pre-rendered once per station
const bannerCache = [];
function bannerSprite(i) {
  if (bannerCache[i]) return bannerCache[i];
  const st = STATIONS[i], m = st.bnMask, label = 'NEXT STATION:';
  const lw = textWidth(label), ew = textWidth(st.en), h = Math.max(m.h, 5) + 8;
  // A long name plus its English could still push the banner past the screen,
  // so drop the "/ <english>" tail rather than clip it.
  const full = 6 + lw + 6 + m.w + 5 + 3 + 5 + ew + 6, tail = full <= W - 4;
  const w = tail ? full : 6 + lw + 6 + m.w + 6;
  const [c, g] = makeCanvas(w, h);
  rect(g, 0, 0, w, h, PALETTE.slate);
  rect(g, 1, 1, w - 2, h - 2, PALETTE.ink);
  rect(g, 1, h - 2, w - 2, 1, PALETTE.green);
  const ty = (h - 5) >> 1;
  let x = 6;
  drawText(g, label, x, ty, PALETTE.grayLight);  x += lw + 6;
  drawMask(g, m, x, (h - m.h) >> 1, PALETTE.glow);
  if (tail) {
    x += m.w + 5;
    drawText(g, '/', x, ty, PALETTE.slate);          x += 8;
    drawText(g, st.en, x, ty, PALETTE.white);
  }
  return (bannerCache[i] = c);
}

function drawBanner(g) {
  const b = bannerSprite(ui.bannerSt), y = Math.round(ui.bannerY);
  if (y <= -b.height) return;
  g.drawImage(b, Math.max(input.debug ? ui.debugW + 4 : 2, (W - b.width) >> 1), y);
}

// "Journey complete" panel with a restart button (normal + hover sprites).
// After a drive it grows a score card: the breakdown, stars, best score.
const PANEL = { w: 172, h: 64 };
const COMPLETE_BN = textMask('যাত্রা সম্পন্ন', CONFIG.BN_SIZE);
const STAR = ['....x....', '...xxx...', 'xxxxxxxxx', '.xxxxxxx.', '..xxxxx..', '.xxx.xxx.', '.xx...xx.'];
let panelSprites = null;

function readBest() {
  try { return +localStorage.getItem('ipt-best') || 0; } catch (e) { return 0; }
}

function sizePanel() {
  PANEL.w = drive.final ? 184 : 172;
  PANEL.h = drive.final ? 142 : 74;
}

function panelButton() {
  const bw = textWidth('RESTART TRIP') + 12, bh = 11;
  return { x: (PANEL.w - bw) >> 1, y: PANEL.h - bh - 6, w: bw, h: bh };
}

function buildPanel(hover) {
  sizePanel();
  const { w, h } = PANEL, [c, g] = makeCanvas(w, h), m = COMPLETE_BN, P = PALETTE;
  const first = STATIONS[0], last = STATIONS[LAST_STATION];
  rect(g, 0, 0, w, h, P.slate);
  rect(g, 1, 1, w - 2, h - 2, P.ink);
  const title = 'JOURNEY COMPLETE';
  drawText2x(g, title, (w - title.length * 8 + 2) >> 1, 7, P.glow);
  drawMask(g, m, (w - m.w) >> 1, 21, P.white);
  const tr = TRAINS[ui.train], train = tr.no + '  ' + tr.en;
  drawText(g, train, (w - textWidth(train)) >> 1, 25 + m.h, P.glow);
  const route = first.en + ' > ' + last.en + '  ' + (last.km - first.km) + ' KM';
  drawText(g, route, (w - textWidth(route)) >> 1, 33 + m.h, P.grayLight);
  const F = drive.final;
  if (F) {
    const S = drive.pts, y0 = 44 + m.h;
    const rows = [['STOPS', S.stops], ['PUNCTUALITY', S.time], ['PASSENGERS', S.pax],
                  ['COMFORT ' + Math.round(drive.comfort) + '%', F.comfort], ['PENALTIES', Math.round(S.penalty)]];
    rows.forEach(([label, val], i) => {
      drawText(g, label, 14, y0 + i * 8, P.grayLight);
      drawText(g, String(val), w - 14 - textWidth(String(val)), y0 + i * 8, val < 0 ? P.red : P.white);
    });
    const ty = y0 + rows.length * 8 + 2;
    rect(g, 14, ty - 2, w - 28, 1, P.slate);
    drawText(g, 'TOTAL', 14, ty + 1, P.glow);
    drawText2x(g, String(F.total), w - 12 - String(F.total).length * 8, ty - 1, P.glow);
    for (let i = 0; i < 3; i++) stamp(g, STAR, 14 + i * 11, ty + 12, { x: i < F.stars ? P.glow : P.indigo });
    const best = F.record ? 'NEW RECORD!' : 'BEST ' + Math.max(F.best, F.total);
    drawText(g, best, w - 14 - textWidth(best), ty + 13, F.record ? P.glow : P.grayLight);
  }
  const b = panelButton();
  rect(g, b.x, b.y, b.w, b.h, P.grassLight);
  rect(g, b.x + 1, b.y + 1, b.w - 2, b.h - 2, hover ? P.grass : P.green);
  drawText(g, 'RESTART TRIP', b.x + 6, b.y + 3, P.white);
  return c;
}

function drawPanel(g) {
  const y = Math.round(ui.panelY);
  if (y <= -PANEL.h) return;
  panelSprites = panelSprites || [buildPanel(false), buildPanel(true)];
  g.drawImage(panelSprites[ui.hover ? 1 : 0], (W - PANEL.w) >> 1, y);
}

function buttonHit(x, y) {
  if (!ui.complete) return false;
  const b = panelButton(), bx = ((W - PANEL.w) >> 1) + b.x, by = Math.round(ui.panelY) + b.y;
  return x >= bx && x < bx + b.w && y >= by && y < by + b.h;
}

// --- title card: WATCH the journey or DRIVE it ------------------------------
// The Bangla route name: the chosen line's own (options.bnName), or the name of
// the built-in line in 01-config's LINE_INFO.
const TITLE = { w: 208, h: 112, y: 34, bn: textMask(OPT.bnName || LINE_INFO.bnName, CONFIG.BN_SIZE), sprite: null, best: readBest() };
TITLE.w = Math.max(TITLE.w, TITLE.bn.w + 24);              // a long route name widens the card
// The 20px Bangla route name is tall, so the service row (train picker + times)
// sits a few rows under it instead of at a fixed y — otherwise they collide.
TITLE.serviceY = 23 + TITLE.bn.h + 7;
const TITLE_OPTS = [['WATCH', 'SIT BACK AND ENJOY'], ['DRIVE', 'YOU ARE THE DRIVER']];
const TITLE_HITS = TITLE_OPTS.map(() => ({ x: 0, y: 0, w: 80, h: 15 }));

function buildTitle() {
  const { w, h, bn } = TITLE, [c, g] = makeCanvas(w, h), P = PALETTE;
  rect(g, 0, 0, w, h, P.slate);
  rect(g, 1, 1, w - 2, h - 2, P.ink);
  rect(g, 1, h - 2, w - 2, 1, P.green);
  const t = 'DESHI RAIL';
  drawText2x(g, t, (w - t.length * 8 + 2) >> 1, 6, P.glow);
  drawMask(g, bn, (w - bn.w) >> 1, 20, P.white);
  const line = STATIONS.length + ' STATIONS  ' + STATIONS[LAST_STATION].km + ' KM';
  drawText(g, line, (w - textWidth(line)) >> 1, 23 + bn.h, P.grayLight);
  const keys = 'E ENGINE  ↑↓ LEVER  R REV  O DOORS  H HORN';
  drawText(g, keys, (w - textWidth(keys)) >> 1, h - 19, P.slate);
  const foot = '↑↓ TRAIN   ←→ CHOOSE   ENTER START' + (TITLE.best ? '   BEST ' + TITLE.best : '');
  drawText(g, foot, (w - textWidth(foot)) >> 1, h - 11, P.grayLight);
  return c;
}

// The service picker: click [ or ] (or anywhere on the row) to cycle trains
function titleTrainHit(x, y) {
  const x0 = (W - TITLE.w) >> 1, y0 = TITLE.y;
  if (y < y0 + TITLE.serviceY - 2 || y > y0 + TITLE.serviceY + 14 || x < x0 + 6 || x > x0 + TITLE.w - 6) return 0;
  return x < x0 + 28 ? -1 : 1;
}
function selectTrain(k) {
  const n = TRAINS.length;
  ui.train = ((k % n) + n) % n;
  applyTrain(ui.train);
  syncButtons();
}

function drawTitle(g) {
  const x0 = (W - TITLE.w) >> 1, y0 = TITLE.y, P = PALETTE;
  g.drawImage(TITLE.sprite || (TITLE.sprite = buildTitle()), x0, y0);
  const tr = TRAINS[ui.train];
  const name = tr.no + '  ' + tr.en;
  const sy = y0 + TITLE.serviceY;
  drawText(g, '[', x0 + 10, sy, P.glow);
  drawText(g, ']', x0 + TITLE.w - 14, sy, P.glow);
  drawText(g, name, x0 + ((TITLE.w - textWidth(name)) >> 1), sy, P.white);
  const when = (tr.all ? STATIONS.length : tr.stops.length + 2) + ' STOPS   DEP ' + hhmm(tr.start) +
               '   ARR ' + hhmm(tr.end) + (tr.end >= 24 ? ' +1' : '');
  drawText(g, when, x0 + ((TITLE.w - textWidth(when)) >> 1), sy + 8, P.grayLight);
  for (let i = 0; i < TITLE_OPTS.length; i++) {
    const [label, sub] = TITLE_OPTS[i], r = TITLE_HITS[i], sel = ui.titleSel === i;
    r.x = x0 + 16 + i * 96; r.y = y0 + 62;
    rect(g, r.x, r.y, r.w, r.h, sel ? P.glow : P.slate);
    rect(g, r.x + 1, r.y + 1, r.w - 2, r.h - 2, sel ? (i ? P.green : P.blue) : P.navy);
    drawText2x(g, label, r.x + ((r.w - label.length * 8 + 2) >> 1), r.y + 3, sel ? P.white : P.grayLight);
    drawText(g, sub, r.x + ((r.w - textWidth(sub)) >> 1), r.y + 19, sel ? P.white : P.gray);
  }
}

function titleHit(x, y) {
  for (let i = 0; i < TITLE_HITS.length; i++) {
    const r = TITLE_HITS[i];
    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return i;
  }
  return -1;
}

// Leave the title card: AUTO cranks the engine and carries on as before;
// DRIVE leaves the engine cold for the driver
function beginTrip(driving) {
  if (!ui.title) return;
  ui.title = false;
  if (driving) { setDriveMode(true); resetDrive(); }
  else if (drive.engine === 'OFF') startEngine();
  syncButtons();
}

// --- DRIVE mode: the driver's panels, the next-step hint, messages ----------
function hudBox(g, x, y, w, h) {
  rect(g, x, y, w, h, PALETTE.slate);
  rect(g, x + 1, y + 1, w - 2, h - 2, PALETTE.ink);
}
const textRight = (g, s, xr, y, col) => drawText(g, s, xr - textWidth(s), y, col);

function drawDriveHUD(g) {
  const P = PALETTE, D = CONFIG.DRIVE, blink = Math.floor(sim.clock * 4) & 1, E = drive.engine;
  // left: speedometer, the lever, engine, passengers
  let x = 2, y = 2;
  hudBox(g, x, y, 76, 44);
  const v = String(Math.round(Math.abs(sim.speed)));
  drawText2x(g, v, x + 28 - v.length * 8, y + 4, P.white);
  drawText(g, 'KM/H', x + 30, y + 9, P.grayLight);
  if (drive.reverser === -1) {
    rect(g, x + 30, y + 2, 17, 6, P.navy);
    drawText(g, 'REV', x + 31, y + 2, P.amber);
  }
  const ly = y + 18, l = drive.lever;                    // brake steps on the left, power on the right
  for (let n = EB; n <= D.NOTCHES; n++) {
    const cx = x + 4 + (n - EB) * 4, on = l > 0 ? n > 0 && n <= l : l < 0 ? n < 0 && n >= l : n === 0;
    rect(g, cx, ly, 3, 5, n > 0 ? (on ? (drive.reverser === -1 ? P.amber : P.grassLight) : P.greenDeep) : n < 0 ? (on ? (n === EB ? P.red : P.amber) : P.brownDark)
                         : on ? P.white : P.grayDark);
    if (n === l) rect(g, cx, ly + 6, 3, 1, P.glow);
  }
  textRight(g, leverLabel(l), x + 73, ly, l === EB ? P.red : P.white);
  const ey = y + 28;
  drawText(g, 'ENG', x + 4, ey, P.grayLight);
  drawText(g, E === 'OFF' ? 'OFF' : E === 'ON' ? 'ON' : E === 'CRANK' ? 'START' : 'STOP', x + 20, ey,
           E === 'OFF' ? P.red : E === 'ON' ? P.grassLight : blink ? P.amber : P.peach);
  rect(g, x + 44, ey, 29, 5, P.navy);
  rect(g, x + 44, ey, Math.round(29 * drive.rpm), 5, drive.rpm > 0.85 ? P.orange : P.green);
  drawText(g, 'PAX ' + drive.pax, x + 4, y + 36, P.white);
  textRight(g, 'LAMP', x + 73, y + 36, drive.headlight && E !== 'OFF' ? P.glow : P.grayDark);

  // right: score, clock and timetable, the next stop, comfort
  x = W - 78;
  hudBox(g, x, y, 76, 44);
  const S = drive.pts, score = String(Math.round(S.stops + S.time + S.pax + S.penalty));
  drawText(g, 'SCORE', x + 4, y + 4, P.grayLight);
  textRight(g, score, x + 72, y + 4, P.glow);
  const stopped = sim.state === 'STOPPED';
  const nextI = sim.station < LAST_STATION ? nextCallIdx(sim.station) : LAST_STATION;
  const i = stopped ? sim.station : nextI;
  const leaving = stopped && i < LAST_STATION, dueT = leaving ? SCHEDULE[i].dep : SCHEDULE[i].arr;
  drawText(g, hhmm(sim.hour), x + 4, y + 12, P.white);
  textRight(g, (leaving ? 'DEP ' : 'ARR ') + hhmm(tripHour(dueT)), x + 72, y + 12,
            drive.tripT > dueT && !(stopped && !leaving) ? P.red : P.grayLight);
  const st = stopped ? null : STATIONS[nextI];
  if (stopped) {
    drawText(g, 'AT ' + STATIONS[sim.station].code, x + 4, y + 20, P.white);
    textRight(g, sim.station < LAST_STATION ? 'NEXT ' + STATIONS[nextI].code : 'TERMINUS', x + 72, y + 20, P.grayLight);
  } else if (st) {
    const togo = st.dist - sim.dist;
    drawText(g, st.code, x + 4, y + 20, P.white);
    textRight(g, togo < 0 ? 'REV ' + Math.round(-togo) + ' M' : togo > 400 ? (togo / CONFIG.PX_PER_KM).toFixed(1) + ' KM' : 'STOP ' + Math.round(togo) + ' M', x + 72, y + 20,
              togo > 400 ? P.white : togo < 0 ? P.amber : P.glow);
  }
  if (!stopped && st && (st.dist - sim.dist < 400 && sim.dist - st.dist < 260)) {      // stop gauge: the window, the mark, the train
    const w = stopWindow(st), o = sim.dist - st.dist, bx = x + 4, bw = 68;
    const at = u => bx + Math.round((Math.max(-160, Math.min(120, u)) + 160) / 280 * (bw - 1));
    rect(g, bx, y + 29, bw, 3, P.navy);
    rect(g, at(w[0]), y + 29, Math.max(2, at(w[1]) - at(w[0]) + 1), 3, P.greenDark);
    rect(g, at(0), y + 28, 1, 5, P.white);
    rect(g, at(o) - 1, y + 28, 3, 5, o > w[1] ? P.amber : P.glow);
  }
  const cf = Math.round(drive.comfort);
  drawText(g, 'COMFORT', x + 4, y + 36, P.grayLight);
  textRight(g, cf + '%', x + 72, y + 36, cf > 80 ? P.grassLight : cf > 50 ? P.amber : P.red);
}

function drawHint(g) {
  const s = driveHint();
  if (!s) return;
  const w = textWidth(s) + 8, x = (W - w) >> 1, y = 20;
  hudBox(g, x, y, w, 11);
  drawText(g, s, x + 4, y + 3, PALETTE.glow);
}

function drawToasts(g) {
  const b = bannerCache[ui.bannerSt];                   // under the HUD, or under the banner while it shows
  let y = b && ui.bannerY > -b.height ? Math.max(50, Math.round(ui.bannerY) + b.height + 3) : 50;
  for (let i = toasts.length - 1; i >= 0; i--) {
    const t = toasts[i], h = t.big ? 16 : 11, w = (t.big ? t.text.length * 8 - 2 : textWidth(t.text)) + 10, x = (W - w) >> 1;
    const yy = y - Math.round(Math.max(0, 1 - t.t / 0.15) * 6);      // pops in from above
    g.globalAlpha = Math.max(0, Math.min(1, (TOAST_LIFE - t.t) / 0.4));
    hudBox(g, x, yy, w, h);
    (t.big ? drawText2x : drawText)(g, t.text, x + 5, yy + 3, PALETTE[t.col]);
    g.globalAlpha = 1;
    y += h + 2;
  }
}

function drawPopups(g) {
  for (let i = 0; i < popPool.n; i++) {
    const q = popPool.items[i], x = q.x - (textWidth(q.text) >> 1), y = Math.round(q.y - q.t * 12);
    drawText(g, q.text, x + 1, y + 1, PALETTE.ink);
    drawText(g, q.text, x, y, PALETTE[q.col]);
  }
}

function drawPaused(g) {
  const s = 'PAUSED', w = s.length * 8 + 8, x = (W - w) >> 1;
  hudBox(g, x, 84, w, 16);
  drawText2x(g, s, x + 5, 87, PALETTE.white);
}

function landLabel() {
  const w = terrainAt(sim.dist);
  return SECTIONS[TERRAIN[w.t > 0.5 ? w.b : w.a].id].name;
}

function drawDebug(g) {
  const stopped = sim.state === 'STOPPED';
  const nextI = sim.station < LAST_STATION ? nextCallIdx(sim.station) : LAST_STATION;
  const st = STATIONS[stopped ? sim.station : nextI];
  const lines = [
    'STATE ' + sim.state + (stopped ? ' ' + sim.stopPhase.replace('_', ' ') : ''),
    'SPEED ' + sim.speed.toFixed(1) + ' PX/S',
    'DIST  ' + Math.floor(sim.dist) + ' PX',
    (stopped ? 'AT    ' : 'NEXT  ') + st.en,
    stopped ? 'PEOPLE ' + sim.people.length : 'IN    ' + Math.ceil(sim.nextStop - sim.dist) + ' PX',
    'TIME  ' + hhmm(sim.hour) + ' ' + TIME_MODES[ui.timeMode][0] + (weather.level > 0.05 ? ' RAIN ' + Math.round(weather.level * 100) : ''),
    'LAND  ' + landLabel() + (sim.onBridge ? ' BRIDGE' : ''),
  ];
  if (drive.on) lines.push('DRIVE ' + drive.engine + (drive.reverser === -1 ? ' [REV]' : '') + ' ' + leverLabel(drive.lever) + ' RPM ' + Math.round(drive.rpm * 100) +
                           ' A ' + drive.accel.toFixed(1), 'TRIP ' + Math.round(drive.tripT) + ' S  OFFSET ' + Math.round(sim.dist - STATIONS[sim.station < LAST_STATION ? nextI : sim.station].dist));
  if (timeScale() !== 1) lines.push(ui.paused ? 'PAUSED' : 'SPEED X' + timeScale());
  if (quality.low) lines.push('LOW QUALITY ' + quality.ema.toFixed(1) + ' MS');
  lines.push('P PAUSE  N NEXT  T TIME  W RAIN  C DRIVE', 'M SOUND  1/2/4 SPEED  R REV/RESTART');
  const w = Math.max(...lines.map(textWidth)) + 6, h = lines.length * 7 + 4;
  rect(g, 2, 2, w, h, PALETTE.slate);
  rect(g, 3, 3, w - 2, h - 2, PALETTE.ink);
  lines.forEach((s, i) =>
    drawText(g, s, 5, 5 + i * 7, i >= lines.length - 2 ? PALETTE.grayLight : i === 0 ? PALETTE.glow : PALETTE.white));
  ui.debugW = w + 2;
}

// --- sound: everything synthesised with Web Audio, no files -----------------
// The context is created on the first click / tap / key (browser rule).
// Continuous beds (rumble, bridge ring, crowd, rain) are looping noise
// through filters whose gains follow the scene; one-shots (rail joints,
// horn, thunder) are scheduled ahead on the audio clock.
const audio = { ctx: null, muted: false, master: null, noise: null, unlockedAt: 0, bedT: 0,
                rumble: null, metal: null, boom: null, murmur: null, rain: null, patter: null,
                engine: null, engOsc: null, engSub: null, engLfo: null, squeal: null,
                horn: null, hornT0: 0 };                // horn: the voice held down in DRIVE
const JOINT_PX = 96;                                    // one rail length between joints
const AXLES = [0, 8, 30, 38];                           // a carriage's two bogies: clickety ... clack
const HORN_TONES = [311.1, 370.0];                      // E-flat and F-sharp: the two-tone chord of a diesel air horn
const audioOn = () => audio.ctx && audio.ctx.state === 'running' && !audio.muted;

function unlockAudio() {
  if (!audio.ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { audio.ctx = new AC(); } catch (e) { return; }
    audio.unlockedAt = performance.now();
    buildAudioGraph();
  }
  if (audio.ctx.state === 'suspended') audio.ctx.resume().then(syncButtons, syncButtons);
  syncButtons();
}

function buildAudioGraph() {
  const ac = audio.ctx;
  audio.master = ac.createGain();
  audio.master.gain.value = audio.muted ? 0 : 0.9;
  audio.master.connect(ac.destination);
  const len = ac.sampleRate * 2, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;      // 2 s of white noise, shared
  audio.noise = buf;
  const loop = () => { const s = ac.createBufferSource(); s.buffer = buf; s.loop = true; s.start(0, Math.random() * 2); return s; };
  const filt = (type, f, q) => { const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q) b.Q.value = q; return b; };
  const gain = v => { const n = ac.createGain(); n.gain.value = v; return n; };
  const chain = nodes => { for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]); };
  const lfo = (hz, depth, param) => { const o = ac.createOscillator(), gn = gain(depth); o.frequency.value = hz; o.connect(gn); gn.connect(param); o.start(); };
  // wheels on rails: low rumble always, a ringing steel note and a hollow boom on the bridge
  audio.rumble = gain(0); chain([loop(), filt('lowpass', 220), audio.rumble, audio.master]);
  audio.metal = gain(0); chain([loop(), filt('bandpass', 2600, 7), audio.metal, audio.master]);
  audio.boom = gain(0); chain([loop(), filt('bandpass', 110, 4), audio.boom, audio.master]);
  // station crowd: two voice-band noises whose loudness wobbles like chatter
  audio.murmur = gain(0);
  const v1 = gain(0.55), v2 = gain(0.3);
  chain([loop(), filt('bandpass', 420, 1.2), v1, audio.murmur]);
  chain([loop(), filt('bandpass', 980, 2.2), v2, audio.murmur]);
  lfo(0.9, 0.3, v1.gain); lfo(2.3, 0.15, v1.gain); lfo(1.7, 0.2, v2.gain);
  chain([audio.murmur, filt('lowpass', 1600), audio.master]);
  // rain: hiss plus a brighter patter
  audio.rain = gain(0); chain([loop(), filt('highpass', 1200), filt('lowpass', 7500), audio.rain, audio.master]);
  audio.patter = gain(0); chain([loop(), filt('bandpass', 3800, 1.5), audio.patter, audio.master]);
  // diesel engine: a low sawtooth, a sub-octave square and some clatter, all
  // pulsing with the firing strokes; pitch and loudness follow the revs
  audio.engine = gain(0);
  const fire = gain(0.6), osc = type => { const o = ac.createOscillator(); o.type = type; o.start(); return o; };
  audio.engOsc = osc('sawtooth'); audio.engSub = osc('square'); audio.engLfo = osc('sine');
  chain([audio.engOsc, filt('lowpass', 300), fire]);
  chain([audio.engSub, filt('lowpass', 150), gain(0.5), fire]);
  chain([loop(), filt('bandpass', 190, 1.4), gain(1.2), fire]);
  const beat = gain(0.4);
  audio.engLfo.connect(beat); beat.connect(fire.gain);
  chain([fire, audio.engine, audio.master]);
  // brake squeal in the last metres before a stop
  audio.squeal = gain(0);
  const sq = osc('sine');
  sq.frequency.value = 3150;
  lfo(6.5, 40, sq.frequency);
  chain([sq, audio.squeal, audio.master]);
}

function setMuted(m) {
  audio.muted = m;
  if (audio.master) audio.master.gain.setTargetAtTime(m ? 0 : 0.9, audio.ctx.currentTime, 0.05);
  syncButtons();
}

// Ten times a second, steer the continuous beds towards the scene
function updateAudioBeds(dt) {
  if (!audio.ctx || audio.ctx.state !== 'running' || (audio.bedT += dt) < 0.1) return;
  audio.bedT = 0;
  const absSp = Math.abs(sim.speed);
  const now = audio.ctx.currentTime, run = ui.paused ? 0 : 1, sp = Math.min(1, absSp / CONFIG.CRUISE_SPEED) * run;
  const nextI = sim.station < LAST_STATION ? nextCallIdx(sim.station) : LAST_STATION;
  const st = STATIONS[sim.state === 'STOPPED' ? sim.station : nextI];
  const near = Math.max(0, 1 - Math.abs(st.dist - sim.dist) / 500) * Math.min(1, sim.people.length / 8) * run;
  const set = (node, v) => node.gain.setTargetAtTime(v, now, 0.15);
  set(audio.rumble, sp * (0.16 + 0.12 * sim.bridgeMix));
  set(audio.metal, sp * sim.bridgeMix * 0.05);
  set(audio.boom, sp * sim.bridgeMix * 0.35);
  set(audio.murmur, near * 0.09);
  set(audio.rain, weather.level * 0.16 * run);
  set(audio.patter, weather.level * 0.05 * run);
  const rpm = drive.rpm, f = 24 + rpm * 52;
  audio.engOsc.frequency.setTargetAtTime(f, now, 0.2);
  audio.engSub.frequency.setTargetAtTime(f / 2, now, 0.2);
  audio.engLfo.frequency.setTargetAtTime(f / 5, now, 0.2);
  set(audio.engine, rpm > 0.02 ? (0.05 + 0.09 * rpm) * (drive.on ? 1 : 0.55) * run : 0);
  set(audio.squeal, squealLevel() * 0.02 * run);
}

// Rail joints: every JOINT_PX of travel, the four axles of a carriage click
// over it in turn - so the rhythm follows the speed exactly
function trackSound(dt) {
  const absSp = Math.abs(sim.speed);
  sim.jointAcc += absSp * dt;
  if (sim.jointAcc < JOINT_PX) return;
  sim.jointAcc -= JOINT_PX;
  if (!audioOn() || absSp < 3) return;
  const now = audio.ctx.currentTime, rate = absSp * timeScale();
  for (let i = 0; i < AXLES.length; i++) playClick(now + 0.02 + AXLES[i] / rate, i === 0 || i === 2);
}

function playClick(t, strong) {
  const ac = audio.ctx, metal = sim.bridgeMix > 0.3, peak = (strong ? 0.32 : 0.22) * (1 + sim.bridgeMix * 0.7);
  const src = ac.createBufferSource(), bp = ac.createBiquadFilter(), g = ac.createGain();
  src.buffer = audio.noise;
  bp.type = 'bandpass'; bp.frequency.value = metal ? 3200 : 1700; bp.Q.value = metal ? 9 : 1.6;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, t + (metal ? 0.14 : 0.06));
  src.connect(bp); bp.connect(g); g.connect(audio.master);
  src.start(t, Math.random() * 1.8, 0.16);
  const o = ac.createOscillator(), og = ac.createGain();               // the thump under the click
  o.frequency.setValueAtTime(95, t);
  o.frequency.exponentialRampToValueAtTime(45, t + 0.07);
  og.gain.setValueAtTime(peak * 0.9, t);
  og.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
  o.connect(og); og.connect(audio.master);
  o.start(t); o.stop(t + 0.1);
}

// Two-tone chord, three detuned saws per tone, a brassy peak and vibrato.
// Long blast on departure; two short toots passing villages.
function playHorn(short) {
  sim.hornWave = short ? 1 : 1.6;
  if (!audioOn()) return;
  const t0 = audio.ctx.currentTime + 0.02;
  if (short) { hornBlast(t0, 0.3); hornBlast(t0 + 0.42, 0.5); }
  else hornBlast(t0, 1.3);
}

function hornBlast(t0, dur) { hornRelease(hornVoice(t0), t0 + dur - 0.15); }

// One horn voice, sounding from t0 until hornRelease()
function hornVoice(t0) {
  const ac = audio.ctx, out = ac.createGain(), lp = ac.createBiquadFilter(), pk = ac.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 2400;
  pk.type = 'peaking'; pk.frequency.value = 900; pk.gain.value = 6;
  out.gain.setValueAtTime(0, t0);
  out.gain.linearRampToValueAtTime(0.09, t0 + 0.07);
  lp.connect(pk); pk.connect(out); out.connect(audio.master);
  const vib = ac.createOscillator(), vg = ac.createGain(), oscs = [vib];
  vib.frequency.value = 5.5; vg.gain.value = 2.5; vib.connect(vg);
  for (const f of HORN_TONES)
    for (const det of [-7, 0, 6]) {
      const o = ac.createOscillator();
      o.type = 'sawtooth';
      o.detune.value = det;
      o.frequency.setValueAtTime(f * 0.94, t0);
      o.frequency.exponentialRampToValueAtTime(f, t0 + 0.09);
      vg.connect(o.frequency);
      o.connect(lp);
      oscs.push(o);
    }
  for (const o of oscs) o.start(t0);
  return { out, oscs };
}
function hornRelease(h, t) {
  h.out.gain.setValueAtTime(0.09, t);
  h.out.gain.linearRampToValueAtTime(0, t + 0.15);
  for (const o of h.oscs) o.stop(t + 0.2);
}

// DRIVE: the horn sounds for as long as it is held (at least a short toot)
function hornOn() {
  if (drive.horn) return;
  drive.horn = true;
  sim.hornWave = 99;
  if (!audioOn()) return;
  audio.hornT0 = audio.ctx.currentTime + 0.01;
  audio.horn = hornVoice(audio.hornT0);
}
function hornOff() {
  if (!drive.horn) return;
  drive.horn = false;
  sim.hornWave = Math.min(sim.hornWave, 0.3);
  if (!audio.horn) return;
  hornRelease(audio.horn, Math.max(audio.ctx.currentTime, audio.hornT0 + 0.3));
  audio.horn = null;
}

// --- DRIVE sound effects: all short, synthesised one-shots ------------------
function noiseHit(t, dur, type, freq, q, vol) {
  const ac = audio.ctx, src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
  src.buffer = audio.noise; src.loop = true;
  f.type = type; f.frequency.value = freq; if (q) f.Q.value = q;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + Math.min(0.03, dur * 0.2));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(audio.master);
  src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
}
function tone(t, freq, dur, vol, type = 'sine') {
  const ac = audio.ctx, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(audio.master);
  o.start(t); o.stop(t + dur + 0.05);
}

// Starter motor: a rising whine and the engine turning over, faster and faster
function playCrank() {
  if (!audioOn()) return;
  const ac = audio.ctx, t = ac.currentTime + 0.02, dur = CONFIG.DRIVE.CRANK_TIME;
  const o = ac.createOscillator(), lp = ac.createBiquadFilter(), g = ac.createGain();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(70, t);
  o.frequency.exponentialRampToValueAtTime(240, t + dur * 0.7);
  lp.type = 'lowpass'; lp.frequency.value = 900;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.025, t + 0.15);
  g.gain.setValueAtTime(0.025, t + dur - 0.2);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(lp); lp.connect(g); g.connect(audio.master);
  o.start(t); o.stop(t + dur + 0.05);
  for (let k = 0, tp = t + 0.1; tp < t + dur - 0.05; k++, tp += Math.max(0.09, 0.22 - k * 0.012))
    noiseHit(tp, 0.12, 'bandpass', 260, 1.2, 0.1 + Math.min(0.1, k * 0.008));
}
function playThump(v) {
  if (!audioOn()) return;
  const ac = audio.ctx, t = ac.currentTime + 0.01, o = ac.createOscillator(), g = ac.createGain();
  o.frequency.setValueAtTime(80, t);
  o.frequency.exponentialRampToValueAtTime(32, t + 0.3);
  g.gain.setValueAtTime(v, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
  o.connect(g); g.connect(audio.master);
  o.start(t); o.stop(t + 0.45);
  noiseHit(t, 0.25, 'lowpass', 500, 0, v * 0.6);
}
function playAir(dur, vol) { if (audioOn()) noiseHit(audio.ctx.currentTime + 0.01, dur, 'highpass', 2200, 0, vol); }   // pneumatics: pssssh
function playNotch() { if (audioOn()) noiseHit(audio.ctx.currentTime + 0.005, 0.04, 'bandpass', 2600, 4, 0.12); }    // the lever clicking into a notch
function playChime() {                                                                                                 // doors closing
  if (!audioOn()) return;
  const t = audio.ctx.currentTime + 0.01;
  tone(t, 784, 0.45, 0.06); tone(t + 0.32, 622, 0.6, 0.06);
}
function playScore(good) {
  if (!audioOn()) return;
  const t = audio.ctx.currentTime + 0.05, notes = good ? [523, 659, 784, 1047] : [523, 659, 784];
  notes.forEach((f, i) => tone(t + i * 0.08, f, 0.3, 0.045, 'triangle'));
}

function playThunder(strength) {
  if (!audioOn()) return;
  const ac = audio.ctx, t = ac.currentTime, src = ac.createBufferSource(), lp = ac.createBiquadFilter(), g = ac.createGain();
  src.buffer = audio.noise; src.loop = true;
  lp.type = 'lowpass'; lp.frequency.setValueAtTime(380, t); lp.frequency.exponentialRampToValueAtTime(90, t + 2.5);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.5 * strength, t + 0.25);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
  src.connect(lp); lp.connect(g); g.connect(audio.master);
  src.start(t, Math.random()); src.stop(t + 3.3);
}

// --- route map: the whole line, coloured by landscape, with a little train -
const MAP = { x: 0, y: 2, w: 150, sprite: null };
function buildMap() {
  const w = MAP.w, h = 15, [c, g] = makeCanvas(w + 12, h);
  const d0 = STATIONS[0].dist, d1 = STATIONS[LAST_STATION].dist;
  const SEC_COL = { village: PALETTE.grass, river: PALETTE.skyMid, kash: PALETTE.cream, tea: PALETTE.green, hills: PALETTE.haze };
  rect(g, 0, 0, w + 12, 9, PALETTE.slate);
  rect(g, 1, 1, w + 10, 7, PALETTE.ink);
  for (let i = 0; i <= w; i++) {
    const tw = terrainAt(d0 + (d1 - d0) * i / w);
    rect(g, 6 + i, 4, 1, 1, SEC_COL[TERRAIN[bayer(i, 4) < tw.t * 16 ? tw.b : tw.a].id]);
  }
  let lastRight = -Infinity;                            // labels that would collide are dropped
  for (const st of STATIONS) {
    const x = 6 + Math.round((st.dist - d0) / (d1 - d0) * w);
    rect(g, x, 3, 1, 3, PALETTE.white);
    if (!st.major) continue;
    rect(g, x - 1, 2, 2, 5, PALETTE.white);
    const lx = Math.max(0, Math.min(w + 12 - 11, x - 5));
    if (lx < lastRight + 2) continue;
    drawText(g, st.code, lx, 10, PALETTE.grayLight);
    lastRight = lx + 11;
  }
  MAP.x = (W - w - 12) >> 1;
  MAP.sprite = c;
}

function drawMap(g) {
  if (!MAP.sprite) buildMap();
  const d0 = STATIONS[0].dist, d1 = STATIONS[LAST_STATION].dist, ox = MAP.x + 6, oy = MAP.y;
  g.drawImage(MAP.sprite, MAP.x, oy);
  for (let i = 0; i <= LAST_STATION; i++) {              // stations reached glow, the next one blinks
    const x = ox + Math.round((STATIONS[i].dist - d0) / (d1 - d0) * MAP.w);
    const next = i === (sim.state === 'STOPPED' ? sim.station : (sim.station < LAST_STATION ? nextCallIdx(sim.station) : sim.station));
    if (i <= sim.station || (next && Math.floor(sim.clock * 3) & 1)) { g.fillStyle = PALETTE.glow; g.fillRect(x, oy + 4, 1, 1); }
  }
  const tx = ox + Math.round((sim.dist - d0) / (d1 - d0) * MAP.w);
  g.fillStyle = PALETTE.green; g.fillRect(tx - 5, oy + 2, 3, 2);       // carriage
  g.fillStyle = PALETTE.blue;  g.fillRect(tx - 1, oy + 1, 3, 3);       // locomotive
  g.fillStyle = PALETTE.glow;  g.fillRect(tx + 2, oy + 2, 1, 1);       // headlight
}

// --- controls: toolbar buttons and keys --------------------------------------
const SPEEDS = [1, 2, 4], RAIN_MODES = ['AUTO', 'ON', 'OFF'];
const ICONS = {
  pause: '<path d="M4 3h3v10H4zM9 3h3v10H9z"/>',
  play: '<path d="M4 3h2v1h2v1h2v1h2v1h1v2h-1v1h-2v1H8v1H6v1H4z"/>',
  sun: '<path d="M6 5h4v1h1v4h-1v1H6v-1H5V6h1zM7 1h2v2H7zM7 13h2v2H7zM1 7h2v2H1zM13 7h2v2h-2zM3 3h2v2H3zM11 3h2v2h-2zM3 11h2v2H3zM11 11h2v2h-2z"/>',
  dusk: '<path d="M5 7h6v1h1v2H4V8h1zM1 11h14v1H1zM3 13h10v1H3zM7 2h2v3H7zM2 5h2v2H2zM12 5h2v2h-2z"/>',
  moon: '<path d="M7 2h4v1H8v1H7v1H6v6h1v1h1v1h3v1H7v-1H5v-1H4V9H3V6h1V4h1V3h2z"/>',
  auto: '<path d="M6 2h4v1h2v1h1v2h1v4h-1v2h-1v1h-2v1H6v-1H4v-1H3v-2H2V6h1V4h1V3h2zM7 4v5h4V8H8V4z"/>',
  sound: '<path d="M2 6h3l3-3h1v10H8l-3-3H2zM11 5h1v6h-1zM13 3h1v10h-1z"/>',
  mute: '<path d="M2 6h3l3-3h1v10H8l-3-3H2zM11 5h1v1h-1zM12 6h1v1h-1zM13 7h1v1h-1zM14 8h1v1h-1zM14 5h1v1h-1zM13 6h1v1h-1zM12 7h1v1h-1zM11 8h1v1h-1z"/>',
};
const btn = id => document.getElementById(id);

function syncButtons() {
  // AUTO and DRIVE each show their own set of buttons
  const driving = drive.on && !ui.title;
  let relayout = false;
  for (const b of bar.children) {
    const hide = b.classList.contains('drv') ? !driving : b.classList.contains('aut') && driving;
    if (b.hidden !== hide) { b.hidden = hide; relayout = true; }
  }
  if (relayout) fit();
  const set = (id, icon, label, on, aria) => {
    const b = btn(id);
    if (icon && b.dataset.icon !== icon) { b.firstElementChild.innerHTML = icon; b.dataset.icon = icon; }
    if (label !== null && b.lastChild.textContent !== label) b.lastChild.textContent = label;
    b.classList.toggle('on', !!on);
    b.setAttribute('aria-label', aria);
  };
  set('b-pause', ui.paused ? ICONS.play : ICONS.pause, ui.paused ? 'PLAY' : 'PAUSE', ui.paused, ui.paused ? 'Resume' : 'Pause');
  const sp = btn('b-speed');
  if (sp.textContent !== ui.speed + 'x') sp.textContent = ui.speed + 'x';
  sp.classList.toggle('on', ui.speed > 1);
  sp.setAttribute('aria-label', 'Speed ' + ui.speed + 'x');
  const tm = TIME_MODES[ui.timeMode][0];
  set('b-time', tm === 'NIGHT' ? ICONS.moon : tm === 'DUSK' ? ICONS.dusk : tm === 'DAY' ? ICONS.sun : ICONS.auto, tm, ui.timeMode > 0, 'Time of day: ' + tm);
  set('b-rain', null, RAIN_MODES[ui.rainMode], ui.rainMode === 1, 'Rain: ' + RAIN_MODES[ui.rainMode]);
  const live = audio.ctx && audio.ctx.state === 'running';
  set('b-mute', live && !audio.muted ? ICONS.sound : ICONS.mute, !live ? 'TAP' : audio.muted ? 'OFF' : 'ON', live && !audio.muted,
      !live ? 'Turn sound on' : audio.muted ? 'Unmute' : 'Mute');
  set('b-mode', null, driving ? 'DRIVE' : 'AUTO', driving, driving ? 'Driver mode on: hand back to autopilot' : 'Drive the train yourself');
  const E = drive.engine;
  set('b-engine', null, E === 'OFF' ? 'START' : E === 'ON' ? 'STOP' : '...', E === 'ON', E === 'OFF' ? 'Start the engine' : 'Stop the engine');
  set('b-rev', null, drive.reverser === -1 ? 'REV' : 'FWD', drive.reverser === -1, drive.reverser === -1 ? 'Reverse gear: back up slowly (R)' : 'Forward gear (R)');
  set('b-power', null, null, drive.lever > 0, 'Power up, lever ' + leverLabel(drive.lever));
  set('b-brake', null, null, drive.lever < 0, 'Brake, lever ' + leverLabel(drive.lever));
  const closing = sim.state === 'STOPPED' && (sim.stopPhase === 'BOARDING' || sim.stopPhase === 'BOARDED' || sim.stopPhase === 'DOORS_OPEN');
  set('b-doors', null, closing ? 'CLOSE' : 'OPEN', sim.doorOpen > 0, closing ? 'Close the doors' : 'Open the doors');
  set('b-light', null, null, drive.headlight, drive.headlight ? 'Headlight off' : 'Headlight on');
}

const actions = {
  mode() { if (ui.title) beginTrip(true); else setDriveMode(!drive.on); },
  pause() { ui.paused = !ui.paused; if (ui.paused) hornOff(); },
  speed() { ui.speed = SPEEDS[(SPEEDS.indexOf(ui.speed) + 1) % SPEEDS.length]; },
  skip() { skipToNextStation(); },
  time() { ui.timeMode = (ui.timeMode + 1) % TIME_MODES.length; },
  rain() { ui.rainMode = (ui.rainMode + 1) % RAIN_MODES.length; },
  mute() {
    // the tap that starts the audio should not also mute it
    if (performance.now() - audio.unlockedAt < 700) { setMuted(false); return; }
    setMuted(!audio.muted);
  },
  engine() { toggleEngine(); },
  rev() { toggleReverser(); },
  power() { setLever(drive.lever + 1); },
  brake() { setLever(drive.lever - 1); },
  doors() { toggleDoors(); },
  light() { toggleLight(); },
};
for (const [id, act] of [['b-mode', 'mode'], ['b-pause', 'pause'], ['b-speed', 'speed'], ['b-skip', 'skip'], ['b-time', 'time'],
                         ['b-rain', 'rain'], ['b-mute', 'mute'], ['b-engine', 'engine'], ['b-rev', 'rev'], ['b-doors', 'doors'], ['b-light', 'light']])
  btn(id).addEventListener('click', () => { unlockAudio(); actions[act](); syncButtons(); });

// Power and brake step once per tap and keep stepping while held; the horn
// sounds while held. A click with no pointer (keyboard on the button) taps.
let holdTimer = 0;
const endHold = () => { clearTimeout(holdTimer); holdTimer = 0; };
for (const [id, act] of [['b-power', 'power'], ['b-brake', 'brake']]) {
  const b = btn(id), step = () => { actions[act](); syncButtons(); };
  b.addEventListener('pointerdown', e => {
    unlockAudio(); step(); endHold();
    const again = () => { step(); holdTimer = setTimeout(again, 170); };
    holdTimer = setTimeout(again, 420);
    e.preventDefault();
  });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, endHold);
  b.addEventListener('click', e => { if (e.detail === 0) step(); });
}
{
  const b = btn('b-horn');
  b.addEventListener('pointerdown', e => { unlockAudio(); hornOn(); e.preventDefault(); });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, hornOff);
  b.addEventListener('click', e => { if (e.detail === 0) { hornOn(); setTimeout(hornOff, 400); } });
}

function skipToNextStation() {
  if (ui.complete || sim.station >= LAST_STATION || drive.on) return;
  sim.doorOpen = 0;
  smokePool.n = sparkPool.n = 0;
  arrive(nextCallIdx(sim.station), 0);
}

const timeScale = () => (ui.paused ? 0 : ui.speed) * (input.fast ? CONFIG.FAST_FACTOR : 1);

// Keys on the title card, and the driver's keys; true when the key was used
function titleKey(key) {
  if (key === 'ArrowLeft' || key === 'ArrowRight' || key === 'Tab') ui.titleSel ^= 1;
  else if (key === 'ArrowUp') selectTrain(ui.train - 1);
  else if (key === 'ArrowDown') selectTrain(ui.train + 1);
  else if (key === 'Enter' || key === 'Space') beginTrip(ui.titleSel === 1);
  else if (key === 'KeyC') beginTrip(true);
  else return false;
  return true;
}
function driveKey(key) {
  if (ui.complete) return false;
  switch (key) {
    case 'KeyE': toggleEngine(); break;
    case 'KeyR': toggleReverser(); break;
    case 'ArrowUp': setLever(drive.lever + 1); break;
    case 'ArrowDown': setLever(drive.lever - 1); break;
    case 'KeyB': setLever(EB); break;
    case 'KeyO': toggleDoors(); break;
    case 'KeyL': toggleLight(); break;
    case 'KeyH': break;                                  // held: see keydown
    default: return false;
  }
  return true;
}

addEventListener('keydown', e => {
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
});
addEventListener('keyup', e => {
  if (e.code === 'KeyF') input.fast = false;
  if (e.code === 'KeyH') hornOff();
});
addEventListener('blur', () => { input.fast = false; hornOff(); endHold(); });
addEventListener('pointerdown', unlockAudio);

function toInternal(e) {
  const r = canvas.getBoundingClientRect();
  return [(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height];
}
canvas.addEventListener('pointermove', e => {
  const [x, y] = toInternal(e), t = ui.title ? titleHit(x, y) : -1;
  if (t >= 0) ui.titleSel = t;
  ui.hover = buttonHit(x, y);
  canvas.style.cursor = ui.hover || t >= 0 ? 'pointer' : 'default';
});
canvas.addEventListener('pointerdown', e => {
  const [x, y] = toInternal(e), t = ui.title ? titleHit(x, y) : -1;
  if (t >= 0) { beginTrip(t === 1); canvas.style.cursor = 'default'; }
  else if (buttonHit(x, y)) { startJourney(); ui.hover = false; canvas.style.cursor = 'default'; }
  syncButtons();
});
