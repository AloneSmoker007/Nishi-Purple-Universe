import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname); } catch { res.writeHead(400).end(); return; }
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const target = path.resolve(root, relative);
  fs.readFile(target, (error, data) => {
    if (error) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream' });
    res.end(data);
  });
});
await new Promise(resolve => server.listen(4177, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });

const profiles = [
  { name: 'iPhone 375x667', viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true, dpr: 2 },
  { name: 'iPhone 8 Plus 414x736', viewport: { width: 414, height: 736 }, isMobile: true, hasTouch: true, dpr: 3 },
];
for (const profile of profiles) {
  const context = await browser.newContext({ viewport: profile.viewport, isMobile: profile.isMobile, hasTouch: profile.hasTouch, deviceScaleFactor: profile.dpr });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4177/', { waitUntil: 'domcontentloaded' });
  await page.locator('#pin-lock').waitFor({ state: 'visible' });
  for (const digit of '20062008') await page.locator('[data-pin-digit="' + digit + '"]').click();
  await page.locator('#pin-lock').waitFor({ state: 'hidden' });
  await page.waitForTimeout(500);
  const intro = page.locator('#intro');
  const info = await page.evaluate(() => {
    const introEl = document.querySelector('#intro');
    const skip = document.querySelector('#skip-intro');
    const r = skip?.getBoundingClientRect();
    const ir = introEl?.getBoundingClientRect();
    const cs = skip ? getComputedStyle(skip) : null;
    const ics = introEl ? getComputedStyle(introEl) : null;
    // walk ancestors for overflow
    const chain = [];
    let el = skip;
    while (el && el !== document.documentElement) {
      const s = getComputedStyle(el);
      if (s.overflow !== 'visible' || s.position === 'fixed' || s.transform !== 'none') {
        chain.push({ tag: el.tagName + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''), overflow: s.overflow, position: s.position, transform: s.transform !== 'none' ? 'yes' : 'no' });
      }
      el = el.parentElement;
    }
    return {
      introVisible: !!introEl && getComputedStyle(introEl).display !== 'none' && getComputedStyle(introEl).visibility !== 'hidden',
      introRect: ir ? { x: ir.x, y: ir.y, w: ir.width, h: ir.height } : null,
      skipRect: r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null,
      winH: window.innerHeight, winW: window.innerWidth,
      skipDisplay: cs?.display, skipVis: cs?.visibility, skipOpacity: cs?.opacity,
      introOverflow: ics?.overflow, introPos: ics?.position, introTransform: ics?.transform,
      introAnim: ics?.animation, chain,
      bodyOverflow: getComputedStyle(document.body).overflow,
      htmlOverflow: getComputedStyle(document.documentElement).overflow,
    };
  });
  console.log('==', profile.name);
  console.log(JSON.stringify(info, null, 1));
  // try the click with a short timeout to see behavior
  try {
    await page.locator('#skip-intro').click({ timeout: 5000 });
    console.log('click: OK');
  } catch (e) {
    console.log('click: TIMEOUT —', e.message.split('\n')[0]);
  }
  await context.close();
}
await browser.close();
await new Promise(resolve => server.close(resolve));
