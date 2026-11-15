/**
 * Nishi's Purple Universe — UI controller
 * Wires: cinematic intro, nav, realm progress, 3D world, ambient audio,
 *        seven-star game, storybook, language toggle, quality + a11y.
 *
 * Everything degrades gracefully: if world.js or audio.js fail to load,
 * or WebGL is unavailable, the page stays fully usable with the CSS layer.
 */

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const IS_TOUCH = window.matchMedia('(hover: none)').matches;

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

/* ---------------------------------------------------------------
   toast + live region
--------------------------------------------------------------- */
let toastTimer = 0;
function toast(msg) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-on'), 3200);
  announce(msg);
}
function announce(msg) {
  const lr = $('#live-region');
  if (lr) lr.textContent = msg;
}

/* ---------------------------------------------------------------
   3D world (optional module)
--------------------------------------------------------------- */
const world = {
  ready: false, api: null, quality: 'auto', canvas: null,
  async boot() {
    this.canvas = $('#scene-canvas');
    if (!this.canvas) return;
    // WebGL support probe before we even import the module
    try {
      const probe = document.createElement('canvas');
      const gl = probe.getContext('webgl2') || probe.getContext('webgl');
      if (!gl) return; // CSS fallback layer stays visible
    } catch { return; }

    try {
      const mod = await import('./world.js');
      if (typeof mod.initWorld !== 'function') return;
      const res = mod.initWorld(this.canvas, { reducedMotion: REDUCED, touch: IS_TOUCH });
      if (res && res.ok === false) return;
      this.api = mod;
      this.ready = true;
      // Reveal the canvas only once a real frame exists, so the visitor never
      // sees a blank/background-only canvas while the world is still building.
      // The 2s timeout is a safety net: the canvas must never stay hidden.
      const reveal = () => this.canvas.classList.add('is-live');
      let revealed = false;
      const revealOnce = () => {
        if (revealed) return;
        revealed = true;
        reveal();
      };
      try {
        const st = typeof mod.getWorldStatus === 'function' ? mod.getWorldStatus() : null;
        if (st && st.renderedFrames > 0) revealOnce();
        else {
          document.addEventListener('nishi:world-firstframe', revealOnce, { once: true });
          setTimeout(revealOnce, 2000);
        }
      } catch (e) {
        revealOnce();
      }
      if (typeof mod.setReducedMotion === 'function') mod.setReducedMotion(REDUCED);
      this.applyQuality(detectQuality());
    } catch (err) {
      console.warn('[nishi] 3D world unavailable:', err && err.message);
    }
  },
  applyQuality(level) {
    this.quality = level;
    if (this.ready && this.api && typeof this.api.setQuality === 'function') {
      try { this.api.setQuality(level); } catch { /* non-fatal */ }
    }
    const fab = $('#fab-quality');
    if (fab) fab.title = `Visual quality: ${level}`;
  },
  pointer(x, y) {
    if (!this.ready || REDUCED) return;
    try { this.api && this.api.onPointerMove && this.api.onPointerMove(x, y); } catch { /* non-fatal */ }
  },
  scroll(p) {
    if (!this.ready || REDUCED) return;
    try { this.api && this.api.onScroll && this.api.onScroll(p); } catch { /* non-fatal */ }
  },
  to(name) {
    if (!this.ready) return false;
    try {
      this.api && this.api.setDestination && this.api.setDestination(name);
      return true;
    } catch { return false; }
  },
  resize() {
    try { this.api && this.api.resize && this.api.resize(); } catch { /* non-fatal */ }
  }
};

function detectQuality() {
  const mem = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  if (IS_TOUCH && (mem <= 2 || cores <= 4)) return 'low';
  if (IS_TOUCH) return 'medium';
  if (mem <= 4 || cores <= 4) return 'medium';
  return 'high';
}

/* ---------------------------------------------------------------
   ambient audio (optional module)
--------------------------------------------------------------- */
const sound = {
  ready: false, api: null, on: false, volume: 0.55,
  async ensure() {
    if (this.api) return this.api;
    try {
      const mod = await import('./audio.js');
      if (typeof mod.initAudio !== 'function') return null;
      const res = await mod.initAudio();
      if (res && res.ok === false) {
        toast('Ambient sound is not available in this browser.');
        return null;
      }
      this.api = mod;
      this.ready = true;
      return mod;
    } catch (err) {
      console.warn('[nishi] audio unavailable:', err && err.message);
      return null;
    }
  },
  async toggle() {
    const api = await this.ensure();
    if (!api) return;
    if (this.on) {
      api.stopAmbience();
      this.on = false;
    } else {
      api.setVolume(this.volume);
      api.startAmbience();
      this.on = true;
      try { api.chime && api.chime('chime'); } catch { /* non-fatal */ }
    }
    syncAudioUI();
  },
  chime(kind) {
    if (!this.on || !this.api) return;
    try { this.api.chime && this.api.chime(kind); } catch { /* non-fatal */ }
  }
};

function syncAudioUI() {
  const btn = $('#ambience-btn');
  const fab = $('#fab-audio');
  if (btn) {
    btn.setAttribute('aria-pressed', String(sound.on));
    btn.textContent = sound.on ? '♫ Ambience on' : '♫ Play dreamy ambience';
  }
  if (fab) {
    fab.setAttribute('aria-pressed', String(sound.on));
    fab.textContent = sound.on ? '♫' : '♪';
    fab.setAttribute('aria-label', sound.on ? 'Mute ambient sound' : 'Play ambient sound');
  }
}

/* ---------------------------------------------------------------
   cinematic intro
--------------------------------------------------------------- */
function initIntro() {
  const intro = $('#intro');
  if (!intro) return;
  document.body.classList.add('cinematic');

  const close = (entering) => {
    if (intro.classList.contains('is-hidden')) return;
    intro.classList.add('is-hidden');
    intro.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('cinematic');
    try { localStorage.setItem('nishi-intro-seen', '1'); } catch { /* private mode */ }
    if (entering) {
      sound.chime('portal');
      world.to('portal');
    }
    // move focus into the page for keyboard users
    const main = $('#main-content');
    if (main) { main.setAttribute('tabindex', '-1'); main.focus({ preventScroll: true }); }
  };

  $('#enter-universe')?.addEventListener('click', () => close(true));
  $('#skip-intro')?.addEventListener('click', () => close(false));
  intro.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close(false);
    if (e.key === 'Enter' && e.target === intro) close(true);
  });

  // If the visitor has already seen it, don't block them again.
  let seen = false;
  try { seen = localStorage.getItem('nishi-intro-seen') === '1'; } catch { /* ignore */ }
  if (seen || REDUCED) {
    intro.classList.add('is-hidden');
    intro.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('cinematic');
    return;
  }

  // Auto-focus the primary action so keyboard users can just press Enter.
  setTimeout(() => $('#enter-universe')?.focus({ preventScroll: true }), 260);
}

/* ---------------------------------------------------------------
   navigation (collapsible sheet on mobile)
--------------------------------------------------------------- */
function initNav() {
  const toggle = $('#nav-toggle');
  const menu = $('#nav-menu');
  if (!toggle || !menu) return;

  const setOpen = (open) => {
    menu.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  };

  toggle.addEventListener('click', () => setOpen(!menu.classList.contains('is-open')));
  menu.addEventListener('click', (e) => {
    if (e.target.closest('a')) setOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menu.classList.contains('is-open')) {
      setOpen(false); toggle.focus();
    }
  });
  document.addEventListener('click', (e) => {
    if (!menu.classList.contains('is-open')) return;
    if (menu.contains(e.target) || toggle.contains(e.target)) return;
    setOpen(false);
  });

  // Section highlight on scroll
  const links = $$('#nav-menu a[href^="#"]');
  const map = new Map();
  links.forEach(a => {
    const id = a.getAttribute('href').slice(1);
    const sec = document.getElementById(id);
    if (sec) map.set(sec, a);
  });
  if ('IntersectionObserver' in window && map.size) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(en => {
        const link = map.get(en.target);
        if (!link) return;
        if (en.isIntersecting) {
          links.forEach(l => l.removeAttribute('aria-current'));
          link.setAttribute('aria-current', 'true');
        }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    map.forEach((_, sec) => io.observe(sec));
  }
}

/* ---------------------------------------------------------------
   scroll reveal
--------------------------------------------------------------- */
function initReveal() {
  const items = $$('.reveal');
  if (!items.length) return;
  if (REDUCED || !('IntersectionObserver' in window)) {
    items.forEach(el => el.classList.add('is-in'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach(en => {
      if (en.isIntersecting) {
        en.target.classList.add('is-in');
        io.unobserve(en.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
  items.forEach(el => io.observe(el));
}

/* ---------------------------------------------------------------
   realm progress (visited destinations)
--------------------------------------------------------------- */
const REALM_TOTAL = 6;
const visited = new Set();

function initRealms() {
  const grid = $('#realm-grid');
  if (!grid) return;

  // pointer glow follow
  if (!IS_TOUCH) {
    $$('.realm').forEach(card => {
      card.addEventListener('pointermove', (e) => {
        const r = card.getBoundingClientRect();
        card.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
        card.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
      });
    });
  }

  $$('.realm').forEach(card => {
    card.addEventListener('click', () => {
      const key = card.dataset.realm;
      const isNew = !visited.has(key);
      visited.add(key);
      card.classList.add('is-done');
      updateRealmProgress();
      if (isNew) {
        sound.chime('star');
        toast('✦ Realm discovered!');
      }
      // try to fly the 3D camera to the matching vantage point
      const dest = { ot7: 'ot7', music: 'music', busan: 'busan', story: 'quest', quest: 'quest', road: 'road' }[key];
      if (dest) world.to(dest);
    });
  });

  updateRealmProgress();
}

function updateRealmProgress() {
  const n = visited.size;
  const txt = $('#realm-progress-text');
  const fill = $('#realm-progress-fill');
  if (txt) txt.textContent = `✦ Realms explored: ${n} / ${REALM_TOTAL}`;
  if (fill) fill.style.width = `${Math.round((n / REALM_TOTAL) * 100)}%`;
  if (n === REALM_TOTAL) {
    toast('💜 You have explored the whole universe!');
    sound.chime('reveal');
  }
}

/* ---------------------------------------------------------------
   seven-star quest (hidden object game)
--------------------------------------------------------------- */
const STAR_TOTAL = 7;
const game = { found: 0, attempts: 0, built: false };

function buildStarField() {
  const field = $('#star-field');
  if (!field) return;
  field.innerHTML = '';

  // deterministic-ish scatter that avoids the HUD area (top 90px)
  const spots = [
    [12, 26], [28, 62], [45, 33], [61, 70], [76, 28], [88, 56], [33, 84], [68, 47], [20, 47]
  ];
  // first 7 are real stars, last 2 are decoys
  spots.forEach(([x, y], i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'star-btn';
    btn.style.left = `${x}%`;
    btn.style.top = `calc(90px + ${y}% * 0.86)`;
    btn.style.top = `calc(90px + ${(y / 100) * 86}%)`;
    btn.dataset.real = i < STAR_TOTAL ? '1' : '0';
    btn.setAttribute('aria-label', i < STAR_TOTAL ? 'A hidden star. Activate to discover it.' : 'A twinkling light');
    btn.innerHTML = `<span class="glyph" aria-hidden="true">${i < STAR_TOTAL ? '⭐' : '✨'}</span>`;
    field.appendChild(btn);
  });
  game.built = true;
}

function initGame() {
  const stage = $('#game-stage');
  if (!stage) return;
  buildStarField();

  $('#star-field')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.star-btn');
    if (!btn || btn.classList.contains('is-found')) return;
    game.attempts++;
    if (btn.dataset.real === '1') {
      btn.classList.add('is-found');
      game.found++;
      sound.chime('star');
      announce(`Star found. ${game.found} of ${STAR_TOTAL}.`);
    } else {
      sound.chime('chime');
      announce('That light was not a star. Keep looking.');
    }
    updateGameHUD();
  });

  $('#game-restart')?.addEventListener('click', () => {
    game.found = 0; game.attempts = 0;
    buildStarField();
    updateGameHUD();
    toast('↻ The quest has been restarted.');
  });

  updateGameHUD();
}

function updateGameHUD() {
  const p = $('#game-progress');
  const a = $('#game-attempts');
  if (p) p.textContent = `⭐ ${game.found} / ${STAR_TOTAL} stars discovered`;
  if (a) a.textContent = `🎯 ${game.attempts} attempt${game.attempts === 1 ? '' : 's'}`;

  if (game.found === STAR_TOTAL) {
    const hud = $('.game-hud');
    if (hud && !hud.dataset.won) {
      hud.dataset.won = '1';
      sound.chime('reveal');
      toast('💜 You found your universe, Nishi!');
      announce('You found all seven stars. Your secret letter is revealed below.');
      setTimeout(() => {
        $('#final-letter')?.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'center' });
      }, 700);
    }
  }
}

/* ---------------------------------------------------------------
   storybook
--------------------------------------------------------------- */
function initStory() {
  $('#open-letter')?.addEventListener('click', () => {
    sound.chime('chime');
    $('#final-letter')?.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'center' });
    toast('💌 The letter is waiting below.');
  });
  $('#follow-stars')?.addEventListener('click', () => {
    sound.chime('star');
    $('#game')?.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'start' });
    toast('✨ Follow the stars into the quest.');
  });
}

/* ---------------------------------------------------------------
   language toggle (Bangla emphasis)
--------------------------------------------------------------- */
function initLang() {
  const btn = $('#lang-toggle');
  if (!btn) return;
  let banglaFirst = false;
  try { banglaFirst = localStorage.getItem('nishi-lang') === 'bn'; } catch { /* ignore */ }
  applyLang(banglaFirst);

  btn.addEventListener('click', () => {
    banglaFirst = !banglaFirst;
    try { localStorage.setItem('nishi-lang', banglaFirst ? 'bn' : 'en'); } catch { /* ignore */ }
    applyLang(banglaFirst);
    toast(banglaFirst ? 'বাংলা দেখানো হচ্ছে 💜' : 'Showing English 💜');
  });

  function applyLang(bn) {
    document.documentElement.lang = bn ? 'bn' : 'en';
    btn.textContent = bn ? 'English' : 'বাংলা';
    btn.setAttribute('aria-label', bn ? 'Switch to English' : 'Switch to Bangla emphasis');
    document.body.classList.toggle('bn-first', bn);
    // keep the Q&A portal in sync with the site language
    try {
      if (window.__nishiQuest && typeof window.__nishiQuest.setLanguage === 'function') {
        window.__nishiQuest.setLanguage(bn ? 'bn' : 'en');
      }
    } catch { /* ignore */ }
  }
}

/* ---------------------------------------------------------------
   floating controls
--------------------------------------------------------------- */
function initFabs() {
  $('#fab-top')?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: REDUCED ? 'auto' : 'smooth' });
  });

  $('#fab-audio')?.addEventListener('click', () => sound.toggle());
  $('#ambience-btn')?.addEventListener('click', () => sound.toggle());

  const QUALITIES = ['auto', 'high', 'medium', 'low'];
  $('#fab-quality')?.addEventListener('click', () => {
    const i = QUALITIES.indexOf(world.quality);
    const next = QUALITIES[(i + 1) % QUALITIES.length];
    if (next === 'auto') world.applyQuality(detectQuality());
    else world.applyQuality(next);
    toast(`✦ Visual quality: ${world.quality}`);
  });
}

/* ---------------------------------------------------------------
   pointer parallax + scroll -> camera
--------------------------------------------------------------- */
function initPointer() {
  if (REDUCED) return;
  let raf = 0, nx = 0, ny = 0;
  const onMove = (cx, cy) => {
    nx = (cx / window.innerWidth) * 2 - 1;
    ny = (cy / window.innerHeight) * 2 - 1;
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; world.pointer(nx, ny); });
  };
  if (IS_TOUCH) {
    window.addEventListener('touchmove', (e) => {
      const t = e.touches[0];
      if (t) onMove(t.clientX, t.clientY);
    }, { passive: true });
  } else {
    window.addEventListener('pointermove', (e) => onMove(e.clientX, e.clientY), { passive: true });
  }
}

function initScrollCamera() {
  if (REDUCED) return;
  let raf = 0;
  const onScroll = () => {
    if (!raf) raf = requestAnimationFrame(() => {
      raf = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      world.scroll(max > 0 ? window.scrollY / max : 0);
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
}

/* ---------------------------------------------------------------
   device orientation (opt-in gyroscope tilt)
--------------------------------------------------------------- */
function initGyro() {
  if (REDUCED || !IS_TOUCH) return;
  const attach = () => {
    window.addEventListener('deviceorientation', (e) => {
      if (e.gamma == null || e.beta == null) return;
      const x = Math.max(-1, Math.min(1, e.gamma / 32));
      const y = Math.max(-1, Math.min(1, (e.beta - 42) / 32));
      world.pointer(x, y);
    }, { passive: true });
  };
  // iOS requires an explicit permission request from a user gesture.
  if (typeof DeviceOrientationEvent !== 'undefined'
      && typeof DeviceOrientationEvent.requestPermission === 'function') {
    const fab = $('#fab-quality');
    const ask = async () => {
      try {
        const res = await DeviceOrientationEvent.requestPermission();
        if (res === 'granted') { attach(); toast('📱 Motion control enabled.'); }
      } catch { /* user declined */ }
      fab?.removeEventListener('click', ask);
    };
    fab?.addEventListener('click', ask, { once: false });
  } else if ('DeviceOrientationEvent' in window) {
    attach();
  }
}

/* ---------------------------------------------------------------
   resize
--------------------------------------------------------------- */
function initResize() {
  let t = 0;
  window.addEventListener('resize', () => {
    clearTimeout(t);
    t = setTimeout(() => world.resize(), 140);
  }, { passive: true });
}

/* ---------------------------------------------------------------
   quest — "Nishi, Tell Me Your Universe"
   Lazy-loaded so it can never block first paint. Answers stay in
   localStorage only; nothing is transmitted anywhere.
--------------------------------------------------------------- */
async function initQuest() {
  const mount = $('#quest-mount');
  if (!mount) return;
  try {
    const mod = await import('./quest.js');
    if (typeof mod.initQuest !== 'function') return;
    let lang = 'en';
    try { lang = localStorage.getItem('nishi-lang') === 'bn' ? 'bn' : 'en'; } catch { /* ignore */ }
    const res = mod.initQuest(mount, { lang, confirmRestart: true, autoAdvance: true });
    if (res && res.ok === false) {
      console.warn('[nishi] quest unavailable:', res.reason);
      mount.innerHTML = '<p class="dim" style="text-align:center">This little corner needs JavaScript to bloom. 💜</p>';
      return;
    }
    window.__nishiQuest = mod;
  } catch (err) {
    console.warn('[nishi] quest unavailable:', err && err.message);
  }
}

/* ---------------------------------------------------------------
   boot
--------------------------------------------------------------- */
function boot() {
  initIntro();
  initNav();
  initReveal();
  initRealms();
  initGame();
  initStory();
  initLang();
  initFabs();
  initPointer();
  initScrollCamera();
  initGyro();
  initResize();
  syncAudioUI();
  initQuest();

  // 3D last — it must never block the page from becoming usable.
  world.boot();

  // Guard against accidental reload losing the intro state
  window.addEventListener('pagehide', () => {
    try { localStorage.setItem('nishi-intro-seen', '1'); } catch { /* ignore */ }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}

// Expose a tiny debug handle (no sensitive data) for manual QA.
window.__nishi = { world, sound, game, visited };
