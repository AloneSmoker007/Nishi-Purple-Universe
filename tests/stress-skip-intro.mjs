import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium, webkit } from 'playwright';

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
await new Promise(resolve => server.listen(4178, '127.0.0.1', resolve));

const engine = process.argv[2] === 'webkit' ? webkit : chromium;
const ITER = Number(process.argv[3] || 5);
const profiles = [
  { name: 'iPhone375', viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true, dpr: 2 },
  { name: 'tablet768', viewport: { width: 768, height: 1024 }, isMobile: true, hasTouch: true, dpr: 2 },
];
let fails = 0;
for (const profile of profiles) {
  for (let i = 0; i < ITER; i++) {
    const browser = await engine.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
    const context = await browser.newContext({ viewport: profile.viewport, isMobile: profile.isMobile, hasTouch: profile.hasTouch, deviceScaleFactor: profile.dpr });
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:4178/', { waitUntil: 'domcontentloaded' });
    await page.locator('#pin-lock').waitFor({ state: 'visible' });
    for (const digit of '20062008') await page.locator('[data-pin-digit="' + digit + '"]').click();
    await page.locator('#pin-lock').waitFor({ state: 'hidden' });
    const intro = page.locator('#intro');
    if (await intro.isVisible()) {
      const skip = page.locator('#skip-intro');
      try {
        await skip.click({ timeout: 8000 });
        console.log(`OK   ${profile.name} iter${i}`);
      } catch (e) {
        fails++;
        const state = await page.evaluate(() => {
          const s = document.querySelector('#skip-intro');
          const r = s.getBoundingClientRect();
          return { rect: [r.x, r.y, r.width, r.height], anim: getComputedStyle(s).animation, transform: getComputedStyle(s).transform, introClass: document.querySelector('#intro')?.className, scrollY: window.scrollY, bodyOverflow: getComputedStyle(document.body).overflow, viewport: [window.innerWidth, window.innerHeight] };
        }).catch(e2 => ({ evalError: e2.message }));
        console.log(`FAIL ${profile.name} iter${i}: ${e.message.split('\n')[0]} state=${JSON.stringify(state)}`);
      }
    } else {
      console.log(`SKIP ${profile.name} iter${i}: intro not visible`);
    }
    await browser.close();
  }
}
console.log(fails === 0 ? 'ALL OK' : `FLAKY: ${fails} failures`);
await new Promise(resolve => server.close(resolve));
