// React layer test (no browser, no extra deps): loads the .jsx components
// through Vite's SSR module loader and renders them with react-dom/server,
// checking that the toolbar switches between the AUTO and DRIVE button sets and
// that App's initial render is clean.
//
//   node scripts/react-ssr-test.mjs
import assert from 'node:assert';
import { createServer } from 'vite';

// The engine state the toolbar reads, as a plain object.
function fakeEngine({ title = true, on = false, paused = false, speed = 1, timeMode = 0, rainMode = 0 } = {}) {
  return {
    ui: { paused, speed, timeMode, rainMode, title, complete: false },
    drive: { on, engine: 'OFF', reverser: 1, lever: 0, headlight: false },
    sim: { state: 'TRAVELING', stopPhase: null, doorOpen: 0, station: 0 },
    audio: { ctx: null, muted: false },
    TIME_MODES: [['AUTO', null], ['DAY', 12], ['DUSK', 18.3], ['NIGHT', 22.5]],
    RAIN_MODES: ['AUTO', 'ON', 'OFF'],
    invoke() {},
    unlockAudio() {},
    hornOn() {},
    hornOff() {},
  };
}

const countButtons = html => (html.match(/<button/g) || []).length;

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const React = (await import('react')).default;
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { Toolbar } = await server.ssrLoadModule('/src/components/Toolbar.jsx');
  const AppModule = await server.ssrLoadModule('/src/App.jsx');

  // 1. AUTO (title card up): no driver controls.
  const auto = fakeEngine({ title: true, on: false });
  const autoHtml = renderToStaticMarkup(
    React.createElement(Toolbar, { engine: auto, driving: auto.drive.on && !auto.ui.title }),
  );
  assert.equal(countButtons(autoHtml), 7, 'AUTO shows 7 buttons');
  assert.ok(autoHtml.includes('>AUTO<'), 'AUTO label present');
  assert.ok(autoHtml.includes('id="b-speed"'), 'speed button present');
  assert.ok(!autoHtml.includes('id="b-engine"'), 'no engine button in AUTO');

  // 2. DRIVE (trip started): driver control set.
  const drv = fakeEngine({ title: false, on: true, paused: true });
  const drvHtml = renderToStaticMarkup(
    React.createElement(Toolbar, { engine: drv, driving: drv.drive.on && !drv.ui.title }),
  );
  assert.equal(countButtons(drvHtml), 10, 'DRIVE shows 10 buttons');
  assert.ok(drvHtml.includes('>DRIVE<'), 'DRIVE label present');
  assert.ok(drvHtml.includes('id="b-engine"') && drvHtml.includes('>START<'), 'engine button');
  assert.ok(drvHtml.includes('id="b-horn"') && drvHtml.includes('id="b-light"'), 'horn + light buttons');
  assert.ok(!drvHtml.includes('id="b-speed"'), 'no speed button in DRIVE');
  assert.ok(drvHtml.includes('>PLAY<'), 'pause button reads PLAY while paused');

  // 3. App's initial render (engine not mounted yet) is clean.
  const appHtml = renderToStaticMarkup(React.createElement(AppModule.default));
  assert.ok(appHtml.includes('<canvas') && appHtml.includes('id="screen"'), 'canvas rendered');
  assert.ok(appHtml.includes('class="topbar"'), 'top bars share one wrapping strip');
  assert.ok(appHtml.slice(appHtml.indexOf('class="topbar"')).includes('class="userbar"'),
    'the account chip sits inside the top strip');

  // 4. The route picker lists the built-in line and the extra lines.
  const { RoutePicker } = await server.ssrLoadModule('/src/components/RoutePicker.jsx');
  const pickerHtml = renderToStaticMarkup(
    React.createElement(RoutePicker, {
      routes: [{ id: 'dhaka-khulna', name: 'Dhaka – Khulna' }, { id: 'dhaka-chattogram', name: 'Dhaka – Chattogram' }],
      value: 'dhaka-chattogram',
      onChange() {},
    }),
  );
  assert.ok(pickerHtml.includes('<select'), 'picker renders a select');
  assert.equal((pickerHtml.match(/<option/g) || []).length, 2, 'picker lists both lines');
  assert.ok(pickerHtml.includes('Dhaka – Chattogram'), 'picker shows line names');
  assert.ok(pickerHtml.includes('value="dhaka-chattogram"') || pickerHtml.includes('selected'), 'picker marks the current line');

  console.log('react-ssr-test: OK — Toolbar (AUTO/DRIVE), RoutePicker and App render cleanly');
} finally {
  await server.close();
}
