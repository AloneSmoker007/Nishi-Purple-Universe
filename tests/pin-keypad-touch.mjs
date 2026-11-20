/*
 * iPhone/Android PIN keypad regression suite.
 *
 * Reproduces the real-iPhone failure: on iPhone-sized viewports the keypad used
 * to extend below the fold, so users had to scroll the PIN overlay — and iOS
 * Safari turns taps inside a scrollable overlay into scroll gestures, so keypad
 * taps stopped registering entirely ("the keypad does not type anything").
 *
 * Runs on WebKit (Safari's engine) and Chromium, with real touch input.
 * NOTE: this is engine emulation. It is NOT a claim of physical-device testing.
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { webkit, chromium, devices } from 'playwright';

const root = process.cwd();
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json'
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

const profiles = [
  { name: 'WebKit iPhone 13', browser: webkit, device: devices['iPhone 13'], touch: true },
  { name: 'WebKit iPhone SE', browser: webkit, device: devices['iPhone 13'], viewport: { width: 375, height: 667 }, touch: true },
  { name: 'WebKit iPhone 14 Pro Max landscape', browser: webkit, device: devices['iPhone 13'], viewport: { width: 740, height: 390 }, touch: true },
  { name: 'Chromium Android', browser: chromium, device: devices['Pixel 7'], touch: true },
  { name: 'Chromium desktop', browser: chromium, viewport: { width: 1365, height: 900 }, touch: false }
];

let passed = 0;
let browser;
try {
  await new Promise(resolve => server.listen(4176, '127.0.0.1', resolve));
  for (const profile of profiles) {
    browser = await profile.browser.launch({ headless: true });
    const context = await browser.newContext({
      ...profile.device,
      ...(profile.viewport ? { viewport: profile.viewport } : {}),
      hasTouch: profile.touch
    });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));

    const tapKey = async (sel) => {
      const key = page.locator('#pin-lock ' + sel);
      await key.waitFor({ state: 'visible' });
      const box = await key.boundingBox();
      assert.ok(box, profile.name + ': ' + sel + ' has no box');
      if (profile.touch) {
        await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      } else {
        await key.click();
      }
      // pace taps at human speed: machine-gun taps get coalesced by the engine
      await page.waitForTimeout(70);
    };
    const filledDots = () => page.locator('.pin-lock-dot.is-filled').count();

    // --- 1. The keypad must be fully usable without scrolling (the iPhone bug) ---
    await page.goto('http://127.0.0.1:4176/', { waitUntil: 'domcontentloaded' });
    const pinLock = page.locator('#pin-lock');
    await pinLock.waitFor({ state: 'visible' });
    const layout = await page.evaluate(() => {
      const overlay = document.querySelector('#pin-lock');
      const bad = [];
      for (const el of document.querySelectorAll('.pin-key')) {
        const r = el.getBoundingClientRect();
        const label = el.getAttribute('data-pin-digit') || el.getAttribute('data-pin-action');
        if (r.top < -1 || r.bottom > window.innerHeight + 1 || r.left < -1 || r.right > window.innerWidth + 1) {
          bad.push(label + '(' + Math.round(r.top) + '..' + Math.round(r.bottom) + ' vs ' + window.innerHeight + ')');
        }
      }
      return {
        keysOffScreen: bad,
        needsScroll: overlay.scrollHeight > overlay.clientHeight + 2,
        scrollH: overlay.scrollHeight, clientH: overlay.clientHeight
      };
    });
    assert.deepEqual(layout.keysOffScreen, [],
      profile.name + ': keypad keys must stay fully visible without scrolling (scrolling breaks taps on iOS Safari). '
      + 'Off-screen keys: ' + layout.keysOffScreen.join(', ')
      + ' (overlay content ' + layout.scrollH + 'px inside ' + layout.clientH + 'px viewport)');

    // --- 2. Every key must own its tap target (nothing may cover it) ---
    const hitTest = await page.evaluate(() => {
      const bad = [];
      for (const el of document.querySelectorAll('.pin-key')) {
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        const label = el.getAttribute('data-pin-digit') || el.getAttribute('data-pin-action');
        if (hit !== el && !el.contains(hit)) bad.push(label + ' covered by ' + (hit ? hit.tagName + '.' + hit.className : 'null'));
      }
      return bad;
    });
    assert.deepEqual(hitTest, [], profile.name + ': some keypad keys are covered by other elements: ' + hitTest.join('; '));

    // --- 3. One tap = exactly one digit (no touch+click double input) ---
    for (const digit of ['1', '2', '3']) {
      const before = await filledDots();
      await tapKey('[data-pin-digit="' + digit + '"]');
      await page.waitForTimeout(80);
      assert.equal(await filledDots(), before + 1,
        profile.name + ': tapping ' + digit + ' must register exactly one digit');
    }

    // --- 4. Backspace removes one digit, Clear resets ---
    await tapKey('[data-pin-action="backspace"]');
    await page.waitForTimeout(80);
    assert.equal(await filledDots(), 2, profile.name + ': backspace must remove exactly one digit');
    await tapKey('[data-pin-action="clear"]');
    await page.waitForTimeout(80);
    assert.equal(await filledDots(), 0, profile.name + ': clear must empty the PIN');

    // --- 5. Full flow: wrong PIN twice (sad, crying), then the real PIN unlocks ---
    const mascot = page.locator('#pin-mascot');
    for (const digit of '11111111') await tapKey('[data-pin-digit="' + digit + '"]');
    await page.waitForFunction(() => /Oopsie/.test(document.querySelector('#pin-lock-status')?.textContent || ''));
    assert.equal(await mascot.getAttribute('data-mood'), 'sad', profile.name + ': first wrong PIN should make the mascot sad');
    await page.waitForFunction(() => !document.querySelector('#pin-lock .pin-key')?.disabled);
    for (const digit of '11111111') await tapKey('[data-pin-digit="' + digit + '"]');
    await page.waitForFunction(() => /crying/.test(document.querySelector('#pin-lock-status')?.textContent || ''));
    assert.equal(await mascot.getAttribute('data-mood'), 'crying', profile.name + ': repeated wrong PIN should make the mascot cry');
    await page.waitForFunction(() => !document.querySelector('#pin-lock .pin-key')?.disabled);
    for (const digit of '20062008') await tapKey('[data-pin-digit="' + digit + '"]');
    await page.waitForFunction(() => document.querySelector('#pin-mascot')?.getAttribute('data-mood') === 'happy');
    await pinLock.waitFor({ state: 'hidden' });
    assert.equal(await page.locator('#main-content').evaluate(el => el.inert), false,
      profile.name + ': site content must be interactive after unlock');

    // --- 6. Unlock survives a reload (session behaviour preserved) ---
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !document.querySelector('#pin-lock'), null, { timeout: 5000 });
    assert.equal(await page.locator('#main-content').evaluate(el => el.inert), false,
      profile.name + ': unlocked state must persist across reloads');

    assert.deepEqual(pageErrors, [], profile.name + ': uncaught errors: ' + pageErrors.join('; '));
    console.log('PASS ' + profile.name + ': keypad fits the screen, taps register once, clear/backspace, wrong+correct PIN, session persistence');
    passed++;
    await context.close();
    await browser.close();
    browser = null;
  }

  // --- 7. Reduced motion + orientation change (WebKit iPhone) ---
  browser = await webkit.launch({ headless: true });
  {
    const context = await browser.newContext({ ...devices['iPhone 13'], hasTouch: true, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:4176/', { waitUntil: 'domcontentloaded' });
    const pinLock = page.locator('#pin-lock');
    await pinLock.waitFor({ state: 'visible' });
    const tap = async (sel) => {
      const box = await page.locator('#pin-lock ' + sel).boundingBox();
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(70);
    };
    // rotate mid-entry: dots must survive and taps must keep working
    await tap('[data-pin-digit="2"]');
    await page.setViewportSize({ width: 664, height: 390 });
    // allow the rotated layout to settle before tapping again — a real user
    // pauses to re-grip the phone; WebKit drops taps during the relayout
    await page.waitForTimeout(400);
    assert.equal(await page.locator('.pin-lock-dot.is-filled').count(), 1,
      'reduced motion: entered digits must survive orientation change');
    for (const digit of '0062008') await tap('[data-pin-digit="' + digit + '"]');
    await page.waitForFunction(() => document.querySelector('#pin-mascot')?.getAttribute('data-mood') === 'happy');
    await pinLock.waitFor({ state: 'hidden' });
    console.log('PASS WebKit iPhone reduced-motion + orientation change');
    passed++;
    await context.close();
  }
  await browser.close();
  browser = null;
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}
console.log('pin-keypad-touch: ' + passed + ' profile suites PASS (WebKit + Chromium, emulated devices)');
