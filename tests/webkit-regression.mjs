/**
 * WebKit regression suite for Nishi's Purple Universe.
 * Verifies the flows that Chromium emulation cannot prove:
 * PIN keypad reachability on iPhone-sized viewports (incl. the reported
 * "buttons 7 and 8 below the fold" WebKit bug), PIN behaviour, intro
 * navigation, Secret World features, layout, console health.
 *
 * Run: node tests/webkit-regression.mjs   (via pw-env.sh wrapper in CI)
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { webkit } from 'playwright';

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
  { name: 'iPhone SE 375x667', viewport: { width: 375, height: 667 }, dpr: 2 },
  { name: 'iPhone 8 Plus 414x736', viewport: { width: 414, height: 736 }, dpr: 3 },
  { name: 'Vivo Y11-ish 720x1520', viewport: { width: 720, height: 1520 }, dpr: 2 },
];

let browser;
const failures = [];
function record(name, fn) {
  return Promise.resolve().then(fn).then(
    () => console.log('PASS ' + name),
    (error) => { failures.push(name + ': ' + error.message); console.log('FAIL ' + name + ' — ' + error.message.split('\n')[0]); }
  );
}

try {
  await new Promise(resolve => server.listen(4183, '127.0.0.1', resolve));
  browser = await webkit.launch({ headless: true });

  for (const profile of profiles) {
    const context = await browser.newContext({
      viewport: profile.viewport, isMobile: true, hasTouch: true, deviceScaleFactor: profile.dpr
    });
    const page = await context.newPage();
    const pageErrors = [];
    const consoleErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });

    await page.goto('http://127.0.0.1:4183/', { waitUntil: 'domcontentloaded' });
    const pinLock = page.locator('#pin-lock');
    await pinLock.waitFor({ state: 'visible' });

    // ---- PIN keypad reachability (reported WebKit bug: keys 7/8 below the fold)
    await record(profile.name + ': PIN keypad all 12 keys reachable and tappable', async () => {
      const lock = page.locator('#pin-lock');
      // the overlay itself is the scroll container
      const scrollInfo = await page.evaluate(() => {
        const overlay = document.querySelector('#pin-lock');
        return { scrollH: overlay.scrollHeight, clientH: overlay.clientHeight, scrollable: overlay.scrollHeight > overlay.clientHeight };
      });
      // Each key is verified independently: tap -> exactly one dot fills -> clear.
      // (The PIN entry is capped at 8 digits, so keys must not be chained.)
      for (const digit of '0123456789') {
        const key = lock.locator('[data-pin-digit="' + digit + '"]');
        await key.scrollIntoViewIfNeeded();
        const box = await key.boundingBox();
        assert.ok(box && box.width > 0 && box.height > 0, 'key ' + digit + ' has no box');
        assert.ok(box.y >= -1 && box.y + box.height <= profile.viewport.height + 1,
          'key ' + digit + ' cannot be scrolled fully into view (y=' + box.y + ' h=' + box.height + ' vh=' + profile.viewport.height + ')');
        await key.tap();
        const filled = await page.locator('.pin-lock-dot.is-filled').count();
        assert.equal(filled, 1, 'key ' + digit + ' tap did not register');
        await lock.locator('[data-pin-action="clear"]').tap();
        assert.equal(await page.locator('.pin-lock-dot.is-filled').count(), 0, 'clear button did not reset');
      }
      void scrollInfo;
    });

    // ---- backspace + keyboard input
    await record(profile.name + ': backspace and physical keyboard input', async () => {
      const lock = page.locator('#pin-lock');
      for (const digit of '12') await lock.locator('[data-pin-digit="' + digit + '"]').tap();
      await lock.locator('[data-pin-digit="3"]').tap();
      await lock.locator('[data-pin-action="backspace"]').tap();
      assert.equal(await page.locator('.pin-lock-dot.is-filled').count(), 2, 'backspace did not remove a digit');
      await page.keyboard.press('4');
      assert.equal(await page.locator('.pin-lock-dot.is-filled').count(), 3, 'keyboard digit did not register');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('.pin-lock-dot.is-filled').count(), 0, 'Escape did not clear');
    });

    // ---- wrong PIN flow with mascot moods
    await record(profile.name + ': wrong PIN retry and mascot moods', async () => {
      const lock = page.locator('#pin-lock');
      for (const digit of '11111111') await lock.locator('[data-pin-digit="' + digit + '"]').tap();
      await page.waitForFunction(() => /Oopsie/.test(document.querySelector('#pin-lock-status')?.textContent || ''));
      assert.equal(await page.locator('#pin-mascot').getAttribute('data-mood'), 'sad', 'mascot not sad after first wrong PIN');
      await page.waitForFunction(() => !document.querySelector('#pin-lock .pin-key')?.disabled);
      for (const digit of '11111111') await lock.locator('[data-pin-digit="' + digit + '"]').tap();
      await page.waitForFunction(() => /crying/.test(document.querySelector('#pin-lock-status')?.textContent || ''));
      assert.equal(await page.locator('#pin-mascot').getAttribute('data-mood'), 'crying', 'mascot not crying after repeat wrong PIN');
      await page.waitForFunction(() => !document.querySelector('#pin-lock .pin-key')?.disabled);
    });

    // ---- correct PIN + unlock
    await record(profile.name + ': correct PIN unlocks and gates site', async () => {
      assert.equal(await page.locator('#main-content').evaluate(el => el.inert), true, 'content not inert while locked');
      const lock = page.locator('#pin-lock');
      for (const digit of '20062008') await lock.locator('[data-pin-digit="' + digit + '"]').tap();
      await page.waitForFunction(() => document.querySelector('#pin-mascot')?.getAttribute('data-mood') === 'happy');
      await lock.waitFor({ state: 'hidden' });
      assert.equal(await page.locator('#main-content').evaluate(el => el.inert), false, 'content still inert after unlock');
    });

    // ---- intro: Skip must dismiss
    await record(profile.name + ': intro Skip navigation works', async () => {
      const intro = page.locator('#intro');
      if (await intro.isVisible()) {
        await page.locator('#skip-intro').tap();
        await intro.waitFor({ state: 'hidden' });
      }
      assert.equal(await page.evaluate(() => localStorage.getItem('nishi-intro-seen')), '1', 'intro-seen not persisted');
    });

    // ---- session persistence: reload keeps unlocked
    await record(profile.name + ': PIN unlock persists for the tab session', async () => {
      await page.reload({ waitUntil: 'domcontentloaded' });
      const lock = page.locator('#pin-lock');
      await page.waitForTimeout(1200);
      assert.equal(await lock.count(), 0, 'PIN lock reappeared after reload in same tab');
      assert.ok(await page.evaluate(() => document.body.classList.contains('nishi-pin-unlocked')), 'unlock class missing after reload');
    });

    // ---- Secret World core features
    await record(profile.name + ': Secret World stars, letters, hug, magic, gacha', async () => {
      const secretWorld = page.locator('#nishi-secret-world');
      await secretWorld.waitFor({ state: 'visible', timeout: 15000 });
      assert.equal(await secretWorld.locator('.nishi-star-card').count(), 7, 'not 7 OT7 stars');
      await secretWorld.locator('[data-star-id="rm"]').tap();
      assert.match(await secretWorld.locator('#nishi-star-count').textContent(), /1 of 7/);
      await secretWorld.locator('[data-letter-id="sad"]').tap();
      assert.equal(await secretWorld.locator('#nishi-letter-reveal').isVisible(), true, 'letter did not reveal');
      await secretWorld.locator('.nishi-hug-button').tap();
      assert.ok((await secretWorld.locator('.nishi-hug-status').textContent()).includes('Hug delivered'), 'hug gave no feedback');
      await secretWorld.locator('#nishi-magic-wish').fill('A little wish');
      await secretWorld.locator('.nishi-magic-open').tap();
      assert.ok((await secretWorld.locator('.nishi-magic-status').textContent()).includes('you deserve patience'), 'magic shop reveal missing');
      await secretWorld.locator('.nishi-photocard-pull').tap();
      const card = secretWorld.locator('.nishi-photocard');
      await card.waitFor({ state: 'visible' });
      const member = (await card.locator('.nishi-photocard-member').textContent()).trim();
      assert.ok(['RM', 'Jin', 'SUGA', 'j-hope', 'Jimin', 'V', 'Jung Kook'].includes(member), 'unexpected member: ' + member);
    });

    // ---- layout health
    await record(profile.name + ': no horizontal overflow, core sections present', async () => {
      const layout = await page.evaluate(() => ({
        width: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        sections: ['music-room', 'story', 'quest-mount', 'home'].every(id => !!document.getElementById(id)),
      }));
      assert.ok(layout.sections, 'core sections missing');
      assert.ok(layout.scrollWidth <= layout.width + 2,
        'horizontal overflow ' + layout.scrollWidth + ' > ' + layout.width);
    });

    // ---- console health
    await record(profile.name + ': no uncaught errors or console errors', async () => {
      assert.deepEqual(pageErrors, [], 'page errors: ' + pageErrors.join('; '));
      // Known container-only noise: headless WPE has no TLS backend, so the
      // external Tenor stickers cannot load here. Real devices are unaffected.
      // Everything else must be clean — nothing is hidden by this filter.
      const KNOWN_ENV = /TLS support is not available/;
      const envNoise = consoleErrors.filter(m => KNOWN_ENV.test(m));
      const realErrors = consoleErrors.filter(m => !KNOWN_ENV.test(m));
      if (envNoise.length) console.log('  (env noise, not counted: ' + envNoise.length + 'x external-https TLS-unavailable)');
      assert.deepEqual(realErrors, [], 'console errors: ' + realErrors.join('; '));
    });

    await context.close();
  }
} finally {
  if (browser) await browser.close();
  await new Promise(resolve => server.close(resolve));
}

if (failures.length) {
  console.log('\n' + failures.length + ' FAILURE(S):');
  for (const f of failures) console.log(' - ' + f);
  process.exit(1);
}
console.log('\nAll WebKit regression checks passed.');
