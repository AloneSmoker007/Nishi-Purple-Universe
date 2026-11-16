/**
 * Nishi's Purple Universe — in-app music player.
 *
 * Plays the official BTS videos through YouTube's own embedded player, which
 * is the only legitimate way to present these tracks: this project must never
 * download, copy or re-host copyrighted music. The YouTube UI is hidden behind
 * a custom purple-glass player so it feels like part of the world.
 *
 * If the YouTube IFrame API cannot load (offline, blocked, corporate proxy),
 * the player degrades to the local WebAudio ambience so the room is never silent.
 */

const TRACKS = [
  { id: '7C2z4GqqS5E', title: 'Fake Love',   note: '💜' },
  { id: '0lapF4DQPKQ', title: 'Save Me',     note: '🌙' },
  { id: 'GZjt_sA2eso', title: 'Black Swan',  note: '🦢' },
  { id: 'mPVDGOVjRQ0', title: 'ON',          note: '⚡' },
  { id: 'MBdVXkSdhwU', title: 'DNA',         note: '🧬' },
  { id: 'tCX0oMf6XQY', title: 'FYA?',        note: '✨' },
];

const state = {
  ready: false,
  player: null,
  current: 0,
  playing: false,
  apiLoaded: false,
  apiFailed: false,
  fallback: false,
};

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

function announce(msg) {
  const lr = $('#live-region');
  if (lr) lr.textContent = msg;
}
function toast(msg) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('is-on');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('is-on'), 3000);
  announce(msg);
}

/* ---------------------------------------------------------------- *
 *  YouTube IFrame API loader (lazy — only when the room is opened)
 * ---------------------------------------------------------------- */
function loadYouTubeAPI() {
  return new Promise((resolve, reject) => {
    if (window.YT && window.YT.Player) return resolve(window.YT);
    if (state.apiFailed) return reject(new Error('yt-api-failed'));
    if (state.apiLoaded) {
      const t = setInterval(() => {
        if (window.YT && window.YT.Player) { clearInterval(t); resolve(window.YT); }
      }, 60);
      setTimeout(() => { clearInterval(t); reject(new Error('yt-api-timeout')); }, 9000);
      return;
    }
    state.apiLoaded = true;
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prev === 'function') prev();
      resolve(window.YT);
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    s.onerror = () => { state.apiFailed = true; reject(new Error('yt-api-script-error')); };
    document.head.appendChild(s);
    setTimeout(() => {
      if (!(window.YT && window.YT.Player)) { state.apiFailed = true; reject(new Error('yt-api-timeout')); }
    }, 9000);
  });
}

/* ---------------------------------------------------------------- *
 *  UI wiring
 * ---------------------------------------------------------------- */
function renderPlaylist() {
  const list = $('#player-list');
  if (!list) return;
  list.innerHTML = '';
  TRACKS.forEach((t, i) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'player-track' + (i === state.current ? ' is-current' : '');
    b.dataset.index = String(i);
    b.setAttribute('aria-pressed', String(i === state.current && state.playing));
    b.innerHTML =
      `<span class="pt-note" aria-hidden="true">${t.note}</span>` +
      `<span class="pt-body"><span class="pt-title">${t.title}</span>` +
      `<span class="pt-sub">BTS · official video</span></span>` +
      `<span class="pt-glyph" aria-hidden="true">${i === state.current && state.playing ? '❚❚' : '▶'}</span>`;
    li.appendChild(b);
    list.appendChild(li);
  });
}

function syncUI() {
  renderPlaylist();
  const t = TRACKS[state.current];
  const now = $('#player-now');
  if (now) now.textContent = t ? `${t.note} ${t.title}` : '—';
  const glyph = $('#player-toggle-glyph');
  if (glyph) glyph.textContent = state.playing ? '❚❚' : '▶';
  const toggle = $('#player-toggle');
  if (toggle) {
    toggle.setAttribute('aria-pressed', String(state.playing));
    toggle.setAttribute('aria-label', state.playing ? 'Pause' : 'Play');
  }
  const bar = $('#player-bar-fill');
  if (bar && state.player && typeof state.player.getDuration === 'function') {
    try {
      const d = state.player.getDuration() || 0;
      const c = state.player.getCurrentTime() || 0;
      bar.style.width = d ? `${Math.min(100, (c / d) * 100)}%` : '0%';
    } catch { /* player not ready */ }
  }
}

function setStatus(text) {
  const el = $('#player-status');
  if (el) el.textContent = text;
}

/* ---------------------------------------------------------------- *
 *  Playback
 * ---------------------------------------------------------------- */
async function ensurePlayer() {
  if (state.player) return state.player;
  const YT = await loadYouTubeAPI();
  return new Promise((resolve) => {
    state.player = new YT.Player('player-frame', {
      videoId: TRACKS[state.current].id,
      playerVars: {
        autoplay: 0, controls: 0, modestbranding: 1, rel: 0,
        playsinline: 1, iv_load_policy: 3, disablekb: 1,
      },
      events: {
        onReady: () => { state.ready = true; syncUI(); resolve(state.player); },
        onStateChange: (e) => {
          state.playing = e.data === 1 /* playing */;
          syncUI();
          if (e.data === 0 /* ended */) nextTrack(true);
        },
        onError: () => {
          setStatus('This video is unavailable right here.');
          nextTrack(true);
        },
      },
    });
  });
}

function startFallback(msg) {
  state.fallback = true;
  setStatus(msg || 'YouTube is unreachable — playing the local dreamy ambience instead.');
  toast('♫ Playing the dreamy ambience instead');
  document.dispatchEvent(new CustomEvent('nishi:audio-fallback'));
  syncUI();
}

async function play(index) {
  const i = ((index ?? state.current) + TRACKS.length) % TRACKS.length;
  state.current = i;
  syncUI();
  try {
    const p = await ensurePlayer();
    if (!p || typeof p.loadVideoById !== 'function') throw new Error('no-player');
    p.loadVideoById(TRACKS[i].id);
    p.playVideo();
    setStatus(`Now playing · ${TRACKS[i].title}`);
    state.playing = true;
    syncUI();
  } catch (err) {
    startFallback();
  }
}

function pause() {
  try {
    if (state.player && typeof state.player.pauseVideo === 'function') state.player.pauseVideo();
  } catch { /* ignore */ }
  state.playing = false;
  syncUI();
}

function toggle() {
  if (state.fallback) {
    document.dispatchEvent(new CustomEvent('nishi:audio-toggle'));
    return;
  }
  if (state.playing) pause();
  else play(state.current);
}

function nextTrack(auto) {
  play((state.current + 1) % TRACKS.length);
  if (!auto) announce(`Next track: ${TRACKS[state.current].title}`);
}
function prevTrack() {
  play((state.current - 1 + TRACKS.length) % TRACKS.length);
  announce(`Previous track: ${TRACKS[state.current].title}`);
}

/* ---------------------------------------------------------------- *
 *  Public
 * ---------------------------------------------------------------- */
export function initPlayer() {
  const room = $('#music-room');
  if (!room) return;

  renderPlaylist();
  syncUI();
  setStatus('Press play to start · official videos, streamed from YouTube');

  $('#player-toggle')?.addEventListener('click', () => toggle());
  $('#player-next')?.addEventListener('click', () => nextTrack(false));
  $('#player-prev')?.addEventListener('click', () => prevTrack());

  $('#player-list')?.addEventListener('click', (e) => {
    const b = e.target.closest('.player-track');
    if (!b) return;
    const i = Number(b.dataset.index);
    if (i === state.current && state.playing) { pause(); return; }
    play(i);
  });

  $('#player-open-yt')?.addEventListener('click', () => {
    const t = TRACKS[state.current];
    window.open(`https://www.youtube.com/watch?v=${t.id}`, '_blank', 'noopener,noreferrer');
  });

  // progress tick (cheap: one DOM write per second, only while playing)
  setInterval(() => { if (state.playing && !state.fallback) syncUI(); }, 1000);
}

export function getPlayerState() {
  return { current: state.current, playing: state.playing, fallback: state.fallback, tracks: TRACKS.length };
}
