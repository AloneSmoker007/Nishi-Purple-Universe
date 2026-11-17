/**
 * Applies safe, optional content settings from content/site-config.js.
 * Missing artwork always restores the original SVG fallback.
 */
import { siteConfig } from "../content/site-config.js";

function applyContent() {
  const { brand, theme, artwork } = siteConfig;
  if (brand?.title) document.title = brand.title;
  const root = document.documentElement;
  for (const [key, value] of Object.entries(theme || {})) {
    if (typeof value === "string") root.style.setProperty(`--site-${key}`, value);
  }
  const hero = document.querySelector("[data-content-image='hero']");
  if (hero && artwork?.hero) {
    const fallbackSrc = hero.getAttribute("src");
    hero.addEventListener("error", () => {
      if (fallbackSrc && hero.getAttribute("src") !== fallbackSrc) {
        hero.src = fallbackSrc;
      }
      hero.classList.add("content-image-fallback");
    }, { once: true });
    hero.src = artwork.hero;
    if (artwork.heroAlt) hero.alt = artwork.heroAlt;
  }
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", applyContent, { once: true });
} else {
  applyContent();
}
