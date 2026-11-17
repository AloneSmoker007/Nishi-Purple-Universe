# Module Contract — Nishi's Purple Universe (cinematic 3D upgrade)

**Repo root:** `/home/work/.openclaw/workspace/nishi-build`
**Architecture:** modular ES modules. `index.html` imports them. NO build step, NO bundler.

## Files & ownership (do NOT write outside your assigned file)

| File | Owner | Purpose |
|---|---|---|
| `index.html` | integrator | structure + ALL CSS |
| `js/world.js` | agent `world3d` | Three.js 3D world |
| `js/audio.js` | agent `audio` | WebAudio ambient engine |
| `js/player.js` | integrator | Official YouTube playback + local-device MP3 selection |
| `js/ui.js` | integrator | DOM interactions, game, storybook, i18n |
| `js/quest.js` | integrator | "Nishi, Tell Me Your Universe" Q&A + personalised reveal (Phase 3-4) |
| `js/wishes.js` | integrator | Purple Wishing Stars — catch shooting stars, make wishes (Phase 6) |
| `vendor/three.module.min.js` | (locked) | Three.js r169, MIT, already vendored |
| `assets/*` | (locked) | existing assets — do not modify |

## Design tokens (use these exact values)

```
--ink-abyss:   #0B0420   /* deepest background */
--ink-deep:    #1A0B3B   /* nebula base */
--purple-core: #7B2CBF   /* main purple */
--purple-glow: #C77DFF   /* NEON glow accent (core) */
--gold:        #FFD700   /* star / highlight accent */
--gold-warm:   #F0E130   /* bright gold */
--pink:        #FF69B4   /* heart / love accent */
--pink-warm:   #E87A5D   /* warm text accent */
--violet-deep: #4B0082   /* shadow purple */
--mist:        #2D1B3D   /* dark warm */
--paper:       #FFFFFF   /* primary text */
```

Style keywords: **cinematic, dreamcore, neon-cyber-romantic, maximalist, premium fantasy movie**.
Dark background is essential — only a deep backdrop makes neon glow read.

## HARD RULES (all agents)

1. **No copyrighted assets.** No BTS photos, logos, audio, lyrics. Do NOT generate fake human faces.
   The only personal photo is `assets/nishi-busan-memory.jpg` (owner's own) — use only that.
2. **No external network requests at runtime.** Everything vendored locally.
3. **`prefers-reduced-motion`** must be respected — every animation gets a reduced-motion path.
4. **Performance:** cap `devicePixelRatio` at 2 (1.5 on mobile). Target 60fps desktop / 30fps+ mobile.
   Provide a quality switcher (high / medium / low / auto).
5. **WebGL fallback:** if WebGL is unavailable, the page must still work and look good (CSS-only layer).
6. **Accessibility:** keyboard reachable, visible focus, `aria-*` where meaningful, alt text on images.
7. **ES modules only.** No globals leaking except the documented exports.
8. **Never claim something works without testing it.**
9. Idempotent + defensive: guard against missing DOM nodes / missing WebGL.

## Public API — `js/world.js` (agent `world3d`)

```js
export function initWorld(canvas, opts) -> { ok: boolean, reason?: string }
export function startIntro()            // cinematic camera fly-in, returns Promise
export function setDestination(name)    // camera moves to a named vantage point
export function setQuality(level)       // 'high'|'medium'|'low'
export function onPointerMove(x, y)     // normalised -1..1, for parallax
export function onScroll(progress)      // 0..1 page scroll -> camera path
export function resize()
export function setReducedMotion(bool)
export function dispose()
```

Destinations (camera presets) — implement at least:
`'portal'`, `'ot7'`, `'music'`, `'busan'`, `'quest'`, `'violet'`, `'road'`, `'promise'`

## Public API — `js/audio.js` (agent `audio`)

```js
export function initAudio() -> Promise<{ok:boolean,reason?:string}>
export function startAmbience()   // MUST be user-initiated (never autoplay)
export function stopAmbience()
export function setVolume(v)      // 0..1
export function setMuted(bool)
export function chime(kind)       // 'star'|'portal'|'chime'|'reveal'
export function isReady()
```

Audio must be **synthesised with WebAudio** (oscillators + noise + filters + reverb-ish delay).
Do NOT load any audio files, do NOT use copyrighted music. Never autoplay.

## Public API — `js/quest.js`

```js
export function initQuest(rootEl, opts) -> { ok: boolean, reason?: string }
export function setLanguage(lang)      // 'en' | 'bn'
export function getAnswers()            // plain object, local only
export function resetQuest()            // start over
export function deleteAllData()         // wipe localStorage
export function destroy()
```

`opts`: `{ lang: 'en'|'bn', confirmRestart: bool, autoAdvance: bool }`

Hard rules for the quest module:
1. **Every question is optional.** Skip is always available and never punished.
2. **No sensitive data** — never ask for name, age, location, contacts, or anything
   that could identify her beyond what she volunteers.
3. **Answers never leave the device.** localStorage only, key `nishi-universe-v1`.
   No fetch/XHR/beacon with answer data. Ever.
4. **Visible reset + delete controls** at all times, with a confirm step on delete.
5. **Sharing is opt-in only** ("Copy my universe"), never automatic.

## Verification each agent must run before reporting done

```bash
cd /home/work/.openclaw/workspace/nishi-build
node --input-type=module -e "import('./js/<yours>.js').then(()=>console.log('OK')).catch(e=>{console.error('FAIL',e.message);process.exit(1)})"
```
Also run `node --check` equivalent and report the exact output you saw.

## Music playback rules — `js/player.js`

- BTS tracks must use official YouTube embeds/links; never download, mirror, or re-host copyrighted audio.
- Visitors may select up to 10 local MP3 files, 20 MB maximum each. Files must remain in the browser session and never be uploaded or persisted.
- Switching sources must pause the previous source immediately; stale asynchronous completions and inactive-source events must not restart playback or change UI state.
- Revoke temporary object URLs when leaving the page. Treat filenames as untrusted text.
- YouTube/API failure may use the existing Web Audio ambience, but ambience must start only after a user gesture.
