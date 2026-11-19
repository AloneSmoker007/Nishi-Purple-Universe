# CURRENT_STATE

Last updated: 2026-11-20 (Asia/Shanghai)

## Branch
`fix/pin-and-full-site-regression` (from `main@8f769d2`)

## What is in this checkpoint
Four targeted fixes for the birthday PIN gate + intro lifecycle, verified
against dedicated diagnostics and the full regression suites:

1. **Mobile PIN layout overflow (reported WebKit bug, independently confirmed
   and fixed).** At 375x667 and 360x640 up to 9 of 12 keypad controls sat below
   the fold (card ~828px vs viewport 640-736). New compact media tiers
   (`max-height:780px` / `max-height:650px`) shrink the mascot, emblem, title
   and key height. Verified: `belowFold: []` at 375x667, 414x736, 360x640.
2. **PIN keypad position shifting when the status text changed.** The status
   line reserved one line but messages wrap to two, so every tap nudged the
   keypad ~5px and fought scroll anchoring. Status box now reserves 2.55rem
   (2 lines). Verified: 10/10 keys keep identical boxes across taps,
   overlay scrollTop stable at 0.
3. **3D render loop started while the intro overlay covered the screen.**
   On software rendering / low-end phones this starved the main thread (tap
   flakiness reproduced in Playwright stability checks). `world.boot()` is now
   deferred until `nishi:intro-closed`; "Enter the universe" waits for the
   boot promise before `world.to('portal')` so the cinematic fly-in is kept.
4. **Intro fade-out click-through.** `.intro.is-hidden` set `pointer-events:none`
   immediately while `visibility` only flips after the 1.05s transition, so
   taps during the fade fell through to the hero artwork beneath. The
   `pointer-events` change is now delayed to the end of the transition; the
   seen/reduced-motion early path disables the transition entirely.

## Unchanged by design
All features preserved: PIN gate, cinematic intro, Bubu & Dudu moods + Tenor
stickers, Secret World, OT7 star hunt, Open When letters, Virtual Hug, Magic
Shop, photocard gacha, music room, bilingual EN+BN, QR card, V's section.

## Environment notes (this container, not the site)
- No root; Playwright browsers + user-space WebKit libs live in `/tmp`
  (wiped on container restart). Rebuild: `bash .openclaw/tmp/rebuild-pw.sh`,
  wrap test runs with `bash .openclaw/tmp/pw-env.sh <cmd>`.
- Headless WPE has no TLS backend: external https (Tenor stickers) fails to
  load in WebKit runs only. Real devices are unaffected.
