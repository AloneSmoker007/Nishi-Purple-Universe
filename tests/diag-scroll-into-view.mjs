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
await new Promise(resolve => server.listen(4180, '127.0.0.1', resolve));

const variants = [
  { name: 'A mobile768 touch dpr2', opts: { viewport: { width: 768, height: 1024 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
  { name: 'B mobile768 no-touch dpr2', opts: { viewport: { width: 768, height: 1024 }, isMobile: true, hasTouch: false, deviceScaleFactor: 2 } },
  { name: 'C mobile768 touch dpr1', opts: { viewport: { width: 768, height: 1024 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 } },
  { name: 'D desktop768', opts: { viewport: { width: 768, height: 1024 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 } },
];
for (const v of variants) {
  const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
  const context = await browser.newContext(v.opts);
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4180/', { waitUntil: 'domcontentloaded' });
  await page.locator('#pin-lock').waitFor({ state: 'visible' });
  for (const digit of '20062008') await page.locator('[data-pin-digit="' + digit + '"]').click();
  await page.locator('#pin-lock').waitFor({ state: 'hidden' });
  const skip = page.locator('#skip-intro');
  const info = await page.evaluate(() => ({
    vv: window.visualViewport ? { scale: window.visualViewport.scale, w: window.visualViewport.width, h: window.visualViewport.height, offsetTop: window.visualViewport.offsetTop, offsetLeft: window.visualViewport.offsetLeft } : null,
    inner: [window.innerWidth, window.innerHeight],
    scrollY: window.scrollY, docH: document.documentElement.scrollHeight, bodyH: document.body.scrollHeight,
    scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
  }));
  let result;
  try {
    await skip.scrollIntoViewIfNeeded({ timeout: 3000 });
    result = 'scrollOK';
  } catch (e) { result = 'scrollTIMEOUT'; }
  let clickResult;
  try {
    await skip.click({ timeout: 4000 });
    clickResult = 'clickOK';
  } catch (e) { clickResult = 'clickTIMEOUT'; }
  let mouseResult;
  if (clickResult !== 'clickOK') {
    const box = await skip.boundingBox();
    if (box) {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2).then(() => mouseResult = 'mouseOK', () => mouseResult = 'mouseFAIL');
      const hidden = await page.evaluate(() => document.querySelector('#intro')?.classList.contains('is-hidden'));
      mouseResult += ' introHidden=' + hidden;
    }
  }
  console.log(v.name, '|', result, '|', clickResult, '|', mouseResult || '-', '|', JSON.stringify(info));
  await browser.close();
}
await new Promise(resolve => server.close(resolve));
