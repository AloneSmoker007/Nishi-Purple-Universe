/**
 * Applies safe, optional content settings from content/site-config.js.
 * Missing artwork never hides the existing CSS/SVG fallback.
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
    hero.addEventListener("error", () => {
      hero.removeAttribute("src");
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
