# MASTER WORK INVENTORY — Nishi's Purple Universe

> Handover snapshot updated 2026-11-23. GitHub is the source of truth; verify the current SHA before acting.

## 0. Current snapshot

| Item | Verified value |
|---|---|
| Repository | https://github.com/AloneSmoker007/Nishi-Purple-Universe |
| Live site | https://alonesmoker007.github.io/Nishi-Purple-Universe/ |
| `main` SHA | `33bbc972595bec28f0992e69e1348a4e150406de` |
| Latest merged PR | [#27 — restore collected star message after reload](https://github.com/AloneSmoker007/Nishi-Purple-Universe/pull/27) |
| PR #27 head | `8df3c6a0682b487443e78a5000d22a0ef3d73ad5` |
| PR #27 merge commit | `33bbc972595bec28f0992e69e1348a4e150406de` |
| PR #27 CI | static PASS; Safari/WebKit PIN PASS; desktop/mobile smoke PASS |
| Post-merge main CI | static PASS; browser smoke + Pages deployment were still running at handover time (see `NEXT_TASK.md`) |

## 1. Product and feature inventory

| Area | Implementation | Current understanding |
|---|---|---|
| Birthday PIN gate | `index.html`, `js/pin-lock.js` | Client-side visitor gate; not authentication |
| Bubu & Dudu | Local sticker assets + PIN mood states | Locally vendored; avoid runtime CDN dependency |
| Cinematic intro + 3D world | `js/ui.js`, `js/world.js`, Three.js vendor module | Existing; further performance/lifecycle audit remains |
| OT7 | Main OT7 section + Secret World seven-star hunt | All seven members represented |
| English/Bangla | `content/site-config.js`, UI i18n | Preserve both languages in all changes |
| Music Room | `js/player.js` | Official YouTube playback, local MP3 selection, ambient fallback; manual phone playback still needed |
| Wishes and Q&A | `js/wishes.js`, `js/quest.js` | Local browser persistence; review accessibility and storage failure paths |
| Secret World | `js/secret-world.js` | Seven stars, bilingual wishes, Open-When letters, hug, Magic Shop, photocard |
| Printable QR card | `qr-card.html` | Previously verified to point to the live site; recheck if URL changes |
| Pages hosting | GitHub Pages | Static public site; no server-side authentication or private content |

## 2. Recent PR history

| PR | Title | State |
|---|---|---|
| #27 | Restore collected star message after reload | **MERGED** — latest |
| #23 | Handover documentation | MERGED |
| #22 | iPhone Safari PIN keypad reliability | MERGED |
| #15 | Playful bilingual birthday surprises | MERGED |

Older feature/fix PRs #1–#21 are historical; consult GitHub PR history for exact disposition rather than relying on old task notes.

## 3. PR #27 change and regression coverage

- `js/secret-world.js`: after progress is loaded and stars are updated, the latest valid collected star is selected in reverse collection order; its English and Bangla reveal messages are restored.
- `tests/browser-smoke.mjs`: collect two stars, verify the second message replaces the first, simulate a fresh PIN session, reload, unlock, and assert both 2/7 progress and the latest bilingual reveal.
- PR branch checks: static validation PASS; WebKit PIN test PASS; desktop/mobile browser smoke PASS.
- Merge SHA: `33bbc972595bec28f0992e69e1348a4e150406de`.

## 4. Confirmed risks and remaining evidence

1. **Physical device gap:** no verified real-iPhone or real-Android tap-through is recorded here. Emulation is not equivalent.
2. **Static-site privacy:** PIN gate is UX only. Public source and client-side content are inspectable.
3. **Music validation:** browser tests do not prove real-device YouTube availability, local MP3 behavior, or absence of overlapping audio in every mobile browser.
4. **Accessibility:** complete keyboard, focus restoration, screen-reader, contrast, and reduced-motion walkthrough still needs evidence.
5. **Performance/lifecycle:** profile low-end mobile 3D startup, fallback, renderer disposal, and memory use before declaring performance complete.
6. **CSP:** inventory inline scripts/styles and evaluate a stricter policy without breaking GitHub Pages. Do not blindly remove `unsafe-inline`.

## 5. Next source of truth

Follow `NEXT_TASK.md` for the ordered next actions and `RELEASE_CHECKLIST.md` for release gates. Update this inventory only after verified repository or test-state changes.
