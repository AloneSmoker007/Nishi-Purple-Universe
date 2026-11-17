import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8', '.json': 'application/json'
};
const server = http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname); }
  catch { res.writeHead(400).end(); return; }
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const target = path.resolve(root, relative);
  if (!target.startsWith(root + path.sep) && target !== path.join(root, 'index.html')) {
    res.writeHead(403).end(); return;
  }
  fs.readFile(target, (error, data) => {
    if (error) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': mime[path.extname(target)] || 'application/octet-stream' });
    res.end(data);
  });
});

const errors = [];
let browser;
try {
  await new Promise(resolve => server.listen(4173, '127.0.0.1', resolve));
  browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
  const profiles = [
    { name: 'desktop', viewport: { width: 1365, height: 900 }, isMobile: false, hasTouch: false, dpr: 1 },
    { name: 'iPhone-sized Safari emulation', viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true, dpr: 2 },
    { name: 'Android-sized Chrome emulation', viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, dpr: 2.625 },
    { name: 'tablet', viewport: { width: 768, height: 1024 }, isMobile: true, hasTouch: true, dpr: 2 }
  ];

  for (const profile of profiles) {
    const context = await browser.newContext({
      viewport: profile.viewport, isMobile: profile.isMobile,
      hasTouch: profile.hasTouch, deviceScaleFactor: profile.dpr
    });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    const localFailures = [];
    page.on('requestfailed', request => {
      if (request.url().startsWith('http://127.0.0.1:4173/')) localFailures.push(request.url());
    });

    const response = await page.goto('http://127.0.0.1:4173/', { waitUntil: 'domcontentloaded' });
    assert.equal(response.status(), 200, profile.name + ': homepage should return HTTP 200');
    await page.locator('#music-room').waitFor({ state: 'attached' });
    await page.locator('#story').waitFor({ state: 'attached' });
    await page.locator('#quest-mount').waitFor({ state: 'attached' });

    // The first-visit cinematic intro intentionally blocks background controls.
    // Dismiss it through its real user-facing action before testing the page UI.
    const intro = page.locator('#intro');
    if (await intro.isVisible()) {
      const skip = page.locator('#skip-intro');
      await skip.waitFor({ state: 'visible' });
      await skip.click();
      await intro.waitFor({ state: 'hidden' });
    }
    await page.waitForTimeout(1200);

    const layout = await page.evaluate(() => ({
      width: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      title: document.title,
      lang: document.documentElement.lang,
      canvas: !!document.querySelector('#scene-canvas'),
      mainSections: ['music-room', 'story', 'quest-mount'].every(id => !!document.getElementById(id))
    }));
    assert.ok(layout.title.includes('Nishi'), profile.name + ': title missing');
    assert.ok(layout.mainSections, profile.name + ': core sections missing');
    assert.ok(layout.scrollWidth <= layout.width + 2,
      profile.name + ': horizontal overflow (' + layout.scrollWidth + ' > ' + layout.width + ')');

    const menu = page.locator('#nav-toggle');
    if (await menu.isVisible()) {
      await menu.click();
      assert.equal(await menu.getAttribute('aria-expanded'), 'true', profile.name + ': mobile menu did not open');
      await menu.click();
      assert.equal(await menu.getAttribute('aria-expanded'), 'false', profile.name + ': mobile menu did not close');
    }

    const initialLang = await page.locator('html').getAttribute('lang');
    await page.locator('#lang-toggle').click();
    const translatedLang = await page.locator('html').getAttribute('lang');
    assert.ok(['en', 'bn'].includes(translatedLang), profile.name + ': invalid language state');
    assert.notEqual(translatedLang, initialLang, profile.name + ': language toggle did not switch language');
    assert.equal(pageErrors.length, 0, profile.name + ': uncaught browser errors: ' + pageErrors.join('; '));
    assert.equal(localFailures.length, 0, profile.name + ': failed local assets: ' + localFailures.join(', '));

    console.log('PASS ' + profile.name + ': layout, core content, nav, language, no runtime errors');
    await context.close();
  }
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
