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
await new Promise(resolve => server.listen(4182, '127.0.0.1', resolve));

// Each iteration uses a FRESH browser (fresh localStorage) and default reducedMotion.
const ITER = Number(process.argv[2] || 8);
for (let i = 0; i < ITER; i++) {
  const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 768, height: 1024 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4182/', { waitUntil: 'domcontentloaded' });
  await page.locator('#pin-lock').waitFor({ state: 'visible' });
  for (const digit of '20062008') await page.locator('[data-pin-digit="' + digit + '"]').click();
  await page.locator('#pin-lock').waitFor({ state: 'hidden' });
  const skip = page.locator('#skip-intro');
  try {
    await skip.click({ timeout: 10000 });
    console.log(`iter${i}: OK`);
  } catch (e) {
    const snap = await page.evaluate(() => {
      const s = document.querySelector('#skip-intro');
      const r = s.getBoundingClientRect();
      const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return {
        introClass: document.querySelector('#intro')?.className,
        introVis: getComputedStyle(document.querySelector('#intro')).visibility,
        introPE: getComputedStyle(document.querySelector('#intro')).pointerEvents,
        introOpacity: getComputedStyle(document.querySelector('#intro')).opacity,
        skipRect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
        hit: hit ? hit.tagName + (hit.id ? '#' + hit.id : '') + (typeof hit.className === 'string' && hit.className ? '.' + hit.className.trim().split(/\s+/)[0] : '') : null,
        localStorage: localStorage.getItem('nishi-intro-seen'),
        reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
      };
    }).catch(e2 => ({ evalError: e2.message }));
    console.log(`iter${i}: FAIL ${e.message.split('\n')[0]} snap=${JSON.stringify(snap)}`);
  }
  await browser.close();
}
await new Promise(resolve => server.close(resolve));
