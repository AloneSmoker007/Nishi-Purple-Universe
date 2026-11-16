/* ---------------------------------------------------------------
   Purple Wishing Stars — Phase 6
   Catch shooting stars, make wishes, build a constellation.
   All data is local-only (localStorage). No network requests.
   Answers never leave the device.
--------------------------------------------------------------- */

const WISH_KEY = 'nishi-wishes-v1';
const WISH_VERSION = 1;

/* ---- state ---- */
let _root = null;
let _canvas = null;
let _ctx = null;
let _animId = 0;
let _stars = [];          // active shooting stars on canvas
let _wishes = [];         // persisted wishes [{id, text, ts}]
let _reducedMotion = false;
let _lang = 'en';

/* ---- i18n ---- */
const STR = {
  en: {
    placeholder: 'Write your wish here… ✨',
    send: 'Send to the stars ⭐',
    count: (n) => `✦ ${n} wish${n === 1 ? '' : 'es'} among the stars`,
    clear: 'Clear all wishes',
    confirmClear: 'Delete all your wishes? This cannot be undone.',
    empty: 'Your constellation is waiting for its first star…',
    toastAdded: 'Your wish is now a star ⭐',
    toastCleared: 'All wishes cleared',
    toastTooShort: 'Write at least 2 characters',
    label: 'Your wishes among the stars',
    wishLabel: 'Wish',
  },
  bn: {
    placeholder: 'এখানে তোমার কামনা লেখো… ✨',
    send: 'তারায় পাঠাও ⭐',
    count: (n) => `✦ ${n}টি কামনা তারার মাঝে`,
    clear: 'সব কামনা মুছে ফেলো',
    confirmClear: 'তোমার সব কামনা মুছে ফেলবে? এটি ফিরিয়ে আনা যাবে না।',
    empty: 'তোমার নক্ষত্রমণ্ডল প্রথম তারার জন্য অপেক্ষা করছে…',
    toastAdded: 'তোমার কামনা এখন একটি তারা ⭐',
    toastCleared: 'সব কামনা মুছে ফেলা হয়েছে',
    toastTooShort: 'কমপক্ষে ২টি অক্ষর লেখো',
    label: 'তারার মাঝে তোমার কামনাগুলো',
    wishLabel: 'কামনা',
  },
};

function t(key) {
  return STR[_lang]?.[key] ?? STR.en[key] ?? key;
}

/* ---- persistence ---- */
function loadWishes() {
  try {
    const raw = localStorage.getItem(WISH_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (!data || data.version !== WISH_VERSION || !Array.isArray(data.wishes)) return [];
    return data.wishes.filter((w) => w && typeof w.text === 'string' && w.text.length > 0).slice(-60);
  } catch { return []; }
}

function saveWishes() {
  try {
    localStorage.setItem(WISH_KEY, JSON.stringify({ version: WISH_VERSION, wishes: _wishes }));
  } catch { /* quota — silently ignore */ }
}

/* ---- shooting-star canvas ---- */
function spawnShootingStar() {
  const w = _canvas?.width || 800;
  const h = _canvas?.height || 400;
  _stars.push({
    x: Math.random() * w * 0.8,
    y: Math.random() * h * 0.45,
    vx: 1.2 + Math.random() * 2.2,
    vy: 0.6 + Math.random() * 1.4,
    life: 1,
    decay: 0.004 + Math.random() * 0.008,
    size: 1.5 + Math.random() * 2.5,
    hue: 260 + Math.random() * 40, // purple-gold range
  });
}

function drawStars() {
  if (!_ctx || !_canvas) return;
  const w = _canvas.width;
  const h = _canvas.height;
  _ctx.clearRect(0, 0, w, h);

  for (let i = _stars.length - 1; i >= 0; i--) {
    const s = _stars[i];
    s.x += s.vx;
    s.y += s.vy;
    s.life -= s.decay;
    if (s.life <= 0 || s.x > w + 20 || s.y > h + 20) {
      _stars.splice(i, 1);
      continue;
    }
    const alpha = Math.max(0, s.life);
    // trail
    const grad = _ctx.createLinearGradient(s.x, s.y, s.x - s.vx * 18, s.y - s.vy * 18);
    grad.addColorStop(0, `hsla(${s.hue}, 80%, 75%, ${alpha})`);
    grad.addColorStop(1, `hsla(${s.hue}, 80%, 75%, 0)`);
    _ctx.beginPath();
    _ctx.moveTo(s.x, s.y);
    _ctx.lineTo(s.x - s.vx * 18, s.y - s.vy * 18);
    _ctx.strokeStyle = grad;
    _ctx.lineWidth = s.size * alpha;
    _ctx.stroke();
    // head glow
    _ctx.beginPath();
    _ctx.arc(s.x, s.y, s.size * 1.6, 0, Math.PI * 2);
    _ctx.fillStyle = `hsla(${s.hue}, 90%, 82%, ${alpha * 0.8})`;
    _ctx.fill();
  }

  if (_stars.length === 0 && !_reducedMotion && Math.random() < 0.012) {
    spawnShootingStar();
  }
}

function animateLoop() {
  drawStars();
  _animId = requestAnimationFrame(animateLoop);
}

function resizeCanvas() {
  if (!_canvas) return;
  const rect = _canvas.parentElement?.getBoundingClientRect();
  if (!rect) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  _canvas.width = rect.width * dpr;
  _canvas.height = rect.height * dpr;
  _ctx?.scale(dpr, dpr);
}

/* ---- constellation rendering ---- */
function renderConstellation() {
  const el = _root.querySelector('#wish-constellation');
  if (!el) return;
  el.textContent = '';

  if (_wishes.length === 0) {
    const msg = document.createElement('p');
    msg.className = 'wish-empty-msg';
    msg.textContent = t('empty');
    el.appendChild(msg);
    return;
  }

  for (const w of _wishes) {
    const star = document.createElement('div');
    star.className = 'wish-star';
    star.setAttribute('role', 'listitem');
    star.setAttribute('aria-label', `${t('wishLabel')}: ${w.text}`);

    const icon = document.createElement('span');
    icon.className = 'star-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '⭐';

    const text = document.createElement('span');
    text.className = 'star-text';
    text.textContent = w.text;

    star.appendChild(icon);
    star.appendChild(text);
    el.appendChild(star);
  }
}

function updateCount() {
  const el = _root.querySelector('#wish-count');
  if (el) el.textContent = t('count')(_wishes.length);
}

/* ---- toast helper ---- */
function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('is-on');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('is-on'), 2600);
}

/* ---- actions ---- */
function addWish(text) {
  const clean = text.trim();
  if (clean.length < 2) {
    toast(t('toastTooShort'));
    return;
  }
  _wishes.push({ id: Date.now(), text: clean, ts: new Date().toISOString() });
  if (_wishes.length > 60) _wishes = _wishes.slice(-60);
  saveWishes();
  renderConstellation();
  updateCount();
  toast(t('toastAdded'));

  // celebration: spawn 3 shooting stars
  for (let i = 0; i < 3; i++) spawnShootingStar();

  // play chime if audio is available
  try {
    import('./audio.js').then((m) => m.chime?.('star')).catch(() => {});
  } catch { /* audio not available */ }
}

function clearWishes() {
  if (!window.confirm(t('confirmClear'))) return;
  _wishes = [];
  saveWishes();
  renderConstellation();
  updateCount();
  toast(t('toastCleared'));
}

/* ---- language ---- */
function setLanguage(lang) {
  _lang = lang === 'bn' ? 'bn' : 'en';
  const input = _root.querySelector('#wish-input');
  const send = _root.querySelector('#wish-send');
  const clear = _root.querySelector('#wish-clear');
  const constellation = _root.querySelector('#wish-constellation');
  if (input) input.placeholder = t('placeholder');
  if (send) send.textContent = t('send');
  if (clear) clear.textContent = t('clear');
  if (constellation) constellation.setAttribute('aria-label', t('label'));
  renderConstellation();
  updateCount();
}

/* ---- public API ---- */
export function initWishes(rootEl, opts = {}) {
  if (!rootEl) return { ok: false, reason: 'no root element' };
  _root = rootEl;
  _lang = opts.lang === 'bn' ? 'bn' : 'en';
  _reducedMotion = !!opts.reducedMotion;

  _canvas = _root.querySelector('#wish-canvas');
  if (_canvas) {
    _ctx = _canvas.getContext('2d');
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas, { passive: true });
    if (!_reducedMotion) {
      _animId = requestAnimationFrame(animateLoop);
    }
  }

  // load persisted wishes
  _wishes = loadWishes();
  renderConstellation();
  updateCount();

  // wire up form
  const input = _root.querySelector('#wish-input');
  const send = _root.querySelector('#wish-send');
  const clear = _root.querySelector('#wish-clear');

  if (input && send) {
    send.addEventListener('click', () => {
      addWish(input.value);
      input.value = '';
      input.focus();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addWish(input.value);
        input.value = '';
      }
    });
  }

  if (clear) {
    clear.addEventListener('click', clearWishes);
  }

  setLanguage(_lang);

  return { ok: true };
}

export function setLang(lang) {
  setLanguage(lang);
}

export function setReducedMotion(bool) {
  _reducedMotion = !!bool;
  if (_reducedMotion) {
    cancelAnimationFrame(_animId);
    _stars = [];
    _ctx?.clearRect(0, 0, _canvas?.width || 0, _canvas?.height || 0);
  } else if (_canvas) {
    _animId = requestAnimationFrame(animateLoop);
  }
}

export function getWishes() {
  return [..._wishes];
}

export function destroy() {
  cancelAnimationFrame(_animId);
  window.removeEventListener('resize', resizeCanvas);
  _stars = [];
  _root = null;
  _canvas = null;
  _ctx = null;
}
