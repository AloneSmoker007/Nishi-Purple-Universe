# RELEASE_CHECKLIST.md — Nishi's Purple Universe

**Updated:** 2026-11-23  
**Current main:** `33bbc972595bec28f0992e69e1348a4e150406de`

## Merge state

- [x] PR #22 — iPhone PIN keypad reliability — merged
- [x] PR #15 — playful bilingual birthday surprises — merged
- [x] PR #23 — handover documentation — merged
- [x] PR #27 — restore latest collected star message after reload — merged

## CI and deployment gates

- [x] PR #27 static validation — PASS (run #45288176507)
- [x] PR #27 Safari/WebKit iPhone PIN regression — PASS (run #45288176254)
- [x] PR #27 desktop + mobile viewport browser smoke — PASS (run #45288176254)
- [x] Post-merge main static validation — PASS (run #45289218806)
- [ ] Post-merge main browser smoke — pending at update time (run #45289218736)
- [ ] Post-merge GitHub Pages deployment — pending at update time (run #45289217565)
- [ ] Verify live site serves the new main build after deployment

## Manual and product QA

- [ ] Real iPhone Safari: keypad taps, orientation, scrolling, music
- [ ] Low-end Android: keypad taps, orientation, scrolling, music
- [ ] Confirm YouTube playback, local MP3 playback, and no overlapping audio on phones
- [ ] Human walkthrough of the full visitor journey in English and Bangla
- [ ] Keyboard-only navigation, focus behavior, and screen-reader spot check
- [ ] Reduced-motion experience review
- [ ] Low-end mobile 3D startup, fallback, and memory/lifecycle profiling

## Security and privacy notes

- [x] Public-site limitation documented: PIN is a friendly client-side gate, not authentication
- [ ] Review CSP inline-script/style requirements before any policy tightening
- [ ] Confirm no private notes, credentials, or personal data are committed to this public repository

## Release decision

Do not mark the project fully release-verified or tag a release until the pending CI/deployment checks, live-site verification, and manual-device gates are completed. Browser emulation does not satisfy physical-device QA.
