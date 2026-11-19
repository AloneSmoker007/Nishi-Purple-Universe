# TEST_EVIDENCE

All commands run from the repository root inside the container, wrapped with
`bash .openclaw/tmp/pw-env.sh` (Playwright runtime env). Timestamps: 2026-11-20 CST.

## 1. Static validation (mirrors .github/workflows/validate.yml)
`node --check` on js/ui.js js/quest.js js/world.js js/audio.js js/player.js
js/wishes.js js/content.js js/pin-lock.js js/secret-world.js content/site-config.js
→ **PASS** (10/10 syntax OK). Python static assertion block
(SEO/markup/player/PIN/SecretWorld/MagicShop/moods/timer/GPU/WebGL) → **PASS** (11/11).

## 2. PIN layout (the reported WebKit bug — independently reproduced & fixed)
`node tests/diag-pin-fit.mjs`
- BEFORE: 375x667 belowFold [0,4,5,6,7,8,9,clear,backspace]; 414x736
  belowFold [0,clear,backspace]; 360x640 belowFold [0,4,5,6,7,8,9,clear,backspace]
- AFTER: **belowFold [] at all three viewports** → PASS

## 3. PIN keypad taps & jitter
`node tests/diag-keypad-loop.mjs` → **PASS** digits 0-9 all register (filled=1),
boxBefore == boxAfter (was ±5px shift), overlay scrollTop stable 0 (was 46↔51).

## 4. WebKit regression (3 mobile profiles × 9 checks)
`node tests/webkit-regression.mjs` → **PASS 27/27**.
Covers: 12-key reachability & taps, backspace, physical keyboard digits,
Escape clear, wrong PIN + mascot sad/crying moods, correct PIN + inert gating,
intro Skip + persistence, session persistence across reload, Secret World
(7 OT7 stars + counter, Open-When letter, virtual hug, Magic Shop, photocard
gacha with OT7 member), no horizontal overflow, no uncaught errors.
Env noise explicitly classified: 6x/profile "TLS support is not available"
(headless WPE has no TLS backend; external Tenor stickers only).

## 5. Chromium smoke (4 viewports)
`node tests/browser-smoke.mjs` → **PASS 4/4** (desktop 1365x900, iPhone-sized
375x667, Android-sized 412x915, tablet 768x1024). No flaky skip-intro clicks
this run (previous flake root causes fixed: status jitter, 3D starvation,
fade click-through).

## Not tested / blocked
- Physical iPhone 8 Plus (iOS 16) Safari — no device. REQUIRED before release.
- Physical Vivo Y11 Android Chrome — no device. REQUIRED before release.
- Tenor sticker loading in headless WebKit — container TLS limitation (BLOCKED),
  verified working via Chromium runs (network tab OK) and unchanged URLs.
