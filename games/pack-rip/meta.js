// Progression: levels and XP, the guaranteed-hit meter, daily quests, achievements, the lucky spin,
// the rotating "hot" pack, and the simulated feed of other rippers' pulls. All functions take the save (S).
import { rand } from "./odds.js";

// ---------- levels ----------
export const xpNeed = (lv) => Math.round(60 * Math.pow(lv, 1.45));          // XP from level lv to lv+1
export const xpForPack = (price) => Math.round(10 + price * 2);
export const RANKS = [
  { name: "Bronze", at: 1, rate: 0.01, color: "#c9773f" }, { name: "Silver", at: 5, rate: 0.02, color: "#c9d1d6" },
  { name: "Gold", at: 12, rate: 0.03, color: "#e8b64c" }, { name: "Platinum", at: 25, rate: 0.04, color: "#dfe7ec" },
  { name: "Diamond", at: 45, rate: 0.05, color: "#7fd8ff" }, { name: "Master", at: 75, rate: 0.06, color: "#ff3d6e" },
];
export const rank = (S) => { let r = RANKS[0]; for (const x of RANKS) if (S.lv >= x.at) r = x; return r; };
// Add XP; returns the list of levels reached (for the level-up screen).
export function addXP(S, xp) {
  S.xp += xp; const ups = [];
  while (S.xp >= xpNeed(S.lv)) { S.xp -= xpNeed(S.lv); S.lv++; ups.push(S.lv); }
  return ups;
}
// What a level-up gives: cash, and a free pack ticket every 5 levels.
export function levelReward(lv, packs) {
  const cash = 5 + lv * 3;
  let ticket = null;
  if (lv % 5 === 0) {
    const cap = Math.min(250, lv * 8);
    ticket = packs.filter(p => p.price <= cap).sort((a, b) => b.price - a.price)[0] || null;
  }
  return { cash, ticket };
}

// ---------- guaranteed hit ----------
export const PITY = 25;          // packs in a row without an Epic or better, then the next one is guaranteed Epic+
export const PITY_TIER = 3;      // Epic

// ---------- daily quests ----------
function seeded(seed) { let s = 0; for (const ch of seed) s = (s * 31 + ch.charCodeAt(0)) >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
const QUESTS = [
  { k: "rip",   make: (r) => { const n = [5, 10, 20][Math.floor(r() * 3)]; return { n, text: `Rip ${n} packs`, reward: n * 1.5 }; } },
  { k: "spend", make: (r) => { const n = [25, 100, 300][Math.floor(r() * 3)]; return { n, text: `Spend $${n} on packs`, reward: Math.round(n * 0.12) + 3 }; } },
  { k: "tier",  make: (r) => { const t = [2, 3, 4][Math.floor(r() * 3)]; return { n: 1, t, text: `Pull a ${["", "", "Rare", "Epic", "Legendary"][t]} or better`, reward: [0, 0, 5, 12, 30][t] }; } },
  { k: "sell",  make: (r) => { const n = [20, 60, 150][Math.floor(r() * 3)]; return { n, text: `Sell $${n} of cards`, reward: Math.round(n * 0.1) + 2 }; } },
  { k: "keep",  make: (r) => { const n = [3, 6, 12][Math.floor(r() * 3)]; return { n, text: `Keep ${n} cards`, reward: n + 3 }; } },
  { k: "multi", make: () => ({ n: 1, text: "Rip a 10-pack bundle", reward: 15 }) },
  { k: "new",   make: (r) => { const n = [3, 8, 15][Math.floor(r() * 3)]; return { n, text: `Add ${n} new cards to your binders`, reward: n * 1.2 + 2 }; } },
];
export function questsFor(S, day) {
  if (S.quests && S.quests.day === day) return S.quests.list;
  const r = seeded(day), pool = QUESTS.slice(), list = [];
  while (list.length < 3) { const q = pool.splice(Math.floor(r() * pool.length), 1)[0]; list.push({ k: q.k, ...q.make(r), prog: 0, claimed: false }); }
  list.forEach(q => { q.reward = Math.round(q.reward); });
  S.quests = { day, list };
  return list;
}
// Count progress. ev: { k: "rip"|"spend"|..., n: amount, t: tier index }
export function questProgress(S, day, ev) {
  const list = questsFor(S, day); let done = [];
  for (const q of list) {
    if (q.k !== ev.k || q.prog >= q.n) continue;
    if (q.k === "tier") { if (ev.t >= q.t) q.prog = 1; }
    else q.prog = Math.min(q.n, q.prog + (ev.n || 1));
    if (q.prog >= q.n) done.push(q);
  }
  return done;
}

// ---------- achievements ----------
// Each: id, name, what, goal, stat (a key of S.st), reward
const A = (id, name, what, stat, goal, reward) => ({ id, name, what, stat, goal, reward });
export const ACHIEVEMENTS = [
  A("p1", "First Rip", "Open your first pack", "packs", 1, 5),
  A("p25", "Getting Into It", "Open 25 packs", "packs", 25, 15),
  A("p100", "Ripper", "Open 100 packs", "packs", 100, 40),
  A("p500", "Pack Addict", "Open 500 packs", "packs", 500, 150),
  A("p2500", "Can't Stop", "Open 2,500 packs", "packs", 2500, 600),
  A("e1", "Purple Haze", "Pull an Epic", "epics", 1, 10),
  A("l1", "Legend", "Pull a Legendary", "legends", 1, 25),
  A("l10", "Legend Hunter", "Pull 10 Legendaries", "legends", 10, 100),
  A("g1", "GRAIL!", "Pull a Grail", "grails", 1, 75),
  A("g10", "Grail Collector", "Pull 10 Grails", "grails", 10, 400),
  A("b100", "Big Hit", "Pull a card worth $100+", "best", 100, 20),
  A("b500", "Monster Hit", "Pull a card worth $500+", "best", 500, 100),
  A("b1k", "Four Figures", "Pull a card worth $1,000+", "best", 1000, 250),
  A("u50", "Binder Starter", "Own 50 different cards", "unique", 50, 15),
  A("u250", "Binder Builder", "Own 250 different cards", "unique", 250, 60),
  A("u1k", "Card Hoarder", "Own 1,000 different cards", "unique", 1000, 250),
  A("u5k", "The Collector", "Own 5,000 different cards", "unique", 5000, 1000),
  A("s1", "Set Complete", "Finish a whole set", "sets", 1, 100),
  A("s5", "Master Binder", "Finish 5 sets", "sets", 5, 500),
  A("m10", "Bundle Up", "Rip 10 bundles of 10", "bundles", 10, 50),
  A("sp", "Spender", "Spend $1,000 on packs", "spent", 1000, 50),
  A("sp10", "High Roller", "Spend $10,000 on packs", "spent", 10000, 400),
  A("lv10", "Level 10", "Reach level 10", "lv", 10, 50),
  A("lv25", "Level 25", "Reach level 25", "lv", 25, 200),
];

// ---------- lucky spin ----------
export const WHEEL = [
  { label: "$2", cash: 2, w: 22, c: "#2a3a40" }, { label: "$5", cash: 5, w: 20, c: "#1d6b45" },
  { label: "$10", cash: 10, w: 15, c: "#2a3a40" }, { label: "PACK", pack: "silver", w: 10, c: "#7a8a92" },
  { label: "$25", cash: 25, w: 10, c: "#3b5bdb" }, { label: "2× XP", xp2: true, w: 10, c: "#6a3ad1" },
  { label: "$50", cash: 50, w: 6, c: "#c47a1a" }, { label: "GOLD", pack: "gold", w: 4, c: "#e8a63a" },
  { label: "$100", cash: 100, w: 2.5, c: "#d4342e" }, { label: "PLAT", pack: "platinum", w: 0.5, c: "#e9eef2" },
];
export function spinResult() {
  const tot = WHEEL.reduce((s, x) => s + x.w, 0); let r = rand() * tot;
  for (let i = 0; i < WHEEL.length; i++) { if (r < WHEEL[i].w) return i; r -= WHEEL[i].w; }
  return 0;
}

// ---------- hot pack ----------
export const HOT_HOURS = 3, HOT_BOOST = 0.1;
export function hotPack(packs) {
  const slot = Math.floor(Date.now() / (HOT_HOURS * 3600e3)), list = packs.filter(p => p.price >= 5);
  return { pack: list[(slot * 7 + 3) % list.length], ends: (slot + 1) * HOT_HOURS * 3600e3 };
}

// ---------- the feed of other rippers ----------
const NAMES = ["ash_k", "mistyRips", "brock99", "zardKing", "pullz4days", "eevee_ella", "rocketjess", "gary0ak", "holo_hank", "slabsnatcher",
  "packgoblin", "mewtwo_mo", "lugiaLuv", "ripcity", "shinyhuntr", "nidoqueen", "cardsharkk", "binderbro", "gengarGal", "pika_pete",
  "grailseeker", "fatpack_fran", "sleevedsam", "pokedad", "toploader_t", "illustrator", "vstarvic", "sir_hits", "hypeRip", "luckyLarry"];
export function fakePull(packs, poolFor, pullFn) {
  const pk = packs[Math.floor(rand() * packs.length)], pool = poolFor(pk);
  const r = pullFn(pool, rand() < 0.15 ? 5 : 3);
  if (!r) return null;
  return { who: NAMES[Math.floor(rand() * NAMES.length)], card: r.card, tier: r.tier, pack: pk };
}
