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
  ready: false, api: null, quality: 'auto', qualityMode: 'auto', canvas: null,
  async boot() {
    this.canvas = $('#scene-canvas');
    if (!this.canvas) return;

    // Load the 3D world on capable phones as well as desktops. Quality is
    // selected adaptively below; WebGL/import failures retain the CSS fallback.
    if (!canRunWebGL()) {
      document.body.classList.add('no-webgl');
      return;
    }

    // WebGL support probe before we even import the module
    try {
      const probe = document.createElement('canvas');
      const gl = probe.getContext('webgl2') || probe.getContext('webgl');
      if (!gl) { document.body.classList.add('no-webgl'); return; } // CSS fallback layer stays visible
    } catch { document.body.classList.add('no-webgl'); return; }

    try {
      const mod = await import('./world.js');
      if (typeof mod.initWorld !== 'function') {
        document.body.classList.add('no-webgl');
        return;
      }
      const res = mod.initWorld(this.canvas, { reducedMotion: REDUCED, touch: IS_TOUCH });
      if (!res || res.ok === false) {
        document.body.classList.add('no-webgl');
        this.canvas.classList.remove('is-live');
        console.warn('[nishi] 3D world fell back to CSS:', res && res.reason || 'initialisation failed');
        return;
      }
      this.api = mod;
      this.ready = true;
      // Reveal the canvas only once a real frame exists, so the visitor never
      // sees a blank/background-only canvas while the world is still building.
      // NOTE: setQuality() can recreate the renderer on a fresh canvas clone
      // (needed to change antialias), so always re-query by id — a captured
      // reference may point at a detached node.
      const reveal = () => {
        const c = $('#scene-canvas');
        if (c) c.classList.add('is-live');
      };
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
          // Never reveal a canvas merely because time elapsed. If no frame
          // rendered, release the failed renderer and keep the CSS fallback.
          setTimeout(() => {
            const status = typeof mod.getWorldStatus === 'function' ? mod.getWorldStatus() : null;
            if (status && status.renderedFrames > 0) {
              revealOnce();
              return;
            }
            document.body.classList.add('no-webgl');
            const c = $('#scene-canvas');
            if (c) c.classList.remove('is-live');
            try { mod.dispose && mod.dispose(); } catch { /* non-fatal */ }
            this.ready = false;
            this.api = null;
            console.warn('[nishi] 3D produced no frame; CSS fallback retained.');
          }, 2000);
        }
      } catch (e) {
        revealOnce();
      }
      if (typeof mod.setReducedMotion === 'function') mod.setReducedMotion(REDUCED);
      this.applyQuality(detectQuality());
    } catch (err) {
      document.body.classList.add('no-webgl');
      this.canvas?.classList.remove('is-live');
      console.warn('[nishi] 3D world unavailable; CSS fallback enabled:', err && err.message);
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
    // Resizing must never reveal a blank or context-lost canvas. The renderer's
    // first-frame and context-restored signals own visibility transitions.
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

/**
 * Whether the heavy Three.js world is safe to spin up.
 * Conservative on purpose: a lighter, always-correct experience beats a
 * spectacular one that reloads the page on a phone.
 */
function canRunWebGL() {
  // Explicit choice from the ✦ FAB always wins.
  try {
    const pref = localStorage.getItem('nishi-webgl');
    if (pref === 'on') return true;
    if (pref === 'off') return false;
  } catch { /* private mode */ }

  // Keep the 3D experience available on mobile; reject only genuinely
  // constrained hardware and visitors who explicitly request data saving.
  const mem = navigator.deviceMemory;
  const cores = navigator.hardwareConcurrency;
  if (typeof mem === 'number' && mem < 2) return false;
  if (typeof cores === 'number' && cores < 2) return false;
  // Save-Data visitors asked for less, not more.
  const conn = navigator.connection;
  if (conn && conn.saveData) return false;
  return true;
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
// Single memoised 3D boot promise: the render loop is deferred while the
// intro overlay is on screen, and Enter-to-portal must wait for it.
let worldBootPromise = null;
function startWorldOnce() {
  if (!worldBootPromise) worldBootPromise = world.boot();
  return worldBootPromise;
}

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
    // The 3D renderer is deliberately held back until the intro is gone so the
    // full-screen overlay never competes with a full-speed render loop for the
    // main thread (keeps taps instant on low-end devices).
    document.dispatchEvent(new CustomEvent('nishi:intro-closed'));
    if (entering) {
      sound.chime('portal');
      // The world may still be booting (render loop is deferred while the intro
      // is up); fly to the portal only once it is ready.
      Promise.resolve(startWorldOnce()).then(() => world.to('portal'));
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
    intro.style.transition = 'none';
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

  const revealAll = () => items.forEach(el => el.classList.add('is-in'));

  if (REDUCED || !('IntersectionObserver' in window)) {
    revealAll();
    return;
  }

  // Reveal anything already at or above the fold immediately, so the visitor
  // never lands on a blank first screen waiting for an observer callback.
  const vh = window.innerHeight || 800;
  items.forEach(el => {
    const b = el.getBoundingClientRect();
    if (b.top < vh * 1.05) el.classList.add('is-in');
  });

  const io = new IntersectionObserver((entries) => {
    entries.forEach(en => {
      if (en.isIntersecting) {
        en.target.classList.add('is-in');
        io.unobserve(en.target);
      }
    });
  }, {
    threshold: 0.01,
    // Start fading in slightly BEFORE the element reaches the viewport, so on a
    // phone the content is already visible by the time the eye gets there.
    rootMargin: '0px 0px 12% 0px',
  });
  items.forEach(el => { if (!el.classList.contains('is-in')) io.observe(el); });

  // HARD SAFETY NETS. IntersectionObserver only reports elements it *saw*
  // cross the viewport — a fast scroll or an anchor jump flies past sections
  // and leaves them at opacity:0 forever. So we also sweep on scroll, and run
  // two timers, and never let anything stay invisible.
  const revealNearby = (marginPx) => {
    const limit = window.innerHeight * marginPx;
    items.forEach(el => {
      if (el.classList.contains('is-in')) return;
      const b = el.getBoundingClientRect();
      // visible, about to be visible, or already scrolled past
      if (b.top < limit || b.bottom < 0) el.classList.add('is-in');
    });
  };

  let sweepQueued = false;
  const onScroll = () => {
    if (sweepQueued) return;
    sweepQueued = true;
    requestAnimationFrame(() => {
      sweepQueued = false;
      revealNearby(1.15);
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });

  setTimeout(() => revealNearby(1.2), 2500);
  window.addEventListener('load', () => {
    setTimeout(() => revealNearby(1.3), 400);
  }, { once: true });
  // Absolute last resort: nothing may still be invisible after 6s.
  setTimeout(() => {
    items.forEach(el => el.classList.add('is-in'));
  }, 6000);
}

/* ---------------------------------------------------------------
   realm progress (visited destinations)
--------------------------------------------------------------- */
const REALM_TOTAL = 7;
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
      const dest = { ot7: 'ot7', music: 'music', busan: 'busan', story: 'quest', quest: 'quest', road: 'road', wishes: 'portal' }[key];
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

  // 21 matching lights: 7 stars and 14 decoys. Shuffle the answer
  // positions on every build so the visual pattern never gives them away.
  const spots = [
    [10, 20], [23, 20], [37, 20], [50, 20], [63, 20], [77, 20], [90, 20],
    [10, 48], [23, 48], [37, 48], [50, 48], [63, 48], [77, 48], [90, 48],
    [10, 76], [23, 76], [37, 76], [50, 76], [63, 76], [77, 76], [90, 76]
  ];
  const shuffled = spots.map((_, i) => i);
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const realSpots = new Set(shuffled.slice(0, STAR_TOTAL));

  spots.forEach(([x, y], i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'star-btn';
    btn.style.left = `${x}%`;
    btn.style.top = `calc(90px + ${(y / 100) * 86}%)`;
    btn.dataset.real = realSpots.has(i) ? '1' : '0';
    btn.setAttribute('aria-label', 'A glowing point of light. Activate to check it.');
    // Identical glyphs prevent the correct answers being visually obvious.
    btn.innerHTML = '<span class="glyph" aria-hidden="true">✦</span>';
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
      btn.disabled = true;
      btn.setAttribute('aria-label', 'Star found.');
      btn.querySelector('.glyph').textContent = '⭐';
      game.found++;
      sound.chime('star');
      announce(`Star found. ${game.found} of ${STAR_TOTAL}.`);
    } else {
      btn.disabled = true;
      btn.setAttribute('aria-label', 'Not a star. This light has been checked.');
      btn.querySelector('.glyph').textContent = '·';
      sound.chime('chime');
      announce('That light was not a star. Keep looking.');
    }
    updateGameHUD();
  });

  $('#game-restart')?.addEventListener('click', () => {
    game.found = 0; game.attempts = 0;
    const hud = $('.game-hud');
    if (hud) delete hud.dataset.won;
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
   storybook — interactive choose-your-path story (Phase 5)

   State lives in localStorage under a versioned key ('nishi-story-v1') and
   is strictly validated on restore. Every user-facing story string is
   rendered through DOM/text APIs (createElement/textContent) — never
   innerHTML — so nothing can ever be interpreted as markup.
--------------------------------------------------------------- */
const STORY_KEY = 'nishi-story-v1';
const STORY_VERSION = 1;
const STORY_CHOICE_IDS = ['open', 'follow', 'song', 'memory', 'promise', 'dream'];

const STORY_NODES = {
  letter: {
    part: 1,
    title: {
      en: 'Chapter I · A letter from the purple sky',
      bn: 'অধ্যায় I · বেগুনি আকাশ থেকে একটি চিঠি',
    },
    body: {
      en: 'One quiet evening, seven stars appear above a moonlit castle. A little glowing envelope lands at your feet. It has your name on it.',
      bn: 'একটি শান্ত সন্ধ্যায়, চাঁদ-স্নাত দুর্গের উপর সাতটি তারা জ্বলে ওঠে। তোমার পায়ের কাছে একটি ছোট্ট উজ্জ্বল খাম নেমে আসে। তার ওপর তোমার নাম লেখা।',
    },
    choices: [
      { id: 'open', to: 'letter-open', en: 'Open the glowing envelope ✉️', bn: 'উজ্জ্বল খামটি খোলো ✉️' },
      { id: 'follow', to: 'road-stars', en: 'Follow the seven stars ✨', bn: 'সাতটি তারার পিছু চলো ✨' },
    ],
  },
  'letter-open': {
    part: 2,
    title: {
      en: 'Chapter II · The voice in the letter',
      bn: 'অধ্যায় II · চিঠির ভেতরের কণ্ঠ',
    },
    body: {
      en: 'Inside the envelope a single violet line glows — “You are doing better than you think.” The words feel like a song you already know by heart.',
      bn: 'খামের ভেতরে একটিমাত্র বেগুনি লাইন জ্বলে — “তুমি ভাবো তার চেয়ে অনেক ভালো করছ।” কথাগুলো এমন একটি গানের মতো, যা তুমি আগেই মুখস্থ করে ফেলেছ।',
    },
    choices: [
      { id: 'song', to: 'home', en: 'Keep the song it sings 🎧', bn: 'যে গানটি গায় তা রাখো 🎧' },
      { id: 'memory', to: 'home', en: 'Keep the memory it holds 🌙', bn: 'যে স্মৃতিটি ধরে রাখে তা রাখো 🌙' },
    ],
  },
  'road-stars': {
    part: 2,
    title: {
      en: 'Chapter II · The seven-star road',
      bn: 'অধ্যায় II · সাত-তারার রাস্তা',
    },
    body: {
      en: 'You follow the light. Every star becomes a song you love, a memory you kept, and a promise you never had to say out loud.',
      bn: 'তুমি আলোর পিছু চলো। প্রতিটি তারা হয়ে ওঠে তোমার প্রিয় একটি গান, তুমি যে স্মৃতিটি সংরক্ষণ করেছ, আর একটি প্রতিশ্রুতি — যে কথা তোমাকে কখনো জোরে বলতে হয়নি।',
    },
    choices: [
      { id: 'promise', to: 'home', en: 'Make the purple promise 💜', bn: 'বেগুনি প্রতিশ্রুতি দাও 💜' },
      { id: 'dream', to: 'home', en: 'Chase the bigger dream ⭐', bn: 'আরও বড় স্বপ্নের পিছু যাও ⭐' },
    ],
  },
  home: {
    part: 3,
    title: {
      en: 'Chapter III · Home is a purple sky',
      bn: 'অধ্যায় III · বাড়ি মানে বেগুনি আকাশ',
    },
    body: {
      en: 'At the end of the road the sky turns violet, and you understand — you were never walking alone. You were always under the same purple sky.',
      bn: 'রাস্তার শেষে আকাশ বেগুনি হয়ে ওঠে, আর তুমি বুঝে যাও — তুমি কখনো একা হেঁটে যাওনি। তুমি সবসময় একই বেগুনি আকাশের নিচে ছিলে।',
    },
    choices: [],
  },
};

/* Three endings, composed from the path tags (memory + promise share the
   “heart” ending, so all four routes land in three distinct endings). */
const STORY_ENDINGS = {
  song: {
    title: { en: 'The Songkeeper’s Sky', bn: 'গান-রক্ষকের আকাশ' },
    line: {
      en: 'Of everything the universe offered, you chose the song. May every road you walk keep humming its melody.',
      bn: 'মহাকাশ যা কিছু দিয়েছিল, তুমি বেছে নিয়েছ গানটি। তুমি যে পথেই হাঁটুক না কেন, সেখানে সুরটি বাজতে থাকুক।',
    },
  },
  dream: {
    title: { en: 'The Dreamkeeper’s Sky', bn: 'স্বপ্ন-রক্ষকের আকাশ' },
    line: {
      en: 'You looked up and chose the bigger dream. The sky kept every wish you ever made on it.',
      bn: 'তুমি উপরে তাকিয়ে বড় স্বপ্নটি বেছে নিয়েছ। আকাশ তোমার প্রতিটি প্রার্থনা ধরে রেখেছে।',
    },
  },
  heart: {
    title: { en: 'The Heartkeeper’s Sky', bn: 'হৃদয়-রক্ষকের আকাশ' },
    line: {
      en: 'You kept what matters quietly — a memory, a promise, a heart that stays. That is the bravest kind of magic.',
      bn: 'তুমি যা সত্যিকারের গুরুত্বপূর্ণ তা নিঃশব্দে ধরে রেখেছ — একটি স্মৃতি, একটি প্রতিশ্রুতি, একটি থেকে যাওয়া হৃদয়। এটাই সবচেয়ে সাহসী জাদু।',
    },
  },
};
const STORY_ENDING_FOR_TAG = { song: 'song', memory: 'heart', promise: 'heart', dream: 'dream' };

const storyState = { node: 'letter', path: [] };

function storyTag() {
  const last = storyState.path[storyState.path.length - 1];
  return STORY_ENDING_FOR_TAG[last] ? last : null;
}

function saveStory() {
  try {
    localStorage.setItem(STORY_KEY, JSON.stringify({
      v: STORY_VERSION,
      node: storyState.node,
      path: storyState.path,
    }));
  } catch { /* private mode — the story still works, just not persisted */ }
}

function wipeStoryData() {
  try { localStorage.removeItem(STORY_KEY); } catch { /* ignore */ }
}

/** Strict restore: corrupted, tampered or outdated payloads start clean. */
function loadStory() {
  storyState.node = 'letter';
  storyState.path = [];
  try {
    const raw = localStorage.getItem(STORY_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    const expectedPathLen = data && data.node === 'letter' ? 0 : data.node === 'home' ? 2 : 1;
    const valid = !!data
      && typeof data === 'object'
      && data.v === STORY_VERSION
      && typeof data.node === 'string'
      && Object.prototype.hasOwnProperty.call(STORY_NODES, data.node)
      && Array.isArray(data.path)
      && data.path.length <= 2
      && data.path.every((id) => STORY_CHOICE_IDS.includes(id))
      && data.path.length === expectedPathLen;
    if (!valid) { wipeStoryData(); return; }
    storyState.node = data.node;
    storyState.path = data.path.slice();
  } catch {
    wipeStoryData();
  }
}

/** Tiny DOM builder — text only, never innerHTML. */
function storyEl(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  return el;
}

function renderStory(focusHeading) {
  const stage = $('#story-stage');
  const node = STORY_NODES[storyState.node];
  if (!stage || !node) return;
  stage.textContent = '';

  const progress = storyEl('p', 'story-progress dim', `Part ${node.part} of 3`);
  progress.appendChild(storyEl('span', 'bn', `গল্পের ${node.part} / ৩`));
  stage.appendChild(progress);

  const chapter = storyEl('div', 'story-chapter');
  const heading = storyEl('h4', null, node.title.en);
  heading.setAttribute('tabindex', '-1');
  chapter.appendChild(heading);
  chapter.appendChild(storyEl('p', 'bn', node.title.bn));
  const body = storyEl('p', 'lead', node.body.en);
  body.appendChild(storyEl('span', 'bn', node.body.bn));
  chapter.appendChild(body);
  stage.appendChild(chapter);

  if (storyState.node === 'home') {
    const tag = storyTag();
    const ending = STORY_ENDINGS[STORY_ENDING_FOR_TAG[tag] || 'heart'];
    const wrap = storyEl('div', 'story-ending');
    wrap.appendChild(storyEl('p', 'script story-ending-title', ending.title.en));
    wrap.appendChild(storyEl('p', 'bn', ending.title.bn));
    const line = storyEl('p', 'lead', ending.line.en);
    line.appendChild(storyEl('span', 'bn', ending.line.bn));
    wrap.appendChild(line);

    // bilingual path summary from the actual chosen choices
    const labels = { en: [], bn: [] };
    for (const id of storyState.path) {
      for (const n of Object.values(STORY_NODES)) {
        const c = n.choices.find((x) => x.id === id);
        if (c) { labels.en.push(c.en); labels.bn.push(c.bn); }
      }
    }
    wrap.appendChild(storyEl('p', 'dim', `Your path: ${labels.en.join(' → ')}`));
    wrap.appendChild(storyEl('p', 'bn', `তোমার পথ: ${labels.bn.join(' → ')}`));

    const restart = storyEl('button', 'btn ghost sm', null);
    restart.type = 'button';
    restart.id = 'story-restart';
    restart.appendChild(storyEl('span', null, 'Start the story again'));
    restart.appendChild(storyEl('span', 'bn', 'গল্প আবার শুরু করো'));
    restart.addEventListener('click', restartStory);
    wrap.appendChild(restart);
    stage.appendChild(wrap);
  } else {
    const row = storyEl('div', 'story-choice');
    for (const c of node.choices) {
      const btn = storyEl('button', 'btn', null);
      btn.type = 'button';
      btn.appendChild(storyEl('span', null, c.en));
      btn.appendChild(storyEl('span', 'bn', c.bn));
      btn.addEventListener('click', () => advanceStory(c));
      row.appendChild(btn);
    }
    stage.appendChild(row);
  }

  if (focusHeading) {
    try { heading.focus({ preventScroll: true }); } catch { /* ignore */ }
  }
}

function announceStory() {
  const node = STORY_NODES[storyState.node];
  if (node) announce(`${node.title.en} — part ${node.part} of 3. ${node.title.bn}`);
}

function advanceStory(choice) {
  if (!choice || storyState.node === 'home') return;
  storyState.path.push(choice.id);
  storyState.node = choice.to;
  saveStory();
  renderStory(true);
  try { sound.chime(storyState.node === 'home' ? 'reveal' : 'chime'); } catch { /* non-fatal */ }
  announceStory();
}

function restartStory() {
  const ok = window.confirm('Start the story again from the beginning? / গল্প আবার শুরু থেকে শুরু করবে?');
  if (!ok) return;
  wipeStoryData();
  storyState.node = 'letter';
  storyState.path = [];
  renderStory(true);
  announceStory();
  toast('↻ The story has been reset. / গল্প আবার শুরু হয়েছে।');
}

/* ---------------------------------------------------------------
   universal press feedback
   Any tappable element gets a visible response within one frame, so the
   interface never feels dead even when the handler is async (audio init,
   player boot, lazy modules).
--------------------------------------------------------------- */
function initPressFeedback() {
  const SEL = 'button, .btn, .realm, .song, .player-track';
  const flash = (el) => {
    if (!el) return;
    el.classList.remove('is-pressed');
    void el.offsetWidth;
    el.classList.add('is-pressed');
    clearTimeout(el._pressT);
    el._pressT = setTimeout(() => el.classList.remove('is-pressed'), 420);
  };
  // pointerdown fires immediately on touch and mouse — much sooner than click
  document.addEventListener('pointerdown', (e) => {
    const el = e.target.closest(SEL);
    if (el) flash(el);
  }, { passive: true });
  // keyboard activation (Space/Enter) has no pointerdown
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target.closest && e.target.closest(SEL);
    if (el) flash(el);
  }, { passive: true });
}

/* ---------------------------------------------------------------
   7-Star Secret Surprise (gift box)
--------------------------------------------------------------- */
function initGift() {
  const btn = $('#gift-btn');
  const reveal = $('#gift-reveal');
  const burst = $('#gift-burst');
  const hint = $('#gift-hint');
  if (!btn || !reveal) return;

  let opened = false;
  btn.addEventListener('click', () => {
    if (opened) return;
    opened = true;
    btn.classList.add('is-open');
    btn.setAttribute('aria-expanded', 'true');
    reveal.classList.add('is-open');
    if (hint) hint.textContent = '💜 Your secret letter is open';

    if (burst && !REDUCED) {
      burst.classList.remove('is-go');
      void burst.offsetWidth; // reflow so the animation restarts on repeat clicks
      burst.classList.add('is-go');
    }

    sound.chime('reveal');
    announce('The secret letter is now open.');
    toast('💜 7-star surprise unlocked!');

    setTimeout(() => {
      reveal.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'center' });
    }, REDUCED ? 0 : 620);
  });
}

function initStory() {
  const stage = $('#story-stage');
  if (!stage) return;
  loadStory();
  renderStory(false);

  // Existing CTAs — behaviour preserved exactly.
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
    // keep the wishing stars in sync with the site language
    try {
      if (window.__nishiWishes && typeof window.__nishiWishes.setLang === 'function') {
        window.__nishiWishes.setLang(bn ? 'bn' : 'en');
      }
    } catch { /* ignore */ }
  }

  // The quest portal has its own language toggle — keep this header toggle
  // in sync when it is used (guarded so it can never loop back on itself).
  document.addEventListener('nishi:quest-lang', (e) => {
    const bn = !!(e && e.detail && e.detail.lang === 'bn');
    if (bn !== banglaFirst) {
      banglaFirst = bn;
      try { localStorage.setItem('nishi-lang', bn ? 'bn' : 'en'); } catch { /* ignore */ }
      applyLang(bn);
    }
  });
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
    // Cycle the *selected mode* — cycling the resolved quality would collapse
    // the 'auto' step whenever it resolves to the current level (e.g. stuck on
    // 'low' on small/touch devices, where the switcher matters most).
    const i = QUALITIES.indexOf(world.qualityMode);
    const next = QUALITIES[(i + 1) % QUALITIES.length];
    world.qualityMode = next;
    world.applyQuality(next === 'auto' ? detectQuality() : next);
    toast(next === 'auto'
      ? `✦ Visual quality: auto (${world.quality})`
      : `✦ Visual quality: ${next}`);
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
   wishes — Purple Wishing Stars (Phase 6)
   Lazy-loaded. Wishes stay in localStorage only.
--------------------------------------------------------------- */
async function initWishes() {
  const mount = $('#wish-scene');
  if (!mount) return;
  try {
    const mod = await import('./wishes.js');
    if (typeof mod.initWishes !== 'function') return;
    let lang = 'en';
    try { lang = localStorage.getItem('nishi-lang') === 'bn' ? 'bn' : 'en'; } catch { /* ignore */ }
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const res = mod.initWishes(mount, { lang, reducedMotion });
    if (res && res.ok === false) {
      console.warn('[nishi] wishes unavailable:', res.reason);
      return;
    }
    window.__nishiWishes = mod;
  } catch (err) {
    console.warn('[nishi] wishes unavailable:', err && err.message);
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
  initPressFeedback();
  initGame();
  initGift();
  initStory();
  import('./player.js').then(m => {
    try { m.initPlayer(); } catch (e) { console.warn('[nishi] player unavailable:', e && e.message); }
  }).catch(() => { /* player is optional */ });
  initLang();
  initFabs();
  initPointer();
  initScrollCamera();
  initGyro();
  initResize();
  syncAudioUI();
  initQuest();
  initWishes();

  // 3D last — it must never block the page from becoming usable. When the
  // intro overlay is on screen, defer the render loop until it closes.
  const introNow = $('#intro');
  if (introNow && !introNow.classList.contains('is-hidden')) {
    document.addEventListener('nishi:intro-closed', startWorldOnce, { once: true });
  } else {
    startWorldOnce();
  }

  // Guard against accidental reload losing the intro state
  window.addEventListener('pagehide', () => {
    try { localStorage.setItem('nishi-intro-seen', '1'); } catch { /* ignore */ }
  });
}

function startAfterPinUnlock() {
  // Do not start audio, the 3D renderer, or interactive modules behind the lock.
  if (document.getElementById('pin-lock')) {
    document.addEventListener('nishi:pin-unlocked', boot, { once: true });
    return;
  }
  boot();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startAfterPinUnlock, { once: true });
} else {
  startAfterPinUnlock();
}

// Expose a tiny debug handle (no sensitive data) for manual QA.
window.__nishi = { world, sound, game, visited };
