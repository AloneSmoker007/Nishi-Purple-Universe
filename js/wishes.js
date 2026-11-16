/* ---------------------------------------------------------------
   Purple Wishing Stars — Phase 6
   Catch shooting stars, make wishes, build a constellation.
   All data is local-only (localStorage). No network requests.
   Answers never leave the device.
--------------------------------------------------------------- */

const WISH_KEY = 'nishi-wishes-v1';
const WISH_VERSION = 1;
const CATCH_RADIUS = 42;
const MAX_WISH_TEXT = 120;
const MAX_WISHES = 60;

/* ---- state ---- */
let _root = null;
let _canvas = null;
let _ctx = null;
let _animId = 0;
let _animRunning = false;
let _stars = [];          // active shooting stars on canvas
let _wishes = [];         // persisted wishes [{id, text, ts}]
let _reducedMotion = false;
let _lang = 'en';
let _cssW = 0;           // logical CSS width of canvas
let _cssH = 0;           // logical CSS height of canvas
let _resizeHandler = null;
let _orientationHandler = null;
let _rmQuery = null;
let _rmHandler = null;

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
    toastSaveFail: 'Could not save — storage may be full. Your wish was not kept.',
    label: 'Your wishes among the stars',
    wishLabel: 'Wish',
    caught: '⭐ Star caught!',
    noStars: 'No stars to catch right now — look for shooting stars!',
    canvasLabel: 'Shooting star canvas — click or press Enter to catch a star',
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
    toastSaveFail: 'সংরক্ষণ করা যায়নি — স্টোরেজ পূর্ণ হতে পারে। তোমার কামনা রাখা হয়নি।',
    label: 'তারার মাঝে তোমার কামনাগুলো',
    wishLabel: 'কামনা',
    caught: '⭐ তারা ধরা হয়েছে!',
    noStars: 'এখন ধরার মতো তারা নেই — উল্কা তারার জন্য দেখো!',
    canvasLabel: 'উল্কা তারার ক্যানভাস — তারা ধরতে ক্লিক করো বা Enter চাপো',
  },
};

function t(key) {
  return STR[_lang]?.[key] ?? STR.en[key] ?? key;
}

/* ---- screen reader announcements ---- */
function announce(msg) {
  const el = document.getElementById('live-region');
  if (el) { el.textContent = ''; setTimeout(() => { el.textContent = msg; }, 50); }
}

/* ---- persistence ---- */
function loadWishes() {
  try {
    const raw = localStorage.getItem(WISH_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (!data || data.version !== WISH_VERSION || !Array.isArray(data.wishes)) return [];
    return data.wishes
      .filter((w) => {
        if (!w || typeof w !== 'object') return false;
        if (typeof w.text !== 'string') return false;
        const txt = w.text.trim();
        return txt.length >= 2 && txt.length <= MAX_WISH_TEXT;
      })
      .map((w) => ({
        id: typeof w.id === 'number' && isFinite(w.id) ? w.id : Date.now(),
        text: w.text.trim().slice(0, MAX_WISH_TEXT),
        ts: typeof w.ts === 'string' ? w.ts : new Date().toISOString(),
      }))
      .slice(-MAX_WISHES);
  } catch {
    return [];
  }
}

function saveWishes() {
  try {
    localStorage.setItem(WISH_KEY, JSON.stringify({ version: WISH_VERSION, wishes: _wishes }));
    return true;
  } catch {
    return false;
  }
}

/* ---- shooting-star canvas ---- */
function spawnShootingStar() {
  if (_cssW <= 0 || _cssH <= 0) return;
  _stars.push({
    x: Math.random() * _cssW * 0.8,
    y: Math.random() * _cssH * 0.45,
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
  const w = _cssW;
  const h = _cssH;
  if (w <= 0 || h <= 0) return;
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
  if (!_animRunning) return;
  drawStars();
  _animId = requestAnimationFrame(animateLoop);
}

function startAnimation() {
  if (_animRunning || _reducedMotion || !_canvas) return;
  _animRunning = true;
  _animId = requestAnimationFrame(animateLoop);
}

function stopAnimation() {
  _animRunning = false;
  if (_animId) {
    cancelAnimationFrame(_animId);
    _animId = 0;
  }
}

function resizeCanvas() {
  if (!_canvas) return;
  const parent = _canvas.parentElement;
  if (!parent) return;
  const rect = parent.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  _cssW = rect.width;
  _cssH = rect.height;
  // setTransform resets any previous scale — prevents cumulative DPR drift
  _canvas.width = Math.round(rect.width * dpr);
  _canvas.height = Math.round(rect.height * dpr);
  _canvas.style.width = rect.width + 'px';
  _canvas.style.height = rect.height + 'px';
  _ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/* ---- star catching ---- */
function catchNearestStar(x, y) {
  let best = -1;
  let bestDist = CATCH_RADIUS * CATCH_RADIUS;
  for (let i = 0; i < _stars.length; i++) {
    const s = _stars[i];
    const dx = s.x - x;
    const dy = s.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestDist) { bestDist = d2; best = i; }
  }
  if (best === -1) return false;
  const caught = _stars[best];
  _stars.splice(best, 1);
  showCatchFlash(caught.x, caught.y);
  try { import('./audio.js').then((m) => m.chime?.('star')).catch(() => {}); } catch { /* ok */ }
  announce(t('caught'));
  toast(t('caught'));
  return true;
}

function showCatchFlash(x, y) {
  if (!_root) return;
  const scene = _root.querySelector('#wish-scene');
  if (!scene) return;
  const flash = document.createElement('div');
  flash.className = 'wish-catch-flash';
  flash.style.left = x + 'px';
  flash.style.top = y + 'px';
  flash.setAttribute('aria-hidden', 'true');
  scene.appendChild(flash);
  flash.addEventListener('animationend', () => flash.remove(), { once: true });
  setTimeout(() => flash.remove(), 600);
}

function handlePointerCatch(e) {
  if (_stars.length === 0) return;
  const rect = _canvas?.getBoundingClientRect();
  if (!rect) return;
  catchNearestStar(e.clientX - rect.left, e.clientY - rect.top);
}

function handleKeyCatch() {
  if (_stars.length === 0) {
    toast(t('noStars'));
    announce(t('noStars'));
    return;
  }
  const cx = _cssW / 2;
  const cy = _cssH / 2;
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < _stars.length; i++) {
    const s = _stars[i];
    const d = (s.x - cx) ** 2 + (s.y - cy) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  }
  const caught = _stars[best];
  _stars.splice(best, 1);
  showCatchFlash(caught.x, caught.y);
  try { import('./audio.js').then((m) => m.chime?.('star')).catch(() => {}); } catch { /* ok */ }
  announce(t('caught'));
  toast(t('caught'));
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
    star.setAttribute('tabindex', '0');
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
  const clean = text.trim().slice(0, MAX_WISH_TEXT);
  if (clean.length < 2) {
    toast(t('toastTooShort'));
    announce(t('toastTooShort'));
    return;
  }
  const entry = { id: Date.now(), text: clean, ts: new Date().toISOString() };
  _wishes.push(entry);
  if (_wishes.length > MAX_WISHES) _wishes = _wishes.slice(-MAX_WISHES);
  const saved = saveWishes();
  renderConstellation();
  updateCount();

  if (saved) {
    toast(t('toastAdded'));
    announce(t('toastAdded'));
  } else {
    toast(t('toastSaveFail'));
    announce(t('toastSaveFail'));
    // remove from memory since it was not persisted
    _wishes = _wishes.filter((w) => w.id !== entry.id);
    renderConstellation();
    updateCount();
  }

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
  const saved = saveWishes();
  renderConstellation();
  updateCount();
  if (saved) {
    toast(t('toastCleared'));
    announce(t('toastCleared'));
  } else {
    toast(t('toastSaveFail'));
    announce(t('toastSaveFail'));
  }
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
  const canvas = _root.querySelector('#wish-canvas');
  if (canvas) canvas.setAttribute('aria-label', t('canvasLabel'));
  renderConstellation();
  updateCount();
}

/* ---- public API ---- */
export function initWishes(rootEl, opts = {}) {
  if (!rootEl) return { ok: false, reason: 'no root element' };
  // prevent double-init
  if (_root) destroy();
  _root = rootEl;
  _lang = opts.lang === 'bn' ? 'bn' : 'en';
  _reducedMotion = !!opts.reducedMotion;

  _canvas = _root.querySelector('#wish-canvas');
  if (_canvas) {
    _ctx = _canvas.getContext('2d');
    resizeCanvas();
    _resizeHandler = () => resizeCanvas();
    _orientationHandler = () => { setTimeout(resizeCanvas, 120); };
    window.addEventListener('resize', _resizeHandler, { passive: true });
    window.addEventListener('orientationchange', _orientationHandler, { passive: true });

    // star-catching interactions
    _canvas.setAttribute('tabindex', '0');
    _canvas.setAttribute('role', 'application');
    _canvas.setAttribute('aria-label', t('canvasLabel'));
    _canvas.addEventListener('pointerdown', handlePointerCatch, { passive: true });
    _canvas.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleKeyCatch();
      }
    });

    if (!_reducedMotion) startAnimation();
  }

  // dynamic prefers-reduced-motion listener
  if (typeof window.matchMedia === 'function') {
    _rmQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    _rmHandler = (e) => setReducedMotion(e.matches);
    _rmQuery.addEventListener?.('change', _rmHandler) ??
      _rmQuery.addListener?.(_rmHandler);
    _reducedMotion = _rmQuery.matches;
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
    stopAnimation();
    _stars = [];
    if (_ctx && _cssW > 0 && _cssH > 0) {
      _ctx.clearRect(0, 0, _cssW, _cssH);
    }
  } else {
    startAnimation();
  }
}

export function getWishes() {
  return [..._wishes];
}

export function destroy() {
  stopAnimation();
  if (_resizeHandler) window.removeEventListener('resize', _resizeHandler);
  if (_orientationHandler) window.removeEventListener('orientationchange', _orientationHandler);
  _resizeHandler = null;
  _orientationHandler = null;
  if (_rmQuery && _rmHandler) {
    _rmQuery.removeEventListener?.('change', _rmHandler) ??
      _rmQuery.removeListener?.(_rmHandler);
  }
  _rmQuery = null;
  _rmHandler = null;
  _stars = [];
  _root = null;
  _canvas = null;
  _ctx = null;
  _cssW = 0;
  _cssH = 0;
}
