import { preview } from 'vite';

const server = await preview({ preview: { port: 5199, strictPort: true }, logLevel: 'error' });
const res = await fetch('http://localhost:5199/');
const html = await res.text();
const okHtml = res.ok && html.includes('<div id="root">') && /assets\/index-.*\.js/.test(html);

const jsUrl = 'http://localhost:5199/' + html.match(/assets\/index-[^"]+\.js/)[0];
const js = await (await fetch(jsUrl)).text();
// minified: check for string literals that survive the build
const wanted = ['Nirmala UI', 'KAMALAPUR', 'SYLHET', 'SURMA MAIL', 'PARABAT EXPRESS',
                'SILK CITY EXPRESS', 'SUBORNO EXPRESS', 'BANGABANDHU BRIDGE WEST', 'COXS BAZAR',
                'Dhaka – Chattogram'];
const missing = wanted.filter(s => !js.includes(s));
const okJs = js.length > 100000 && missing.length === 0;
if (missing.length) console.log('preview-check: missing literals:', missing);

console.log('preview-check:', { status: res.status, okHtml, okJs });
await new Promise(r => server.httpServer.close(r));
process.exit(okHtml && okJs ? 0 : 1);
