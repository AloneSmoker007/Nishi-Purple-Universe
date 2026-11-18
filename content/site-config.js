/**
 * NISHI SITE CONTENT — EDIT THIS FILE TO PERSONALISE THE WEBSITE.
 * Keep image paths inside /assets. Music entries must use official YouTube video IDs.
 */
export const siteConfig = {
  brand: {
    title: "Nishi's Purple Universe 💜",
    description: "A little universe, made with love for Nishi.",
    language: "en",
  },
  theme: {
    accent: "#C77DFF",
    accentSoft: "#E0B4FF",
    background: "#0B0420",
    glow: "rgba(199,125,255,.42)",
  },
  artwork: {
    hero: "assets/purple-galaxy.svg", // Replace with assets/ai/purple-castle-hero.webp when uploaded.
    heroAlt: "A moonlit purple fantasy castle beneath seven glowing stars",
    memory: "assets/ai/rose-garden-terrace.webp",
    castle: "assets/ai/moonlit-castle-detail.webp",
  },
  playfulArcade: {
    title: "Nishi's Little Joy Arcade 💜",
    subtitle: "Three tiny surprises. Pick the one that matches your mood!",
    titleBn: "নিশির ছোট্ট আনন্দের জগৎ 💜",
    subtitleBn: "তোমার মনের মতো একটি ছোট্ট চমক বেছে নাও!",
    gifts: [
      {
        id: "hype",
        icon: "🎀",
        label: "Hype bestie",
        labelBn: "হাইপ বেস্টি",
        message: "Breaking news: you are legally required to keep being this iconic. No refunds, only extra cake. 🎂",
        messageBn: "জরুরি খবর: তোমাকে এভাবেই অসাধারণ থাকতে হবে! রিফান্ড নেই, শুধু আরও কেক! 🎂"
      },
      {
        id: "soft",
        icon: "🧸",
        label: "Soft hug",
        labelBn: "একটি মিষ্টি আলিঙ্গন",
        message: "A tiny reminder: even on a cloudy day, you deserve kindness, laughter and a thousand little reasons to smile. 💜",
        messageBn: "মনে রেখো: মেঘলা দিনেও তুমি ভালোবাসা, হাসি আর হাজারো ছোট্ট আনন্দ পাওয়ার যোগ্য। 💜"
      },
      {
        id: "star",
        icon: "🌟",
        label: "Main character",
        labelBn: "গল্পের নায়িকা",
        message: "Your next chapter comes with seven-star energy, a little chaos, big dreams and a soundtrack picked by you. ✨",
        messageBn: "তোমার পরের অধ্যায়ে থাকুক সাত তারার আলো, একটু দুষ্টুমি, বড় স্বপ্ন আর তোমার পছন্দের গান। ✨"
      }
    ]
  },
  tracks: [
    { id: "7C2z4GqqS5E", title: "Fake Love", note: "💜" },
    { id: "0lapF4DQPKQ", title: "Save Me", note: "🌙" },
    { id: "GZjt_sA2eso", title: "Black Swan", note: "🦢" },
    { id: "mPVDGOVjRQ0", title: "ON", note: "⚡" },
    { id: "MBdVXkSdhwU", title: "DNA", note: "🧬" },
    { id: "tCX0oMf6XQY", title: "FYA?", note: "✨" },
  ],
};
