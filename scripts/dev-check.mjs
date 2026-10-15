import { createServer } from 'vite';

const server = await createServer({ server: { port: 5198, strictPort: true }, logLevel: 'error' });
await server.listen();
try {
  const base = 'http://localhost:5198';
  const htmlRes = await fetch(base + '/');
  const html = await htmlRes.text();
  const mainRes = await fetch(base + '/src/main.jsx');
  const main = await mainRes.text();
  const engineRes = await fetch(base + '/src/engine/engine.js');
  const engine = await engineRes.text();
  console.log('status:', { html: htmlRes.status, main: mainRes.status, engine: engineRes.status });
  if (mainRes.status !== 200) console.log('MAIN ERROR:\n' + main.slice(0, 800));
  const ok =
    html.includes('<div id="root">') &&
    main.includes('createRoot') &&
    engine.includes('createEngine');
  console.log('dev-check:', { ok, mainBytes: main.length, engineBytes: engine.length });
  process.exitCode = ok ? 0 : 1;
} finally {
  await server.close();
}
