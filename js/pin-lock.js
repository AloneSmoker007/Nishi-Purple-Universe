/* Reliable birthday PIN controller. Classic deferred script; friendly gate, not authentication. */
(function () {
  'use strict';
  const overlay = document.getElementById('pin-lock');
  if (!overlay) return;
  const SESSION_KEY = 'nishi-purple-universe-unlocked-v1';
  const PIN_SHA256 = '05fd5a1ee836f75c0b6d259897dee23934c94c0475d0024bc1da5cafd06465b4';
  /* Pure-JS SHA-256. crypto.subtle only exists on secure origins (https or
     localhost), so a plain-http host would otherwise leave the keypad dead. */
  var K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  function sha256Hex(text) {
    var bytes = new TextEncoder().encode(text);
    var bitLen = bytes.length * 8;
    var withPad = new Uint8Array((((bytes.length + 8) >> 6) + 1) * 64);
    withPad.set(bytes);
    withPad[bytes.length] = 0x80;
    var dv = new DataView(withPad.buffer);
    dv.setUint32(withPad.length - 8, Math.floor(bitLen / 4294967296));
    dv.setUint32(withPad.length - 4, bitLen >>> 0);
    var H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    var W = new Array(64);
    for (var off = 0; off < withPad.length; off += 64) {
      for (var i = 0; i < 16; i++) W[i] = dv.getUint32(off + i * 4);
      for (i = 16; i < 64; i++) {
        var w15 = W[i - 15], w2 = W[i - 2];
        var s0 = ((w15 >>> 7) | (w15 << 25)) ^ ((w15 >>> 18) | (w15 << 14)) ^ (w15 >>> 3);
        var s1 = ((w2 >>> 17) | (w2 << 15)) ^ ((w2 >>> 19) | (w2 << 13)) ^ (w2 >>> 10);
        W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
      }
      var a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (i = 0; i < 64; i++) {
        var S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        var ch = (e & f) ^ (~e & g);
        var t1 = (h + S1 + ch + K[i] + W[i]) | 0;
        var S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + maj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0;
        d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
      H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    return H.map(function (x) { return (x >>> 0).toString(16).padStart(8, '0'); }).join('');
  }
  const dots = Array.from(overlay.querySelectorAll('.pin-lock-dot'));
  const dotsLabel = overlay.querySelector('#pin-lock-dots');
  const status = overlay.querySelector('#pin-lock-status');
  const keys = overlay.querySelector('.pin-lock-keypad');
  const mascot = overlay.querySelector('#pin-mascot');
  let entered = '', checking = false, failedAttempts = 0;
  const mascotStickers = {
    /* vendored locally — the page must not depend on a CDN at runtime */
    idle: 'assets/stickers/bubu-dudu-hug.gif',
    thinking: 'assets/stickers/bubu-dudu-hug.gif',
    sad: 'assets/stickers/dudu-sad.gif',
    crying: 'assets/stickers/bubu-dudu-cry.gif',
    happy: 'assets/stickers/bubu-dudu-hug.gif'
  };
  const moodBadge = overlay.querySelector('#pin-mood-badge');
  const moodEmoji = { idle: '', thinking: '💭', sad: '🥺', crying: '💧', happy: '🎉' };
  function mood(value) {
    if (mascot) {
      mascot.setAttribute('data-mood', value);
      const next = mascotStickers[value] || mascotStickers.idle;
      if (!mascot.src.endsWith(next)) mascot.src = next;
      mascot.alt = value === 'sad' ? 'Dudu the white panda looking sad'
        : value === 'crying' ? 'Dudu the white panda crying'
        : 'Bubu the brown bear cuddling Dudu the white panda';
    }
    if (moodBadge) {
      moodBadge.textContent = moodEmoji[value] || '';
      moodBadge.classList.toggle('is-on', !!moodEmoji[value]);
    }
  }
  function render() { dots.forEach((dot, i) => dot.classList.toggle('is-filled', i < entered.length)); if (dotsLabel) dotsLabel.setAttribute('aria-label', 'Eight digit PIN, ' + entered.length + ' digits entered'); }
  function setStatus(message, error) { if (!status) return; status.textContent = message; status.classList.toggle('is-error', !!error); }
  function clear(resetMood) { entered = ''; if (resetMood !== false) mood('idle'); render(); }
  function setInert(locked) { Array.from(document.body.children).forEach(child => { if (child === overlay) return; if (locked) { child.dataset.pinWasInert = child.inert ? 'true' : 'false'; child.inert = true; } else { child.inert = child.dataset.pinWasInert === 'true'; delete child.dataset.pinWasInert; } }); }
  function announceUnlocked() { document.body.classList.remove('pin-locked'); document.body.classList.add('nishi-pin-unlocked'); setInert(false); document.dispatchEvent(new CustomEvent('nishi:pin-unlocked')); }
  function addDigit(digit) { if (checking || entered.length >= 8 || !/^[0-9]$/.test(String(digit))) return; entered += String(digit); mood('thinking'); setStatus('A little magic, one number at a time ✨💜', false); render(); if (entered.length === 8) verify(); }
  function handleKey(button) { if (!button || checking) return; if (button.hasAttribute('data-pin-digit')) addDigit(button.getAttribute('data-pin-digit')); else if (button.getAttribute('data-pin-action') === 'clear') { clear(); setStatus('PIN cleared. Take your time 🌷', false); } else if (button.getAttribute('data-pin-action') === 'backspace') { entered = entered.slice(0, -1); mood(entered.length ? 'thinking' : 'idle'); render(); } }
  async function verify() {
    if (checking || entered.length !== 8) return; checking = true;
    if (keys) keys.querySelectorAll('button').forEach(button => { button.disabled = true; });
    try {
      // Never leave the keypad dead: if the digest stalls, fall back to the JS
      // implementation instead of failing. crypto.subtle is only present on
      // secure origins, so plain-http previews and LAN hosts need this path.
      let actual;
      if (window.crypto && window.crypto.subtle && typeof window.crypto.subtle.digest === 'function') {
        try {
          const digest = await Promise.race([
            window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(entered)),
            new Promise((resolve, reject) => window.setTimeout(() => reject(new Error('PIN check timed out')), 5000))
          ]);
          actual = Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
        } catch (digestError) {
          actual = sha256Hex(entered);
        }
      } else {
        actual = sha256Hex(entered);
      }
      if (actual !== PIN_SHA256) { failedAttempts++; mood(failedAttempts > 1 ? 'crying' : 'sad'); setStatus(failedAttempts > 1 ? 'Oh nooo! Bubu & Dudu are crying 🥺💧 Try again!' : 'Oopsie! Bubu is a little sad 🥺💜 Try again!', true); clear(false); return; }
      try { sessionStorage.setItem(SESSION_KEY, '1'); } catch (error) {}
      mood('happy'); setStatus('YAY! Bubu & Dudu are celebrating! 🎉💜✨', false); overlay.classList.add('is-unlocking');
      window.setTimeout(() => { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); announceUnlocked(); }, 650);
    } catch (error) { setStatus('PIN check needs a secure, up-to-date browser 🔒', true); clear(); }
    finally { checking = false; if (overlay.isConnected && keys) keys.querySelectorAll('button').forEach(button => { button.disabled = false; }); }
  }
  try { if (sessionStorage.getItem(SESSION_KEY) === '1') { overlay.parentNode.removeChild(overlay); announceUnlocked(); return; } } catch (error) {}
  document.body.classList.add('pin-locked'); setInert(true);
  /* Input wiring — one tap must always register exactly one digit.
     iOS Safari is unreliable at synthesising click from touch and can drop a
     tap when the hit target moves mid-gesture, so:
     - touchend is the primary tap path (target-matched, movement-guarded;
       preventDefault kills ghost clicks and double-tap zoom)
     - pointerup covers mouse and pen
     - click is the keyboard-activation fallback (and ancient browsers)
     - physical keyboards work from anywhere via a document-level handler. */
  let lastGestureHandledAt = 0;
  let touchStart = null;
  function keyFromEventTarget(target) {
    const el = target && typeof target.closest === 'function' ? target.closest('.pin-lock-keypad button') : null;
    return el && keys && keys.contains(el) ? el : null;
  }
  function activate(button) {
    lastGestureHandledAt = Date.now();
    handleKey(button);
  }
  if (keys) {
    keys.addEventListener('touchstart', (event) => {
      const t = event.changedTouches[0];
      const button = keyFromEventTarget(event.target);
      touchStart = t && button ? { x: t.clientX, y: t.clientY, button } : null;
    }, { passive: true });
    keys.addEventListener('touchend', (event) => {
      const start = touchStart; touchStart = null;
      if (!start) return;
      const t = event.changedTouches[0];
      const moved = t ? Math.hypot(t.clientX - start.x, t.clientY - start.y) : 99;
      const button = keyFromEventTarget(event.target);
      if (!button || button !== start.button || moved > 12) return; /* scroll/flick, not a tap */
      event.preventDefault(); /* no ghost click, no double-tap zoom */
      activate(button);
    }, { passive: false });
    keys.addEventListener('pointerup', (event) => {
      if (event.pointerType === 'touch') return; /* handled on touchend */
      if (!event.isPrimary || event.button !== 0) return;
      const button = keyFromEventTarget(event.target);
      if (button) activate(button);
    });
    keys.addEventListener('click', (event) => {
      const button = keyFromEventTarget(event.target);
      if (!button) return;
      if (Date.now() - lastGestureHandledAt < 700) return; /* this tap was already handled */
      activate(button);
    });
  }
  document.addEventListener('keydown', event => {
    if (event.repeat || !overlay.isConnected) return;
    if (/^[0-9]$/.test(event.key)) { event.preventDefault(); addDigit(event.key); }
    else if (event.key === 'Backspace') { event.preventDefault(); entered = entered.slice(0, -1); mood(entered.length ? 'thinking' : 'idle'); render(); }
    else if (event.key === 'Escape') { event.preventDefault(); clear(); }
  });
  window.addEventListener('resize', render);
  window.addEventListener('orientationchange', () => window.setTimeout(render, 120));
  setStatus('Made with love, just for you 💜🌙', false); render();
  const firstKey = keys && keys.querySelector('[data-pin-digit="1"]'); if (firstKey) firstKey.focus({ preventScroll: true });
})();