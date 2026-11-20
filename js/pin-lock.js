/* Reliable birthday PIN controller. Classic deferred script; friendly gate, not authentication. */
(function () {
  'use strict';
  const overlay = document.getElementById('pin-lock');
  if (!overlay) return;
  const SESSION_KEY = 'nishi-purple-universe-unlocked-v1';
  const PIN_SHA256 = '05fd5a1ee836f75c0b6d259897dee23934c94c0475d0024bc1da5cafd06465b4';
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
      if (!window.crypto || !window.crypto.subtle) throw new Error('Secure PIN check unavailable');
      // Never leave the keypad dead: if the digest stalls, fail visibly and re-enable.
      const digest = await Promise.race([
        window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(entered)),
        new Promise((resolve, reject) => window.setTimeout(() => reject(new Error('PIN check timed out')), 5000))
      ]);
      const actual = Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
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