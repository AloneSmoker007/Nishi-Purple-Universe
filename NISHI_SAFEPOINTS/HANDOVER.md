# HANDOVER

Read this first if you are a fresh agent continuing Nishi Purple Universe.

## Where things live
- Repo: https://github.com/AloneSmoker007/Nishi-Purple-Universe
- Working branch: `fix/pin-and-full-site-regression` (never push to main).
- Local workspace: `~/<workspace>/Nishi-Purple-Universe`
- Local backups: `~/<workspace>/NISHI_LOCAL_BACKUPS/` (see BACKUP_INDEX.md)
- This checkpoint folder: `NISHI_SAFEPOINTS/` (in the repo, always current).

## Test runtime (this container: no root, /tmp may be wiped)
1. `bash .openclaw/tmp/rebuild-pw.sh` — installs Playwright Chromium+WebKit
   browsers into /tmp/pw-browsers and user-space WebKit/Mesa libs into
   /tmp/pw-deps. Idempotent. Takes a few minutes.
2. `bash .openclaw/tmp/pw-env.sh <command>` — wraps any command with the env
   (browser path, LD_LIBRARY_PATH, EGL software stack).
3. Test entry points (run from the repo root):
   - `node tests/browser-smoke.mjs` — Chromium, 4 viewports, full smoke.
   - `node tests/webkit-regression.mjs` — WebKit, 3 mobile viewports, PIN +
     intro + secret world + layout + console health.
   - `node tests/diag-pin-fit.mjs` — PIN keypad below-fold measurement.
   - `node tests/diag-keypad-loop.mjs` — keypad tap/jitter stress.
   - Other `tests/diag-*.mjs` / `tests/stress-*.mjs` — targeted diagnostics.

## Known environment noise (do NOT "fix" the site for these)
- Headless WPE has no TLS: `Failed to load resource: TLS support is not
  available` for external https (Tenor stickers). Real devices load fine.
- Never run `pkill -f <pattern>` where the pattern appears in your own
  command line — it kills your shell. Use bracket tricks like `pkill -f "pat[t]"`.

## Hard rules
- One logical task → test → diff review → local backup → checkpoint update →
  commit → push → verify remote SHA. Then the next task.
- No force-push, no reset --hard, no rewriting pushed history.
- Keep OT7 equal representation, V's section, bilingual EN+BN, QR card,
  Bubu & Dudu moods, no fake AI member faces, no copyrighted music.
- Do not claim physical iPhone/Android testing unless actually performed.

## Session report template
Branch / latest local SHA / verified remote SHA / commits pushed /
tests passed+failed / files changed / backup location / checkpoint location /
exact next task.
