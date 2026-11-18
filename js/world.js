/**
 * js/world.js — Nishi's Purple Universe — cinematic 3D fantasy world.
 * Three.js r169 (vendored at ../vendor/three.module.min.js).
 *
 * 100% procedural: every shape, texture and effect is generated at runtime with
 * geometry, shaders or canvas-drawn textures. No external files, no network
 * requests, no copyrighted assets, no human faces.
 *
 * Public API (see js/CONTRACT.md):
 *   initWorld(canvas, opts) -> { ok, reason? }
 *   startIntro(skip?)       -> Promise        (cinematic fly-in; startIntro(true) skips instantly)
 *   setDestination(name)                      ('portal'|'ot7'|'music'|'busan'|
 *                                              'quest'|'violet'|'road'|'promise')
 *   setQuality(level)                         ('high'|'medium'|'low')
 *   onPointerMove(x, y)                       (normalised -1..1, damped parallax)
 *   onScroll(progress)                        (0..1 -> camera spline through the world)
 *   resize()
 *   setReducedMotion(bool)
 *   dispose()
 */

import * as THREE from '../vendor/three.module.min.js';

/* ------------------------------------------------------------------ *
 *  Design tokens — exact values from js/CONTRACT.md
 * ------------------------------------------------------------------ */
const TOKENS = {
  inkAbyss: 0x0b0420,
  inkDeep: 0x1a0b3b,
  purpleCore: 0x7b2cbf,
  purpleGlow: 0xc77dff,
  gold: 0xffd700,
  goldWarm: 0xf0e130,
  pink: 0xff69b4,
  pinkWarm: 0xe87a5d,
  violetDeep: 0x4b0082,
  mist: 0x2d1b3d,
  paper: 0xffffff,
};

/** sRGB hex -> Vector3 with raw 0..1 channels (for hand-written shaders that
 *  output directly to the canvas without a colour-space include). */
function srgb(hex) {
  return new THREE.Vector3(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);
}

/* ------------------------------------------------------------------ *
 *  Small math helpers
 * ------------------------------------------------------------------ */
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;
const easeCubicInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function hash2(x, y) {
  let n = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177) | 0;
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function valueNoise2(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm2(x, y, oct) {
  let v = 0;
  let a = 0.5;
  let f = 1;
  for (let i = 0; i < (oct || 4); i++) {
    v += a * valueNoise2(x * f, y * f);
    f *= 2.07;
    a *= 0.55;
  }
  return v;
}

function ridgedFbm2(x, y, oct) {
  let v = 0;
  let a = 0.55;
  let f = 1;
  for (let i = 0; i < (oct || 4); i++) {
    v += a * (1 - Math.abs(2 * valueNoise2(x * f, y * f) - 1));
    f *= 2.11;
    a *= 0.52;
  }
  return v;
}

/* ------------------------------------------------------------------ *
 *  Module state
 * ------------------------------------------------------------------ */
const state = {
  ready: false,
  disposed: false,
  ctxLost: false,
  ctxRecoveryPending: false,
  quality: 'high',
  isMobile: false,
  reducedMotion: false,
  time: 0,
  canvas: null,
  renderer: null,
  scene: null,
  camera: null,
  clock: null,
  tweens: [],
  timedUniforms: [],
  textures: [],
  disposables: [],
  intro: null, // { resolve }
  cameraMode: 'idle', // 'intro' | 'spline' | 'preset' | 'idle'
  camPos: new THREE.Vector3(0, 26, 420),
  camLook: new THREE.Vector3(0, 70, -260),
  camFov: 62,
  parTarget: new THREE.Vector2(0, 0),
  par: new THREE.Vector2(0, 0),
  scrollTarget: 0,
  scrollCur: 0,
  // scene refs used by the animation loop
  moon: null,
  moonHalo: null,
  stars: null,
  fireflies: null,
  petals: null,
  petalData: null,
  butterflies: [],
  clouds: [],
  waterfalls: [],
  composer: null,
  contextHandlers: null,
  bloomStrength: 0.45,
  vignetteAmount: 0.42,
  chromaticAmount: 0.0012,
  shooters: [],
  shooterTimer: 3.5,
  windowMat: null,
  dirLight: null,
  rainbowGroup: null,
};

/* ------------------------------------------------------------------ *
 *  Canvas-generated textures
 * ------------------------------------------------------------------ */
function trackTexture(tex) {
  state.textures.push(tex);
  return tex;
}

function makeGlowTexture(size, inner, mid, outer) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.35, mid);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return trackTexture(new THREE.CanvasTexture(c));
}

function makeStreakTexture() {
  const w = 128;
  const h = 32;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.55, 'rgba(199,125,255,0.55)');
  g.addColorStop(0.88, 'rgba(255,255,255,0.95)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  return trackTexture(new THREE.CanvasTexture(c));
}

function makeCloudTexture() {
  const w = 256;
  const h = 128;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const rng = makeRng(77);
  for (let i = 0; i < 12; i++) {
    const x = w * (0.15 + rng() * 0.7);
    const y = h * (0.3 + rng() * 0.4);
    const r = 18 + rng() * 42;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.16)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  return trackTexture(new THREE.CanvasTexture(c));
}

function makePetalTexture() {
  const s = 64;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  ctx.translate(s / 2, s / 2);
  ctx.rotate(0.6);
  const g = ctx.createRadialGradient(0, -6, 2, 0, 0, 26);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.45, 'rgba(255,105,180,0.8)');
  g.addColorStop(1, 'rgba(255,105,180,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 0, 12, 22, 0, 0, Math.PI * 2);
  ctx.fill();
  return trackTexture(new THREE.CanvasTexture(c));
}

function makeWingTexture(base, accent) {
  const s = 128;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, s, s);
  g.addColorStop(0, base);
  g.addColorStop(1, accent);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  for (let i = 0; i < 10; i++) {
    const r = makeRng(i * 97 + 13);
    ctx.beginPath();
    ctx.arc(r() * s, r() * s, 3 + r() * 8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(11,4,32,0.55)';
  ctx.fillRect(0, 0, s * 0.12, s);
  return trackTexture(new THREE.CanvasTexture(c));
}

function makeRibbonTexture() {
  const w = 64;
  const h = 256;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, 'rgba(255,215,0,0)');
  g.addColorStop(0.16, 'rgba(255,215,0,0.55)');
  g.addColorStop(0.5, 'rgba(255,105,180,0.5)');
  g.addColorStop(0.84, 'rgba(255,215,0,0.55)');
  g.addColorStop(1, 'rgba(255,215,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const rng = makeRng(21);
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.08 + rng() * 0.25})`;
    ctx.fillRect(rng() * w, rng() * h, 2, 6 + rng() * 18);
  }
  return trackTexture(new THREE.CanvasTexture(c));
}

function makeFallSheetTexture() {
  const w = 64;
  const h = 512;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(220,195,255,0.0)');
  g.addColorStop(0.06, 'rgba(230,210,255,0.75)');
  g.addColorStop(0.35, 'rgba(240,225,255,0.88)');
  g.addColorStop(0.65, 'rgba(220,195,255,0.65)');
  g.addColorStop(0.92, 'rgba(199,125,255,0.28)');
  g.addColorStop(1, 'rgba(199,125,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const rng = makeRng(31);
  for (let i = 0; i < 28; i++) {
    ctx.fillStyle = `rgba(240,230,255,${0.05 + rng() * 0.22})`;
    ctx.fillRect(rng() * w, 0, 1 + rng() * 4, h);
  }
  for (let i = 0; i < 10; i++) {
    const y = rng() * h;
    ctx.fillStyle = `rgba(250,245,255,${0.04 + rng() * 0.10})`;
    ctx.fillRect(0, y, w, 2 + rng() * 8);
  }
  return trackTexture(new THREE.CanvasTexture(c));
}

function makeWindowTexture() {
  const w = 32;
  const h = 64;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#fff8dc');
  g.addColorStop(0.5, '#ffd700');
  g.addColorStop(1, '#c98a12');
  ctx.fillStyle = g;
  ctx.fillRect(2, 2, w - 4, h - 4);
  ctx.fillStyle = '#2d1b3d';
  ctx.fillRect(w / 2 - 1, 2, 2, h - 4);
  ctx.fillRect(2, h / 2 - 1, w - 4, 2);
  return trackTexture(new THREE.CanvasTexture(c));
}

/* ------------------------------------------------------------------ *
 *  Fog constants (hand-rolled in custom shaders so they match THREE.FogExp2)
 * ------------------------------------------------------------------ */
const FOG_DENSITY = 0.00082;

const GLSL_NOISE = /* glsl */ `
float hash21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
float vnoise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
             mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 4; i++){ v += a * vnoise(p); p *= 2.03; a *= 0.55; }
  return v;
}
`;

/* ------------------------------------------------------------------ *
 *  Sky dome — nebula gradient + drifting nebula wisps
 * ------------------------------------------------------------------ */
function buildSky() {
  const uniforms = {
    uTime: { value: 0 },
    uInkAbyss: { value: srgb(TOKENS.inkAbyss) },
    uInkDeep: { value: srgb(TOKENS.inkDeep) },
    uPurpleCore: { value: srgb(TOKENS.purpleCore) },
    uPurpleGlow: { value: srgb(TOKENS.purpleGlow) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main(){
        vDir = normalize(position);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uInkAbyss;
      uniform vec3 uInkDeep;
      uniform vec3 uPurpleCore;
      uniform vec3 uPurpleGlow;
      varying vec3 vDir;
      ${GLSL_NOISE}
      void main(){
        vec3 dir = normalize(vDir);
        float h = clamp(dir.y, -1.0, 1.0);
        // vertical gradient: deep space zenith -> nebula base -> horizon glow
        vec3 col = mix(uInkDeep, uInkAbyss, smoothstep(0.12, 0.92, h));
        col = mix(col, uPurpleCore * 0.85, (1.0 - smoothstep(-0.12, 0.42, h)) * 0.72);
        // nebula wisps (distorted projection, drifts slowly)
        vec2 uv = dir.xz / (0.42 + abs(dir.y)) * 1.35;
        float neb = fbm(uv * 1.7 + vec2(uTime * 0.006, uTime * 0.0032));
        float neb2 = fbm(uv * 3.4 - vec2(uTime * 0.004, 0.0) + 5.31);
        col += uPurpleGlow * neb * 0.22 * smoothstep(-0.22, 0.75, h);
        col += uPurpleCore * neb2 * 0.13 * smoothstep(-0.1, 0.9, h);
        col = mix(col, uInkAbyss, fbm(uv * 0.9 + 9.7) * 0.30);
        // diagonal milky band
        float band = exp(-pow((h - 0.32 + dir.x * 0.22) * 2.6, 2.0));
        col += mix(uPurpleCore, uPurpleGlow, neb2) * band * neb * 0.42;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1600, 48, 24), mat);
  sky.frustumCulled = false;
  state.scene.add(sky);
  state.timedUniforms.push(uniforms);
  state.disposables.push(sky.geometry, mat);
}

/* ------------------------------------------------------------------ *
 *  Star field + shooting stars
 * ------------------------------------------------------------------ */
function buildStars() {
  const MAX = 4200;
  const rng = makeRng(1234);
  const pos = new Float32Array(MAX * 3);
  const aSize = new Float32Array(MAX);
  const aPhase = new Float32Array(MAX);
  const aSpeed = new Float32Array(MAX);
  const aTint = new Float32Array(MAX);
  for (let i = 0; i < MAX; i++) {
    // uniform on sphere, biased toward the upper hemisphere
    const u = rng() * 2 - 1;
    const up = u * 0.5 + 0.5; // 0..1
    const y = -0.15 + up * 1.05;
    const th = rng() * Math.PI * 2;
    const r = Math.sqrt(Math.max(0, 1 - Math.min(1, y * y)));
    const R = 1250;
    pos[i * 3] = Math.cos(th) * r * R;
    pos[i * 3 + 1] = y * R;
    pos[i * 3 + 2] = Math.sin(th) * r * R;
    aSize[i] = 1.4 + rng() * 3.2;
    aPhase[i] = rng() * Math.PI * 2;
    aSpeed[i] = 0.35 + rng() * 1.5;
    aTint[i] = rng();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(aSize, 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(aPhase, 1));
  geo.setAttribute('aSpeed', new THREE.BufferAttribute(aSpeed, 1));
  geo.setAttribute('aTint', new THREE.BufferAttribute(aTint, 1));
  const uniforms = {
    uTime: { value: 0 },
    uScale: { value: 1 },
    uPaper: { value: srgb(TOKENS.paper) },
    uGlow: { value: srgb(TOKENS.purpleGlow) },
    uGold: { value: srgb(TOKENS.gold) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute float aSize;
      attribute float aPhase;
      attribute float aSpeed;
      attribute float aTint;
      uniform float uTime;
      uniform float uScale;
      varying float vTw;
      varying float vTint;
      void main(){
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        float tw = 0.55 + 0.45 * sin(uTime * aSpeed + aPhase);
        gl_PointSize = aSize * uScale * (0.65 + 0.5 * tw) * (1100.0 / max(-mvPosition.z, 1.0));
        gl_PointSize = clamp(gl_PointSize, 0.6, 26.0);
        vTw = tw;
        vTint = aTint;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uPaper;
      uniform vec3 uGlow;
      uniform vec3 uGold;
      varying float vTw;
      varying float vTint;
      void main(){
        vec2 q = gl_PointCoord - vec2(0.5);
        float d = length(q);
        float a = smoothstep(0.5, 0.02, d);
        a *= a * (0.35 + 0.65 * vTw);
        vec3 col = mix(uPaper, uGlow, smoothstep(0.35, 0.8, vTint));
        col = mix(col, uGold, smoothstep(0.86, 1.0, vTint));
        gl_FragColor = vec4(col, a);
      }
    `,
  });
  const stars = new THREE.Points(geo, mat);
  stars.frustumCulled = false;
  state.scene.add(stars);
  state.stars = stars;
  state.timedUniforms.push(uniforms);
  state.disposables.push(geo, mat);

  // shooting-star sprite pool
  const streakTex = makeStreakTexture();
  for (let i = 0; i < 3; i++) {
    const sm = new THREE.SpriteMaterial({
      map: streakTex,
      transparent: true,
      depthWrite: false,
      fog: false,
      blending: THREE.AdditiveBlending,
      opacity: 0,
      rotation: -0.42,
    });
    const sp = new THREE.Sprite(sm);
    sp.scale.set(170, 12, 1);
    sp.visible = false;
    state.scene.add(sp);
    state.shooters.push({ sprite: sp, active: false, vel: new THREE.Vector3(), life: 0, maxLife: 1 });
    state.disposables.push(sm);
  }
}

function spawnShootingStar() {
  const s = state.shooters.find((q) => !q.active);
  if (!s) return;
  const rng = Math.random;
  s.active = true;
  s.life = 0;
  s.maxLife = 1.1 + rng() * 0.8;
  s.sprite.visible = true;
  s.sprite.position.set(-700 + rng() * 500, 380 + rng() * 380, -750 - rng() * 450);
  s.vel.set(260 + rng() * 140, -(120 + rng() * 90), 40 + rng() * 60);
  s.sprite.material.rotation = Math.atan2(s.vel.y, s.vel.x) + Math.PI;
}

function updateShooters(dt) {
  state.shooterTimer -= dt;
  if (state.shooterTimer <= 0) {
    state.shooterTimer = 5 + Math.random() * 9;
    spawnShootingStar();
  }
  for (const s of state.shooters) {
    if (!s.active) continue;
    s.life += dt;
    const k = s.life / s.maxLife;
    if (k >= 1) {
      s.active = false;
      s.sprite.visible = false;
      s.sprite.material.opacity = 0;
      continue;
    }
    s.sprite.position.addScaledVector(s.vel, dt);
    s.sprite.material.opacity = k < 0.25 ? k / 0.25 : 1 - (k - 0.25) / 0.75;
  }
}

/* ------------------------------------------------------------------ *
 *  Moon — glowing disc + soft halo (main light source)
 * ------------------------------------------------------------------ */
function buildMoon() {
  const moonPos = new THREE.Vector3(-450, 500, -1250);

  const haloTex = makeGlowTexture(256, 'rgba(255,255,255,0.95)', 'rgba(199,125,255,0.32)', 'rgba(199,125,255,0)');
  const haloMat = new THREE.SpriteMaterial({
    map: haloTex,
    transparent: true,
    depthWrite: false,
    fog: false,
    blending: THREE.AdditiveBlending,
    opacity: 1.0,
  });
  const halo = new THREE.Sprite(haloMat);
  halo.position.copy(moonPos);
  halo.scale.set(1350, 1350, 1);
  state.scene.add(halo);
  state.moonHalo = halo;
  state.disposables.push(haloMat);

  const uniforms = {
    uCore: { value: srgb(0xfff6ff) },
    uEdge: { value: srgb(TOKENS.purpleGlow) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main(){
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uCore;
      uniform vec3 uEdge;
      varying vec2 vUv;
      ${GLSL_NOISE}
      void main(){
        float d = length(vUv - vec2(0.5)) * 2.0;
        float body = 1.0 - smoothstep(0.55, 1.0, d);
        float limb = smoothstep(0.12, 1.0, d);
        float craters = fbm(vUv * 6.0) * 0.5 + fbm(vUv * 13.0) * 0.25;
        vec3 col = mix(uCore, uEdge, limb * 0.8);
        col *= 0.82 + 0.36 * craters;
        col = mix(col, uEdge * 0.9, smoothstep(0.55, 0.95, d) * 0.35);
        float a = body * (1.0 - smoothstep(0.55, 1.0, d));
        gl_FragColor = vec4(col, a);
      }
    `,
  });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(88, 48), mat);
  disc.position.copy(moonPos);
  disc.frustumCulled = false;
  state.scene.add(disc);
  state.moon = disc;
  state.disposables.push(disc.geometry, mat);

  // moonlight
  const dir = new THREE.DirectionalLight(0xcfb2ff, 2.7);
  dir.position.copy(moonPos.clone().normalize().multiplyScalar(700));
  dir.target.position.set(0, 40, -220);
  state.scene.add(dir);
  state.scene.add(dir.target);
  dir.castShadow = true;
  // A 2048² shadow map is costly on mobile GPUs; 1024² retains the castle
  // silhouette while cutting shadow-map texel memory and fill work by 75%.
  const shadowSize = state.isMobile ? 1024 : 2048;
  dir.shadow.mapSize.set(shadowSize, shadowSize);
  dir.shadow.camera.near = 200;
  dir.shadow.camera.far = 1600;
  dir.shadow.camera.left = -320;
  dir.shadow.camera.right = 320;
  dir.shadow.camera.top = 320;
  dir.shadow.camera.bottom = -320;
  dir.shadow.bias = -0.0009;
  state.dirLight = dir;
}

/* ------------------------------------------------------------------ *
 *  Castle — 7 towers (OT7 silhouette), emissive gold windows
 * ------------------------------------------------------------------ */
function buildCastle() {
  const g = new THREE.Group();
  g.position.set(0, 2, -260);

  // === MATERIALS (enhanced for cinematic quality) ===
  const stoneColor = new THREE.Color(TOKENS.mist).lerp(new THREE.Color(TOKENS.purpleCore), 0.20);
  const stoneMat = new THREE.MeshStandardMaterial({
    color: stoneColor, roughness: 0.82, metalness: 0.10,
    emissive: TOKENS.violetDeep, emissiveIntensity: 0.18,
  });
  const stoneLightMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x8a7a9e).lerp(new THREE.Color(TOKENS.purpleGlow), 0.15),
    roughness: 0.78, metalness: 0.12,
    emissive: TOKENS.violetDeep, emissiveIntensity: 0.12,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(TOKENS.purpleCore).lerp(new THREE.Color(0x2a1050), 0.35),
    roughness: 0.45, metalness: 0.35,
    emissive: TOKENS.purpleCore, emissiveIntensity: 0.40,
  });
  const roofDarkMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x3a1870), roughness: 0.50, metalness: 0.28,
    emissive: TOKENS.violetDeep, emissiveIntensity: 0.30,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: TOKENS.gold, roughness: 0.30, metalness: 0.80,
    emissive: TOKENS.gold, emissiveIntensity: 0.70,
  });
  const goldDimMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(TOKENS.gold).lerp(new THREE.Color(TOKENS.mist), 0.35),
    roughness: 0.45, metalness: 0.65,
    emissive: TOKENS.gold, emissiveIntensity: 0.35,
  });
  const rockMat = new THREE.MeshStandardMaterial({
    color: 0x1e0f35, roughness: 1, metalness: 0,
    emissive: TOKENS.inkDeep, emissiveIntensity: 0.35, flatShading: true,
  });
  const bridgeStoneMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(TOKENS.mist).lerp(new THREE.Color(0x9a8ab0), 0.30),
    roughness: 0.85, metalness: 0.08,
    emissive: TOKENS.violetDeep, emissiveIntensity: 0.15,
  });
  const winTex = makeWindowTexture();
  const windowMat = new THREE.MeshBasicMaterial({
    map: winTex, color: TOKENS.gold, transparent: true,
    opacity: 0.98, fog: true, side: THREE.DoubleSide,
  });
  const warmGlowMat = new THREE.MeshBasicMaterial({
    color: 0xffcc66, transparent: true, opacity: 0.7,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    fog: false,
  });
  state.windowMat = windowMat;
  state.disposables.push(stoneMat, stoneLightMat, roofMat, roofDarkMat, trimMat, goldDimMat, rockMat, bridgeStoneMat, windowMat, warmGlowMat);

  const shadowify = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };

  // === ROCKY FLOATING BASE ===
  const rock = new THREE.Mesh(new THREE.CylinderGeometry(50, 80, 34, 14, 4), rockMat);
  rock.position.y = -10;
  jitterGeometry(rock.geometry, 6.5, 44);
  shadowify(rock);
  g.add(rock);
  // Underside stalactite-like rock formations
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.3;
    const r = 20 + Math.sin(a * 3.7) * 14;
    const h = 18 + Math.sin(a * 2.3) * 12;
    const stal = new THREE.Mesh(new THREE.ConeGeometry(4 + Math.sin(a * 5) * 2.5, h, 6), rockMat);
    stal.position.set(Math.cos(a) * r, -22 - h / 2 + Math.sin(a * 4) * 5, Math.sin(a) * r);
    stal.rotation.x = Math.PI;
    jitterGeometry(stal.geometry, 1.8, 44 + i);
    g.add(stal);
  }

  // === GRAND TERRACE (multi-tier) ===
  const terrace = shadowify(new THREE.Mesh(new THREE.CylinderGeometry(38, 48, 14, 14), stoneLightMat));
  terrace.position.y = 10;
  g.add(terrace);
  const terrace2 = shadowify(new THREE.Mesh(new THREE.CylinderGeometry(30, 38, 10, 14), stoneMat));
  terrace2.position.y = 20;
  g.add(terrace2);
  // Terrace trim ring
  const terraceRing = new THREE.Mesh(new THREE.CylinderGeometry(38.5, 38.5, 1.5, 14), goldDimMat);
  terraceRing.position.y = 17.5;
  g.add(terraceRing);

  // === ENHANCED RING WALLS with buttresses ===
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 10;
    const r = 33;
    const wall = shadowify(new THREE.Mesh(new THREE.BoxGeometry(22, 20, 5), stoneMat));
    wall.position.set(Math.cos(a) * r, 28, Math.sin(a) * r);
    wall.rotation.y = -a + Math.PI / 2;
    g.add(wall);
    // Parapet
    const parapet = shadowify(new THREE.Mesh(new THREE.BoxGeometry(23, 3, 7), stoneMat));
    parapet.position.set(Math.cos(a) * r, 39, Math.sin(a) * r);
    parapet.rotation.y = -a + Math.PI / 2;
    g.add(parapet);
    // Crenellations
    for (let c = 0; c < 6; c++) {
      const merlon = new THREE.Mesh(new THREE.BoxGeometry(2.6, 3.5, 2.2), stoneLightMat);
      const t = (c / 5 - 0.5) * 19;
      merlon.position.set(
        Math.cos(a) * r + Math.cos(-a + Math.PI / 2) * t + Math.cos(a) * 3.8,
        42.2, Math.sin(a) * r + Math.sin(-a + Math.PI / 2) * t + Math.sin(a) * 3.8
      );
      merlon.rotation.y = -a + Math.PI / 2;
      g.add(merlon);
    }
    // Buttress
    if (i % 2 === 0) {
      const butt = shadowify(new THREE.Mesh(new THREE.BoxGeometry(5, 24, 7), stoneMat));
      butt.position.set(Math.cos(a) * (r + 3), 24, Math.sin(a) * (r + 3));
      butt.rotation.y = -a;
      g.add(butt);
      const buttCap = new THREE.Mesh(new THREE.BoxGeometry(6, 2, 8), stoneLightMat);
      buttCap.position.set(Math.cos(a) * (r + 3), 37, Math.sin(a) * (r + 3));
      buttCap.rotation.y = -a;
      g.add(buttCap);
    }
    // Arrow slit windows in walls
    if (i % 3 === 0) {
      for (let s = 0; s < 2; s++) {
        const slit = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 4), warmGlowMat);
        slit.position.set(
          Math.cos(a) * (r + 2.6) + Math.cos(-a + Math.PI / 2) * (s * 8 - 4),
          30 + s * 5, Math.sin(a) * (r + 2.6) + Math.sin(-a + Math.PI / 2) * (s * 8 - 4)
        );
        slit.lookAt(Math.cos(a) * (r + 30), slit.position.y, Math.sin(a) * (r + 30));
        g.add(slit);
      }
    }
  }

  // === CENTRAL KEEP (enhanced — multi-tier with balconies) ===
  // Base tier
  const keepBase = shadowify(new THREE.Mesh(new THREE.CylinderGeometry(13, 15.5, 55, 12), stoneMat));
  keepBase.position.y = 52;
  g.add(keepBase);
  // Mid tier (slightly narrower)
  const keepMid = shadowify(new THREE.Mesh(new THREE.CylinderGeometry(10.5, 12, 32, 12), stoneLightMat));
  keepMid.position.y = 95;
  g.add(keepMid);
  // Balcony ring
  const balcony = new THREE.Mesh(new THREE.CylinderGeometry(13, 13, 2.5, 12), goldDimMat);
  balcony.position.y = 81;
  g.add(balcony);
  const balconyRail = new THREE.Mesh(new THREE.TorusGeometry(12.5, 0.8, 6, 24), trimMat);
  balconyRail.position.y = 83.5;
  balconyRail.rotation.x = Math.PI / 2;
  g.add(balconyRail);
  // Upper tier
  const keepUpper = shadowify(new THREE.Mesh(new THREE.CylinderGeometry(8, 10, 22, 12), stoneMat));
  keepUpper.position.y = 122;
  g.add(keepUpper);
  // Crown ring
  const crownRing = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 2, 12), goldDimMat);
  crownRing.position.y = 134;
  g.add(crownRing);
  // Steep conical roof (multi-tier)
  const keepRoof = shadowify(new THREE.Mesh(new THREE.ConeGeometry(11, 32, 12), roofMat));
  keepRoof.position.y = 151;
  g.add(keepRoof);
  const keepRoof2 = shadowify(new THREE.Mesh(new THREE.ConeGeometry(6, 18, 8), roofDarkMat));
  keepRoof2.position.y = 168;
  g.add(keepRoof2);
  // Gold finial
  const keepSpire = shadowify(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.2, 16, 6), trimMat));
  keepSpire.position.y = 182;
  g.add(keepSpire);
  const keepOrb = new THREE.Mesh(new THREE.SphereGeometry(3, 14, 12), trimMat);
  keepOrb.position.y = 191;
  g.add(keepOrb);
  // Crown spikes around top
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.6, 8, 4), goldDimMat);
    spike.position.set(Math.cos(a) * 9, 139, Math.sin(a) * 9);
    g.add(spike);
  }
  // Keep windows (multiple rows)
  addWindows(g, windowMat, 13, 52, 55, [12, 22, 32, 42, 50], 8, 0.42);
  addWindows(g, windowMat, 10.5, 95, 32, [8, 18, 26], 7, 0.20);
  addWindows(g, windowMat, 8, 122, 22, [6, 15], 6, 0.60);

  // === TOWERS (enhanced — varied shapes, detailed roofs) ===
  const towers = [
    { a: 0.25, r: 30, h: 62, rad: 7.2, type: 'round' },
    { a: 1.32, r: 28, h: 78, rad: 6.5, type: 'round' },
    { a: 2.41, r: 31, h: 52, rad: 7.8, type: 'square' },
    { a: 3.44, r: 27, h: 72, rad: 6.2, type: 'round' },
    { a: 4.52, r: 32, h: 46, rad: 8.0, type: 'octagonal' },
    { a: 5.58, r: 29, h: 65, rad: 6.8, type: 'round' },
    // Additional smaller turrets
    { a: 0.78, r: 22, h: 38, rad: 4.5, type: 'round' },
    { a: 2.95, r: 21, h: 35, rad: 4.2, type: 'round' },
    { a: 5.05, r: 23, h: 40, rad: 4.8, type: 'square' },
  ];

  for (const t of towers) {
    const x = Math.cos(t.a) * t.r;
    const z = Math.sin(t.a) * t.r;
    const segs = t.type === 'square' ? 4 : t.type === 'octagonal' ? 8 : 10;
    const rotY = t.type === 'square' ? Math.PI / 4 : t.a;

    // Tower body
    const body = shadowify(new THREE.Mesh(new THREE.CylinderGeometry(t.rad, t.rad * 1.18, t.h, segs), stoneMat));
    body.position.set(x, 25 + t.h / 2, z);
    body.rotation.y = rotY;
    g.add(body);

    // Tower mid ring (decorative)
    const midRing = new THREE.Mesh(new THREE.CylinderGeometry(t.rad * 1.12, t.rad * 1.12, 1.8, segs), goldDimMat);
    midRing.position.set(x, 25 + t.h * 0.55, z);
    midRing.rotation.y = rotY;
    g.add(midRing);

    // Steep conical roof
    const roof = shadowify(new THREE.Mesh(new THREE.ConeGeometry(t.rad * 1.35, t.rad * 4.2, segs), roofMat));
    roof.position.set(x, 25 + t.h + t.rad * 2, z);
    roof.rotation.y = rotY;
    g.add(roof);

    // Roof finial
    const tip = new THREE.Mesh(new THREE.SphereGeometry(t.rad * 0.3, 8, 8), trimMat);
    tip.position.set(x, 25 + t.h + t.rad * 4, z);
    g.add(tip);
    const tipSpike = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.5, t.rad * 1.5, 5), goldDimMat);
    tipSpike.position.set(x, 25 + t.h + t.rad * 4 + t.rad * 0.8, z);
    g.add(tipSpike);

    // Tower top ring
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(t.rad * 1.18, t.rad * 1.18, 1.8, segs), trimMat);
    ring.position.set(x, 25 + t.h - 1, z);
    ring.rotation.y = rotY;
    g.add(ring);

    // Balcony on taller towers
    if (t.h > 55) {
      const balc = new THREE.Mesh(new THREE.CylinderGeometry(t.rad * 1.4, t.rad * 1.4, 1.5, segs), goldDimMat);
      balc.position.set(x, 25 + t.h * 0.72, z);
      balc.rotation.y = rotY;
      g.add(balc);
    }

    // Windows
    addWindows(g, windowMat, t.rad, 25 + t.h / 2, t.h * 0.68, [t.h * 0.12, t.h * 0.35, t.h * 0.58], segs > 6 ? 6 : segs, t.a);
  }

  // === GRAND STONE ARCH BRIDGE (extending toward camera) ===
  const bridgeGroup = new THREE.Group();
  // Bridge deck
  const deck = shadowify(new THREE.Mesh(new THREE.BoxGeometry(14, 3, 80), bridgeStoneMat));
  deck.position.set(0, 22, 80);
  bridgeGroup.add(deck);
  // Bridge arches (3 supporting arches)
  for (let i = 0; i < 3; i++) {
    const az = 50 + i * 26;
    const archPillar1 = shadowify(new THREE.Mesh(new THREE.BoxGeometry(5, 25, 6), bridgeStoneMat));
    archPillar1.position.set(-7, 10, az);
    bridgeGroup.add(archPillar1);
    const archPillar2 = shadowify(new THREE.Mesh(new THREE.BoxGeometry(5, 25, 6), bridgeStoneMat));
    archPillar2.position.set(7, 10, az);
    bridgeGroup.add(archPillar2);
    // Arch top (curved beam)
    const archBeam = shadowify(new THREE.Mesh(new THREE.BoxGeometry(18, 4, 5), bridgeStoneMat));
    archBeam.position.set(0, 22, az);
    bridgeGroup.add(archBeam);
  }
  // Bridge railings
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(1.2, 4, 80), bridgeStoneMat);
    rail.position.set(side * 7.2, 25.5, 80);
    bridgeGroup.add(rail);
    // Railing posts
    for (let i = 0; i < 11; i++) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(1.5, 5, 1.5), goldDimMat);
      post.position.set(side * 7.2, 27, 42 + i * 7.5);
      bridgeGroup.add(post);
      // Lantern on every other post
      if (i % 2 === 0) {
        const lantern = new THREE.Mesh(new THREE.SphereGeometry(1.2, 8, 8), warmGlowMat);
        lantern.position.set(side * 7.2, 30.5, 42 + i * 7.5);
        bridgeGroup.add(lantern);
        const lanternPole = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 3, 4), goldDimMat);
        lanternPole.position.set(side * 7.2, 28.5, 42 + i * 7.5);
        bridgeGroup.add(lanternPole);
      }
    }
  }
  // Bridge entrance arch (gatehouse end)
  const bridgeArch = shadowify(new THREE.Mesh(new THREE.BoxGeometry(18, 22, 8), stoneMat));
  bridgeArch.position.set(0, 32, 42);
  bridgeGroup.add(bridgeArch);
  const bridgeArchRoof = shadowify(new THREE.Mesh(new THREE.ConeGeometry(12, 10, 4), roofMat));
  bridgeArchRoof.position.set(0, 48, 42);
  bridgeArchRoof.rotation.y = Math.PI / 4;
  bridgeGroup.add(bridgeArchRoof);
  // Arch opening
  const bridgeOpening = new THREE.Mesh(new THREE.PlaneGeometry(10, 16), warmGlowMat);
  bridgeOpening.position.set(0, 30, 46.2);
  bridgeGroup.add(bridgeOpening);
  g.add(bridgeGroup);

  // === GATEHOUSE (enhanced) ===
  const gate = shadowify(new THREE.Mesh(new THREE.BoxGeometry(24, 36, 14), stoneMat));
  gate.position.set(0, 38, 38);
  g.add(gate);
  const gateRoof = shadowify(new THREE.Mesh(new THREE.ConeGeometry(16, 16, 4), roofMat));
  gateRoof.position.set(0, 64, 38);
  gateRoof.rotation.y = Math.PI / 4;
  g.add(gateRoof);
  const gateFinial = new THREE.Mesh(new THREE.SphereGeometry(2, 8, 8), trimMat);
  gateFinial.position.set(0, 73, 38);
  g.add(gateFinial);
  // Gate arch (proper arch shape using half-torus)
  const archShape = new THREE.Mesh(new THREE.TorusGeometry(5, 1.5, 8, 16, Math.PI), stoneLightMat);
  archShape.position.set(0, 26, 45.2);
  archShape.rotation.x = 0;
  g.add(archShape);
  // Gate opening
  const arch = new THREE.Mesh(new THREE.BoxGeometry(9, 16, 2), new THREE.MeshBasicMaterial({ color: TOKENS.inkAbyss }));
  arch.position.set(0, 24, 45);
  g.add(arch);
  const gateGlow = new THREE.Mesh(new THREE.PlaneGeometry(8, 14), new THREE.MeshBasicMaterial({
    color: TOKENS.purpleGlow, transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  }));
  gateGlow.position.set(0, 24, 46.2);
  g.add(gateGlow);
  state.disposables.push(arch.geometry, arch.material, gateGlow.geometry, gateGlow.material);

  // === FLAGS AND BANNERS ===
  const flagMat = new THREE.MeshBasicMaterial({ color: TOKENS.pink, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
  const flagMat2 = new THREE.MeshBasicMaterial({ color: TOKENS.goldWarm, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
  const flagMat3 = new THREE.MeshBasicMaterial({ color: TOKENS.purpleGlow, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
  state.disposables.push(flagMat, flagMat2, flagMat3);
  const flagGeo = new THREE.BufferGeometry();
  flagGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 9, -1.6, 0, 0, -4.2, 0], 3));
  flagGeo.computeVertexNormals();
  state.disposables.push(flagGeo);
  const flagSpots = [
    [0, 182, 0, flagMat],
    [Math.cos(1.32) * 28, 25 + 78 + 6.5 * 4 + 4, Math.sin(1.32) * 28, flagMat2],
    [Math.cos(3.44) * 27, 25 + 72 + 6.2 * 4 + 4, Math.sin(3.44) * 27, flagMat3],
    [Math.cos(0.25) * 30, 25 + 62 + 7.2 * 4 + 4, Math.sin(0.25) * 30, flagMat2],
  ];
  state.flags = [];
  for (const [fx, fy, fz, fm] of flagSpots) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 12, 5), trimMat);
    pole.position.set(fx, fy, fz);
    g.add(pole);
    const flag = new THREE.Mesh(flagGeo, fm);
    flag.position.set(fx, fy + 5, fz);
    g.add(flag);
    state.flags.push(flag);
  }

  // === WARM WINDOW GLOW SPRITES (fake bloom for emissive feel) ===
  const glowGold = makeGlowTexture(128, 'rgba(255,215,0,0.85)', 'rgba(255,200,80,0.25)', 'rgba(255,200,80,0)');
  const glowPurple = makeGlowTexture(128, 'rgba(199,125,255,0.8)', 'rgba(123,44,191,0.22)', 'rgba(123,44,191,0)');
  const glowWarm = makeGlowTexture(128, 'rgba(255,180,60,0.9)', 'rgba(255,160,40,0.3)', 'rgba(255,160,40,0)');
  const glowSpots = [
    [0, 155, 0, 70, glowPurple],   // keep spire glow
    [0, 55, 42, 38, glowWarm],     // gate glow
    [0, 30, 50, 30, glowGold],     // bridge entrance
  ];
  for (const t of towers) {
    glowSpots.push([Math.cos(t.a) * t.r, 25 + t.h * 0.55, Math.sin(t.a) * t.r, 20 + t.rad * 2, glowWarm]);
    glowSpots.push([Math.cos(t.a) * t.r, 25 + t.h + t.rad * 3, Math.sin(t.a) * t.r, 28, glowPurple]);
  }
  for (const [gx, gy, gz, gs, gmap] of glowSpots) {
    const sm = new THREE.SpriteMaterial({
      map: gmap, transparent: true, depthWrite: false, fog: false,
      blending: THREE.AdditiveBlending, opacity: 0.45,
    });
    const sp = new THREE.Sprite(sm);
    sp.position.set(gx, gy, gz);
    sp.scale.set(gs, gs, 1);
    g.add(sp);
    state.disposables.push(sm);
  }

  // === ATMOSPHERIC FOG PLANES (depth layers) ===
  const fogTex = makeCloudTexture();
  const fogLayers = [
    { z: -200, y: 0, w: 400, h: 80, opacity: 0.18 },
    { z: -160, y: -10, w: 500, h: 100, opacity: 0.14 },
    { z: -120, y: -20, w: 600, h: 120, opacity: 0.10 },
    { z: 20, y: -5, w: 400, h: 60, opacity: 0.08 },
  ];
  for (const f of fogLayers) {
    const fm = new THREE.MeshBasicMaterial({
      map: fogTex, transparent: true, opacity: f.opacity,
      depthWrite: false, side: THREE.DoubleSide,
      color: new THREE.Color(TOKENS.purpleGlow).lerp(new THREE.Color(TOKENS.inkDeep), 0.4),
    });
    const fp = new THREE.Mesh(new THREE.PlaneGeometry(f.w, f.h), fm);
    fp.position.set(0, f.y, f.z);
    g.add(fp);
    state.disposables.push(fm);
  }

  // === WARM POINT LIGHTS (key window illumination) ===
  const warmLight1 = new THREE.PointLight(0xffaa44, 2.5, 120, 1.8);
  warmLight1.position.set(0, 35, 45);
  g.add(warmLight1);
  const warmLight2 = new THREE.PointLight(0xffcc66, 1.8, 100, 1.8);
  warmLight2.position.set(0, 85, 0);
  g.add(warmLight2);
  const purpleAccent = new THREE.PointLight(TOKENS.purpleGlow, 1.5, 150, 1.8);
  purpleAccent.position.set(0, 140, 20);
  g.add(purpleAccent);

  state.scene.add(g);
  state.castle = g;
}

function jitterGeometry(geo, amount, seed) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const n = fbm2(x * 0.06 + seed, z * 0.06 - y * 0.03 + seed * 0.7, 3) - 0.5;
    const s = 1 + n * 0.24;
    p.setXYZ(i, x * s, y + n * amount, z * s);
  }
  p.needsUpdate = true;
  geo.computeVertexNormals();
}

function addWindows(parent, mat, radius, centerY, height, levels, perLevel, angleOffset) {
  const winGeo = new THREE.PlaneGeometry(1.9, 3.6);
  state.disposables.push(winGeo);
  for (const ly of levels) {
    for (let i = 0; i < perLevel; i++) {
      const a = angleOffset + (i / perLevel) * Math.PI * 2 + 0.35;
      const w = new THREE.Mesh(winGeo, mat);
      w.position.set(Math.cos(a) * (radius + 0.35), centerY - height / 2 + ly + height * 0.12, Math.sin(a) * (radius + 0.35));
      w.lookAt(Math.cos(a) * (radius + 30), w.position.y, Math.sin(a) * (radius + 30));
      parent.add(w);
    }
  }
}

/* ------------------------------------------------------------------ *
 *  Mountain ranges — layered noise ridgelines fading into fog
 * ------------------------------------------------------------------ */
function buildMountains() {
  const ranges = [
    { z: -430, w: 1900, base: 40, amp: 120, seed: 3.1, top: 0x3a1f63, bottom: 0x140726 },
    { z: -620, w: 2400, base: 70, amp: 190, seed: 8.7, top: 0x452470, bottom: 0x180a2e },
    { z: -840, w: 3000, base: 110, amp: 260, seed: 15.3, top: 0x50297c, bottom: 0x1c0d36 },
    { z: -1080, w: 3600, base: 150, amp: 330, seed: 24.9, top: 0x583089, bottom: 0x221040 },
  ];
  for (const r of ranges) {
    const segs = 140;
    const positions = [];
    const colors = [];
    const indices = [];
    const cTop = new THREE.Color(r.top);
    const cBot = new THREE.Color(r.bottom);
    for (let i = 0; i <= segs; i++) {
      const x = -r.w / 2 + (r.w * i) / segs;
      const n = ridgedFbm2(x * 0.0016 + r.seed, r.seed * 1.7, 5);
      const y = r.base + n * r.amp;
      positions.push(x, y, 0, x, -60, 0);
      colors.push(cTop.r, cTop.g, cTop.b, cBot.r, cBot.g, cBot.b);
      if (i < segs) {
        const a = i * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.z = r.z;
    state.scene.add(mesh);
    state.disposables.push(geo, mat);
  }
}

/* ------------------------------------------------------------------ *
 *  Water — hand-rolled "reflection" shader (moon streak + castle glow)
 * ------------------------------------------------------------------ */
function buildWater() {
  const uniforms = {
    uTime: { value: 0 },
    uDeep: { value: srgb(TOKENS.inkDeep) },
    uViolet: { value: srgb(TOKENS.violetDeep) },
    uCore: { value: srgb(TOKENS.purpleCore) },
    uGlow: { value: srgb(TOKENS.purpleGlow) },
    uGold: { value: srgb(TOKENS.gold) },
    uMoonPos: { value: new THREE.Vector3(-450, 500, -1250) },
    uCastle: { value: new THREE.Vector2(0, -260) },
    uFogColor: { value: srgb(TOKENS.inkDeep) },
    uFogDensity: { value: FOG_DENSITY },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      varying float vFogDepth;
      void main(){
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorld = worldPos.xyz;
        vec4 mvPosition = viewMatrix * worldPos;
        vFogDepth = -mvPosition.z;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uDeep;
      uniform vec3 uViolet;
      uniform vec3 uCore;
      uniform vec3 uGlow;
      uniform vec3 uGold;
      uniform vec3 uMoonPos;
      uniform vec2 uCastle;
      uniform vec3 uFogColor;
      uniform float uFogDensity;
      varying vec3 vWorld;
      varying float vFogDepth;
      ${GLSL_NOISE}
      void main(){
        vec2 p = vWorld.xz * 0.012;
        float n1 = fbm(p + vec2(uTime * 0.030, uTime * 0.018));
        float n2 = fbm(p * 2.1 - vec2(uTime * 0.021, uTime * 0.027) + 3.7);
        float wave = clamp(n1 * 0.65 + n2 * 0.35, 0.0, 1.0);

        vec3 base = mix(uDeep, uViolet, wave * 0.5);
        base = mix(base, uCore, pow(wave, 3.0) * 0.22);

        // pseudo-normal from the two noise fields -> moon glitter
        vec3 viewDir = normalize(cameraPosition - vWorld);
        vec3 nrm = normalize(vec3((n2 - n1) * 0.9, 1.0, (n1 - n2) * 0.9));
        vec3 moonDir = normalize(uMoonPos - vWorld);
        vec3 refl = reflect(-viewDir, nrm);
        float spec = pow(max(dot(refl, moonDir), 0.0), 90.0);
        float spec2 = pow(max(dot(refl, moonDir), 0.0), 18.0);

        // broad moon streak across the water toward the viewer
        vec2 rel = vWorld.xz - cameraPosition.xz;
        vec2 md = normalize(uMoonPos.xz - cameraPosition.xz);
        float along = dot(rel, md);
        float across = abs(rel.x * md.y - rel.y * md.x);
        float streak = exp(-across * 0.0125) * smoothstep(60.0, 620.0, along);
        streak *= 0.35 + 0.65 * wave;

        // castle glow reflected near its base
        float cd = length(vWorld.xz - uCastle);
        float castleGlow = exp(-cd * 0.0085);

        vec3 col = base;
        col += uGlow * streak * 0.58;
        col += vec3(1.0) * spec * 1.25 + uGlow * spec2 * 0.4;
        col += mix(uGold, uCore, 0.32) * castleGlow * (0.13 + wave * 0.20);

        float fogFactor = 1.0 - exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth);
        col = mix(col, uFogColor, fogFactor);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(4200, 4200, 32, 32), mat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0;
  state.scene.add(water);
  state.timedUniforms.push(uniforms);
  state.disposables.push(water.geometry, mat);
}

/* ------------------------------------------------------------------ *
 *  Floating islands + waterfall particle streams
 * ------------------------------------------------------------------ */
const ISLAND_DEFS = [
  { pos: [-128, 62, -152], scale: 1.15, fall: 70 },
  { pos: [140, 44, -112], scale: 0.85, fall: 48 },
  { pos: [-238, 98, -338], scale: 1.35, fall: 92 },
  { pos: [232, 82, -388], scale: 1.15, fall: 74 },
  { pos: [-20, 132, -540], scale: 0.9, fall: 44 },
];

function buildIslands() {
  const rockMat = new THREE.MeshStandardMaterial({
    color: 0x2a1544,
    roughness: 1,
    flatShading: true,
    emissive: TOKENS.inkDeep,
    emissiveIntensity: 0.35,
  });
  const topMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x4b2a72).lerp(new THREE.Color(0x2a6b3a), 0.15),
    roughness: 0.85,
    emissive: TOKENS.violetDeep,
    emissiveIntensity: 0.30,
    flatShading: true,
  });
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x301a4e, roughness: 1, flatShading: true });
  const leafMat = new THREE.MeshStandardMaterial({
    color: TOKENS.purpleCore,
    roughness: 0.7,
    emissive: TOKENS.purpleCore,
    emissiveIntensity: 0.42,
    flatShading: true,
  });
  const flowerMat = new THREE.MeshBasicMaterial({ color: TOKENS.pink, transparent: true, opacity: 0.9 });
  const glowMat = new THREE.MeshBasicMaterial({
    color: TOKENS.purpleGlow,
    transparent: true,
    opacity: 0.55,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  state.disposables.push(rockMat, topMat, trunkMat, leafMat, flowerMat, glowMat);

  const fallTex = makeGlowTexture(64, 'rgba(255,255,255,0.9)', 'rgba(214,180,255,0.45)', 'rgba(214,180,255,0)');

  for (const def of ISLAND_DEFS) {
    const s = def.scale;
    const g = new THREE.Group();
    g.position.set(def.pos[0], def.pos[1], def.pos[2]);

    // rock spike (inverted, jittered cone)
    const rock = new THREE.Mesh(new THREE.CylinderGeometry(20 * s, 4 * s, 34 * s, 8, 3), rockMat);
    rock.position.y = -14 * s;
    jitterGeometry(rock.geometry, 3.2 * s, def.pos[0] * 0.13);
    rock.castShadow = true;
    g.add(rock);

    // grassy top
    const top = new THREE.Mesh(new THREE.CylinderGeometry(21 * s, 18 * s, 6 * s, 8), topMat);
    top.position.y = 2 * s;
    top.receiveShadow = true;
    top.castShadow = true;
    jitterGeometry(top.geometry, 1.2 * s, def.pos[2] * 0.11);
    g.add(top);

    // mini trees + glowing flowers
    const treeCount = Math.round(3 * s);
    for (let i = 0; i < treeCount; i++) {
      const a = (i / treeCount) * Math.PI * 2 + def.pos[0];
      const rr = 7 * s + hash2(i, def.pos[0] | 0) * 7 * s;
      const tx = Math.cos(a) * rr;
      const tz = Math.sin(a) * rr;
      const th = (5 + hash2(i, 7) * 4) * s;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5 * s, 0.8 * s, th, 5), trunkMat);
      trunk.position.set(tx, 5 * s + th / 2, tz);
      g.add(trunk);
      const leaves = new THREE.Mesh(new THREE.ConeGeometry(3.1 * s, th * 1.15, 6), leafMat);
      leaves.position.set(tx, 5 * s + th + th * 0.42, tz);
      leaves.castShadow = true;
      g.add(leaves);
    }
    for (let i = 0; i < 7; i++) {
      const a = hash2(i, def.pos[0] | 0) * Math.PI * 2;
      const rr = 4 * s + hash2(i + 11, def.pos[2] | 0) * 13 * s;
      const flower = new THREE.Mesh(new THREE.SphereGeometry(0.65 * s, 6, 6), i % 2 ? flowerMat : glowMat);
      flower.position.set(Math.cos(a) * rr, 5.6 * s, Math.sin(a) * rr);
      g.add(flower);
    }

    state.scene.add(g);

    // waterfall particle stream from the island lip
    const COUNT = 220;
    const fpos = new Float32Array(COUNT * 3);
    const seedY = new Float32Array(COUNT);
    const rng = makeRng(Math.abs(def.pos[0] * 13 + def.pos[2] * 7) + 5);
    const edgeA = rng() * Math.PI * 2;
    const ox = def.pos[0] + Math.cos(edgeA) * 17 * s;
    const oz = def.pos[2] + Math.sin(edgeA) * 17 * s;
    const oy = def.pos[1] + 2 * s;

    // translucent falling sheet + mist glow (visual anchor for the particle stream)
    const sheetTex = makeFallSheetTexture();
    const sheetMat = new THREE.MeshBasicMaterial({
      map: sheetTex,
      transparent: true,
      opacity: 0.32,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(6 * s, def.fall * 0.82), sheetMat);
    sheet.position.set(ox, oy - def.fall * 0.41, oz);
    sheet.lookAt(0, oy - def.fall * 0.41, 400);
    g.add(sheet);
    state.disposables.push(sheet.geometry, sheetMat);
    const mistTex = makeGlowTexture(96, 'rgba(220,190,255,0.55)', 'rgba(160,110,255,0.18)', 'rgba(160,110,255,0)');
    const mistMat = new THREE.SpriteMaterial({
      map: mistTex,
      transparent: true,
      depthWrite: false,
      fog: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.5,
    });
    const mist = new THREE.Sprite(mistMat);
    mist.position.set(ox, oy - def.fall, oz);
    mist.scale.set(26 * s, 14 * s, 1);
    g.add(mist);
    state.disposables.push(mistMat);

    for (let i = 0; i < COUNT; i++) {
      fpos[i * 3] = ox + (rng() - 0.5) * 7 * s;
      fpos[i * 3 + 1] = oy - rng() * def.fall;
      fpos[i * 3 + 2] = oz + (rng() - 0.5) * 7 * s;
      seedY[i] = 0.7 + rng() * 0.9;
    }
    const fgeo = new THREE.BufferGeometry();
    fgeo.setAttribute('position', new THREE.BufferAttribute(fpos, 3));
    const fmat = new THREE.PointsMaterial({
      map: fallTex,
      color: 0xdcbaff,
      size: 1.9 * s,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    const points = new THREE.Points(fgeo, fmat);
    state.scene.add(points);
    state.waterfalls.push({ points, fpos, seedY, oy, fall: def.fall, ox, oz, spread: 7 * s });
    state.disposables.push(fgeo, fmat);
  }
}

function updateWaterfalls(dt) {
  const activeFraction = QUALITY_COUNTS[state.quality].fall;
  for (const w of state.waterfalls) {
    const n = Math.floor(w.seedY.length * activeFraction);
    for (let i = 0; i < n; i++) {
      w.fpos[i * 3 + 1] -= dt * 34 * w.seedY[i];
      if (w.fpos[i * 3 + 1] < w.oy - w.fall) {
        w.fpos[i * 3] = w.ox + (Math.random() - 0.5) * w.spread;
        w.fpos[i * 3 + 1] = w.oy;
        w.fpos[i * 3 + 2] = w.oz + (Math.random() - 0.5) * w.spread;
      }
    }
    w.points.geometry.attributes.position.needsUpdate = true;
  }
}

/* ------------------------------------------------------------------ *
 *  Rainbow bridge — 7 translucent arcs + glowing walkway
 * ------------------------------------------------------------------ */
function buildRainbowBridge() {
  const g = new THREE.Group();
  const RAINBOW = [0xff5f72, 0xffa45d, 0xf0e130, 0x6dff9e, 0x5dc8ff, 0x8f7dff, 0xc77dff];
  const arcGeos = [];
  for (let i = 0; i < RAINBOW.length; i++) {
    const radius = 46 + i * 5.2;
    const geo = new THREE.TorusGeometry(radius, 0.85, 8, 72, Math.PI);
    const mat = new THREE.MeshBasicMaterial({
      color: RAINBOW[i],
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const arc = new THREE.Mesh(geo, mat);
    arc.position.set(0, 2, -150);
    g.add(arc);
    arcGeos.push(geo);
    state.disposables.push(geo, mat);
  }

  // soft glow ribbon along the approach (walkway over the water)
  const ribbonTex = makeRibbonTexture();
  ribbonTex.wrapS = ribbonTex.wrapT = THREE.RepeatWrapping;
  ribbonTex.repeat.set(1, 10);
  const ribbonMat = new THREE.MeshBasicMaterial({
    map: ribbonTex,
    transparent: true,
    opacity: 0.42,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const ribbon = new THREE.Mesh(new THREE.PlaneGeometry(16, 230, 1, 1), ribbonMat);
  ribbon.rotation.x = -Math.PI / 2;
  ribbon.position.set(0, 1.4, -135);
  g.add(ribbon);
  state.disposables.push(ribbon.geometry, ribbonMat);

  state.scene.add(g);
  state.rainbowGroup = g;
}

/* ------------------------------------------------------------------ *
 *  Fireflies (shader-drifted points)
 * ------------------------------------------------------------------ */
function buildFireflies() {
  const MAX = 480; // enhanced: more fireflies for cinematic atmosphere
  const rng = makeRng(90210);
  const pos = new Float32Array(MAX * 3);
  const aPhase = new Float32Array(MAX);
  const aSpeed = new Float32Array(MAX);
  const aSize = new Float32Array(MAX);
  const aMix = new Float32Array(MAX);
  for (let i = 0; i < MAX; i++) {
    // clustered around the bridge, islands and castle approach
    const cluster = rng();
    let x;
    let y;
    let z;
    if (cluster < 0.4) {
      x = (rng() - 0.5) * 150;
      y = 3 + rng() * 46;
      z = -20 - rng() * 250;
    } else if (cluster < 0.75) {
      const isl = ISLAND_DEFS[Math.floor(rng() * ISLAND_DEFS.length)];
      x = isl.pos[0] + (rng() - 0.5) * 90;
      y = isl.pos[1] + (rng() - 0.5) * 60;
      z = isl.pos[2] + (rng() - 0.5) * 90;
    } else {
      x = (rng() - 0.5) * 380;
      y = 4 + rng() * 90;
      z = -60 - rng() * 320;
    }
    pos[i * 3] = x;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = z;
    aPhase[i] = rng() * Math.PI * 2;
    aSpeed[i] = 0.25 + rng() * 0.85;
    aSize[i] = 1.1 + rng() * 2.6;
    aMix[i] = rng();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(aPhase, 1));
  geo.setAttribute('aSpeed', new THREE.BufferAttribute(aSpeed, 1));
  geo.setAttribute('aSize', new THREE.BufferAttribute(aSize, 1));
  geo.setAttribute('aMix', new THREE.BufferAttribute(aMix, 1));
  const uniforms = {
    uTime: { value: 0 },
    uGold: { value: srgb(TOKENS.gold) },
    uGlow: { value: srgb(TOKENS.purpleGlow) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute float aPhase;
      attribute float aSpeed;
      attribute float aSize;
      attribute float aMix;
      uniform float uTime;
      varying float vMix;
      varying float vTw;
      void main(){
        vec3 p = position;
        float t = uTime * aSpeed + aPhase;
        p.x += sin(t) * 2.6 + sin(t * 0.37 + aPhase * 2.0) * 1.8;
        p.y += sin(t * 0.8 + 1.7) * 2.1;
        p.z += cos(t * 0.63 + aPhase) * 2.6;
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = aSize * (300.0 / max(-mvPosition.z, 1.0));
        gl_PointSize = clamp(gl_PointSize, 1.0, 30.0);
        vMix = aMix;
        vTw = 0.5 + 0.5 * sin(uTime * (1.2 + aSpeed) + aPhase * 3.0);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uGold;
      uniform vec3 uGlow;
      varying float vMix;
      varying float vTw;
      void main(){
        float d = length(gl_PointCoord - vec2(0.5));
        float a = smoothstep(0.5, 0.03, d);
        a = a * a * (0.35 + 0.65 * vTw);
        vec3 col = mix(uGold, uGlow, vMix) * (0.7 + 0.8 * vTw);
        gl_FragColor = vec4(col, a);
      }
    `,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  state.scene.add(points);
  state.fireflies = points;
  state.timedUniforms.push(uniforms);
  state.disposables.push(geo, mat);
}

/* ------------------------------------------------------------------ *
 *  Petals (JS-drifted points, pink)
 * ------------------------------------------------------------------ */
function buildPetals() {
  const MAX = 260;
  const rng = makeRng(4242);
  const pos = new Float32Array(MAX * 3);
  const vel = new Float32Array(MAX * 3);
  const sway = new Float32Array(MAX);
  for (let i = 0; i < MAX; i++) {
    pos[i * 3] = (rng() - 0.5) * 260;
    pos[i * 3 + 1] = 6 + rng() * 92;
    pos[i * 3 + 2] = -8 - rng() * 300;
    vel[i * 3] = (rng() - 0.5) * 1.6;
    vel[i * 3 + 1] = -(1.1 + rng() * 2.1);
    vel[i * 3 + 2] = (rng() - 0.5) * 1.2;
    sway[i] = rng() * Math.PI * 2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const tex = makePetalTexture();
  const mat = new THREE.PointsMaterial({
    map: tex,
    color: TOKENS.pink,
    size: 2.3,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  state.scene.add(points);
  state.petals = points;
  state.petalData = { pos, vel, sway };
  state.disposables.push(geo, mat);
}

function updatePetals(dt) {
  const d = state.petalData;
  if (!d) return;
  const n = Math.min(d.sway.length, QUALITY_COUNTS[state.quality].petals);
  for (let i = 0; i < n; i++) {
    d.pos[i * 3] += (d.vel[i * 3] + Math.sin(state.time * 0.8 + d.sway[i]) * 1.7) * dt;
    d.pos[i * 3 + 1] += d.vel[i * 3 + 1] * dt;
    d.pos[i * 3 + 2] += (d.vel[i * 3 + 2] + Math.cos(state.time * 0.6 + d.sway[i]) * 1.1) * dt;
    if (d.pos[i * 3 + 1] < 1.5) {
      d.pos[i * 3] = (Math.random() - 0.5) * 260;
      d.pos[i * 3 + 1] = 80 + Math.random() * 30;
      d.pos[i * 3 + 2] = -8 - Math.random() * 300;
    }
  }
  state.petals.geometry.attributes.position.needsUpdate = true;
}

/* ------------------------------------------------------------------ *
 *  Butterflies — two-triangle wings that flap
 * ------------------------------------------------------------------ */
function buildButterflies() {
  const colors = [
    ['#ff69b4', '#c77dff'],
    ['#c77dff', '#7b2cbf'],
    ['#ffd700', '#ff69b4'],
    ['#e87a5d', '#ffd700'],
    ['#8f7dff', '#5dc8ff'],
    ['#ff69b4', '#f0e130'],
  ];
  const rng = makeRng(777);
  const bodyGeo = new THREE.CylinderGeometry(0.09, 0.05, 0.72, 5);
  bodyGeo.rotateX(Math.PI / 2);
  const bodyMat = new THREE.MeshBasicMaterial({ color: 0x2d1b3d });
  state.disposables.push(bodyGeo, bodyMat);

  const wingGeoL = new THREE.PlaneGeometry(0.95, 0.66);
  wingGeoL.rotateX(-Math.PI / 2);
  wingGeoL.translate(0.48, 0, 0);
  const wingGeoR = new THREE.PlaneGeometry(0.95, 0.66);
  wingGeoR.rotateX(-Math.PI / 2);
  wingGeoR.translate(-0.48, 0, 0);
  state.disposables.push(wingGeoL, wingGeoR);

  // Six palette materials are shared by all 16 butterflies. Rebuilding the
  // same 128px canvas texture for every butterfly wastes CPU and GPU memory.
  const wingMaterials = colors.map(([base, accent]) => {
    const tex = makeWingTexture(base, accent);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      opacity: 0.92,
    });
    state.disposables.push(mat);
    return mat;
  });

  for (let i = 0; i < 16; i++) {
    const mat = wingMaterials[i % wingMaterials.length];
    const group = new THREE.Group();
    const wingL = new THREE.Mesh(wingGeoL, mat);
    const wingR = new THREE.Mesh(wingGeoR, mat);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    group.add(wingL, wingR, body);
    const scale = 0.8 + rng() * 1.3;
    group.scale.setScalar(scale);
    state.scene.add(group);
    state.butterflies.push({
      group,
      wingL,
      wingR,
      phase: rng() * Math.PI * 2,
      flapSpeed: 6 + rng() * 5,
      orbitSpeed: 0.05 + rng() * 0.1,
      orbitR: 18 + rng() * 42,
      height: 8 + rng() * 55,
      cx: (rng() - 0.5) * 170,
      cz: -40 - rng() * 220,
    });
  }
}

function updateButterflies() {
  const count = QUALITY_COUNTS[state.quality].butterflies;
  for (let i = 0; i < Math.min(count, state.butterflies.length); i++) {
    const b = state.butterflies[i];
    const t = state.time * b.orbitSpeed + b.phase;
    b.group.position.set(
      b.cx + Math.sin(t) * b.orbitR,
      b.height + Math.sin(t * 1.7 + b.phase) * 6,
      b.cz + Math.cos(t * 0.8) * b.orbitR * 0.7,
    );
    b.group.rotation.y = t + Math.PI / 2;
    const flap = Math.sin(state.time * b.flapSpeed + b.phase) * 0.95;
    b.wingL.rotation.z = flap;
    b.wingR.rotation.z = -flap;
    b.group.rotation.x = Math.sin(t * 2.1) * 0.18;
  }
}

/* ------------------------------------------------------------------ *
 *  Drifting clouds
 * ------------------------------------------------------------------ */
function buildClouds() {
  // Enhanced: additional cloud layers for atmospheric depth
  const tex = makeCloudTexture();
  for (let i = 0; i < 18; i++) {
    const mat = new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      fog: false,
      opacity: 0.10 + Math.random() * 0.12,
      color: i % 3 === 0 ? 0xd8b4fe : 0xffffff,
    });
    const sp = new THREE.Sprite(mat);
    const w = 380 + Math.random() * 520;
    sp.scale.set(w, w * (0.22 + Math.random() * 0.12), 1);
    sp.position.set((Math.random() - 0.5) * 1200, 110 + Math.random() * 240, -120 - Math.random() * 1000);
    state.scene.add(sp);
    state.clouds.push({ sprite: sp, baseX: sp.position.x, speed: 2.2 + Math.random() * 4.5, phase: Math.random() * 1000 });
    state.disposables.push(mat);
  }
}

function updateClouds() {
  const count = QUALITY_COUNTS[state.quality].clouds;
  for (let i = 0; i < Math.min(count, state.clouds.length); i++) {
    const c = state.clouds[i];
    c.sprite.position.x = ((c.baseX + state.time * c.speed + c.phase + 700) % 1400) - 700;
    c.sprite.position.y += Math.sin(state.time * 0.07 + c.phase) * 0.02;
  }
}

/* ------------------------------------------------------------------ *
 *  Ambient lighting
 * ------------------------------------------------------------------ */
function buildLights() {
  const hemi = new THREE.HemisphereLight(TOKENS.purpleCore, TOKENS.inkAbyss, 2.05);
  state.scene.add(hemi);
  const amb = new THREE.AmbientLight(TOKENS.inkDeep, 2.35);
  state.scene.add(amb);
  const castleGlow = new THREE.PointLight(TOKENS.gold, 4600, 380, 2);
  castleGlow.position.set(0, 60, -225);
  state.scene.add(castleGlow);
  const violetGlow = new THREE.PointLight(TOKENS.purpleGlow, 3400, 460, 2);
  violetGlow.position.set(-60, 110, -200);
  state.scene.add(violetGlow);
  const bridgeGlow = new THREE.PointLight(TOKENS.pink, 1700, 240, 2);
  bridgeGlow.position.set(0, 26, -110);
  state.scene.add(bridgeGlow);
}

/* ------------------------------------------------------------------ *
 *  Camera destinations & scroll spline
 * ------------------------------------------------------------------ */
const INTRO_START = { pos: [0, 26, 430], look: [0, 72, -260], fov: 62 };
const HERO = { pos: [0, 34, 72], look: [0, 64, -262], fov: 52 };

const DESTINATIONS = {
  portal: { pos: [0, 9, -14], look: [0, 44, -226], fov: 58 },
  ot7: HERO,
  music: { pos: [42, 58, -168], look: [-2, 88, -262], fov: 48 },
  busan: { pos: [-86, 7, -46], look: [-390, 120, -950], fov: 55 },
  quest: { pos: [150, 190, 170], look: [0, 30, -250], fov: 55 },
  violet: { pos: [0, 12, -36], look: [-320, 430, -1120], fov: 62 },
  road: { pos: [-7, 16, -88], look: [0, 46, -248], fov: 54 },
  promise: { pos: [-150, 66, -52], look: [-268, 316, -1160], fov: 50 },
};

const SCROLL_POS = [
  [0, 210, 350],
  [-150, 130, 190],
  [-100, 52, 22],
  [0, 19, -62],
  [46, 32, -152],
  [-32, 64, -212],
  [10, 128, -128],
  [-130, 96, -36],
  [-240, 150, -280],
];
const SCROLL_LOOK = [
  [0, 62, -262],
  [0, 62, -262],
  [0, 56, -244],
  [0, 60, -256],
  [0, 82, -262],
  [0, 98, -266],
  [-180, 300, -1020],
  [-330, 380, -1120],
  [-430, 430, -1230],
];

const scrollPosCurve = new THREE.CatmullRomCurve3(SCROLL_POS.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
const scrollLookCurve = new THREE.CatmullRomCurve3(SCROLL_LOOK.map((p) => new THREE.Vector3(p[0], p[1], p[2])));

/* ------------------------------------------------------------------ *
 *  Tween engine
 * ------------------------------------------------------------------ */
function addTween(t) {
  const tw = { t: 0, done: false, ...t };
  state.tweens.push(tw);
  return tw;
}

function updateTweens(dt) {
  if (!state.tweens.length) return;
  const keep = [];
  for (const tw of state.tweens) {
    tw.t = Math.min(tw.t + dt, tw.dur);
    const p = tw.dur > 0 ? tw.ease(tw.t / tw.dur) : 1;
    tw.onUpdate(p);
    if (tw.t >= tw.dur) {
      if (tw.onComplete) tw.onComplete();
    } else {
      keep.push(tw);
    }
  }
  state.tweens = keep;
}

function finishTweensNow() {
  const list = state.tweens;
  state.tweens = [];
  for (const tw of list) {
    tw.onUpdate(tw.ease(1));
    if (tw.onComplete) tw.onComplete();
  }
}

function setPoseInstant(pos, look, fov) {
  state.camPos.set(pos[0], pos[1], pos[2]);
  state.camLook.set(look[0], look[1], look[2]);
  state.camFov = fov;
}

function tweenCameraTo(pos, look, fov, dur) {
  if (state.reducedMotion) {
    setPoseInstant(pos, look, fov);
    return;
  }
  const p0 = state.camPos.clone();
  const l0 = state.camLook.clone();
  const f0 = state.camFov;
  const p1 = new THREE.Vector3(pos[0], pos[1], pos[2]);
  const l1 = new THREE.Vector3(look[0], look[1], look[2]);
  addTween({
    dur,
    ease: easeCubicInOut,
    onUpdate: (k) => {
      state.camPos.lerpVectors(p0, p1, k);
      state.camLook.lerpVectors(l0, l1, k);
      state.camFov = f0 + (fov - f0) * k;
    },
  });
}

function cancelIntro() {
  if (state.intro) {
    const intro = state.intro;
    state.intro = null;
    state.tweens = state.tweens.filter((tw) => tw.tag !== 'intro');
    if (intro.resolve) intro.resolve();
    if (state.cameraMode === 'intro') state.cameraMode = 'preset';
  }
}

/* ------------------------------------------------------------------ *
 *  Render loop
 * ------------------------------------------------------------------ */

/* First-frame signal.
 *
 * The canvas sits at `opacity: 0` in CSS and only becomes visible via the
 * `is-live` class (see #scene-canvas in index.html). If that class lands
 * before a real frame exists, the visitor sees the flat `.bg-fallback`
 * gradient and the scene looks like a "background-only canvas".
 *
 * So we announce the moment real pixels have been drawn and let the UI
 * reveal the canvas on that signal. Purely additive; never throws. */
let firstFrameDone = false;
let renderedFrames = 0;
function signalFirstFrame() {
  renderedFrames += 1;
  if (firstFrameDone) return;
  firstFrameDone = true;
  try {
    if (typeof document !== 'undefined' && typeof document.dispatchEvent === 'function') {
      document.dispatchEvent(new CustomEvent('nishi:world-firstframe'));
    }
  } catch (e) {
    /* never let diagnostics break the render loop */
  }
}

function tick() {
  if (state.ctxLost || !state.ready) return;
  const dt = Math.min(state.clock.getDelta(), 0.05);
  const animDt = state.reducedMotion ? 0 : dt;
  state.time += animDt;

  updateTweens(state.reducedMotion ? 0 : dt);

  // camera: scroll spline mode
  if (state.cameraMode === 'spline') {
    const k = state.reducedMotion ? 1 : 1 - Math.exp(-dt * 2.2);
    state.scrollCur += (state.scrollTarget - state.scrollCur) * k;
    scrollPosCurve.getPoint(clamp01(state.scrollCur), state.camPos);
    scrollLookCurve.getPoint(clamp01(state.scrollCur), state.camLook);
    state.camFov = 58 - 8 * state.scrollCur;
  }

  // damped parallax on top of the base pose
  const pk = state.reducedMotion ? 1 : 1 - Math.exp(-dt * 2.6);
  state.par.x += (state.parTarget.x - state.par.x) * pk;
  state.par.y += (state.parTarget.y - state.par.y) * pk;
  state.camera.position.set(
    state.camPos.x + state.par.x * 6,
    state.camPos.y + state.par.y * 3.2,
    state.camPos.z,
  );
  state.camera.lookAt(
    state.camLook.x + state.par.x * 2.5,
    state.camLook.y + state.par.y * 1.6,
    state.camLook.z,
  );
  if (Math.abs(state.camera.fov - state.camFov) > 0.01) {
    state.camera.fov = state.camFov;
    state.camera.updateProjectionMatrix();
  }

  // animated shader time
  for (const u of state.timedUniforms) {
    if (u.uTime) u.uTime.value = state.time;
  }

  // moon billboard
  if (state.moon) state.moon.lookAt(state.camera.position);

  // window glow flicker (pure function of time -> frozen under reduced motion)
  if (state.windowMat) {
    const f = 0.86 + 0.14 * Math.sin(state.time * 1.7) * Math.sin(state.time * 0.63 + 1.2);
    state.windowMat.color.setHex(TOKENS.gold).multiplyScalar(f);
  }

  // pennant sway
  if (state.flags) {
    for (let i = 0; i < state.flags.length; i++) {
      state.flags[i].rotation.y = Math.sin(state.time * 1.25 + i * 2.1) * 0.16;
    }
  }

  if (!state.reducedMotion) {
    updateShooters(dt);
    updatePetals(dt);
    updateWaterfalls(dt);
    updateButterflies();
    updateClouds();
  }

  renderWithPostProcessing();
  if (state.ctxRecoveryPending) {
    state.ctxRecoveryPending = false;
    if (state.canvas) state.canvas.classList.add('is-live');
    try {
      document.dispatchEvent(new CustomEvent('nishi:world-context-restored'));
    } catch (e) {
      /* recovery signal must never break rendering */
    }
  }
  signalFirstFrame();
}

/* ------------------------------------------------------------------ *
 *  Post-processing: Bloom + Vignette + Chromatic Aberration
 *  Pure Three.js core — no external modules needed.
 * ------------------------------------------------------------------ */
function disposePostProcessing() {
  const c = state.composer;
  if (!c) return;
  state.composer = null;
  for (const resource of [c.renderTarget, c.material, c.geo]) {
    try { resource?.dispose(); } catch (e) { /* ignore */ }
    const index = state.disposables.indexOf(resource);
    if (index !== -1) state.disposables.splice(index, 1);
  }
}

function postProcessingSize() {
  if (!state.renderer) return { w: 1, h: 1 };
  // The post pass is a full-screen effect, so phones can render it below
  // native DPR without reducing the main canvas' CSS dimensions.
  const scale = state.isMobile
    ? ({ high: 0.85, medium: 0.7, low: 0.55 }[state.quality] || 0.7)
    : 1;
  return {
    w: Math.max(1, Math.floor(state.renderer.domElement.width * scale)),
    h: Math.max(1, Math.floor(state.renderer.domElement.height * scale)),
  };
}

function setupPostProcessing() {
  if (!state.renderer || !state.scene || !state.camera) return;
  disposePostProcessing();

  const { w, h } = postProcessingSize();

  // Offscreen render target (scene renders here first)
  const rt = new THREE.WebGLRenderTarget(w, h, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    type: state.quality === 'high' ? THREE.HalfFloatType : THREE.UnsignedByteType,
  });

  // Fullscreen quad with post-processing shader
  const postScene = new THREE.Scene();
  const postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const postGeo = new THREE.PlaneGeometry(2, 2);

  const postMat = new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: rt.texture },
      uResolution: { value: new THREE.Vector2(w, h) },
      uBloomStrength: { value: state.bloomStrength },
      uVignetteAmount: { value: state.vignetteAmount },
      uChromaticAmount: { value: state.chromaticAmount },
      uTime: { value: 0 },
      uMobile: { value: state.isMobile ? 1 : 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform vec2 uResolution;
      uniform float uBloomStrength;
      uniform float uVignetteAmount;
      uniform float uChromaticAmount;
      uniform float uTime;
      uniform float uMobile;
      varying vec2 vUv;

      // Simple box blur for bloom
      vec3 sampleBlur(vec2 uv, float radius) {
        vec3 sum = vec3(0.0);
        float total = 0.0;
        for (float x = -3.0; x <= 3.0; x += 1.0) {
          for (float y = -3.0; y <= 3.0; y += 1.0) {
            vec2 offset = vec2(x, y) * radius / uResolution;
            sum += texture2D(tDiffuse, uv + offset).rgb;
            total += 1.0;
          }
        }
        return sum / total;
      }

      void main() {
        vec2 uv = vUv;

        // Chromatic aberration (subtle RGB channel offset)
        float ca = uChromaticAmount * length(uv - 0.5);
        vec3 color;
        color.r = texture2D(tDiffuse, uv + vec2(ca, 0.0)).r;
        color.g = texture2D(tDiffuse, uv).g;
        color.b = texture2D(tDiffuse, uv - vec2(ca, 0.0)).b;

        // Bloom: use a lightweight five-tap approximation on phones.
        // Desktop keeps the wider multi-radius blur for richer highlights.
        vec3 bloom;
        if (uMobile > 0.5) {
          vec2 px = 2.0 / uResolution;
          bloom = (
            texture2D(tDiffuse, uv).rgb +
            texture2D(tDiffuse, uv + vec2(px.x, 0.0)).rgb +
            texture2D(tDiffuse, uv - vec2(px.x, 0.0)).rgb +
            texture2D(tDiffuse, uv + vec2(0.0, px.y)).rgb +
            texture2D(tDiffuse, uv - vec2(0.0, px.y)).rgb
          ) * 0.2;
        } else {
          vec3 blur1 = sampleBlur(uv, 4.0);
          vec3 blur2 = sampleBlur(uv, 8.0);
          vec3 blur3 = sampleBlur(uv, 16.0);
          bloom = blur1 * 0.5 + blur2 * 0.3 + blur3 * 0.2;
        }
        // Extract bright parts (highlights)
        float brightness = dot(bloom, vec3(0.2126, 0.7152, 0.0722));
        vec3 bloomHighlights = bloom * smoothstep(0.45, 1.2, brightness);
        color += bloomHighlights * uBloomStrength;

        // Vignette
        float dist = length(uv - 0.5) * 1.42;
        float vignette = 1.0 - smoothstep(0.55, 1.25, dist) * uVignetteAmount;
        color *= vignette;

        // Subtle warm-cool tone shift for cinematic feel
        color.r *= 1.02;
        color.b *= 0.98;

        gl_FragColor = vec4(color, 1.0);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });

  const postMesh = new THREE.Mesh(postGeo, postMat);
  postScene.add(postMesh);

  state.composer = {
    renderTarget: rt,
    scene: postScene,
    camera: postCamera,
    material: postMat,
    mesh: postMesh,
    geo: postGeo,
  };
  state.disposables.push(rt, postMat, postGeo);
}

function renderWithPostProcessing() {
  if (!state.composer || !state.renderer) {
    // fallback: direct render
    state.renderer?.render(state.scene, state.camera);
    return;
  }
  const c = state.composer;

  // Update time uniform
  c.material.uniforms.uTime.value = performance.now() * 0.001;

  // 1. Render scene to offscreen target
  state.renderer.setRenderTarget(c.renderTarget);
  state.renderer.clear();
  state.renderer.render(state.scene, state.camera);

  // 2. Render post-processing quad to screen
  state.renderer.setRenderTarget(null);
  state.renderer.render(c.scene, c.camera);
}

function resizePostProcessing() {
  if (!state.composer || !state.renderer) return;
  const { w, h } = postProcessingSize();
  if (state.composer.renderTarget.width !== w || state.composer.renderTarget.height !== h) {
    state.composer.renderTarget.setSize(w, h);
  }
  state.composer.material.uniforms.uResolution.value.set(w, h);
}

/* ------------------------------------------------------------------ *
 *  Quality
 * ------------------------------------------------------------------ */
const QUALITY_COUNTS = {
  high: { stars: 4200, fireflies: 320, petals: 260, butterflies: 16, clouds: 18, fall: 1 },
  medium: { stars: 2200, fireflies: 160, petals: 120, butterflies: 8, clouds: 11, fall: 0.5 },
  low: { stars: 900, fireflies: 60, petals: 44, butterflies: 4, clouds: 6, fall: 0.25 },
};

function normalizeQuality(level) {
  if (level === 'high' || level === 'medium' || level === 'low') return level;
  return state.isMobile ? 'medium' : 'high';
}

function dprForQuality() {
  const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  const caps = state.isMobile
    ? { high: 1.5, medium: 1.25, low: 1 }
    : { high: 2, medium: 1.75, low: 1.25 };
  return Math.min(dpr, caps[state.quality]);
}

function applyQuality() {
  const c = QUALITY_COUNTS[state.quality];
  if (state.stars) state.stars.geometry.setDrawRange(0, c.stars);
  if (state.fireflies) state.fireflies.geometry.setDrawRange(0, c.fireflies);
  if (state.petals) state.petals.geometry.setDrawRange(0, c.petals);
  for (let i = 0; i < state.butterflies.length; i++) {
    state.butterflies[i].group.visible = i < c.butterflies;
  }
  for (let i = 0; i < state.clouds.length; i++) {
    state.clouds[i].sprite.visible = i < c.clouds;
  }
  for (const w of state.waterfalls) {
    w.points.geometry.setDrawRange(0, Math.floor(w.seedY.length * c.fall));
  }

  const wantShadows = state.quality === 'high';
  if (state.renderer && state.renderer.shadowMap.enabled !== wantShadows) {
    state.renderer.shadowMap.enabled = wantShadows;
    if (state.dirLight) state.dirLight.castShadow = wantShadows;
    // shadow toggling changes the program cache key -> recompile materials once
    state.scene.traverse((obj) => {
      const m = obj.material;
      if (!m) return;
      if (Array.isArray(m)) {
        for (const mm of m) mm.needsUpdate = true;
      } else {
        m.needsUpdate = true;
      }
    });
  }
  if (state.renderer) state.renderer.setPixelRatio(dprForQuality());
  resize();
}

/** Recreate the renderer on a fresh canvas so antialiasing can change at runtime. */
function swapAntialias(wantAA) {
  const parent = state.canvas && state.canvas.parentNode;
  if (!parent) return false;
  try {
    const previousCanvas = state.canvas;
    const fresh = previousCanvas.cloneNode(false); // keeps id/class/style attributes
    detachContextHandlers(previousCanvas);
    parent.replaceChild(fresh, previousCanvas);
    disposePostProcessing();
    try {
      state.renderer.dispose();
    } catch (e) {
      /* ignore */
    }
    state.canvas = fresh;
    state.renderer = createRenderer(fresh, wantAA);
  setupPostProcessing();
    attachContextHandlers(fresh);
    state.renderer.setPixelRatio(dprForQuality());
    resizePostProcessing();
    return true;
  } catch (e) {
    return false;
  }
}

/* ------------------------------------------------------------------ *
 *  Renderer / context
 * ------------------------------------------------------------------ */
function createRenderer(canvas, antialias) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !!antialias,
    powerPreference: 'high-performance',
    alpha: false,
    stencil: false,
  });
  renderer.setPixelRatio(dprForQuality());
  // ACES tone mapping keeps highlights from clipping and lifts midtones so the
  // purple scene reads as *cinematic* rather than muddy/near-black.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.32;
  renderer.shadowMap.enabled = state.quality === 'high';
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  return renderer;
}

function detachContextHandlers(canvas = state.canvas) {
  const handlers = state.contextHandlers;
  if (!canvas || !handlers) return;
  canvas.removeEventListener('webglcontextlost', handlers.lost);
  canvas.removeEventListener('webglcontextrestored', handlers.restored);
  state.contextHandlers = null;
}

function attachContextHandlers(canvas) {
  detachContextHandlers();
  const lost = (e) => {
    e.preventDefault();
    state.ctxLost = true;
    state.ctxRecoveryPending = false;
    if (canvas === state.canvas) canvas.classList.remove('is-live');
  };
  const restored = () => {
    // Three.js restores its WebGL internals before this listener runs.
    // Keep the CSS fallback visible until a real frame renders again.
    state.ctxLost = false;
    state.ctxRecoveryPending = true;
  };
  state.contextHandlers = { lost, restored };
  canvas.addEventListener('webglcontextlost', lost);
  canvas.addEventListener('webglcontextrestored', restored);
}

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(
      typeof window !== 'undefined' &&
      window.WebGLRenderingContext &&
      (c.getContext('webgl2') || c.getContext('webgl') || c.getContext('experimental-webgl'))
    );
  } catch (e) {
    return false;
  }
}

function prefersReducedMotion() {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;
  } catch (e) {
    return false;
  }
}

/* ------------------------------------------------------------------ *
 *  PUBLIC API
 * ------------------------------------------------------------------ */

/**
 * Build the world on `canvas`.
 * @param {HTMLCanvasElement} canvas
 * @param {{quality?: 'auto'|'high'|'medium'|'low', reducedMotion?: boolean}} [opts]
 * @returns {{ok: boolean, reason?: string}}
 */
export function initWorld(canvas, opts = {}) {
  try {
    if (state.ready) return { ok: true };
    if (state.disposed) return { ok: false, reason: 'world was disposed' };
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return { ok: false, reason: 'no DOM available' };
    }
    if (!canvas || typeof canvas.getContext !== 'function') {
      return { ok: false, reason: 'invalid canvas element' };
    }
    if (!webglAvailable()) {
      return { ok: false, reason: 'WebGL is not available in this browser' };
    }

    state.isMobile =
      (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches) ||
      Math.min(window.innerWidth || 0, window.innerHeight || 0) < 820;
    state.quality = normalizeQuality(opts.quality);
    state.reducedMotion = opts.reducedMotion != null ? !!opts.reducedMotion : prefersReducedMotion();
    state.canvas = canvas;

    state.renderer = createRenderer(canvas, state.quality === 'high');
    state.scene = new THREE.Scene();
    state.scene.background = new THREE.Color(TOKENS.inkAbyss);
    state.scene.fog = new THREE.FogExp2(TOKENS.inkDeep, FOG_DENSITY);

    state.camera = new THREE.PerspectiveCamera(62, 1, 0.5, 4000);
    setPoseInstant(INTRO_START.pos, INTRO_START.look, INTRO_START.fov);
    setupPostProcessing();

    buildSky();
    buildStars();
    buildMoon();
    buildMountains();
    buildWater();
    buildCastle();
    buildRainbowBridge();
    buildIslands();
    buildFireflies();
    buildPetals();
    buildButterflies();
    buildClouds();
    buildLights();

    state.clock = new THREE.Clock();
    attachContextHandlers(canvas);

    state.ready = true;
    applyQuality();
    resize();

    state.renderer.setAnimationLoop(tick);
    return { ok: true };
  } catch (e) {
    // Partial scene construction may already own GPU buffers, textures,
    // render targets, listeners, and an animation loop. Release them before
    // returning control to the CSS fallback; never leave a half-built world.
    try {
      dispose();
    } catch (cleanupError) {
      console.warn('[nishi] partial world cleanup failed:', cleanupError && cleanupError.message);
    }
    state.ready = false;
    return { ok: false, reason: (e && e.message) || 'unknown error while building the world' };
  }
}

/**
 * Cinematic dolly-in from the far establishing shot to the hero framing.
 * Resolves when the shot settles, or immediately when skipped via
 * `startIntro(true)` / setDestination() / onScroll().
 * @param {boolean} [skip] jump straight to the hero framing
 * @returns {Promise<void>}
 */
export function startIntro(skip) {
  return new Promise((resolve) => {
    if (!state.ready || state.disposed) {
      resolve();
      return;
    }
    cancelIntro(); // resolve any previous intro promise

    if (skip || state.reducedMotion) {
      setPoseInstant(HERO.pos, HERO.look, HERO.fov);
      state.cameraMode = 'preset';
      resolve();
      return;
    }

    const p0 = state.camPos.clone();
    const l0 = state.camLook.clone();
    const f0 = state.camFov;
    const p1 = new THREE.Vector3(HERO.pos[0], HERO.pos[1], HERO.pos[2]);
    const l1 = new THREE.Vector3(HERO.look[0], HERO.look[1], HERO.look[2]);

    state.cameraMode = 'intro';
    const tw = addTween({
      tag: 'intro',
      dur: 3.5,
      ease: easeCubicInOut,
      onUpdate: (k) => {
        state.camPos.lerpVectors(p0, p1, k);
        state.camLook.lerpVectors(l0, l1, k);
        state.camFov = f0 + (HERO.fov - f0) * k;
      },
      onComplete: () => {
        state.cameraMode = 'preset';
        if (state.intro && state.intro.resolve) state.intro.resolve();
        state.intro = null;
      },
    });
    state.intro = { resolve, tween: tw };
  });
}

/**
 * Smooth eased camera transition to a named vantage point.
 * Names: 'portal' | 'ot7' | 'music' | 'busan' | 'quest' | 'violet' | 'road' | 'promise'
 */
export function setDestination(name) {
  if (!state.ready || state.disposed) return;
  const d = DESTINATIONS[name];
  if (!d) return;
  cancelIntro();
  state.cameraMode = 'preset';
  tweenCameraTo(d.pos, d.look, d.fov, 2.2);
}

/** Quality switcher: 'high' | 'medium' | 'low'. */
export function setQuality(level) {
  if (!state.ready || state.disposed) return;
  const q = normalizeQuality(level);
  if (q === state.quality) {
    applyQuality();
    return;
  }
  const wantAA = q === 'high';
  const hadAA = state.quality === 'high';
  state.quality = q;
  if (wantAA !== hadAA) {
    const swapped = swapAntialias(wantAA);
    if (!swapped) {
      // canvas is not in the DOM — antialiasing stays as created
      state.quality = q;
    }
  }
  if (state.renderer) state.renderer.shadowMap.enabled = wantAA;
  applyQuality();
}

/**
 * Pointer parallax. x/y normalised to -1..1. Damped — deliberately subtle.
 */
export function onPointerMove(x, y) {
  if (state.disposed) return;
  const nx = Math.max(-1, Math.min(1, Number(x) || 0));
  const ny = Math.max(-1, Math.min(1, Number(y) || 0));
  state.parTarget.set(nx, -ny);
}

/** 0..1 page scroll progress -> camera travels along a smooth spline. */
export function onScroll(progress) {
  if (!state.ready || state.disposed) return;
  cancelIntro();
  state.scrollTarget = clamp01(Number(progress) || 0);
  if (state.cameraMode !== 'spline') {
    state.scrollCur = state.scrollTarget;
    state.cameraMode = 'spline';
  }
}

/** Resize the render target to the canvas' current CSS size. */
export function resize() {
  if (!state.ready || !state.renderer || !state.camera) return;
  try {
    const w = (state.canvas && (state.canvas.clientWidth || state.canvas.width)) || window.innerWidth;
    const h = (state.canvas && (state.canvas.clientHeight || state.canvas.height)) || window.innerHeight;
    if (!w || !h) return;
    state.camera.aspect = w / h;
    state.camera.updateProjectionMatrix();
    state.renderer.setSize(w, h, false);
    resizePostProcessing();
  } catch (e) {
    /* never throw from resize */
  }
}

/**
 * Reduced-motion mode: freezes camera motion, particle motion and animated
 * shaders at a still, beautiful composition.
 */
export function setReducedMotion(flag) {
  state.reducedMotion = !!flag;
  if (state.reducedMotion) {
    finishTweensNow(); // snap camera tweens to their final pose
    state.parTarget.set(0, 0);
    state.par.set(0, 0);
  }
}

/**
 * Lightweight diagnostic snapshot. Used by the UI to decide whether the canvas
 * can be revealed, and by future debugging to answer "is the world actually
 * drawing?" without guessing from screenshots.
 * @returns {{ok:boolean, ready:boolean, renderedFrames:number, quality:string, reducedMotion:boolean, ctxLost:boolean}}
 */
export function getWorldStatus() {
  return {
    ok: !!(state.ready && state.renderer),
    ready: !!state.ready,
    renderedFrames,
    quality: state.quality,
    reducedMotion: !!state.reducedMotion,
    ctxLost: !!state.ctxLost,
  };
}

/** Free every geometry, material, texture, the renderer and all listeners. */
export function dispose() {
  if (state.disposed) return;
  state.disposed = true;
  cancelIntro();
  detachContextHandlers();
  try {
    if (state.renderer) state.renderer.setAnimationLoop(null);
  } catch (e) {
    /* ignore */
  }
  state.tweens = [];

  if (state.scene) {
    state.scene.traverse((obj) => {
      if (obj.geometry) {
        try {
          obj.geometry.dispose();
        } catch (e) {
          /* ignore */
        }
      }
      const m = obj.material;
      if (!m) return;
      const mats = Array.isArray(m) ? m : [m];
      for (const mm of mats) {
        try {
          for (const key of Object.keys(mm)) {
            const v = mm[key];
            if (v && v.isTexture) v.dispose();
          }
          mm.dispose();
        } catch (e) {
          /* ignore */
        }
      }
    });
  }
  for (const t of state.textures) {
    try {
      t.dispose();
    } catch (e) {
      /* ignore */
    }
  }
  for (const d of state.disposables) {
    try {
      d.dispose();
    } catch (e) {
      /* ignore */
    }
  }
  if (state.renderer) {
    try {
      state.renderer.dispose();
    } catch (e) {
      /* ignore */
    }
    try {
      if (typeof state.renderer.forceContextLoss === 'function') state.renderer.forceContextLoss();
    } catch (e) {
      /* ignore */
    }
  }

  state.ready = false;
  state.scene = null;
  state.camera = null;
  state.renderer = null;
  state.canvas = null;
  state.textures = [];
  state.disposables = [];
  state.timedUniforms = [];
  state.butterflies = [];
  state.clouds = [];
  state.waterfalls = [];
  state.shooters = [];
  state.stars = null;
  state.fireflies = null;
  state.petals = null;
  state.petalData = null;
  state.moon = null;
  state.moonHalo = null;
  state.flags = null;
}
