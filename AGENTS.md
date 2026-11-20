# Project notes

freecode reads this file before every change. Add anything it should always remember about this project.

## Fixes applied (Nov 2026)
- `js/pin-lock.js`: PIN verification no longer depends on `crypto.subtle` (which only exists on secure origins). A pure-JS SHA-256 fallback keeps the keypad working on plain-http hosts/previews. Keep the fallback in sync with `PIN_SHA256`.
- `index.html`: `.pin-lock-status` has a fixed min-height so the keypad never shifts mid-tap.
- `index.html`: intro buttons (`.intro-actions .btn`) never translate on hover/active — a moving hit target swallows taps.
- `js/ui.js`: intro closes on `pointerdown`/`touchend` (first event of a real tap) plus click de-duplication, and a background tap also advances.
- `index.html`: local `Noto Sans Bengali` webfont (`fonts/noto-sans-bengali.woff2`) so Bangla text never renders as tofu boxes; symbol font fallbacks added.
- `assets/nishi-busan-memory.jpg`: the committed JPEG was truncated/corrupt; re-encoded to a clean 540px-wide file.
