# NEXT_TASK

Updated: 2026-11-20 (Asia/Shanghai)

## Immediate next task
1. ~~Land milestone-001~~ DONE (fa597c0..37b4733, remote verified).
   CI trigger widened to fix/** (this commit).
2. Full-site regression sweep (one logical task per commit):
   - Music Room: playback, controls, local MP3 switching (Chromium + WebKit).
   - QR card: markup + print layout validation.
   - EN/BN language toggle persistence across sections.
   - Reduced-motion pass (context `reducedMotion: 'reduce'`).
   - WebGL/3D fallback path (force `no-webgl`, verify CSS layer).
   - Keyboard accessibility pass (Tab order, Escape, Enter on PIN + intro).
   - Console/network health per feature (filter known headless-TLS noise in
     WebKit; no filtering in Chromium).
3. Physical device testing (NOT yet done, cannot be claimed):
   - iPhone 8 Plus (iOS 16) Safari — PIN fit, intro, stickers, gacha.
   - Vivo Y11 Android Chrome — same + scroll performance.

## Open items from repo survey
- PR #15 (`feat/nishi-playful-mix-experience`), #8, #7 remain OPEN upstream —
  decide keep/merge/close with the owner; not touched by us.
- GitHub Actions: `validate.yml` triggers on `feat/**` pushes only for its
  push filter (branches: [main, 'feat/**']) — our `fix/**` branch gets
  validation only via `pull_request` events. Worth widening the filter later.

## Rules while working
- One logical task = one commit = one push. Never batch.
- Every milestone: update these safepoint files + `NISHI_LOCAL_BACKUPS/`.
- Never claim a test or push without pasting evidence (command + output).
