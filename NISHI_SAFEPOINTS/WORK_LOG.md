# WORK_LOG

## 2026-11-19 (session 1 — recovery & investigation)
- Cloned repo, verified `main@8f769d2` matches handover.
- Surveyed all 21 branches / PR history. PIN branches `fix/pin-keypad-not-registering`
  (PR #18, closed) and `fix/pin-lock-classic-script-and-polish` (PR #19, merged
  as squash `0612929`) are fully superseded by main — nothing left to salvage.
- Built Playwright runtime without root (Chromium + WebKit, user-space libs).
- Ran static validation (11 blocks PASS) and Chromium smoke (4 profiles PASS,
  1 flaky click observed → investigated).
- Wrote diagnostics; root-caused the flake to (a) layout jitter on PIN status
  text, (b) full-speed 3D behind the intro overlay, (c) intro fade click-through.
- Independently reproduced the reported "keypad below the fold" bug:
  375x667 → 9/12 controls below fold, 360x640 → 9/12, 414x736 → 3/12.

## 2026-11-20 (session 2 — fixes + backup/checkpoint system)
- Recovered workspace (was intact; no archive needed).
- Implemented the four fixes (index.html, js/ui.js).
- Fixed an ordering hazard found in diff review: `world.to('portal')` must
  await the deferred world boot (memoised `startWorldOnce()`).
- Verification so far: PIN fit `belowFold: []` at all three viewports;
  keypad loop 10/10 stable (no box shift, scrollTop 0).
- Rebuilt `/tmp` Playwright runtime twice (container wipe) → hardened
  `rebuild-pw.sh` with the full package list + WPE launcher LD_LIBRARY_PATH fix.
- Created `NISHI_LOCAL_BACKUPS/` + `NISHI_SAFEPOINTS/`.
