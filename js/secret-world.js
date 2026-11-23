/**
 * Nishi's Secret World — lightweight, bilingual interactive surprises.
 * Progress and opened letters are stored only in this browser (localStorage).
 * No accounts, analytics, external images, or third-party requests.
 */
import { siteConfig } from "../content/site-config.js";

const KEY = "nishi-secret-world-v1";
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function readProgress() {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || "{}");
    return {
      stars: Array.isArray(value.stars) ? value.stars.filter(id => typeof id === "string") : [],
      letters: Array.isArray(value.letters) ? value.letters.filter(id => typeof id === "string") : []
    };
  } catch {
    return { stars: [], letters: [] };
  }
}

function saveProgress(progress) {
  try { localStorage.setItem(KEY, JSON.stringify(progress)); } catch { /* storage is optional */ }
}

function makeBilingual(parent, en, bn, className = "nishi-secret-bn") {
  parent.append(el("span", null, en), el("span", className, bn));
}

function initSecretWorld() {
  if (document.getElementById("nishi-secret-world")) return;
  const config = siteConfig.secretWorld;
  const finalLetter = document.getElementById("final-letter");
  const host = finalLetter?.closest("section");
  if (!config || !host?.parentNode || !Array.isArray(config.stars) || !Array.isArray(config.letters)) return;

  const progress = readProgress();
  const section = el("section", "nishi-secret-world");
  section.id = "nishi-secret-world";
  section.setAttribute("aria-labelledby", "nishi-secret-title");
  const shell = el("div", "shell");
  const heading = el("div", "section-head");
  heading.append(el("p", "eyebrow", config.eyebrow));
  const title = el("h2", "script", config.title);
  title.id = "nishi-secret-title";
  heading.append(title);
  makeBilingual(heading, config.subtitle, config.subtitleBn, "bn nishi-secret-bn");
  shell.append(heading);

  // Seven-star collection — OT7 stays equally represented.
  const treasure = el("section", "nishi-secret-panel");
  treasure.setAttribute("aria-labelledby", "nishi-stars-title");
  const treasureTitle = el("h3", null, config.starsTitle);
  treasureTitle.id = "nishi-stars-title";
  treasure.append(treasureTitle, el("p", "nishi-secret-copy", config.starsHint), el("p", "bn nishi-secret-bn", config.starsHintBn));
  const meterWrap = el("div", "nishi-star-progress");
  const meter = el("div", "nishi-star-track");
  const fill = el("div", "nishi-star-fill");
  fill.id = "nishi-star-fill";
  meter.append(fill);
  const count = el("p", "nishi-star-count");
  count.id = "nishi-star-count";
  count.setAttribute("aria-live", "polite");
  meterWrap.append(meter, count);
  treasure.append(meterWrap);
  const starReveal = el("div", "nishi-star-reveal");
  starReveal.setAttribute("aria-live", "polite");
  const starRevealEn = el("p");
  const starRevealBn = el("p", "bn nishi-secret-bn");
  starReveal.append(starRevealEn, starRevealBn);
  treasure.append(starReveal);
  const starGrid = el("div", "nishi-star-grid");
  const completion = el("p", "nishi-star-complete");
  completion.id = "nishi-star-complete";
  completion.hidden = true;
  completion.setAttribute("role", "status");
  makeBilingual(completion, config.completeMessage, config.completeMessageBn);
  config.stars.forEach(star => {
    const button = el("button", "nishi-star-card");
    button.type = "button";
    button.dataset.starId = star.id;
    button.setAttribute("aria-pressed", String(progress.stars.includes(star.id)));
    const icon = el("span", "nishi-star-icon", progress.stars.includes(star.id) ? "🌟" : "✦");
    icon.setAttribute("aria-hidden", "true");
    const name = el("strong", null, star.name);
    const hint = el("span", "nishi-star-hint", progress.stars.includes(star.id) ? config.collectedLabel : config.tapLabel);
    button.append(icon, name, hint);
    button.addEventListener("click", () => {
      if (!progress.stars.includes(star.id)) progress.stars.push(star.id);
      saveProgress(progress);
      button.setAttribute("aria-pressed", "true");
      icon.textContent = "🌟";
      hint.textContent = config.collectedLabel;
      updateStars();
      starRevealEn.textContent = star.message || "";
      starRevealBn.textContent = star.messageBn || "";
      if (!reducedMotion) {
        button.classList.remove("is-collected");
        void button.offsetWidth;
        button.classList.add("is-collected");
      }
    });
    starGrid.append(button);
  });
  treasure.append(starGrid, completion);
  shell.append(treasure);

  function updateStars() {
    const total = config.stars.length;
    const found = config.stars.filter(star => progress.stars.includes(star.id)).length;
    fill.style.width = total ? (found / total * 100) + "%" : "0%";
    count.textContent = config.progressLabel.replace("{found}", String(found)).replace("{total}", String(total));
    completion.hidden = found !== total;
  }
  updateStars();

  // Restore the most recently collected star's message after a reload.
  // Keep the stored collection order so the last action remains the active reveal.
  const lastCollectedId = [...progress.stars].reverse().find(id =>
    config.stars.some(star => star.id === id)
  );
  const lastCollectedStar = config.stars.find(star => star.id === lastCollectedId);
  if (lastCollectedStar) {
    starRevealEn.textContent = lastCollectedStar.message || "";
    starRevealBn.textContent = lastCollectedStar.messageBn || "";
  }

  // Open-when letters.
  const lettersPanel = el("section", "nishi-secret-panel");
  lettersPanel.setAttribute("aria-labelledby", "nishi-letters-title");
  const lettersTitle = el("h3", null, config.lettersTitle);
  lettersTitle.id = "nishi-letters-title";
  lettersPanel.append(lettersTitle, el("p", "nishi-secret-copy", config.lettersHint), el("p", "bn nishi-secret-bn", config.lettersHintBn));
  const letterGrid = el("div", "nishi-letter-grid");
  const letterReveal = el("article", "nishi-letter-reveal");
  letterReveal.hidden = true;
  letterReveal.setAttribute("aria-live", "polite");
  const letterHeading = el("h4");
  const letterMessage = el("p");
  const letterMessageBn = el("p", "bn nishi-secret-bn");
  letterReveal.append(letterHeading, letterMessage, letterMessageBn);
  config.letters.forEach(letter => {
    const button = el("button", "nishi-letter-card");
    button.type = "button";
    button.dataset.letterId = letter.id;
    button.setAttribute("aria-expanded", "false");
    button.setAttribute("aria-controls", "nishi-letter-reveal");
    const icon = el("span", "nishi-letter-icon", letter.icon);
    icon.setAttribute("aria-hidden", "true");
    button.append(icon, el("strong", null, letter.label), el("span", "bn nishi-secret-bn", letter.labelBn));
    button.addEventListener("click", () => {
      letterGrid.querySelectorAll("button").forEach(item => {
        const selected = item === button;
        item.setAttribute("aria-expanded", String(selected));
        item.classList.toggle("is-open", selected);
      });
      if (!progress.letters.includes(letter.id)) progress.letters.push(letter.id);
      saveProgress(progress);
      letterHeading.textContent = letter.title;
      letterMessage.textContent = letter.message;
      letterMessageBn.textContent = letter.messageBn;
      letterReveal.hidden = false;
      letterReveal.focus?.({ preventScroll: true });
    });
    letterGrid.append(button);
  });
  letterReveal.id = "nishi-letter-reveal";
  letterReveal.tabIndex = -1;
  lettersPanel.append(letterGrid, letterReveal);
  shell.append(lettersPanel);

  // A no-audio virtual hug for a tiny moment of comfort.
  const hugPanel = el("section", "nishi-secret-hug");
  hugPanel.setAttribute("aria-labelledby", "nishi-hug-title");
  const hugTitle = el("h3", null, config.hugTitle);
  hugTitle.id = "nishi-hug-title";
  hugPanel.append(el("span", "nishi-hug-bears", "🐻‍❄️  🐼"), hugTitle);
  const hugCopy = el("p", "nishi-secret-copy", config.hugCopy);
  const hugCopyBn = el("p", "bn nishi-secret-bn", config.hugCopyBn);
  const hugButton = el("button", "btn nishi-hug-button", config.hugButton);
  hugButton.type = "button";
  const hugStatus = el("p", "nishi-hug-status");
  hugStatus.setAttribute("role", "status");
  hugButton.addEventListener("click", () => {
    hugStatus.textContent = config.hugThanks;
    hugStatus.append(el("span", "bn nishi-secret-bn", config.hugThanksBn));
    if (!reducedMotion) {
      hugPanel.classList.remove("is-hugging");
      void hugPanel.offsetWidth;
      hugPanel.classList.add("is-hugging");
    }
  });
  hugPanel.append(hugCopy, hugCopyBn, hugButton, hugStatus);
  shell.append(hugPanel);


  // Magic Shop + photocard pull. Wish text stays in this browser and is never transmitted.
  const magicPanel = el("section", "nishi-secret-panel nishi-magic-shop");
  magicPanel.setAttribute("aria-labelledby", "nishi-magic-title");
  const magicTitle = el("h3", null, config.magicShop.title);
  magicTitle.id = "nishi-magic-title";
  magicPanel.append(magicTitle, el("p", "nishi-secret-copy", config.magicShop.copy), el("p", "bn nishi-secret-bn", config.magicShop.copyBn));
  const wishLabel = el("label", "nishi-magic-label", config.magicShop.wishLabel);
  const wishInput = el("input", "nishi-magic-input");
  wishInput.type = "text";
  wishInput.maxLength = 160;
  wishInput.autocomplete = "off";
  wishInput.placeholder = config.magicShop.wishPlaceholder;
  wishInput.setAttribute("aria-label", config.magicShop.wishLabel);
  const wishButton = el("button", "btn nishi-magic-open", config.magicShop.openButton);
  wishButton.type = "button";
  const wishStatus = el("p", "nishi-magic-status");
  wishStatus.setAttribute("role", "status");
  wishButton.addEventListener("click", () => {
    wishStatus.replaceChildren();
    wishStatus.append(el("span", null, config.magicShop.comfortMessage));
    wishStatus.append(el("span", "bn nishi-secret-bn", config.magicShop.comfortMessageBn));
    if (wishInput.value.trim()) {
      wishStatus.append(el("span", "nishi-magic-private-note", config.magicShop.privateNote));
    }
  });
  const wishRow = el("div", "nishi-magic-wish-row");
  wishLabel.htmlFor = "nishi-magic-wish";
  wishInput.id = "nishi-magic-wish";
  wishRow.append(wishInput, wishButton);
  magicPanel.append(wishLabel, wishRow, wishStatus);

  const gachaTitle = el("h4", "nishi-gacha-title", config.magicShop.gachaTitle);
  const gachaCopy = el("p", "nishi-secret-copy", config.magicShop.gachaCopy);
  const pullButton = el("button", "btn nishi-photocard-pull", config.magicShop.pullButton);
  pullButton.type = "button";
  const cardStage = el("div", "nishi-photocard-stage");
  cardStage.setAttribute("aria-live", "polite");
  const pullStatus = el("p", "nishi-photocard-status");
  pullStatus.setAttribute("role", "status");
  const members = config.magicShop.members;
  pullButton.addEventListener("click", () => {
    if (!Array.isArray(members) || !members.length) return;
    const member = members[Math.floor(Math.random() * members.length)];
    const rare = Math.random() < 1 / 21;
    const card = el("article", "nishi-photocard" + (rare ? " is-rare" : ""));
    card.setAttribute("aria-label", rare ? config.magicShop.rareLabel : config.magicShop.cardLabel);
    card.append(el("span", "nishi-photocard-sparkle", rare ? "✦ ULTRA RARE ✦" : "✧ PURPLE COLLECTION ✧"));
    card.append(el("span", "nishi-photocard-star", member.symbol || "✦"));
    card.append(el("strong", "nishi-photocard-member", member.name));
    card.append(el("span", "nishi-photocard-caption", rare ? config.magicShop.rareMessage : config.magicShop.cardMessage));
    card.append(el("span", "bn nishi-secret-bn", rare ? config.magicShop.rareMessageBn : config.magicShop.cardMessageBn));
    cardStage.replaceChildren(card);
    pullStatus.textContent = rare ? config.magicShop.rareLabel : config.magicShop.cardLabel;
  });
  magicPanel.append(gachaTitle, gachaCopy, pullButton, cardStage, pullStatus);
  shell.append(magicPanel);

  section.append(shell);
  host.parentNode.insertBefore(section, host.nextSibling);
}

function start() {
  document.addEventListener("nishi:pin-unlocked", initSecretWorld, { once: true });
  // Module dependencies may finish loading just after the PIN event. The
  // persistent in-page marker makes late startup safe without double-rendering.
  if (!document.getElementById("pin-lock") || document.body.classList.contains("nishi-pin-unlocked")) {
    initSecretWorld();
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
