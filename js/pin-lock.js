/**
 * Birthday PIN gate for Nishi's Purple Universe.
 * This is a friendly access screen, not server-side authentication.
 * The PIN is verified locally; only the unlocked state is kept for this tab session.
 */
const overlay = document.getElementById('pin-lock');
const SESSION_KEY = 'nishi-purple-universe-unlocked-v1';
const PIN_SHA256 = '05fd5a1ee836f75c0b6d259897dee23934c94c0475d0024bc1da5cafd06465b4';

function setInert(locked) {
  for (const child of document.body.children) {
    if (child === overlay) continue;
    if (locked) {
      child.dataset.pinWasInert = child.inert ? 'true' : 'false';
      child.inert = true;
    } else {
      child.inert = child.dataset.pinWasInert === 'true';
      delete child.dataset.pinWasInert;
    }
  }
}

function announceUnlocked() {
  document.body.classList.remove('pin-locked');
  document.body.classList.add('nishi-pin-unlocked');
  setInert(false);
  document.dispatchEvent(new CustomEvent('nishi:pin-unlocked'));
}

if (overlay) {
  let alreadyUnlocked = false;
  try { alreadyUnlocked = sessionStorage.getItem(SESSION_KEY) === '1'; } catch { /* fail closed */ }

  if (alreadyUnlocked) {
    overlay.remove();
    announceUnlocked();
  } else {
    document.body.classList.add('pin-locked');
    setInert(true);
    const dots = [...overlay.querySelectorAll('.pin-lock-dot')];
    const dotsLabel = overlay.querySelector('#pin-lock-dots');
    const status = overlay.querySelector('#pin-lock-status');
    const keys = overlay.querySelector('.pin-lock-keypad');
    const mascot = overlay.querySelector('#pin-mascot');
    let entered = '';
    let checking = false;
    let failedAttempts = 0;

    const setMood = mood => mascot?.setAttribute('data-mood', mood);

    const render = () => {
      dots.forEach((dot, index) => dot.classList.toggle('is-filled', index < entered.length));
      dotsLabel?.setAttribute('aria-label', `Eight digit PIN, ${entered.length} digits entered`);
    };

    const clear = (resetMood = true) => {
      entered = '';
      if (resetMood) setMood('idle');
      render();
    };

    const verify = async () => {
      if (checking || entered.length !== 8) return;
      checking = true;
      keys?.querySelectorAll('button').forEach(button => { button.disabled = true; });
      try {
        if (!globalThis.crypto?.subtle) throw new Error('Secure PIN check unavailable');
        const bytes = new TextEncoder().encode(entered);
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        const actual = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
        if (actual !== PIN_SHA256) {
          failedAttempts += 1;
          setMood(failedAttempts > 1 ? 'crying' : 'sad');
          status.textContent = failedAttempts > 1
            ? 'Oh nooo! Bubu & Dudu are crying 🥺 Try once more, Nishi!'
            : 'Oopsie! Bubu is a little sad. Try again 💜';
          status.classList.add('is-error');
          clear(false);
          return;
        }
        try { sessionStorage.setItem(SESSION_KEY, '1'); } catch { /* unlock current page even if storage is blocked */ }
        setMood('happy');
        status.textContent = 'YAY! Bubu & Dudu are celebrating with you! 💜✨';
        overlay.classList.add('is-unlocking');
        window.setTimeout(() => {
          overlay.remove();
          announceUnlocked();
        }, 700);
      } catch {
        status.textContent = 'Please open this page in a modern secure browser.';
        status.classList.add('is-error');
        clear();
      } finally {
        checking = false;
        if (overlay.isConnected) keys?.querySelectorAll('button').forEach(button => { button.disabled = false; });
      }
    };

    const addDigit = digit => {
      if (checking || entered.length >= 8 || !/^[0-9]$/.test(digit)) return;
      entered += digit;
      setMood('thinking');
      status.classList.remove('is-error');
      status.textContent = 'Made with love, just for you 💜';
      render();
      if (entered.length === 8) verify();
    };

    keys?.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button || checking) return;
      if (button.dataset.pinDigit !== undefined) addDigit(button.dataset.pinDigit);
      if (button.dataset.pinAction === 'clear') clear();
      if (button.dataset.pinAction === 'backspace') {
        entered = entered.slice(0, -1);
        setMood(entered.length ? 'thinking' : 'idle');
        render();
      }
    });

    overlay.addEventListener('keydown', event => {
      if (/^[0-9]$/.test(event.key)) {
        event.preventDefault();
        addDigit(event.key);
      } else if (event.key === 'Backspace') {
        event.preventDefault();
        entered = entered.slice(0, -1);
        setMood(entered.length ? 'thinking' : 'idle');
        render();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        clear();
      }
    });

    keys?.querySelector('[data-pin-digit="1"]')?.focus({ preventScroll: true });
  }
}
