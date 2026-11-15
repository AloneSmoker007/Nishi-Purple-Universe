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
  const w = 32;
  const h = 128;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(230,210,255,0.85)');
  g.addColorStop(0.55, 'rgba(199,125,255,0.35)');
  g.addColorStop(1, 'rgba(199,125,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const rng = makeRng(31);
  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.06 + rng() * 0.2})`;
    ctx.fillRect(rng() * w, 0, 1 + rng() * 3, h);
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
  halo.scale.set(1150, 1150, 1);
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
  dir.shadow.mapSize.set(2048, 2048);
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

  // palette-derived stone: mist lifted toward purple-core for moonlit contrast
  const stoneColor = new THREE.Color(TOKENS.mist).lerp(new THREE.Color(TOKENS.purpleCore), 0.24);
  const stoneMat = new THREE.MeshStandardMaterial({
    color: stoneColor,
    roughness: 0.88,
    metalness: 0.08,
    emissive: TOKENS.violetDeep,
    emissiveIntensity: 0.22,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    color: TOKENS.purpleCore,
    roughness: 0.5,
    metalness: 0.3,
    emissive: TOKENS.purpleCore,
    emissiveIntensity: 0.5,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: TOKENS.gold,
    roughness: 0.35,
    metalness: 0.75,
    emissive: TOKENS.gold,
    emissiveIntensity: 0.75,
  });
  const rockMat = new THREE.MeshStandardMaterial({
    color: 0x241238,
    roughness: 1,
    metalness: 0,
    emissive: TOKENS.inkDeep,
    emissiveIntensity: 0.4,
    flatShading: true,
  });
  const winTex = makeWindowTexture();
  const windowMat = new THREE.MeshBasicMaterial({
    map: winTex,
    color: TOKENS.gold,
    transparent: true,
    opacity: 0.98,
    fog: true,
    side: THREE.DoubleSide,
  });
  state.windowMat = windowMat;
  state.disposables.push(stoneMat, roofMat, trimMat, rockMat, windowMat);

  const shadowify = (m) => {
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };

  // rocky base — jittered cylinders read as natural stone
  const rock = new THREE.Mesh(new THREE.CylinderGeometry(48, 74, 30, 12, 3), rockMat);
  rock.position.y = -8;
  jitterGeometry(rock.geometry, 5.5, 44);
  shadowify(rock);
  g.add(rock);

  const terrace = shadowify(new THREE.Mesh(new THREE.CylinderGeometry(36, 44, 12, 12), stoneMat));
  terrace.position.y = 9;
  g.add(terrace);

  // ring walls
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const wall = shadowify(new THREE.Mesh(new THREE.BoxGeometry(30, 17, 4.5), stoneMat));
    wall.position.set(Math.cos(a) * 31, 22, Math.sin(a) * 31);
    wall.rotation.y = -a + Math.PI / 2;
    g.add(wall);
    const parapet = shadowify(new THREE.Mesh(new THREE.BoxGeometry(31, 2.6, 6.4), stoneMat));
    parapet.position.set(Math.cos(a) * 31, 31.5, Math.sin(a) * 31);
    parapet.rotation.y = -a + Math.PI / 2;
    g.add(parapet);
    // crenellations
    for (let c = 0; c < 5; c++) {
      const merlon = new THREE.Mesh(new THREE.BoxGeometry(3.4, 3.2, 2.2), stoneMat);
      const t = (c / 4 - 0.5) * 26;
      merlon.position.set(
        Math.cos(a) * 31 + Math.cos(-a + Math.PI / 2) * t + Math.cos(a) * 3.4,
        34.2,
        Math.sin(a) * 31 + Math.sin(-a + Math.PI / 2) * t + Math.sin(a) * 3.4,
      );
      merlon.rotation.y = -a + Math.PI / 2;
      g.add(merlon);
    }
  }

  // central keep
  const keep = shadowify(new THREE.Mesh(new THREE.CylinderGeometry(11.5, 13.5, 78, 12), stoneMat));
  keep.position.y = 58;
  g.add(keep);
  const keepRoof = shadowify(new THREE.Mesh(new THREE.ConeGeometry(13.5, 26, 12), roofMat));
  keepRoof.position.y = 110;
  g.add(keepRoof);
  const keepSpire = shadowify(new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.1, 14, 6), trimMat));
  keepSpire.position.y = 130;
  g.add(keepSpire);
  const keepOrb = new THREE.Mesh(new THREE.SphereGeometry(2.6, 12, 10), trimMat);
  keepOrb.position.y = 138;
  g.add(keepOrb);
  addWindows(g, windowMat, 11.5, 58, 78, [26, 40, 54, 68], 6, 0.42);

  // six surrounding towers -> 7 spires total (OT7 silhouette)
  const towers = [
    { a: 0.25, r: 27, h: 52, rad: 6.4 },
    { a: 1.32, r: 25, h: 66, rad: 5.8 },
    { a: 2.41, r: 28, h: 44, rad: 6.8 },
    { a: 3.44, r: 24, h: 60, rad: 5.6 },
    { a: 4.52, r: 29, h: 38, rad: 7 },
    { a: 5.58, r: 26, h: 56, rad: 6.1 },
  ];
  for (const t of towers) {
    const x = Math.cos(t.a) * t.r;
    const z = Math.sin(t.a) * t.r;
    const body = shadowify(new THREE.Mesh(new THREE.CylinderGeometry(t.rad, t.rad * 1.22, t.h, 10), stoneMat));
    body.position.set(x, 15 + t.h / 2, z);
    g.add(body);
    const roof = shadowify(new THREE.Mesh(new THREE.ConeGeometry(t.rad * 1.32, t.rad * 3.2, 10), roofMat));
    roof.position.set(x, 15 + t.h + t.rad * 1.5, z);
    g.add(roof);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(t.rad * 0.28, 8, 8), trimMat);
    tip.position.set(x, 15 + t.h + t.rad * 3.1, z);
    g.add(tip);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(t.rad * 1.24, t.rad * 1.24, 1.6, 10), trimMat);
    ring.position.set(x, 15 + t.h - 1, z);
    g.add(ring);
    addWindows(g, windowMat, t.rad, 15 + t.h / 2, t.h * 0.72, [t.h * 0.18, t.h * 0.5], 4, t.a);
  }

  // gatehouse facing the bridge (+z side, toward the camera)
  const gate = shadowify(new THREE.Mesh(new THREE.BoxGeometry(20, 30, 12), stoneMat));
  gate.position.set(0, 26, 38);
  g.add(gate);
  const gateRoof = shadowify(new THREE.Mesh(new THREE.ConeGeometry(14, 12, 4), roofMat));
  gateRoof.position.set(0, 47, 38);
  gateRoof.rotation.y = Math.PI / 4;
  g.add(gateRoof);
  const arch = new THREE.Mesh(new THREE.BoxGeometry(9, 15, 2), new THREE.MeshBasicMaterial({ color: TOKENS.inkAbyss }));
  arch.position.set(0, 18.5, 44.2);
  g.add(arch);
  const gateGlow = new THREE.Mesh(new THREE.PlaneGeometry(8, 13), new THREE.MeshBasicMaterial({
    color: TOKENS.purpleGlow,
    transparent: true,
    opacity: 0.5,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  }));
  gateGlow.position.set(0, 18, 45.4);
  g.add(gateGlow);
  state.disposables.push(arch.geometry, arch.material, gateGlow.geometry, gateGlow.material);

  // pennant flags on the keep + two towers (gentle sway = frozen under reduced motion)
  const flagMat = new THREE.MeshBasicMaterial({ color: TOKENS.pink, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
  const flagMat2 = new THREE.MeshBasicMaterial({ color: TOKENS.goldWarm, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
  state.disposables.push(flagMat, flagMat2);
  const flagGeo = new THREE.BufferGeometry();
  flagGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 9, -1.6, 0, 0, -4.2, 0], 3));
  flagGeo.computeVertexNormals();
  state.disposables.push(flagGeo);
  const flagSpots = [
    [0, 132, 0, flagMat],
    [Math.cos(1.32) * 25, 15 + 66 + 5.8 * 3.1 + 3, Math.sin(1.32) * 25, flagMat2],
    [Math.cos(3.44) * 24, 15 + 60 + 5.6 * 3.1 + 3, Math.sin(3.44) * 24, flagMat],
  ];
  state.flags = [];
  for (const [fx, fy, fz, fm] of flagSpots) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 10, 5), trimMat);
    pole.position.set(fx, fy, fz);
    g.add(pole);
    const flag = new THREE.Mesh(flagGeo, fm);
    flag.position.set(fx, fy + 4, fz);
    g.add(flag);
    state.flags.push(flag);
  }

  // soft additive glow blobs (fake bloom) around spires and window bands
  const glowGold = makeGlowTexture(128, 'rgba(255,215,0,0.85)', 'rgba(255,200,80,0.25)', 'rgba(255,200,80,0)');
  const glowPurple = makeGlowTexture(128, 'rgba(199,125,255,0.8)', 'rgba(123,44,191,0.22)', 'rgba(123,44,191,0)');
  const glowSpots = [
    [0, 118, 0, 60, glowPurple],
    [0, 40, 40, 34, glowGold],
  ];
  for (const t of towers) {
    glowSpots.push([Math.cos(t.a) * t.r, 15 + t.h * 0.72, Math.sin(t.a) * t.r, 22 + t.rad * 2, glowGold]);
    glowSpots.push([Math.cos(t.a) * t.r, 15 + t.h + t.rad * 2, Math.sin(t.a) * t.r, 30, glowPurple]);
  }
  for (const [gx, gy, gz, gs, gmap] of glowSpots) {
    const sm = new THREE.SpriteMaterial({
      map: gmap,
      transparent: true,
      depthWrite: false,
      fog: false,
      blending: THREE.AdditiveBlending,
      opacity: 0.4,
    });
    const sp = new THREE.Sprite(sm);
    sp.position.set(gx, gy, gz);
    sp.scale.set(gs, gs, 1);
    g.add(sp);
    state.disposables.push(sm);
  }

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
    color: 0x4b2a72,
    roughness: 0.9,
    emissive: TOKENS.violetDeep,
    emissiveIntensity: 0.35,
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
  for (const w of state.waterfalls) {
    const n = w.seedY.length;
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
  const MAX = 320;
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
  const n = d.sway.length;
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

  for (let i = 0; i < 16; i++) {
    const [base, accent] = colors[i % colors.length];
    const tex = makeWingTexture(base, accent);
    const mat = new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      opacity: 0.92,
    });
    state.disposables.push(mat);
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
  for (const b of state.butterflies) {
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
  for (const c of state.clouds) {
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

  state.renderer.render(state.scene, state.camera);
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
    const fresh = state.canvas.cloneNode(false); // keeps id/class/style attributes
    parent.replaceChild(fresh, state.canvas);
    try {
      state.renderer.dispose();
    } catch (e) {
      /* ignore */
    }
    state.canvas = fresh;
    state.renderer = createRenderer(fresh, wantAA);
    attachContextHandlers(fresh);
    state.renderer.setPixelRatio(dprForQuality());
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

function attachContextHandlers(canvas) {
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    state.ctxLost = true;
  });
  canvas.addEventListener('webglcontextrestored', () => {
    state.ctxLost = false;
  });
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

/** Free every geometry, material, texture, the renderer and all listeners. */
export function dispose() {
  if (state.disposed) return;
  state.disposed = true;
  cancelIntro();
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
