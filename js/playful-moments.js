/**
 * Playful, bilingual mini-arcade for Nishi.
 * All copy is editable in content/site-config.js; no personal photos or
 * third-party assets are fabricated. This module waits for the PIN gate.
 */
import { siteConfig } from "../content/site-config.js";

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function initPlayfulArcade() {
  if (document.querySelector("#joy-arcade")) return;
  const config = siteConfig.playfulArcade;
  const finalLetter = document.querySelector("#final-letter");
  const hostSection = finalLetter?.closest("section");
  if (!config || !Array.isArray(config.gifts) || !hostSection) return;

  const section = element("section", "joy-arcade");
  section.id = "joy-arcade";
  section.setAttribute("aria-labelledby", "joy-arcade-title");

  const shell = element("div", "shell");
  const head = element("div", "section-head reveal");
  head.append(element("p", "eyebrow", "A little bestie arcade"));
  const title = element("h2", "script", config.title);
  title.id = "joy-arcade-title";
  head.append(title);
  const subtitle = element("p", "lead joy-arcade-subtitle", config.subtitle);
  head.append(subtitle);
  const bnTitle = element("p", "bn joy-arcade-bn", config.titleBn);
  const bnSubtitle = element("p", "bn joy-arcade-bn", config.subtitleBn);
  head.append(bnTitle, bnSubtitle);

  const choices = element("div", "joy-arcade-choices");
  choices.setAttribute("role", "group");
  choices.setAttribute("aria-label", "Choose a little surprise");
  const reveal = element("div", "joy-arcade-reveal");
  reveal.id = "joy-arcade-reveal";
  reveal.hidden = true;
  reveal.setAttribute("aria-live", "polite");
  reveal.setAttribute("aria-atomic", "true");
  const revealIcon = element("span", "joy-arcade-reveal-icon", "💜");
  revealIcon.setAttribute("aria-hidden", "true");
  const revealTitle = element("h3", "joy-arcade-reveal-title");
  const revealMessage = element("p", "joy-arcade-reveal-message");
  const revealBn = element("p", "bn joy-arcade-reveal-bn");
  reveal.append(revealIcon, revealTitle, revealMessage, revealBn);

  config.gifts.forEach((gift, index) => {
    const button = element("button", "joy-gift-card");
    button.type = "button";
    button.dataset.giftId = gift.id;
    button.setAttribute("aria-controls", reveal.id);
    button.setAttribute("aria-expanded", "false");
    const icon = element("span", "joy-gift-icon", gift.icon);
    icon.setAttribute("aria-hidden", "true");
    const label = element("span", "joy-gift-label", gift.label);
    const labelBn = element("span", "joy-gift-label-bn", gift.labelBn);
    const number = element("span", "joy-gift-number", String(index + 1).padStart(2, "0"));
    button.append(number, icon, label, labelBn);
    button.addEventListener("click", () => {
      choices.querySelectorAll("button").forEach(item => {
        item.setAttribute("aria-expanded", String(item === button));
        item.classList.toggle("is-selected", item === button);
      });
      reveal.hidden = false;
      revealIcon.textContent = gift.icon;
      revealTitle.textContent = gift.label;
      revealMessage.textContent = gift.message;
      revealBn.textContent = gift.messageBn;
      reveal.classList.remove("is-revealed");
      if (!reducedMotion) requestAnimationFrame(() => reveal.classList.add("is-revealed"));
      else reveal.classList.add("is-revealed");
    });
    choices.append(button);
  });

  shell.append(head, choices, reveal);
  section.append(shell);
  hostSection.parentNode.insertBefore(section, hostSection);
}

function start() {
  if (document.getElementById("pin-lock")) {
    document.addEventListener("nishi:pin-unlocked", initPlayfulArcade, { once: true });
  } else {
    initPlayfulArcade();
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
