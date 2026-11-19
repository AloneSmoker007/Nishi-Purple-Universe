import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname); } catch { res.writeHead(400).end(); return; }
  const target = path.resolve(root, pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, ''));
  fs.readFile(target, (error, data) => {
    if (error) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream' });
    res.end(data);
  });
});
await new Promise(resolve => server.listen(4179, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const context = await browser.newContext({ viewport: { width: 768, height: 1024 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const page = await context.newPage();
await page.goto('http://127.0.0.1:4179/', { waitUntil: 'domcontentloaded' });
await page.locator('#pin-lock').waitFor({ state: 'visible' });
for (const digit of '20062008') await page.locator('[data-pin-digit="' + digit + '"]').click();
await page.locator('#pin-lock').waitFor({ state: 'hidden' });
const report = await page.evaluate(() => {
  const s = document.querySelector('#skip-intro');
  const r = s.getBoundingClientRect();
  const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
  const hit = document.elementFromPoint(cx, cy);
  const chain = [];
  let el = hit;
  while (el && el !== document.documentElement) {
    const cs = getComputedStyle(el);
    chain.push({ tag: el.tagName + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).join('.') : ''), pe: cs.pointerEvents, z: cs.zIndex, pos: cs.position, op: cs.opacity });
    el = el.parentElement;
  }
  // also probe the four quadrants
  const probes = {};
  for (const [name, px, py] of [['TL', r.x + 5, r.y + 5], ['TR', r.x + r.width - 5, r.y + 5], ['BL', r.x + 5, r.y + r.height - 5], ['BR', r.x + r.width - 5, r.y + r.height - 5]]) {
    const h = document.elementFromPoint(px, py);
    probes[name] = h ? h.tagName + (h.id ? '#' + h.id : '') : null;
  }
  return { skipRect: [r.x, r.y, r.width, r.height], hitTag: hit ? hit.tagName + (hit.id ? '#' + hit.id : '') : null, hitIsSkip: hit === s, chain, probes, introZ: getComputedStyle(document.querySelector('#intro')).zIndex };
});
console.log(JSON.stringify(report, null, 1));
await browser.close();
await new Promise(resolve => server.close(resolve));
