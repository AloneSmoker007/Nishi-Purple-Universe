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
    idle: 'https://media1.tenor.com/m/dHMBUC-iGXgAAAAd/bubu-dudu.gif',
    thinking: 'https://media1.tenor.com/m/dHMBUC-iGXgAAAAd/bubu-dudu.gif',
    sad: 'https://media.tenor.com/BOLqQTbf9QgAAAAj/dudu-sad.gif',
    crying: 'https://media.tenor.com/4-S7eXPVyfQAAAAj/bubu-dudu-sseeyall.gif',
    happy: 'https://media1.tenor.com/m/dHMBUC-iGXgAAAAd/bubu-dudu.gif'
  };
  function mood(value) {
    if (!mascot) return;
    mascot.setAttribute('data-mood', value);
    const next = mascotStickers[value] || mascotStickers.idle;
    if (!mascot.src.endsWith(next)) mascot.src = next;
    mascot.alt = value === 'sad' ? 'Dudu the white panda looking sad'
      : value === 'crying' ? 'Dudu the white panda crying'
      : 'Bubu the brown bear cuddling Dudu the white panda';
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
  /* Input wiring.
     iOS Safari is unreliable at synthesising click from touch, so digits are
     handled on pointerup (fired natively by the iOS event pipeline) and the
     follow-up click is deduplicated. Keyboard activation still arrives as a
     click with detail 0 and is never suppressed. One tap = exactly one digit. */
  let lastPointerActivation = 0;
  function keyFromEventTarget(target) {
    const el = target && typeof target.closest === 'function' ? target.closest('.pin-lock-keypad button') : null;
    return el && keys && keys.contains(el) ? el : null;
  }
  function activateFromPointer(event) {
    if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const button = keyFromEventTarget(event.target);
    if (!button) return;
    lastPointerActivation = Date.now();
    handleKey(button);
  }
  function activateFromClick(event) {
    const button = keyFromEventTarget(event.target);
    if (!button) return;
    if (event.detail !== 0 && Date.now() - lastPointerActivation < 500) return; /* ghost click after touch/mouse */
    handleKey(button);
  }
  if (keys) {
    keys.addEventListener('pointerup', activateFromPointer);
    keys.addEventListener('click', activateFromClick);
  }
  overlay.addEventListener('keydown', event => { if (/^[0-9]$/.test(event.key)) { event.preventDefault(); addDigit(event.key); } else if (event.key === 'Backspace') { event.preventDefault(); entered = entered.slice(0, -1); mood(entered.length ? 'thinking' : 'idle'); render(); } else if (event.key === 'Escape') { event.preventDefault(); clear(); } });
  window.addEventListener('resize', render);
  window.addEventListener('orientationchange', () => window.setTimeout(render, 120));
  setStatus('Made with love, just for you 💜🌙', false); render();
  const firstKey = keys && keys.querySelector('[data-pin-digit="1"]'); if (firstKey) firstKey.focus({ preventScroll: true });
})();