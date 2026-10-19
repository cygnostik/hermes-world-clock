// Serve media/ over loopback HTTP (fetch needs http, not file://) and render.
import { chromium } from 'playwright';
import http from 'node:http'; import { readFile } from 'node:fs/promises'; import path from 'node:path';
const repo = new URL('../', import.meta.url).pathname;
const root = repo + 'media/';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.geojson': 'application/json', '.png': 'image/png', '.ttf': 'font/ttf', '.woff2': 'font/woff2' };
const srv = http.createServer(async (q, r) => { try { const p = path.join(root, decodeURIComponent(q.url.split('?')[0])); r.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); r.end(await readFile(p)); } catch { r.writeHead(404); r.end(); } });await new Promise(r=>srv.listen(0,'127.0.0.1',r));
const base = `http://127.0.0.1:${srv.address().port}/promo.html`;
const jobs = [['catalog-banner.png', 1200, 600, 'catalog'], ['social-preview.png', 1280, 640, 'catalog'], ['readme-hero.png', 1600, 800, 'hero']];
const b = await chromium.launch();
for (const [name, w, h, mode] of jobs) {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(`${base}?w=${w}&h=${h}&mode=${mode}`); await p.waitForSelector('body[data-ready="1"]', { timeout: 60000 }); await p.waitForTimeout(200);
  const fit = await p.evaluate(() => window.__fit);
  await p.screenshot({ path: repo + 'docs/media/' + name }); console.log(name, JSON.stringify(fit), errs); await p.close();
}
await b.close(); srv.close();
