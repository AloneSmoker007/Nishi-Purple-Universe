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
  ambience: null,
  localAudio: null,
  localUrls: new Set(),
  activeSource: 'youtube',
  requestId: 0,
  initialized: false,
  progressTimer: 0,
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
  list.replaceChildren();
  TRACKS.forEach((track, i) => {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'player-track' + (i === state.current ? ' is-current' : '');
    button.dataset.index = String(i);
    button.setAttribute('aria-pressed', String(i === state.current && state.playing));
    const note = document.createElement('span');
    note.className = 'pt-note'; note.setAttribute('aria-hidden', 'true'); note.textContent = track.note || '♫';
    const body = document.createElement('span'); body.className = 'pt-body';
    const title = document.createElement('span'); title.className = 'pt-title'; title.textContent = track.title;
    const sub = document.createElement('span'); sub.className = 'pt-sub';
    sub.textContent = track.localUrl ? 'Your device · local audio' : 'BTS · official video';
    const glyph = document.createElement('span'); glyph.className = 'pt-glyph';
    glyph.setAttribute('aria-hidden', 'true'); glyph.textContent = i === state.current && state.playing ? '❚❚' : '▶';
    body.append(title, sub); button.append(note, body, glyph); li.appendChild(button); list.appendChild(li);
  });
}

function syncProgressTimer() {
  const shouldRun = state.playing && !state.fallback &&
    state.activeSource === 'youtube' && !document.hidden;
  if (shouldRun && !state.progressTimer) {
    state.progressTimer = window.setInterval(() => {
      if (state.playing && !state.fallback && state.activeSource === 'youtube') syncUI();
    }, 1000);
  } else if (!shouldRun && state.progressTimer) {
    clearInterval(state.progressTimer);
    state.progressTimer = 0;
  }
}

function syncUI() {
  renderPlaylist();
  const t = TRACKS[state.current];
  const now = $('#player-now');
  if (now) now.textContent = t ? `${t.note} ${t.title}` : '—';
  const glyph = $('#player-toggle-glyph');
  if (glyph) glyph.textContent = state.playing ? '❚❚' : '▶';
  const toggle = $('#player-toggle');
  const open = $('#player-open-yt');
  if (open) open.disabled = !t || !!t.localUrl;
  if (toggle) {
    toggle.setAttribute('aria-pressed', String(state.playing));
    toggle.setAttribute('aria-label', state.playing ? 'Pause' : 'Play');
  }
  const bar = $('#player-bar-fill');
  if (bar) {
    try {
      const local = TRACKS[state.current] && TRACKS[state.current].localUrl && state.localAudio;
      const d = local ? (state.localAudio.duration || 0) : (state.player && state.player.getDuration ? state.player.getDuration() || 0 : 0);
      const c = local ? (state.localAudio.currentTime || 0) : (state.player && state.player.getCurrentTime ? state.player.getCurrentTime() || 0 : 0);
      bar.style.width = d ? `${Math.min(100, (c / d) * 100)}%` : '0%';
    } catch { /* player not ready */ }
  }
  syncProgressTimer();
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
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) { settled = true; reject(new Error('YouTube player initialisation timed out')); }
    }, 12000);
    const finish = (error) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      if (error) reject(error); else resolve(state.player);
    };
    try {
      state.player = new YT.Player('player-frame', {
        videoId: TRACKS[state.current].id,
        playerVars: { autoplay: 0, controls: 0, modestbranding: 1, rel: 0, playsinline: 1, iv_load_policy: 3, disablekb: 1 },
        events: {
          onReady: () => { state.ready = true; syncUI(); finish(); },
          onStateChange: (event) => {
            if (state.activeSource !== 'youtube') return;
            state.playing = event.data === 1;
            syncUI();
            if (event.data === 0) nextTrack(true);
          },
          onError: () => {
            state.player = null; state.ready = false;
            finish(new Error('YouTube video is unavailable'));
            if (state.activeSource === 'youtube') startFallback('This video is unavailable. Ambient sound or your own MP3 is ready.', state.requestId);
          },
        },
      });
    } catch (error) { finish(error); }
  }).catch((error) => { state.player = null; state.ready = false; throw error; });
}

async function startFallback(msg, requestId = state.requestId) {
  if (requestId !== state.requestId || state.activeSource !== 'youtube') return;
  state.activeSource = 'ambient';
  state.fallback = true;
  setStatus(msg || 'YouTube is unavailable. Ambient sound or your own MP3 is ready.');
  try {
    if (!state.ambience) {
      const mod = await import('./audio.js');
      const result = await mod.initAudio();
      if (!result || !result.ok) throw new Error(result && result.reason || 'Ambient audio unavailable');
      state.ambience = mod;
    }
    if (requestId !== state.requestId || state.activeSource !== 'ambient') return;
    state.ambience.startAmbience();
    state.playing = true;
    setStatus('Dreamy purple ambience is ready · choose an MP3 for your own music');
  } catch (err) {
    if (requestId !== state.requestId || state.activeSource !== 'ambient') return;
    state.playing = false;
    setStatus('YouTube is unavailable. You can still add an MP3 from your device.');
    console.warn('[nishi] ambient fallback unavailable:', err && err.message);
  }
  syncUI();
}

async function play(index) {
  const i = ((index ?? state.current) + TRACKS.length) % TRACKS.length;
  const requestId = ++state.requestId;
  state.current = i;
  const selected = TRACKS[i];
  state.activeSource = selected.localUrl ? 'local' : 'youtube';
  state.fallback = false;

  // Stop every other source before starting the selected one.
  if (state.player && typeof state.player.pauseVideo === 'function') {
    try { state.player.pauseVideo(); } catch { /* player may not be ready */ }
  }
  if (state.localAudio) {
    state.localAudio.pause();
    state.localAudio.removeAttribute('src');
    state.localAudio.load();
  }
  if (state.ambience) state.ambience.stopAmbience();

  $('#music-room')?.classList.toggle('is-local', !!selected.localUrl);
  state.playing = false;
  syncUI();

  if (selected.localUrl) {
    try {
      if (!state.localAudio) throw new Error('Local audio is not initialized');
      state.localAudio.src = selected.localUrl;
      await state.localAudio.play();
      if (requestId !== state.requestId || state.activeSource !== 'local') {
        state.localAudio.pause();
        return;
      }
      state.playing = true;
      setStatus('Playing from your device · ' + selected.title);
      syncUI();
    } catch (err) {
      if (requestId !== state.requestId) return;
      state.playing = false;
      setStatus('Could not play this audio file. Try another MP3.');
      toast('This audio file could not be played.');
      syncUI();
    }
    return;
  }

  try {
    const p = await ensurePlayer();
    if (requestId !== state.requestId || state.activeSource !== 'youtube') return;
    if (!p || typeof p.loadVideoById !== 'function') throw new Error('no-player');
    p.loadVideoById(selected.id);
    p.playVideo();
    state.playing = true;
    setStatus('Now playing · ' + selected.title);
    syncUI();
  } catch (err) {
    if (requestId === state.requestId && state.activeSource === 'youtube') {
      await startFallback('YouTube is unavailable. Ambient sound or your own MP3 is ready.', requestId);
    }
  }
}

function pause() {
  ++state.requestId;
  try {
    if (state.activeSource === 'local' && state.localAudio) state.localAudio.pause();
    if (state.activeSource === 'youtube' && state.player && typeof state.player.pauseVideo === 'function') state.player.pauseVideo();
    if (state.fallback && state.ambience) state.ambience.stopAmbience();
  } catch { /* ignore */ }
  state.playing = false;
  syncUI();
}

function toggle() {
  if (state.fallback && state.activeSource === 'ambient') {
    if (state.playing) { state.ambience && state.ambience.stopAmbience(); state.playing = false; }
    else { state.ambience && state.ambience.startAmbience(); state.playing = true; }
    syncUI();
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
  if (!room || state.initialized) return;
  state.initialized = true;
  state.localAudio = new Audio();
  state.localAudio.preload = 'none';
  state.localAudio.addEventListener('ended', () => { if (state.activeSource === 'local') nextTrack(true); });
  state.localAudio.addEventListener('timeupdate', syncUI);
  state.localAudio.addEventListener('play', () => { if (state.activeSource === 'local') { state.playing = true; syncUI(); } });
  state.localAudio.addEventListener('pause', () => { if (state.activeSource === 'local') { state.playing = false; syncUI(); } });

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

  const localInput = $('#player-local-files');
  $('#player-add-local')?.addEventListener('click', (event) => {
    // Keep the native file picker directly inside the user's tap/click gesture (Android/iOS browsers require this).
    if (localInput) localInput.click();
  });
  localInput?.addEventListener('change', () => {
    const selected = Array.from(localInput.files || []);
    const accepted = selected.filter(file => /\.mp3$/i.test(file.name) || ['audio/mpeg', 'audio/mp3', 'audio/x-mpeg'].includes((file.type || '').toLowerCase()));
    const valid = accepted.filter(file => file.size > 0 && file.size <= 20 * 1024 * 1024);
    const remaining = Math.max(0, 10 - state.localUrls.size);
    const files = valid.slice(0, remaining);
    if (selected.length !== accepted.length) toast('Only MP3 files are supported.');
    if (accepted.length !== valid.length) toast('Each MP3 must be under 20 MB.');
    if (valid.length > remaining) toast('You can add up to 10 local tracks.');
    if (!files.length) { localInput.value = ''; return; }
    files.forEach(file => {
      const url = URL.createObjectURL(file);
      state.localUrls.add(url);
      TRACKS.push({ id: null, title: file.name.replace(/\.[^.]+$/, '') || 'My MP3', note: '♫', localUrl: url });
    });
    renderPlaylist();
    setStatus(files.length + ' local MP3 track(s) added · files stay on this device');
    toast(files.length + ' local MP3 track(s) added');
    localInput.value = '';
  });
  document.addEventListener('visibilitychange', syncUI);
  window.addEventListener('pagehide', () => {
    if (state.progressTimer) {
      clearInterval(state.progressTimer);
      state.progressTimer = 0;
    }
  });
  window.addEventListener('pageshow', syncUI);
  window.addEventListener('beforeunload', () => {
    if (state.progressTimer) clearInterval(state.progressTimer);
    state.progressTimer = 0;
    if (state.localAudio) { state.localAudio.pause(); state.localAudio.removeAttribute('src'); }
    state.localUrls.forEach(url => URL.revokeObjectURL(url));
  }, { once: true });
}

export function getPlayerState() {
  return { current: state.current, playing: state.playing, fallback: state.fallback, tracks: TRACKS.length };
}
