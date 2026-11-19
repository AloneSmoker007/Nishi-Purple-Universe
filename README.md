# Nishi's Purple Universe 💜

A small bilingual (English/Bangla) fan-made surprise website for Nishi.

## Publish with GitHub Pages
1. Open repository **Settings → Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**.
3. Select branch **main** and folder **/(root)**, then Save.
4. Wait for the Pages deployment. The site URL will appear in Settings → Pages.

This is an unofficial fan-made tribute and is not affiliated with BTS or BIGHIT MUSIC. It uses no official BTS images, logos, audio, or lyrics.

## Music room
- BTS tracks are streamed through official YouTube embeds; copyrighted audio is not downloaded or re-hosted.
- Visitors can select up to 10 MP3 files from their own device (20 MB maximum per file). Files remain local to the browser session and are never uploaded.
- Local MP3 playback pauses YouTube first; switching back to a BTS track pauses local playback. Only the active source may update playback state.
- Temporary object URLs are revoked when the page is closed or reloaded.

### Mobile playback compatibility
- The player uses YouTube's inline playback mode and keeps the native MP3 picker call inside the visitor's tap gesture for Android/iOS browser restrictions.
- Android Chrome testing should cover file selection, MP3 decode/playback, source switching, background/lock-screen behavior, and low-memory recovery before release.

## Easy content updates

The editable site settings live in `content/site-config.js`.
- Change the page title and description under `brand`.
- Adjust the purple theme under `theme`.
- Replace the hero art path under `artwork.hero`.
- Edit the official YouTube video IDs, song names and emoji under `tracks`.

The music player reads its playlist from this file, so adding or reordering tracks no longer requires editing player logic. Keep YouTube IDs for official videos; do not upload copyrighted audio.

### AI-generated decorative artwork

The `assets/ai/` folder contains instructions for the original fantasy artwork pack. Use the supplied WebP assets there; they depict a fictional purple castle and garden, not BTS members. The existing SVG remains the fallback until the artwork files are added.


## Birthday PIN lock

The whole experience is gated by the birthday keypad in `index.html` and `js/pin-lock.js`.
- The lock displays an animated brown Bubu + white Dudu sticker hosted by Tenor; sad/crying reactions switch when a PIN attempt fails.
- Tenor community-uploaded sticker links are attributed in the lock UI; these are not verified official creator uploads and creator licensing is not confirmed.
- The PIN keypad supports touch, keyboard input, screen-reader status messages and reduced-motion preferences.

## Printable birthday QR card

Open [qr-card.html](qr-card.html) and print it to create a small physical gift card. Its embedded QR code points to the live website URL. Test the printed QR with a phone camera before gifting.

### PIN behavior
- Birthday PIN: 20 June 2008 (`20062008`).
- A successful unlock lasts for the current browser tab session.
- The 3D world, music player and interactive sections wait until the visitor unlocks the page.

**Privacy note:** this is a client-side surprise gate, not strong authentication. The static site must deliver its HTML and JavaScript to visitors, so a determined person can inspect or bypass the PIN check. Do not use it to protect private or sensitive information.


## Playful birthday arcade

The bilingual mini-arcade is loaded from `js/playful-moments.js` and styled in `css/playful-moments.css`.
Edit `playfulArcade` in `content/site-config.js` to change its English/Bangla title, three gift labels and reveal messages. The arcade appears after the birthday PIN is unlocked and respects reduced-motion settings.
