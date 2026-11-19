/**
 * Exact replica of the regression suite keypad loop with verbose logging,
 * to capture precisely how a tap fails to register.
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
await new Promise(resolve => server.listen(4186, '127.0.0.1', resolve));
const browser = await webkit.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 414, height: 736 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
const page = await context.newPage();
await page.goto('http://127.0.0.1:4186/', { waitUntil: 'domcontentloaded' });
const lock = page.locator('#pin-lock');
await lock.waitFor({ state: 'visible' });

for (const digit of '0123456789') {
  const key = lock.locator('[data-pin-digit="' + digit + '"]');
  await key.scrollIntoViewIfNeeded();
  const boxBefore = await key.boundingBox();
  await key.tap();
  const filled = await page.locator('.pin-lock-dot.is-filled').count();
  const status = await page.locator('#pin-lock-status').textContent().catch(() => '?');
  const boxAfter = await key.boundingBox();
  const overlayScroll = await page.evaluate(() => document.querySelector('#pin-lock').scrollTop);
  console.log(`digit ${digit}: filled=${filled} boxBefore=${JSON.stringify(boxBefore && [Math.round(boxBefore.x), Math.round(boxBefore.y)])} boxAfter=${JSON.stringify(boxAfter && [Math.round(boxAfter.x), Math.round(boxAfter.y)])} scrollTop=${overlayScroll} status="${status?.slice(0, 30)}"`);
  if (filled !== 1) {
    const snap = await page.evaluate(() => {
      const overlay = document.querySelector('#pin-lock');
      const dots = document.querySelectorAll('.pin-lock-dot.is-filled').length;
      const hitAt = [];
      for (const btn of overlay.querySelectorAll('[data-pin-digit]')) {
        const r = btn.getBoundingClientRect();
        if (r.y < window.innerHeight && r.y + r.height > 0) hitAt.push(btn.getAttribute('data-pin-digit') + '@' + Math.round(r.y));
      }
      return { dots, visibleKeys: hitAt, scrollTop: overlay.scrollTop, scrollH: overlay.scrollHeight, clientH: overlay.clientHeight };
    });
    console.log('  MISMATCH SNAP:', JSON.stringify(snap));
  }
  await lock.locator('[data-pin-action="clear"]').tap();
}
await browser.close();
await new Promise(resolve => server.close(resolve));
