/* ==================================================================== *
 *  js/quest.js — "Nishi, Tell Me Your Universe"
 *  A conversational Q&A portal + personalized reveal for Nishi.
 *
 *  Privacy rules (hard requirements):
 *   - Every question is OPTIONAL. Skip is always available.
 *   - No sensitive data is requested (no name, age, location, contacts).
 *   - Answers stay in this browser only (localStorage). Nothing is sent
 *     anywhere. Clear reset / delete controls are always visible.
 *
 *  Public API:
 *    initQuest(rootEl, opts) -> { ok, reason? }
 *    setLanguage(lang)        'en' | 'bn'
 *    getAnswers()             plain object
 *    resetQuest()             start over (keeps nothing)
 *    deleteAllData()          wipe stored answers
 *    destroy()
 * ==================================================================== */

const STORAGE_KEY = 'nishi-universe-v1';

/* ------------------------------------------------------------------ *
 *  Question bank
 *  Each choice carries `tags` used later to compose the reveal, so the
 *  final page reflects *her actual choices* rather than random decoration.
 * ------------------------------------------------------------------ */
const QUESTIONS = [
  /* ---------------- 1. personality ---------------- */
  {
    id: 'dreams',
    category: { en: 'About you', bn: 'তোমার সম্পর্কে' },
    type: 'single',
    prompt: {
      en: 'When you close your eyes and drift away, what do you dream about?',
      bn: 'চোখ বুজে যখন দূরে ভেসে যাও — তুমি কী স্বপ্ন দেখো?',
    },
    hint: {
      en: 'There is no wrong answer here. Only yours.',
      bn: 'এখানে কোনো ভুল উত্তর নেই। শুধু তোমারটা।',
    },
    optional: true,
    choices: [
      { id: 'travel', emoji: '✈️', en: 'Seeing the whole world', bn: 'সারা পৃথিবী ঘুরে দেখা', tags: { title: 'Wanderer', atmosphere: 'horizon' } },
      { id: 'music', emoji: '🎵', en: 'Music that moves my soul', bn: 'সেই সঙ্গীত যা প্রাণ নাড়া দেয়', tags: { title: 'Melody', atmosphere: 'aurora' } },
      { id: 'loved', emoji: '💜', en: 'Being near the people I love', bn: 'যাদের ভালোবাসি তাদের কাছে থাকা', tags: { title: 'Heart', atmosphere: 'warmglow' } },
      { id: 'create', emoji: '🎨', en: 'Making something beautiful', bn: 'কিছু সুন্দর তৈরি করা', tags: { title: 'Dreamer', atmosphere: 'stardust' } },
      { id: 'calm', emoji: '🌙', en: 'Perfect peace and quiet', bn: 'নিপুণ শান্তি ও নীরবতা', tags: { title: 'Moonlight', atmosphere: 'moonveil' } },
      { id: 'shine', emoji: '⭐', en: 'Becoming someone I am proud of', bn: 'এমন কেউ হওয়া যার জন্য গর্বিত', tags: { title: 'Rising', atmosphere: 'constellation' } },
    ],
  },
  {
    id: 'happiness',
    category: { en: 'About you', bn: 'তোমার সম্পর্কে' },
    type: 'multi',
    prompt: {
      en: 'Which of these make you genuinely happy? Pick as many as you like.',
      bn: 'এর কোনগুলো তোমার সত্যিকারের হাসি ফোটায়? যত খুশি বেছে নাও।',
    },
    optional: true,
    choices: [
      { id: 'music', emoji: '🎧', en: 'Music', bn: 'সঙ্গীত', tags: { color: 'purple-glow' } },
      { id: 'friends', emoji: '🤝', en: 'Friends', bn: 'বন্ধুরা', tags: { color: 'pink' } },
      { id: 'family', emoji: '🏡', en: 'Family', bn: 'পরিবার', tags: { color: 'gold' } },
      { id: 'rain', emoji: '🌧️', en: 'Rain', bn: 'বৃষ্টি', tags: { color: 'violet-deep' } },
      { id: 'night', emoji: '🌌', en: 'The night sky', bn: 'রাতের আকাশ', tags: { color: 'purple-core' } },
      { id: 'food', emoji: '🍜', en: 'Good food', bn: 'ভালো খাবার', tags: { color: 'pink-warm' } },
      { id: 'surprise', emoji: '🎁', en: 'Surprises', bn: 'সারপ্রাইজ', tags: { color: 'gold-warm' } },
      { id: 'quiet', emoji: '🍃', en: 'Quiet mornings', bn: 'শান্ত সকাল', tags: { color: 'mist' } },
    ],
  },

  /* ---------------- 2. fantasy ---------------- */
  {
    id: 'fantasy-world',
    category: { en: 'Your magical world', bn: 'তোমার জাদুর জগৎ' },
    type: 'single',
    prompt: {
      en: 'If one magical place could be yours forever, which would it be?',
      bn: 'একটি জাদুর জায়গা চিরকালের মতো তোমার হতে পারলে, কোনটা হতো?',
    },
    optional: true,
    choices: [
      { id: 'castle', emoji: '🏰', en: 'A purple castle above the clouds', bn: 'মেঘের উপর একটি বেগুনি দুর্গ', short: { en: 'the Cloud Castle', bn: 'মেঘের দুর্গ' }, tags: { env: 'castle' } },
      { id: 'galaxy', emoji: '🌌', en: 'A galaxy of my own', bn: 'নিজের একটি গ্যালাক্সি', short: { en: 'the Violet Galaxy', bn: 'বেগুনি গ্যালাক্সি' }, tags: { env: 'galaxy' } },
      { id: 'island', emoji: '🏝️', en: 'A floating island with waterfalls', bn: 'জলপ্রপাতসহ ভাসমান দ্বীপ', short: { en: 'the Floating Island', bn: 'ভাসমান দ্বীপ' }, tags: { env: 'island' } },
      { id: 'garden', emoji: '🌸', en: 'An endless blooming garden', bn: 'অন্তহীন ফোটা বাগান', short: { en: 'the Eternal Garden', bn: 'চিরন্তন বাগান' }, tags: { env: 'garden' } },
      { id: 'stars', emoji: '⭐', en: 'A home among the stars', bn: 'তারার মাঝে একটি ঠিকানা', short: { en: 'the Starfield', bn: 'তারার মাঠ' }, tags: { env: 'stars' } },
      { id: 'moon', emoji: '🌕', en: 'A palace under the moon', bn: 'চাঁদের নিচে একটি প্রাসাদ', short: { en: 'the Moon Palace', bn: 'চাঁদের প্রাসাদ' }, tags: { env: 'moon' } },
      { id: 'rainbow', emoji: '🌈', en: 'A rainbow bridge to anywhere', bn: 'যেকোনো জায়গায় রংধনুর সেতু', short: { en: 'the Rainbow Bridge', bn: 'রংধনুর সেতু' }, tags: { env: 'rainbow' } },
    ],
  },
  {
    id: 'sky-mood',
    category: { en: 'Your magical world', bn: 'তোমার জাদুর জগৎ' },
    type: 'single',
    prompt: {
      en: 'What colour should your sky be?',
      bn: 'তোমার আকাশ কোন রঙের হওয়া উচিত?',
    },
    optional: true,
    choices: [
      { id: 'deep-purple', emoji: '💜', en: 'Deep violet twilight', bn: 'গাঢ় বেগুনি গোধূলি', tags: { sky: 'violet' } },
      { id: 'rose', emoji: '🌸', en: 'Rose-gold dawn', bn: 'গোলাপ-সোনালি ভোর', tags: { sky: 'rose' } },
      { id: 'gold', emoji: '✨', en: 'Golden starlight', bn: 'সোনালি তারার আলো', tags: { sky: 'gold' } },
      { id: 'blue', emoji: '🌌', en: 'Midnight blue', bn: 'মধ্যরাতের নীল', tags: { sky: 'midnight' } },
    ],
  },

  /* ---------------- 3. bts ---------------- */
  {
    id: 'bts-meaning',
    category: { en: 'BTS & you', bn: 'BTS ও তুমি' },
    type: 'text',
    prompt: {
      en: 'What does BTS mean to you? (only if you want to say)',
      bn: 'তোমার কাছে BTS মানে কী? (চাইলে বলো)',
    },
    hint: {
      en: 'A word, a line, a feeling — anything. Or skip it.',
      bn: 'একটি শব্দ, একটি লাইন, একটি অনুভূতি — যা খুশি। বা এড়িয়ে যাও।',
    },
    optional: true,
    placeholder: { en: 'Whatever it means to you…', bn: 'তোমার মনে যা আসে…' },
  },
  {
    id: 'bts-era',
    category: { en: 'BTS & you', bn: 'BTS ও তুমি' },
    type: 'single',
    prompt: {
      en: 'Which era feels the most like you?',
      bn: 'কোন যুগটা তোমার মতো সবচেয়ে বেশি মনে হয়?',
    },
    optional: true,
    choices: [
      { id: 'debut', emoji: '🔥', en: 'The fierce beginning', bn: 'প্রচণ্ড সূচনা', tags: { era: 'The Fierce Beginning' } },
      { id: 'wings', emoji: '🦋', en: 'Wings — growing and breaking free', bn: 'Wings — বেড়ে ওঠা ও মুক্তি', tags: { era: 'Wings' } },
      { id: 'loveyourself', emoji: '💗', en: 'Love Yourself', bn: 'Love Yourself', tags: { era: 'Love Yourself' } },
      { id: 'mots', emoji: '🧠', en: 'Map of the Soul', bn: 'Map of the Soul', tags: { era: 'Map of the Soul' } },
      { id: 'be', emoji: '🕊️', en: 'BE — staying together', bn: 'BE — একসাথে থাকা', tags: { era: 'BE' } },
      { id: 'proof', emoji: '📜', en: 'Proof — every chapter matters', bn: 'Proof — প্রতিটি অধ্যায় গুরুত্বপূর্ণ', tags: { era: 'Proof' } },
    ],
  },
  {
    id: 'bts-songs',
    category: { en: 'BTS & you', bn: 'BTS ও তুমি' },
    type: 'multi',
    prompt: {
      en: 'Which songs live in your heart? (from our little playlist)',
      bn: 'কোন গানগুলো তোমার হৃদয়ে বাস করে? (আমাদের ছোট্ট প্লেলিস্ট থেকে)',
    },
    optional: true,
    choices: [
      { id: 'fakelove', emoji: '💔', en: 'Fake Love', bn: 'Fake Love', tags: { song: 'Fake Love' } },
      { id: 'saveme', emoji: '🆘', en: 'Save Me', bn: 'Save Me', tags: { song: 'Save Me' } },
      { id: 'blackswan', emoji: '🦢', en: 'Black Swan', bn: 'Black Swan', tags: { song: 'Black Swan' } },
      { id: 'on', emoji: '⚡', en: 'ON', bn: 'ON', tags: { song: 'ON' } },
      { id: 'dna', emoji: '🧬', en: 'DNA', bn: 'DNA', tags: { song: 'DNA' } },
    ],
  },
  {
    id: 'concert-dream',
    category: { en: 'BTS & you', bn: 'BTS ও তুমি' },
    type: 'text',
    prompt: {
      en: 'If you could go to one BTS concert, where would it be?',
      bn: 'একটি BTS কনসার্টে যেতে পারলে কোথায় হতো?',
    },
    optional: true,
    placeholder: { en: 'A city, a stadium, a dream…', bn: 'একটি শহর, একটি স্টেডিয়াম, একটি স্বপ্ন…' },
  },

  /* ---------------- 4. v ---------------- */
  {
    id: 'v-moment',
    category: { en: "V's corner", bn: 'V-এর কোণা' },
    type: 'single',
    prompt: {
      en: 'What is your favourite kind of V moment?',
      bn: 'V-এর কোন ধরনের মুহূর্ত তোমার সবচেয়ে প্রিয়?',
    },
    optional: true,
    choices: [
      { id: 'voice', emoji: '🎤', en: 'His deep, warm voice', bn: 'তার গভীর, উষ্ণ কণ্ঠ', tags: { v: 'His voice' } },
      { id: 'smile', emoji: '😊', en: 'That boxy smile', bn: 'সেই বাক্স-হাসি', tags: { v: 'That boxy smile' } },
      { id: 'art', emoji: '🎨', en: 'His art and photography', bn: 'তার শিল্প ও আলোকচিত্র', tags: { v: 'His art' } },
      { id: 'chaos', emoji: '🤪', en: 'His silly, chaotic energy', bn: 'তার মজার, বিশৃঙ্খল শক্তি', tags: { v: 'His chaos' } },
      { id: 'kindness', emoji: '🤍', en: 'How gentle he is with people', bn: 'মানুষের সাথে তার কোমলতা', tags: { v: 'His gentleness' } },
      { id: 'perform', emoji: '🕺', en: 'When he performs on stage', bn: 'মঞ্চে যখন সে পরিবেশন করে', tags: { v: 'His stage presence' } },
    ],
  },
  {
    id: 'v-special',
    category: { en: "V's corner", bn: 'V-এর কোণা' },
    type: 'text',
    prompt: {
      en: 'What makes him special to you, personally?',
      bn: 'ব্যক্তিগতভাবে তোমার কাছে তাকে বিশেষ করে তুলে কী?',
    },
    optional: true,
    placeholder: { en: 'Only share what you are comfortable with…', bn: 'শুধু যা বলতে আরামদায়ক লাগে…' },
  },

  /* ---------------- 5. memories ---------------- */
  {
    id: 'happy-place',
    category: { en: 'Moments you keep', bn: 'যে মুহূর্তগুলো রাখো' },
    type: 'single',
    prompt: {
      en: 'Where do you go in your mind when you want to feel happy?',
      bn: 'সুখী বোধ করতে চাইলে মনে কোথায় যাও?',
    },
    optional: true,
    choices: [
      { id: 'home', emoji: '🏠', en: 'Home', bn: 'বাড়ি', tags: { place: 'home' } },
      { id: 'hills', emoji: '⛰️', en: 'The mountains', bn: 'পাহাড়', tags: { place: 'the mountains' } },
      { id: 'sea', emoji: '🌊', en: 'The sea', bn: 'সমুদ্র', tags: { place: 'the sea' } },
      { id: 'city', emoji: '🌃', en: 'A city at night', bn: 'রাতের শহর', tags: { place: 'a night city' } },
      { id: 'room', emoji: '🛋️', en: 'My own little room', bn: 'আমার নিজের ছোট্ট ঘর', tags: { place: 'my little room' } },
      { id: 'anywhere', emoji: '🫶', en: 'Anywhere with my people', bn: 'আমার মানুষদের সাথে যেকোনো জায়গা', tags: { place: 'wherever my people are' } },
    ],
  },
  {
    id: 'memory-keep',
    category: { en: 'Moments you keep', bn: 'যে মুহূর্তগুলো রাখো' },
    type: 'text',
    prompt: {
      en: 'One memory you never want to forget?',
      bn: 'এমন একটি স্মৃতি যা তুমি কখনো ভুলতে চাও না?',
    },
    optional: true,
    placeholder: { en: 'It can be tiny. Tiny memories are often the biggest…', bn: 'ছোটও হতে পারে। ছোট স্মৃতিই প্রায়ই সবচেয়ে বড় হয়…' },
  },

  /* ---------------- 6. future ---------------- */
  {
    id: 'dream-place',
    category: { en: 'Dreams ahead', bn: 'সামনের স্বপ্ন' },
    type: 'single',
    prompt: {
      en: 'Which dream destination calls you the loudest?',
      bn: 'কোন স্বপ্নের গন্তব্য তোমাকে সবচেয়ে জোরে ডাকে?',
    },
    optional: true,
    choices: [
      { id: 'korea', emoji: '🇰🇷', en: 'South Korea', bn: 'দক্ষিণ কোরিয়া', tags: { dest: 'South Korea' } },
      { id: 'japan', emoji: '🇯🇵', en: 'Japan', bn: 'জাপান', tags: { dest: 'Japan' } },
      { id: 'paris', emoji: '🇫🇷', en: 'Paris', bn: 'প্যারিস', tags: { dest: 'Paris' } },
      { id: 'maldives', emoji: '🏝️', en: 'The Maldives', bn: 'মালদ্বীপ', tags: { dest: 'the Maldives' } },
      { id: 'swiss', emoji: '🏔️', en: 'Switzerland', bn: 'সুইজারল্যান্ড', tags: { dest: 'Switzerland' } },
      { id: 'home', emoji: '🌌', en: 'Somewhere no one has named yet', bn: 'এমন কোথাও যার এখনো নাম হয়নি', tags: { dest: 'somewhere unnamed' } },
    ],
  },
  {
    id: 'bmw',
    category: { en: 'Dreams ahead', bn: 'সামনের স্বপ্ন' },
    type: 'single',
    prompt: {
      en: 'Your dream BMW — what colour is it?',
      bn: 'তোমার স্বপ্নের BMW — ওটা কোন রঙের?',
    },
    hint: {
      en: 'Yes, this question is entirely necessary. 😌',
      bn: 'হ্যাঁ, এই প্রশ্নটা সম্পূর্ণ প্রয়োজনীয়। 😌',
    },
    optional: true,
    choices: [
      { id: 'purple', emoji: '💜', en: 'Purple, obviously', bn: 'বেগুনি, অবশ্যই', short: { en: 'purple', bn: 'বেগুনি' }, tags: { car: 'purple' } },
      { id: 'black', emoji: '🖤', en: 'Gloss black', bn: 'চকচকে কালো', short: { en: 'gloss black', bn: 'চকচকে কালো' }, tags: { car: 'gloss black' } },
      { id: 'white', emoji: '🤍', en: 'Pearl white', bn: 'মুক্তা-সাদা', short: { en: 'pearl white', bn: 'মুক্তা-সাদা' }, tags: { car: 'pearl white' } },
      { id: 'red', emoji: '❤️', en: 'Deep red', bn: 'গাঢ় লাল', short: { en: 'deep red', bn: 'গাঢ় লাল' }, tags: { car: 'deep red' } },
      { id: 'blue', emoji: '💙', en: 'Midnight blue', bn: 'মধ্যরাতের নীল', short: { en: 'midnight blue', bn: 'মধ্যরাতের নীল' }, tags: { car: 'midnight blue' } },
    ],
  },
  {
    id: 'perfect-day',
    category: { en: 'Dreams ahead', bn: 'সামনের স্বপ্ন' },
    type: 'single',
    prompt: {
      en: 'Describe your perfect day in one choice.',
      bn: 'একটি পছন্দে তোমার নিখুঁত দিনটা বর্ণনা করো।',
    },
    optional: true,
    choices: [
      { id: 'slow', emoji: '☕', en: 'Slow, warm and quiet', bn: 'ধীর, উষ্ণ ও শান্ত', short: { en: 'slow, warm and quiet', bn: 'ধীর, উষ্ণ ও শান্ত' }, tags: { day: 'a slow, warm, quiet day' } },
      { id: 'adventure', emoji: '🗺️', en: 'Full of adventure', bn: 'দুঃসাহসিকতায় ভরপুর', short: { en: 'full of adventure', bn: 'দুঃসাহসিকতায় ভরপুর' }, tags: { day: 'an adventurous day' } },
      { id: 'people', emoji: '🫶', en: 'Surrounded by favourite people', bn: 'প্রিয় মানুষদের ঘিরে', short: { en: 'with your favourite people', bn: 'প্রিয় মানুষদের সাথে' }, tags: { day: 'a day surrounded by favourite people' } },
      { id: 'music', emoji: '🎶', en: 'Music from morning to night', bn: 'সকাল থেকে রাত পর্যন্ত সঙ্গীত', short: { en: 'filled with music', bn: 'সঙ্গীতে ভরা' }, tags: { day: 'a day full of music' } },
      { id: 'surprise', emoji: '🎁', en: 'A day full of good surprises', bn: 'ভালো সারপ্রাইজে ভরা দিন', short: { en: 'full of good surprises', bn: 'ভালো সারপ্রাইজে ভরা' }, tags: { day: 'a day full of good surprises' } },
    ],
  },

  /* ---------------- 7. friendship ---------------- */
  {
    id: 'friendship',
    category: { en: 'Friendship', bn: 'বন্ধুত্ব' },
    type: 'multi',
    prompt: {
      en: 'What makes a friendship truly meaningful to you?',
      bn: 'তোমার কাছে কী একটি বন্ধুত্বকে সত্যিকারের অর্থবহ করে তোলে?',
    },
    optional: true,
    choices: [
      { id: 'trust', emoji: '🤝', en: 'Trust', bn: 'বিশ্বাস', tags: { bond: 'trust' } },
      { id: 'time', emoji: '⏳', en: 'Time given freely', bn: 'স্বেচ্ছায় দেওয়া সময়', tags: { bond: 'time' } },
      { id: 'listen', emoji: '👂', en: 'Really listening', bn: 'সত্যিই শোনা', tags: { bond: 'listening' } },
      { id: 'laugh', emoji: '😂', en: 'Laughing together', bn: 'একসাথে হাসা', tags: { bond: 'laughter' } },
      { id: 'honest', emoji: '💬', en: 'Honesty, even when it is hard', bn: 'কঠিন হলেও সততা', tags: { bond: 'honesty' } },
      { id: 'stay', emoji: '🫂', en: 'Staying, no matter what', bn: 'যাই হোক থেকে যাওয়া', tags: { bond: 'staying' } },
    ],
  },
  {
    id: 'appreciated',
    category: { en: 'Friendship', bn: 'বন্ধুত্ব' },
    type: 'single',
    prompt: {
      en: 'When do you feel most appreciated?',
      bn: 'কবে তুমি সবচেয়ে বেশি প্রশংসিত বোধ করো?',
    },
    optional: true,
    choices: [
      { id: 'words', emoji: '💌', en: 'Kind words', bn: 'দয়ালু কথা', tags: { feel: 'kind words' } },
      { id: 'time', emoji: '🕰️', en: 'Someone giving me their time', bn: 'কেউ আমাকে সময় দিলে', tags: { feel: 'someone’s time' } },
      { id: 'help', emoji: '🤲', en: 'Someone showing up to help', bn: 'কেউ সাহায্য করতে এলে', tags: { feel: 'someone showing up' } },
      { id: 'remember', emoji: '🌼', en: 'Being remembered in small ways', bn: 'ছোট ছোট উপায়ে মনে রাখা হলে', tags: { feel: 'small remembered things' } },
    ],
  },

  /* ---------------- 8. surprises ---------------- */
  {
    id: 'surprise-kind',
    category: { en: 'Your kind of magic', bn: 'তোমার জাদুর ধরন' },
    type: 'single',
    prompt: {
      en: 'What kind of magical surprise do you love most?',
      bn: 'কোন ধরনের জাদুর সারপ্রাইজ তুমি সবচেয়ে ভালোবাসো?',
    },
    optional: true,
    choices: [
      { id: 'letter', emoji: '✉️', en: 'A handwritten letter', bn: 'হাতে লেখা চিঠি', tags: { magic: 'a handwritten letter' } },
      { id: 'place', emoji: '🎁', en: 'Being taken somewhere beautiful', bn: 'কোনো সুন্দর জায়গায় নিয়ে যাওয়া', tags: { magic: 'a beautiful place' } },
      { id: 'song', emoji: '🎧', en: 'A song chosen just for me', bn: 'শুধু আমার জন্য বাছাই গান', tags: { magic: 'a song chosen just for me' } },
      { id: 'stars', emoji: '🌠', en: 'Something under the stars', bn: 'তারার নিচে কিছু', tags: { magic: 'something under the stars' } },
      { id: 'time', emoji: '🕯️', en: 'Undivided, unhurried time', bn: 'অবিভক্ত, অব্যস্ত সময়', tags: { magic: 'undivided time' } },
    ],
  },
];

const CATEGORY_ORDER = [
  { en: 'About you', bn: 'তোমার সম্পর্কে' },
  { en: 'Your magical world', bn: 'তোমার জাদুর জগৎ' },
  { en: 'BTS & you', bn: 'BTS ও তুমি' },
  { en: "V's corner", bn: 'V-এর কোণা' },
  { en: 'Moments you keep', bn: 'যে মুহূর্তগুলো রাখো' },
  { en: 'Dreams ahead', bn: 'সামনের স্বপ্ন' },
  { en: 'Friendship', bn: 'বন্ধুত্ব' },
  { en: 'Your kind of magic', bn: 'তোমার জাদুর ধরন' },
];

/* ------------------------------------------------------------------ *
 *  Runtime state
 * ------------------------------------------------------------------ */
const state = {
  lang: 'en',
  index: 0,
  phase: 'intro', // intro | question | review | reveal
  answers: {}, // questionId -> choiceId | [choiceId] | string
  root: null,
  opts: {},
};

function t(pair) {
  if (!pair) return '';
  return state.lang === 'bn' ? (pair.bn || pair.en) : (pair.en || pair.bn);
}

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/** Lowercase only the first character, so labels drop cleanly into a sentence. */
function lc(s) {
  const str = String(s == null ? '' : s);
  return str ? str.charAt(0).toLowerCase() + str.slice(1) : str;
}

/* ------------------------------------------------------------------ *
 *  Persistence — local only, never transmitted
 * ------------------------------------------------------------------ */
function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ lang: state.lang, answers: state.answers }));
    return true;
  } catch (e) {
    /* private mode / quota — the experience still works, just not persisted */
    return false;
  }
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (data && typeof data === 'object') {
      if (data.lang === 'bn' || data.lang === 'en') state.lang = data.lang;
      if (data.answers && typeof data.answers === 'object') state.answers = data.answers;
    }
  } catch (e) {
    /* corrupt payload — start clean */
    state.answers = {};
  }
}

function wipeStorage() {
  try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
}

/** Keep the site-wide language toggle in sync (key shared with js/ui.js). */
function broadcastLang() {
  try { localStorage.setItem('nishi-lang', state.lang); } catch (e) { /* private mode */ }
  try {
    document.dispatchEvent(new CustomEvent('nishi:quest-lang', { detail: { lang: state.lang } }));
  } catch (e) { /* non-DOM env */ }
}

/** Deterministic star field so the same answers always paint the same sky. */
function starField(count) {
  const parts = [];
  let seed = 7;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  for (let i = 0; i < count; i++) {
    const x = (rnd() * 100).toFixed(1);
    const y = (rnd() * 100).toFixed(1);
    const s = (1 + rnd() * 1.7).toFixed(1);
    const o = (0.45 + rnd() * 0.55).toFixed(2);
    const roll = rnd();
    const c = roll > 0.82
      ? `rgba(255,215,0,${o})`
      : roll > 0.52 ? `rgba(199,125,255,${o})` : `rgba(255,255,255,${o})`;
    parts.push(`radial-gradient(${s}px ${s}px at ${x}% ${y}%, ${c}, transparent 62%)`);
  }
  return parts.join(',');
}

/* ------------------------------------------------------------------ *
 *  Reveal composition — built from *her* actual choices
 * ------------------------------------------------------------------ */
function firstChoiceTag(qid, tagKey) {
  const a = state.answers[qid];
  if (!a) return null;
  const ids = Array.isArray(a) ? a : [a];
  for (const id of ids) {
    const q = QUESTIONS.find((x) => x.id === qid);
    const c = q && q.choices && q.choices.find((x) => x.id === id);
    if (c && c.tags && c.tags[tagKey]) return c.tags[tagKey];
  }
  return null;
}

/** Resolve the selected choice object for a question (first pick for multi). */
function findChoice(qid) {
  return findChoices(qid)[0] || null;
}

/** Resolve every selected choice for a question (multi-select aware). */
function findChoices(qid) {
  const a = state.answers[qid];
  if (a == null) return [];
  const ids = Array.isArray(a) ? a : [a];
  const q = QUESTIONS.find((x) => x.id === qid);
  if (!q || !q.choices) return [];
  return ids.map((id) => q.choices.find((x) => x.id === id)).filter(Boolean);
}

/** Localised label of the selected choice, in the active language. */
function choiceLabelText(qid) {
  const c = findChoice(qid);
  return c ? t({ en: c.en, bn: c.bn }) : null;
}

function answeredList() {
  return QUESTIONS.filter((q) => {
    const a = state.answers[q.id];
    if (a == null) return false;
    if (Array.isArray(a)) return a.length > 0;
    return String(a).trim().length > 0;
  });
}

function buildReveal() {
  const titleWord = firstChoiceTag('dreams', 'title') || 'Dreamer';
  const envTag = firstChoiceTag('fantasy-world', 'env') || 'galaxy';
  const fantasyChoiceId = state.answers['fantasy-world'];
  const fantasyQ = QUESTIONS.find((x) => x.id === 'fantasy-world');
  const fantasyChoice = fantasyQ.choices.find((x) => x.id === fantasyChoiceId);
  const envName = fantasyChoice && fantasyChoice.short ? t(fantasyChoice.short) : null;
  const envLabel = fantasyChoice ? t({ en: fantasyChoice.en, bn: fantasyChoice.bn }) : null;
  const skyTag = firstChoiceTag('sky-mood', 'sky') || 'violet';
  // Localised labels: use the choice's own en/bn text so the reveal reads
  // naturally in either language instead of leaking English tags into Bangla.
  const pick = (qid) => choiceLabelText(qid);
  const pickShort = (qid) => {
    const c = findChoice(qid);
    return c && c.short ? t(c.short) : (c ? t({ en: c.en, bn: c.bn }) : null);
  };
  const era = pick('bts-era');
  const vThing = pick('v-moment');
  const place = pick('happy-place');
  const dest = pick('dream-place');
  const car = pickShort('bmw');
  const day = pickShort('perfect-day');
  const magic = pick('surprise-kind');

  const songIds = state.answers['bts-songs'] || [];
  const songs = (Array.isArray(songIds) ? songIds : [songIds])
    .map((id) => {
      const q = QUESTIONS.find((x) => x.id === 'bts-songs');
      const c = q.choices.find((x) => x.id === id);
      return c ? c.en : null;
    })
    .filter(Boolean);

  const bonds = (state.answers.friendship || []);
  const bondList = (Array.isArray(bonds) ? bonds : [bonds])
    .map((id) => {
      const q = QUESTIONS.find((x) => x.id === 'friendship');
      const c = q.choices.find((x) => x.id === id);
      return c ? t({ en: c.en, bn: c.bn }) : null;
    })
    .filter(Boolean);

  // Colours she actually picked (from the happiness question) + atmosphere.
  const COLOR_TOKENS = {
    'purple-glow': '#C77DFF',
    pink: '#FF69B4',
    gold: '#FFD700',
    'violet-deep': '#4B0082',
    'purple-core': '#7B2CBF',
    'pink-warm': '#E87A5D',
    mist: '#2D1B3D',
  };
  const colours = findChoices('happiness')
    .map((c) => (c.tags && c.tags.color ? { token: c.tags.color, hex: COLOR_TOKENS[c.tags.color], label: t({ en: c.en, bn: c.bn }) } : null))
    .filter((x) => x && x.hex);
  const starCount = Math.min(24, 6 + findChoices('happiness').length * 3);

  const custom = {
    btsMeaning: (state.answers['bts-meaning'] || '').toString().trim(),
    concert: (state.answers['concert-dream'] || '').toString().trim(),
    vSpecial: (state.answers['v-special'] || '').toString().trim(),
    memory: (state.answers['memory-keep'] || '').toString().trim(),
  };

  const bn = state.lang === 'bn';
  const TITLE_WORDS_BN = {
    Wanderer: 'ভ্রমণপ্রার্থী',
    Melody: 'সুরধারা',
    Heart: 'হৃদয়',
    Dreamer: 'স্বপ্নদ্রষ্টা',
    Moonlight: 'চাঁদের আলো',
    Rising: 'উদীয়মান',
  };
  const word = (bn && TITLE_WORDS_BN[titleWord]) ? TITLE_WORDS_BN[titleWord] : titleWord;
  const title = bn
    ? `${word}-এর ${envName || 'বেগুনি মহাকাশ'}`
    : `The ${titleWord} of ${envName || 'the Violet Sky'}`;

  const lines = [];
  lines.push(bn
    ? `তুমি বেছে নিয়েছ ${envLabel || 'একটি বেগুনি জগৎ'}, ${skyTag === 'gold' ? 'সোনালি তারার আলো' : skyTag === 'rose' ? 'গোলাপ-সোনালি ভোর' : skyTag === 'midnight' ? 'মধ্যরাতের নীল' : 'গাঢ় বেগুনি গোধূলি'} আকাশ, আর তারার নিচে বসে থাকা।`
    : `You chose ${envLabel || 'a violet world'}, a ${skyTag === 'gold' ? 'golden starlight' : skyTag === 'rose' ? 'rose-gold dawn' : skyTag === 'midnight' ? 'midnight blue' : 'deep violet twilight'} sky, and a seat beneath the stars.`);

  if (era) lines.push(bn ? `তোমার যুগ — ${era}।` : `Your era is ${lc(era)}.`);
  if (songs.length) lines.push(bn ? `তোমার হৃদয়ে বাস করে: ${songs.join(', ')}।` : `Living in your heart: ${songs.join(', ')}.`);
  if (custom.btsMeaning) lines.push(bn ? `BTS তোমার কাছে মানে — “${custom.btsMeaning}”` : `To you, BTS means — “${custom.btsMeaning}”`);
  if (vThing) lines.push(bn ? `V-এর ক্ষেত্রে, ${vThing} তোমার প্রিয়।` : `For V, it is ${vThing.toLowerCase()} that you love most.`);
  if (custom.vSpecial) lines.push(bn ? `“${custom.vSpecial}”` : `“${custom.vSpecial}”`);
  if (place) lines.push(bn ? `তোমার খুশির জায়গা: ${place}।` : `Your happy place: ${place}.`);
  if (custom.memory) lines.push(bn ? `তুমি রাখতে চাও — “${custom.memory}”` : `You want to keep — “${custom.memory}”`);
  if (dest) lines.push(bn ? `তোমার স্বপ্নের গন্তব্য: ${dest}।` : `Your dream destination: ${dest}.`);
  if (car) lines.push(bn ? `আর হ্যাঁ — সেই ${car} BMW, রাস্তায় ভেসে বেড়াবে। 😌` : `And yes — that ${car} BMW, gliding down the road. 😌`);
  if (day) lines.push(bn ? `তোমার নিখুঁত দিন হলো ${day}।` : `Your perfect day is ${day}.`);
  if (bondList.length) lines.push(bn ? `বন্ধুত্ব তোমার কাছে মানে: ${bondList.join(', ')}।` : `Friendship means: ${bondList.join(', ')}.`);
  if (custom.concert) lines.push(bn ? `তুমি কনসার্টে যেতে চাও — ${custom.concert}।` : `Your concert dream: ${custom.concert}.`);
  if (magic) lines.push(bn ? `তোমার জাদুর ধরন: ${magic}।` : `Your kind of magic: ${lc(magic)}.`);

  return {
    title,
    subtitle: bn
      ? `${answeredList().length}টি প্রশ্ন, তোমার নিজের উত্তর দিয়ে তৈরি`
      : `${answeredList().length} answers, all yours`,
    lines,
    env: envTag,
    sky: skyTag,
    colours,
    starCount,
    songs,
    dest,
    car,
  };
}

/* ------------------------------------------------------------------ *
 *  Rendering
 * ------------------------------------------------------------------ */
function render() {
  const root = state.root;
  if (!root) return;
  const total = QUESTIONS.length;
  const answered = answeredList().length;

  let body = '';
  if (state.phase === 'intro') {
    body = `
      <div class="quest-intro">
        <p class="eyebrow" style="justify-content:center">${esc(t({ en: 'A little conversation', bn: 'একটি ছোট্ট কথোপকথন' }))}</p>
        <h3 class="script">${esc(t({ en: 'Nishi, Tell Me Your Universe', bn: 'নিশি, তোমার মহাকাশ বলো' }))}</h3>
        <p class="lead" style="margin-inline:auto">
          ${esc(t({
            en: 'A few gentle questions. Answer as much or as little as you like — every single one is optional, and nothing leaves this device.',
            bn: 'কয়েকটি কোমল প্রশ্ন। যত খুশি উত্তর দাও — প্রতিটি সম্পূর্ণ ঐচ্ছিক, আর কিছুই এই ডিভাইস ছেড়ে যায় না।',
          }))}
        </p>
        <div class="quest-actions">
          <button type="button" class="btn gold" data-quest="start">${esc(t({ en: 'Begin ✨', bn: 'শুরু করি ✨' }))}</button>
          <button type="button" class="btn ghost" data-quest="resume" hidden>${esc(t({ en: 'Continue where I left off', bn: 'যেখানে ছিলাম সেখান থেকে' }))}</button>
        </div>
        <p class="dim quest-privacy">
          🔒 ${esc(t({ en: 'Your answers stay in this browser only. Reset or delete them any time.', bn: 'তোমার উত্তর শুধু এই ব্রাউজারে থাকে। যেকোনো সময় রিসেট বা মুছে ফেলা যাবে।' }))}
        </p>
      </div>`;
  } else if (state.phase === 'question') {
    const q = QUESTIONS[state.index];
    const given = state.answers[q.id];
    body = `
      <div class="quest-card" data-qid="${esc(q.id)}">
        <div class="quest-meta">
          <span class="chip">${esc(t(q.category))}</span>
          <span class="quest-count">${state.index + 1} / ${total}</span>
        </div>
        <h3 class="quest-prompt">${esc(t(q.prompt))}</h3>
        ${q.hint ? `<p class="dim quest-hint">${esc(t(q.hint))}</p>` : ''}
        <div class="quest-body">
          ${q.type === 'text' ? `
            <label class="sr-only" for="quest-text">${esc(t(q.prompt))}</label>
            <textarea id="quest-text" class="quest-text" rows="3"
              placeholder="${esc(t(q.placeholder || { en: 'Type if you like…', bn: 'চাইলে লেখো…' }))}">${esc(given || '')}</textarea>
          ` : `
            <div class="quest-choices" role="${q.type === 'multi' ? 'group' : 'radiogroup'}" aria-label="${esc(t(q.prompt))}">
              ${q.choices.map((c) => {
                const on = q.type === 'multi'
                  ? Array.isArray(given) && given.includes(c.id)
                  : given === c.id;
                return `<button type="button"
                  class="quest-choice${on ? ' is-on' : ''}"
                  role="${q.type === 'multi' ? 'checkbox' : 'radio'}"
                  aria-checked="${on}"
                  data-choice="${esc(c.id)}">
                  <span class="quest-emoji" aria-hidden="true">${c.emoji}</span>
                  <span class="quest-choice-label">${esc(t({ en: c.en, bn: c.bn }))}</span>
                </button>`;
              }).join('')}
            </div>
          `}
        </div>
        <div class="quest-actions">
          <button type="button" class="btn ghost sm" data-quest="back" ${state.index === 0 ? 'disabled' : ''}>← ${esc(t({ en: 'Back', bn: 'পেছনে' }))}</button>
          <button type="button" class="btn ghost sm" data-quest="skip">${esc(t({ en: 'Skip', bn: 'এড়িয়ে যাও' }))}</button>
          <button type="button" class="btn" data-quest="next">${esc(t({ en: 'Next →', bn: 'পরবর্তী →' }))}</button>
        </div>
      </div>`;
  } else if (state.phase === 'review') {
    body = `
      <div class="quest-review">
        <p class="eyebrow" style="justify-content:center">${esc(t({ en: 'Your answers', bn: 'তোমার উত্তরগুলো' }))}</p>
        <h3 class="script">${esc(t({ en: 'Change anything you like', bn: 'যা খুশি বদলাও' }))}</h3>
        <p class="dim" style="text-align:center">${esc(t({ en: 'Tap any answer to edit it. Nothing is final.', bn: 'যেকোনো উত্তরে ট্যাপ করে সম্পাদনা করো। কিছুই চূড়ান্ত নয়।' }))}</p>
        <ul class="quest-review-list">
          ${QUESTIONS.map((q, i) => {
            const a = state.answers[q.id];
            let label = t({ en: 'Skipped', bn: 'এড়িয়ে গেছো' });
            if (q.type === 'text' && a) label = String(a);
            else if (q.type === 'multi' && Array.isArray(a) && a.length) {
              label = a.map((id) => {
                const c = q.choices.find((x) => x.id === id);
                return c ? t({ en: c.en, bn: c.bn }) : '';
              }).filter(Boolean).join(', ');
            } else if (a) {
              const c = q.choices && q.choices.find((x) => x.id === a);
              if (c) label = `${c.emoji} ${t({ en: c.en, bn: c.bn })}`;
            }
            return `<li>
              <button type="button" class="quest-review-item" data-quest="edit" data-index="${i}">
                <span class="quest-review-q">${esc(t(q.prompt))}</span>
                <span class="quest-review-a${label === t({ en: 'Skipped', bn: 'এড়িয়ে গেছো' }) ? ' is-empty' : ''}">${esc(label)}</span>
              </button>
            </li>`;
          }).join('')}
        </ul>
        <div class="quest-actions">
          <button type="button" class="btn ghost" data-quest="back-q">← ${esc(t({ en: 'Edit answers', bn: 'উত্তর সম্পাদনা' }))}</button>
          <button type="button" class="btn gold" data-quest="reveal">${esc(t({ en: 'Reveal my universe ✨', bn: 'আমার মহাকাশ দেখাও ✨' }))}</button>
        </div>
      </div>`;
  } else if (state.phase === 'reveal') {
    const r = buildReveal();
    body = `
      <div class="quest-reveal" data-env="${esc(r.env)}" data-sky="${esc(r.sky)}">
        <p class="eyebrow" style="justify-content:center">${esc(t({ en: 'Made only from your answers', bn: 'শুধু তোমার উত্তর দিয়ে তৈরি' }))}</p>
        <h3 class="script quest-reveal-title">${esc(r.title)}</h3>
        <p class="dim" style="text-align:center">${esc(r.subtitle)}</p>
        <div class="quest-reveal-scene" aria-hidden="true">
          <div class="quest-orb"></div>
          <div class="quest-stars" style="background-image:${starField(r.starCount)}"></div>
        </div>
        ${r.colours.length ? `
        <ul class="quest-swatches" aria-label="${esc(t({ en: 'The colours you chose', bn: 'তুমি যে রঙগুলো বেছে নিয়েছ' }))}">
          ${r.colours.map((c) => `<li><span class="quest-swatch" style="background:${c.hex}"></span>${esc(c.label)}</li>`).join('')}
        </ul>` : ''}
        <ul class="quest-reveal-lines">
          ${r.lines.map((l) => `<li>${esc(l)}</li>`).join('')}
        </ul>
        <div class="quest-letter panel">
          <p class="script" style="font-size:clamp(1.5rem,3.6vw,2.2rem)">${esc(t({ en: 'One last thing', bn: 'শেষ একটি কথা' }))}</p>
          <p class="lead">
            ${esc(t({
              en: 'Nishi — the universe you just described is not imaginary. It is the shape of the person you already are. Keep the purple, keep the stars, and keep being exactly this. 💜',
              bn: 'নিশি — তুমি যে মহাকাশটা এইমাত্র বর্ণনা করেছ ওটা কাল্পনিক নয়। ওটা তোমার মধ্যে যে মানুষটা আছে তারই আকৃতি। বেগুনি রাখো, তারাগুলো রাখো, আর ঠিক এমনই থেকে যাও। 💜',
            }))}
          </p>
          <p class="quest-sign">${esc(t({ en: 'With love, Your Bilal', bn: 'ভালোবাসাসহ, তোমার বিলাল' }))} 💜</p>
        </div>
        <div class="quest-actions">
          <button type="button" class="btn ghost sm" data-quest="review">← ${esc(t({ en: 'Review answers', bn: 'উত্তর দেখো' }))}</button>
          <button type="button" class="btn ghost sm" data-quest="copy">${esc(t({ en: 'Copy my universe', bn: 'আমার মহাকাশ কপি করো' }))}</button>
          <button type="button" class="btn ghost sm" data-quest="restart">${esc(t({ en: 'Start over', bn: 'আবার শুরু' }))}</button>
          <button type="button" class="btn pink sm" data-quest="delete">${esc(t({ en: 'Delete my answers', bn: 'আমার উত্তর মুছে ফেলো' }))}</button>
        </div>
        <p class="dim quest-privacy">🔒 ${esc(t({ en: 'Sharing is your choice only. Nothing is uploaded anywhere.', bn: 'শেয়ার করা শুধু তোমার ইচ্ছা। কিছুই কোথাও আপলোড হয় না।' }))}</p>
      </div>`;
  }

  root.innerHTML = `
    <div class="quest-shell" data-phase="${esc(state.phase)}">
      <div class="quest-progress" role="progressbar"
        aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${answered}"
        aria-label="${esc(t({ en: 'Questions answered', bn: 'উত্তর দেওয়া প্রশ্ন' }))}">
        <div class="quest-progress-bar" style="width:${Math.round((answered / total) * 100)}%"></div>
      </div>
      ${body}
      <div class="quest-lang">
        <button type="button" class="btn ghost sm" data-quest="lang" data-lang="${state.lang === 'en' ? 'bn' : 'en'}">
          ${state.lang === 'en' ? 'বাংলা' : 'English'}
        </button>
      </div>
    </div>`;

  bind();
  const focusTarget = root.querySelector('.quest-prompt, .script, .quest-reveal-title');
  if (focusTarget) {
    focusTarget.setAttribute('tabindex', '-1');
    try { focusTarget.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
  }
}

/* ------------------------------------------------------------------ *
 *  Interaction
 * ------------------------------------------------------------------ */
function currentQuestion() {
  return QUESTIONS[state.index];
}

function setAnswer(qid, value) {
  state.answers[qid] = value;
  save();
}

function bind() {
  const root = state.root;
  root.querySelectorAll('[data-quest]').forEach((el) => {
    el.addEventListener('click', onAction);
  });

  root.querySelectorAll('.quest-choice').forEach((btn) => {
    btn.addEventListener('click', () => {
      const q = currentQuestion();
      const id = btn.getAttribute('data-choice');
      if (!q) return;
      if (q.type === 'multi') {
        const cur = Array.isArray(state.answers[q.id]) ? state.answers[q.id].slice() : [];
        const at = cur.indexOf(id);
        if (at >= 0) cur.splice(at, 1); else cur.push(id);
        setAnswer(q.id, cur);
        btn.classList.toggle('is-on', cur.includes(id));
        btn.setAttribute('aria-checked', String(cur.includes(id)));
      } else {
        setAnswer(q.id, id);
        root.querySelectorAll('.quest-choice').forEach((b) => {
          const on = b === btn;
          b.classList.toggle('is-on', on);
          b.setAttribute('aria-checked', String(on));
        });
        // single-choice advances automatically, but only if the user wants it.
        // Guard on question id so a manual Next click within the delay window
        // can never skip a question.
        if (state.opts.autoAdvance !== false) {
          const qid = q.id;
          setTimeout(() => {
            const cur = currentQuestion();
            if (state.phase === 'question' && cur && cur.id === qid) next();
          }, 260);
        }
      }
    });
  });

  const ta = root.querySelector('.quest-text');
  if (ta) {
    ta.addEventListener('input', () => {
      setAnswer(currentQuestion().id, ta.value);
    });
  }
}

function onAction(e) {
  const el = e.currentTarget;
  const action = el.getAttribute('data-quest');

  switch (action) {
    case 'start':
      state.index = 0;
      state.phase = 'question';
      break;
    case 'resume': {
      const firstUnanswered = QUESTIONS.findIndex((q) => state.answers[q.id] == null);
      state.index = firstUnanswered < 0 ? QUESTIONS.length - 1 : firstUnanswered;
      state.phase = 'question';
      break;
    }
    case 'next':
      next();
      return;
    case 'skip':
      setAnswer(currentQuestion().id, null);
      next();
      return;
    case 'back':
      state.index = Math.max(0, state.index - 1);
      break;
    case 'back-q':
      state.phase = 'question';
      state.index = Math.max(0, state.index);
      break;
    case 'edit':
      state.index = parseInt(el.getAttribute('data-index'), 10) || 0;
      state.phase = 'question';
      break;
    case 'review':
      state.phase = 'review';
      break;
    case 'reveal':
      state.phase = 'reveal';
      break;
    case 'restart':
      if (state.opts.confirmRestart) {
        if (!window.confirm(t({ en: 'Start over and clear your answers?', bn: 'আবার শুরু করে উত্তরগুলো মুছে ফেলবে?' }))) return;
      }
      state.answers = {};
      state.index = 0;
      state.phase = 'intro';
      wipeStorage();
      break;
    case 'delete':
      if (!window.confirm(t({
        en: 'Delete all your answers from this device? This cannot be undone.',
        bn: 'এই ডিভাইস থেকে তোমার সব উত্তর মুছে ফেলবে? এটা ফিরিয়ে আনা যাবে না।',
      }))) return;
      state.answers = {};
      state.index = 0;
      state.phase = 'intro';
      wipeStorage();
      break;
    case 'copy': {
      const r = buildReveal();
      const text = [r.title, '', ...r.lines, '', t({ en: 'With love, Your Bilal 💜', bn: 'ভালোবাসাসহ, তোমার বিলাল 💜' })].join('\n');
      const finishCopy = (success) => {
        el.textContent = success
          ? t({ en: 'Copied ✓', bn: 'কপি হয়েছে ✓' })
          : t({ en: 'Copy unavailable — please select the text manually.', bn: 'কপি করা যায়নি — অনুগ্রহ করে লেখাটি নিজে নির্বাচন করো।' });
        el.setAttribute('aria-live', 'polite');
        if (success) setTimeout(() => render(), 1400);
      };
      const legacyCopy = () => {
        const tmp = document.createElement('textarea');
        tmp.value = text;
        tmp.setAttribute('readonly', '');
        tmp.style.position = 'fixed';
        tmp.style.opacity = '0';
        document.body.appendChild(tmp);
        tmp.select();
        let copied = false;
        try { copied = document.execCommand('copy') === true; } catch (err) { copied = false; }
        document.body.removeChild(tmp);
        finishCopy(copied);
      };
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(text).then(
          () => finishCopy(true),
          () => legacyCopy()
        );
      } else {
        legacyCopy();
      }
      return;
    }
    case 'lang':
      state.lang = el.getAttribute('data-lang') === 'bn' ? 'bn' : 'en';
      save();
      broadcastLang();
      break;
    default:
      return;
  }
  render();
}

function next() {
  if (state.index >= QUESTIONS.length - 1) {
    state.phase = 'review';
  } else {
    state.index += 1;
    state.phase = 'question';
  }
  render();
}

/* ------------------------------------------------------------------ *
 *  Public API
 * ------------------------------------------------------------------ */
export function initQuest(rootEl, opts = {}) {
  try {
    if (!rootEl || typeof rootEl.querySelector !== 'function') {
      return { ok: false, reason: 'invalid root element' };
    }
    state.root = rootEl;
    state.opts = opts || {};
    if (opts.lang === 'bn' || opts.lang === 'en') state.lang = opts.lang;
    load();
    if (Object.keys(state.answers).length > 0) state.phase = 'intro';
    render();
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: (e && e.message) || 'quest failed to initialise' };
  }
}

export function setLanguage(lang) {
  state.lang = lang === 'bn' ? 'bn' : 'en';
  save();
  broadcastLang();
  render();
}

export function getAnswers() {
  return Object.assign({}, state.answers);
}

export function resetQuest() {
  state.answers = {};
  state.index = 0;
  state.phase = 'intro';
  wipeStorage();
  render();
}

export function deleteAllData() {
  state.answers = {};
  state.index = 0;
  state.phase = 'intro';
  wipeStorage();
  render();
}

export function destroy() {
  if (state.root) state.root.innerHTML = '';
  state.root = null;
}

export default {
  initQuest,
  setLanguage,
  getAnswers,
  resetQuest,
  deleteAllData,
  destroy,
};
