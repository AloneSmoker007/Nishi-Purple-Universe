# NEXT_TASK.md — current handover

**Updated:** 2026-11-23  
**Repository:** https://github.com/AloneSmoker007/Nishi-Purple-Universe  
**Live site:** https://alonesmoker007.github.io/Nishi-Purple-Universe/

## Verified snapshot

- Current `main`: `33bbc972595bec28f0992e69e1348a4e150406de`.
- PR #27, “Restore collected star message after reload”, is **MERGED**.
- PR #27 head: `8df3c6a0682b487443e78a5000d22a0ef3d73ad5`; merge commit: `33bbc972595bec28f0992e69e1348a4e150406de`.
- PR #27 validation: static validation PASS; Safari/WebKit iPhone PIN test PASS; desktop + mobile viewport smoke PASS.
- Post-merge on `main`: static validation run #45289218806 PASS. Browser smoke run #45289218736 and Pages deployment run #45289217565 were still running when this document was prepared. Recheck them before calling the release verified.
- Previously merged work: PR #22 (iPhone PIN keypad), #15 (playful arcade), and #23 (handover docs), per the previous verified release checklist.

## Next actions — strict order

1. **Finish post-merge CI:** confirm browser smoke and Pages deployment runs #45289218736 and #45289217565 both conclude SUCCESS on the exact `main` SHA above.
2. **Verify live deployment:** open the GitHub Pages URL after deployment; check HTTP success and confirm the current build is served. Do not infer deployment success from a queued workflow.
3. **Refresh release evidence:** update `RELEASE_CHECKLIST.md` and `TEST_EVIDENCE.md` only with observed results.
4. **Manual device QA:** real iPhone Safari and a low-end Android (Vivo Y11 if available): PIN taps, orientation, scroll, music playback, and audio overlap. Playwright emulation is not physical-device evidence.
5. **Then address quality gaps:** keyboard/focus and screen-reader pass; reduced-motion behavior; 3D fallback and memory lifecycle; CSP/inline-script inventory; player failure states and offline behavior.

## Important product/security facts

- The PIN is a friendly visitor gate, **not authentication**. This is a public static GitHub Pages site; client-side code and content can be inspected. Never store secrets or private information in the site.
- OT7 representation must remain equal. V may have a special moment, but must not displace the other six.
- English + Bangla content must remain intact.
- Avoid unrelated redesigns or feature additions while release gates are open.

## Working rules

- One atomic change at a time: evidence → scope → implementation → tests → review → PR → merge → verify.
- Never weaken assertions to obtain green CI.
- Never claim physical-device validation from browser emulation.
- Do not force-push or rewrite shared history.
