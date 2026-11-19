/**
 * Diagnose why specific PIN keypad keys fail to register taps on WebKit.
 * Reports for each key: bounding box, hit-test at tap point, overlays.
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
await new Promise(resolve => server.listen(4185, '127.0.0.1', resolve));
const browser = await webkit.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 414, height: 736 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
const page = await context.newPage();
await page.goto('http://127.0.0.1:4185/', { waitUntil: 'domcontentloaded' });
await page.locator('#pin-lock').waitFor({ state: 'visible' });

const report = await page.evaluate(() => {
  const overlay = document.querySelector('#pin-lock');
  const out = { overlayScroll: { scrollH: overlay.scrollHeight, clientH: overlay.clientHeight, scrollTop: overlay.scrollTop }, keys: [] };
  for (const btn of overlay.querySelectorAll('[data-pin-digit]')) {
    const r = btn.getBoundingClientRect();
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    const hit = document.elementFromPoint(cx, cy);
    out.keys.push({
      digit: btn.getAttribute('data-pin-digit'),
      rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      inViewport: r.y >= 0 && r.y + r.height <= window.innerHeight,
      hitIsSelf: hit === btn,
      hit: hit ? hit.tagName + (hit.id ? '#' + hit.id : '') + (typeof hit.className === 'string' && hit.className ? '.' + hit.className.trim().split(/\s+/)[0] : '') : null,
    });
  }
  return out;
});
console.log(JSON.stringify(report, null, 1));

// Now try tapping keys 6,7,8 individually with fresh state and watch registration
for (const digit of ['6', '7', '8']) {
  await page.evaluate(() => document.querySelector('[data-pin-action="clear"]')?.click());
  const key = page.locator('[data-pin-digit="' + digit + '"]');
  await key.scrollIntoViewIfNeeded();
  const before = await page.evaluate(() => {
    const overlay = document.querySelector('#pin-lock');
    return { scrollTop: overlay.scrollTop, y: window.scrollY };
  });
  await key.tap();
  const filled = await page.locator('.pin-lock-dot.is-filled').count();
  // check whether tap landed: compare with direct JS click
  console.log(`tap ${digit}: filled=${filled} before=${JSON.stringify(before)}`);
}
// direct JS click comparison for key 7
await page.evaluate(() => document.querySelector('[data-pin-action="clear"]')?.click());
await page.evaluate(() => document.querySelector('[data-pin-digit="7"]')?.click());
console.log('js click 7: filled=' + await page.locator('.pin-lock-dot.is-filled').count());

await browser.close();
await new Promise(resolve => server.close(resolve));
