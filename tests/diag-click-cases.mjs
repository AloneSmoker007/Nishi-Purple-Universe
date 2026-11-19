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
await new Promise(resolve => server.listen(4181, '127.0.0.1', resolve));

const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const context = await browser.newContext({ viewport: { width: 768, height: 1024 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
const page = await context.newPage();
await page.goto('http://127.0.0.1:4181/', { waitUntil: 'domcontentloaded' });
await page.locator('#pin-lock').waitFor({ state: 'visible' });
for (const digit of '20062008') await page.locator('[data-pin-digit="' + digit + '"]').click();
await page.locator('#pin-lock').waitFor({ state: 'hidden' });

// case 1: baseline
const skip = page.locator('#skip-intro');
try { await skip.click({ timeout: 6000 }); console.log('CASE1 baseline click: OK'); }
catch { console.log('CASE1 baseline click: TIMEOUT'); }

// fresh page for case 2: kill smooth scrolling
const page2 = await context.newPage();
await page2.goto('http://127.0.0.1:4181/', { waitUntil: 'domcontentloaded' });
await page2.locator('#pin-lock').waitFor({ state: 'visible' });
for (const digit of '20062008') await page2.locator('[data-pin-digit="' + digit + '"]').click();
await page2.locator('#pin-lock').waitFor({ state: 'hidden' });
await page2.addStyleTag({ content: 'html{scroll-behavior:auto !important}' });
try { await page2.locator('#skip-intro').click({ timeout: 6000 }); console.log('CASE2 no-smooth-scroll click: OK'); }
catch { console.log('CASE2 no-smooth-scroll click: TIMEOUT'); }

// case 3: baseline page again but with forced reduced motion in context
const context2 = await browser.newContext({ viewport: { width: 768, height: 1024 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, reducedMotion: 'reduce' });
const page3 = await context2.newPage();
await page3.goto('http://127.0.0.1:4181/', { waitUntil: 'domcontentloaded' });
await page3.locator('#pin-lock').waitFor({ state: 'visible' });
for (const digit of '20062008') await page3.locator('[data-pin-digit="' + digit + '"]').click();
await page3.locator('#pin-lock').waitFor({ state: 'hidden' });
try { await page3.locator('#skip-intro').click({ timeout: 6000 }); console.log('CASE3 reduced-motion click: OK'); }
catch { console.log('CASE3 reduced-motion click: TIMEOUT'); }

await browser.close();
await new Promise(resolve => server.close(resolve));
