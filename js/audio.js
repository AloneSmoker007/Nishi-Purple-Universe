/**
 * js/audio.js — "Nishi's Purple Universe" ambient sound engine.
 *
 * 100% WebAudio synthesis. NO audio files, NO network requests, NO copyrighted
 * material. Everything is built from oscillators, a generated pink-noise buffer,
 * biquad filters, LFOs and a feedback-delay "reverb".
 *
 * Public API (see js/CONTRACT.md):
 *   initAudio()      -> Promise<{ok:boolean, reason?:string}>
 *   startAmbience()  -> void   (MUST be called from a user gesture; never autoplays)
 *   stopAmbience()   -> void
 *   setVolume(v)     -> void   (0..1)
 *   setMuted(bool)   -> void
 *   chime(kind)      -> void   ('star' | 'portal' | 'chime' | 'reveal')
 *   isReady()        -> boolean
 *
 * Design: cinematic dreamcore — a quiet, slowly evolving pad chord, distant
 * wind, a sparse pentatonic sparkle layer and a very low sub drone, all glued
 * together by a damped feedback delay. Fades in ~2s, fades out ~1.5s, never a
 * hard cut.
 */

'use strict';

/* ------------------------------------------------------------------ *
 * Tunables
 * ------------------------------------------------------------------ */

// Ab major-ish dreamy chord: Ab3 + C4 + Eb4 + Bb4 (Abadd9). Slight detune
// gives the slow "breathing" beating between voices.
const PAD_VOICES = [
  { f: 207.65, type: 'triangle', detune: -6, g: 0.30 }, // Ab3
  { f: 261.63, type: 'sine', detune: 5, g: 0.26 }, // C4
  { f: 311.13, type: 'triangle', detune: 8, g: 0.21 }, // Eb4
  { f: 466.16, type: 'sine', detune: -4, g: 0.13 }, // Bb4
];

// Ab pentatonic pool for sparkle bells (Hz), two octaves.
const PENTA = [
  207.65, 233.08, 261.63, 311.13, 349.23,
  415.30, 466.16, 523.25, 622.25, 698.46,
  830.61, 932.33, 1046.50, 1244.51, 1396.91,
];

const FADE_IN_S = 2.0;
const FADE_OUT_S = 1.5;
const SPARKLE_MIN_MS = 6000;
const SPARKLE_SPAN_MS = 8000; // 6–14 s
const MIN_GAIN = 0.0001; // exponential-ramp floor (never 0)

/* ------------------------------------------------------------------ *
 * Module state (no globals leak beyond the documented exports)
 * ------------------------------------------------------------------ */

let ctx = null;
let initialized = false;
let initPromise = null;
let userActivated = false; // set on first real user gesture
let disposed = false;

/** ambience graph bookkeeping, null when nothing is running */
let layers = null;
let playing = false;
let stopping = false;
let stopTimer = 0;
let sparkleTimer = 0;

let userVolume = 0.7;
let muted = false;

/* persistent nodes (built once per context) */
let master = null; // user volume + mute
let ambienceBus = null;
let ambienceFade = null; // start/stop fade
let chimeBus = null;
let delayIn = null;
let delayNode = null;
let fbGain = null;
let damp = null;
let wetGain = null;
let noiseBuffer = null;

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function _now() {
  return ctx ? ctx.currentTime : 0;
}

function _safe(fn) {
  try {
    fn();
  } catch (_) {
    /* never throw uncaught */
  }
}

/** True if the page has ever seen a user gesture (native API or our listener). */
function _isUserActivated() {
  if (userActivated) return true;
  try {
    const ua = globalThis.navigator && globalThis.navigator.userActivation;
    if (ua) return ua.hasBeenActive === true || ua.isActive === true;
    return false; // API present but never activated
  } catch (_) {
    return userActivated;
  }
}

/** Can we positively detect user activation? (if not, let the browser decide) */
function _activationDetectable() {
  try {
    return !!(globalThis.navigator && 'userActivation' in globalThis.navigator);
  } catch (_) {
    return false;
  }
}

/** Click-free gain ramp. */
function _ramp(param, target, seconds) {
  if (!ctx || !param) return;
  const t = _now();
  _safe(() => {
    param.cancelScheduledValues(t);
    param.setValueAtTime(Math.max(param.value, MIN_GAIN), t);
    param.linearRampToValueAtTime(Math.max(target, MIN_GAIN), t + Math.max(seconds, 0.01));
  });
}

/** Click-free gain glide (exponential-ish). */
function _glide(param, target, tau) {
  if (!ctx || !param) return;
  const t = _now();
  _safe(() => {
    param.cancelScheduledValues(t);
    param.setValueAtTime(Math.max(param.value, MIN_GAIN), t);
    param.setTargetAtTime(Math.max(target, MIN_GAIN), t, Math.max(tau, 0.005));
  });
}

function _fadeAmbience(target, seconds) {
  _ramp(ambienceFade && ambienceFade.gain, target, seconds);
}

/* ------------------------------------------------------------------ *
 * One-shot voices
 * ------------------------------------------------------------------ */

/**
 * Soft bell / tone: sine fundamental + quiet partial, fast attack,
 * exponential decay, optional stereo pan. Auto-disconnects on end.
 */
function _tone(freq, when, dur, peak, pan, dest, type) {
  if (!ctx || ctx.state === 'closed' || !dest) return;
  _safe(() => {
    const t = Math.max(when, _now());
    const g = ctx.createGain();
    const o = ctx.createOscillator();
    o.type = type || 'sine';
    o.frequency.value = freq;

    const p2 = ctx.createGain();
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = freq * 2.01; // bell-ish partial

    let panner = null;
    if (typeof ctx.createStereoPanner === 'function') {
      panner = ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan || 0));
    }

    g.gain.setValueAtTime(MIN_GAIN, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.012);
    g.gain.exponentialRampToValueAtTime(MIN_GAIN, t + dur);

    p2.gain.setValueAtTime(MIN_GAIN, t);
    p2.gain.linearRampToValueAtTime(peak * 0.28, t + 0.008);
    p2.gain.exponentialRampToValueAtTime(MIN_GAIN, t + dur * 0.45);

    o.connect(g);
    o2.connect(p2);
    p2.connect(g);
    if (panner) {
      g.connect(panner);
      panner.connect(dest);
    } else {
      g.connect(dest);
    }

    const stopAt = t + dur + 0.08;
    o.start(t);
    o2.start(t);
    o.stop(stopAt);
    o2.stop(stopAt);
    o.onended = () => {
      _safe(() => {
        o.disconnect();
        o2.disconnect();
        p2.disconnect();
        g.disconnect();
        if (panner) panner.disconnect();
      });
    };
  });
}

/** Low cinematic swell: slow attack, slow release, tiny detune beating. */
function _swell(freq, when, dur, peak, dest) {
  if (!ctx || ctx.state === 'closed' || !dest) return;
  _safe(() => {
    const t = Math.max(when, _now());
    const g = ctx.createGain();
    const o1 = ctx.createOscillator();
    o1.type = 'sine';
    o1.frequency.value = freq;
    const o2 = ctx.createOscillator();
    o2.type = 'triangle';
    o2.frequency.value = freq * 1.005;

    const attack = dur * 0.45;
    g.gain.setValueAtTime(MIN_GAIN, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(MIN_GAIN, t + dur);

    o1.connect(g);
    const sub = ctx.createGain();
    sub.gain.value = 0.35;
    o2.connect(sub);
    sub.connect(g);
    g.connect(dest);

    o1.start(t);
    o2.start(t);
    o1.stop(t + dur + 0.1);
    o2.stop(t + dur + 0.1);
    o1.onended = () => {
      _safe(() => {
        o1.disconnect();
        o2.disconnect();
        sub.disconnect();
        g.disconnect();
      });
    };
  });
}

/** Rising shimmer: pink noise through a resonant bandpass sweeping upward. */
function _shimmer(when, f0, f1, dur, peak, dest) {
  if (!ctx || ctx.state === 'closed' || !dest || !noiseBuffer) return;
  _safe(() => {
    const t = Math.max(when, _now());
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 7;
    bp.frequency.setValueAtTime(Math.max(f0, 20), t);
    bp.frequency.exponentialRampToValueAtTime(Math.max(f1, 40), t + dur);

    const g = ctx.createGain();
    g.gain.setValueAtTime(MIN_GAIN, t);
    g.gain.linearRampToValueAtTime(peak, t + dur * 0.35);
    g.gain.exponentialRampToValueAtTime(MIN_GAIN, t + dur);

    src.connect(bp);
    bp.connect(g);
    g.connect(dest);

    src.start(t);
    src.stop(t + dur + 0.1);
    src.onended = () => {
      _safe(() => {
        src.disconnect();
        bp.disconnect();
        g.disconnect();
      });
    };
  });
}

/* ------------------------------------------------------------------ *
 * Ambience layers
 * ------------------------------------------------------------------ */

function _newLayerSet() {
  return { oscs: [], srcs: [], nodes: [] };
}

/** Warm pad: detuned chord through a slowly breathing lowpass. */
function _buildPad() {
  const t = _now();
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 560;
  filter.Q.value = 0.8;

  // slow LFO on cutoff
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 0.045;
  const lfoAmt = ctx.createGain();
  lfoAmt.gain.value = 230;
  lfo.connect(lfoAmt);
  lfoAmt.connect(filter.frequency);
  lfo.start(t);

  filter.connect(ambienceBus);
  layers.nodes.push(filter, lfoAmt);
  layers.oscs.push(lfo);

  for (const v of PAD_VOICES) {
    const o = ctx.createOscillator();
    o.type = v.type;
    o.frequency.value = v.f;
    o.detune.value = v.detune;
    const g = ctx.createGain();
    g.gain.value = v.g;
    o.connect(g);
    g.connect(filter);
    o.start(t);
    layers.oscs.push(o);
    layers.nodes.push(g);
  }
}

/** Distant wind: pink noise through a slowly swept bandpass + gentle AM. */
function _buildAir() {
  const t = _now();
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  src.loop = true;

  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 640;
  bp.Q.value = 0.7;

  const g = ctx.createGain();
  g.gain.value = 0.05;

  // slow bandpass sweep (wind gusting)
  const sweep = ctx.createOscillator();
  sweep.type = 'sine';
  sweep.frequency.value = 0.031;
  const sweepAmt = ctx.createGain();
  sweepAmt.gain.value = 380;
  sweep.connect(sweepAmt);
  sweepAmt.connect(bp.frequency);

  // gentle amplitude breathing
  const am = ctx.createOscillator();
  am.type = 'sine';
  am.frequency.value = 0.075;
  const amAmt = ctx.createGain();
  amAmt.gain.value = 0.02;
  am.connect(amAmt);
  amAmt.connect(g.gain);

  src.connect(bp);
  bp.connect(g);
  g.connect(ambienceBus);

  src.start(t);
  sweep.start(t);
  am.start(t);

  layers.srcs.push(src);
  layers.oscs.push(sweep, am);
  layers.nodes.push(bp, g, sweepAmt, amAmt);
}

/** Sub drone: two very low detuned sines with a slow amplitude drift. */
function _buildSub() {
  const t = _now();
  const g = ctx.createGain();
  g.gain.value = 0.05;

  const o1 = ctx.createOscillator();
  o1.type = 'sine';
  o1.frequency.value = 55.0; // A1
  const o2 = ctx.createOscillator();
  o2.type = 'sine';
  o2.frequency.value = 55.6; // slow beating

  const drift = ctx.createOscillator();
  drift.type = 'sine';
  drift.frequency.value = 0.02;
  const driftAmt = ctx.createGain();
  driftAmt.gain.value = 0.015;
  drift.connect(driftAmt);
  driftAmt.connect(g.gain);

  o1.connect(g);
  o2.connect(g);
  g.connect(ambienceBus);

  o1.start(t);
  o2.start(t);
  drift.start(t);

  layers.oscs.push(o1, o2, drift);
  layers.nodes.push(g, driftAmt);
}

/** Occasional soft bell, random pentatonic pitch + random stereo pan. */
function _sparkleNote() {
  const f = PENTA[Math.floor(Math.random() * PENTA.length)];
  const oct = Math.random() < 0.35 ? 2 : 1;
  const pan = Math.random() * 1.4 - 0.7;
  _tone(f * oct, _now() + 0.02, 2.4, 0.045, pan, ambienceBus, 'sine');
}

function _scheduleSparkle() {
  if (sparkleTimer) {
    clearTimeout(sparkleTimer);
    sparkleTimer = 0;
  }
  if (!playing || !layers) return;
  const delay = SPARKLE_MIN_MS + Math.random() * SPARKLE_SPAN_MS;
  sparkleTimer = setTimeout(() => {
    sparkleTimer = 0;
    if (!playing || !layers) return;
    _sparkleNote();
    _scheduleSparkle();
  }, delay);
}

function _startLayers() {
  if (!ctx || ctx.state === 'closed') return;

  if (layers) {
    // idempotent: already built — just make sure we are fading up, never stack
    if (stopping) {
      stopping = false;
      if (stopTimer) {
        clearTimeout(stopTimer);
        stopTimer = 0;
      }
    }
    playing = true;
    _fadeAmbience(1, FADE_IN_S);
    _scheduleSparkle();
    return;
  }

  layers = _newLayerSet();
  _buildPad();
  _buildAir();
  _buildSub();
  playing = true;
  _fadeAmbience(1, FADE_IN_S);
  _scheduleSparkle();
}

/** Stop + disconnect every ambience node. Keeps the context alive for chimes. */
function _teardownLayers() {
  playing = false;
  stopping = false;
  if (sparkleTimer) {
    clearTimeout(sparkleTimer);
    sparkleTimer = 0;
  }
  const set = layers;
  layers = null;
  if (!set) return;
  for (const o of set.oscs) _safe(() => o.stop());
  for (const s of set.srcs) _safe(() => s.stop());
  for (const n of set.nodes) _safe(() => n.disconnect());
}

/* ------------------------------------------------------------------ *
 * Master graph
 * ------------------------------------------------------------------ */

function _buildMasterGraph() {
  const t = _now();

  master = ctx.createGain();
  master.gain.setValueAtTime(muted ? MIN_GAIN : userVolume, t);
  master.connect(ctx.destination);

  ambienceBus = ctx.createGain();
  ambienceBus.gain.value = 1;
  ambienceFade = ctx.createGain();
  ambienceFade.gain.setValueAtTime(MIN_GAIN, t);
  ambienceBus.connect(ambienceFade);
  ambienceFade.connect(master);

  chimeBus = ctx.createGain();
  chimeBus.gain.value = 0.9;
  chimeBus.connect(master);

  // damped feedback delay ≈ cheap reverb
  delayIn = ctx.createGain();
  delayNode = ctx.createDelay(1.5);
  delayNode.delayTime.value = 0.42;
  damp = ctx.createBiquadFilter();
  damp.type = 'lowpass';
  damp.frequency.value = 2200;
  fbGain = ctx.createGain();
  fbGain.gain.value = 0.38;
  wetGain = ctx.createGain();
  wetGain.gain.value = 0.32;

  delayIn.connect(delayNode);
  delayNode.connect(damp);
  damp.connect(fbGain);
  fbGain.connect(delayNode);
  damp.connect(wetGain);
  wetGain.connect(master);

  ambienceBus.connect(delayIn);
  chimeBus.connect(delayIn);
}

function _makeNoiseBuffer() {
  const len = Math.floor(ctx.sampleRate * 3);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  // Paul Kellet pink-noise approximation — softer than white noise
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;
    const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
    b6 = white * 0.115926;
    d[i] = pink * 0.11;
  }
  noiseBuffer = buf;
}

/** First user gesture: mark activation and unlock the context. */
function _armGestureWatch() {
  const g = globalThis;
  if (typeof g.addEventListener !== 'function') {
    userActivated = true; // non-DOM env — nothing to guard against here
    return;
  }
  const evts = ['pointerdown', 'touchstart', 'mousedown', 'keydown', 'click'];
  const onGesture = () => {
    userActivated = true;
    for (const e of evts) {
      try {
        g.removeEventListener(e, onGesture, true);
      } catch (_) { /* noop */ }
    }
    if (ctx && ctx.state === 'suspended') {
      _safe(() => {
        const p = ctx.resume();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      });
    }
  };
  for (const e of evts) {
    try {
      g.addEventListener(e, onGesture, true);
    } catch (_) { /* noop */ }
  }
}

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

/**
 * Create the AudioContext + master graph. Safe to call repeatedly.
 * MUST be called from a user gesture. The context is created suspended
 * (browsers do this automatically) and only ever resumed by startAmbience()
 * or a gesture — this module NEVER autoplays.
 */
export function initAudio() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    try {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (typeof AC !== 'function') {
        return { ok: false, reason: 'WebAudio is not supported in this browser' };
      }
      ctx = new AC({ latencyHint: 'interactive' });
      disposed = false;
      _buildMasterGraph();
      _makeNoiseBuffer();
      _armGestureWatch();
      initialized = true;
      // Never auto-resume here: no sound until a gesture + startAmbience().
      return { ok: true };
    } catch (err) {
      ctx = null;
      initialized = false;
      return {
        ok: false,
        reason: 'AudioContext failed: ' + (err && err.message ? err.message : String(err)),
      };
    }
  })();
  return initPromise;
}

/**
 * Start (or fade back in) the ambience. Must be user-initiated.
 * Idempotent: repeated calls never stack oscillators or re-ramp volume.
 * If the context cannot be resumed (autoplay blocked), returns gracefully.
 */
export function startAmbience() {
  if (!initialized || disposed || !ctx || ctx.state === 'closed') return;

  // Never autoplay: require evidence of a user gesture before making noise,
  // unless the context is already running (i.e. the platform already allowed it).
  if (ctx.state !== 'running' && _activationDetectable() && !_isUserActivated()) {
    return; // silent no-op until the user actually interacts
  }

  if (ctx.state === 'running') {
    _startLayers();
    return;
  }

  // suspended -> try to resume (only succeeds from a gesture / allowed policy)
  _safe(() => {
    const p = ctx.resume();
    if (p && typeof p.then === 'function') {
      p.then(() => {
        if (ctx && ctx.state === 'running') _startLayers();
        // else: still blocked — graceful no-op, never throw
      }).catch(() => { /* graceful */ });
    }
  });
}

/** Fade out (~1.5s) then stop + disconnect every ambience node. Idempotent. */
export function stopAmbience() {
  if (stopping) return;
  if (!layers) {
    playing = false;
    if (sparkleTimer) {
      clearTimeout(sparkleTimer);
      sparkleTimer = 0;
    }
    return;
  }
  stopping = true;
  playing = false;
  if (sparkleTimer) {
    clearTimeout(sparkleTimer);
    sparkleTimer = 0;
  }
  _fadeAmbience(MIN_GAIN, FADE_OUT_S);
  stopTimer = setTimeout(() => {
    stopTimer = 0;
    _teardownLayers();
  }, (FADE_OUT_S + 0.15) * 1000);
}

/** Master volume 0..1 (clamped). Click-free. No-op while muted (restored on unmute). */
export function setVolume(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return;
  userVolume = Math.min(1, Math.max(0, n));
  if (!muted) _glide(master && master.gain, userVolume, 0.05);
}

/** Mute = master gain 0 (graph preserved); unmute restores the previous volume. */
export function setMuted(m) {
  muted = !!m;
  _glide(master && master.gain, muted ? MIN_GAIN : userVolume, 0.06);
}

/**
 * Short musical gesture. Each kind is a different synthesised figure:
 *   'star'   — bright high arpeggio (3 quick notes)
 *   'portal' — low swell + rising shimmer
 *   'chime'  — single soft bell
 *   'reveal' — ascending 4-note flourish + shimmer
 */
export function chime(kind) {
  if (!ctx || disposed || ctx.state !== 'running') return;
  const t = _now() + 0.03;
  switch (kind) {
    case 'star': {
      const notes = [1046.50, 1244.51, 1567.98]; // C6, Eb6, G6
      notes.forEach((f, i) => {
        _tone(f, t + i * 0.085, 0.75, 0.09, 0.15 + i * 0.18, chimeBus, 'triangle');
      });
      break;
    }
    case 'portal': {
      _swell(73.42, t, 1.7, 0.16, chimeBus); // D2 low swell
      _shimmer(t + 0.15, 320, 1600, 1.35, 0.05, chimeBus);
      break;
    }
    case 'chime': {
      _tone(830.61, t, 1.9, 0.09, -0.2, chimeBus, 'sine'); // Ab5 soft bell
      _tone(1661.22, t, 1.1, 0.026, -0.2, chimeBus, 'sine'); // partial
      break;
    }
    case 'reveal': {
      const notes = [415.30, 523.25, 622.25, 830.61]; // Ab4 C5 Eb5 Ab5
      notes.forEach((f, i) => {
        _tone(f, t + i * 0.075, 1.15, 0.085, -0.3 + i * 0.2, chimeBus, 'triangle');
      });
      _shimmer(t + 0.32, 600, 2400, 1.45, 0.045, chimeBus);
      break;
    }
    default:
      break; // unknown kind: graceful no-op
  }
}

/**
 * True when the engine is initialised and the AudioContext is running
 * (i.e. sound can actually be produced right now).
 */
export function isReady() {
  return !!(initialized && !disposed && ctx && ctx.state === 'running');
}
