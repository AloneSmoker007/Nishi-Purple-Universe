/**
 * Measure PIN keypad fit on small viewports WITHOUT scrolling:
 * which keys fall below the fold at rest (the reported WebKit bug),
 * and what the card layout looks like.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { webkit } from 'playwright';

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
await new Promise(resolve => server.listen(4189, '127.0.0.1', resolve));
const browser = await webkit.launch({ headless: true });

for (const vp of [{ w: 375, h: 667, dpr: 2 }, { w: 414, h: 736, dpr: 3 }, { w: 360, h: 640, dpr: 2 }]) {
  const context = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, isMobile: true, hasTouch: true, deviceScaleFactor: vp.dpr });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4189/', { waitUntil: 'domcontentloaded' });
  await page.locator('#pin-lock').waitFor({ state: 'visible' });
  await page.waitForTimeout(400);
  const r = await page.evaluate(() => {
    const overlay = document.querySelector('#pin-lock');
    const card = overlay.querySelector('.pin-lock-card');
    const cr = card.getBoundingClientRect();
    const keys = {};
    for (const btn of overlay.querySelectorAll('[data-pin-digit],[data-pin-action]')) {
      const b = btn.getBoundingClientRect();
      const label = btn.getAttribute('data-pin-digit') || btn.getAttribute('data-pin-action');
      keys[label] = { y: Math.round(b.y), bottom: Math.round(b.y + b.height), visible: b.y >= 0 && b.y + b.height <= window.innerHeight };
    }
    return {
      vh: window.innerHeight,
      cardTop: Math.round(cr.y), cardBottom: Math.round(cr.y + cr.height), cardH: Math.round(cr.height),
      overlayScrollH: overlay.scrollHeight, overlayClientH: overlay.clientHeight,
      topReachable: cr.y >= 0,
      belowFold: Object.entries(keys).filter(([, v]) => !v.visible).map(([k]) => k),
      keys,
    };
  });
  console.log(`== ${vp.w}x${vp.h}`);
  console.log(JSON.stringify(r));
  await context.close();
}
await browser.close();
await new Promise(resolve => server.close(resolve));
