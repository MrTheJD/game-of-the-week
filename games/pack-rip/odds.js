// The odds math. Like the real app, every pack shows six tiers by card value, from Common to Grail,
// with a chance for each. Here the chances are worked out from the actual cards in the pack, so that the
// average pull is worth what the "return" setting says (1.00 = on average you get back what you pay).
import { GROUPS } from "./packs.js";

export const TIERS = [
  { id: "common",    name: "Common",    color: "#9aa6ab", lo: 0,    hi: 0.4 },
  { id: "uncommon",  name: "Uncommon",  color: "#36c46f", lo: 0.4,  hi: 0.8 },
  { id: "rare",      name: "Rare",      color: "#3b8bff", lo: 0.8,  hi: 1.25 },
  { id: "epic",      name: "Epic",      color: "#a35bff", lo: 1.25, hi: 2 },
  { id: "legendary", name: "Legendary", color: "#ff9f1a", lo: 2,    hi: 5 },
  { id: "grail",     name: "Grail",     color: "#ff3d6e", lo: 5,    hi: Infinity },
];

// Odds styles. "Adjust Odds" in the app: same average, different swinginess.
export const MODES = {
  safe:   { name: "Safe",   blurb: "Fewer duds, fewer grails. Steadier balance.", base: [14, 36, 32, 10, 6, 2] },
  normal: { name: "Normal", blurb: "The classic mix.",                             base: [28, 31, 20, 9, 8, 4] },
  risky:  { name: "Risky",  blurb: "More duds, but grails hit twice as often.",    base: [44, 22, 11, 7, 8, 8] },
};

export function setIds(sets) {
  const list = Array.isArray(sets) ? sets : [sets];
  return [...new Set(list.flatMap(s => GROUPS[s] || [s]))];
}

// Build a pack's pool: cards in its value window, split into tiers, with odds that hit the target return.
export function buildPool(pack, data, mode = "normal", rtp = 1) {
  const P = pack.price, ids = new Set(setIds(pack.sets));
  const lo = P * pack.floor, hi = P * pack.cap;
  const cards = data.cards.filter(c => ids.has(c.set) && c.price >= lo && c.price <= hi && c.price >= 0.01);
  const tiers = TIERS.map(t => ({ ...t, cards: [], min: Infinity, max: 0 }));
  for (const c of cards) {
    const r = c.price / P;
    const t = tiers.find(t => r >= t.lo && r < t.hi) || tiers[0];
    t.cards.push(c); t.min = Math.min(t.min, c.price); t.max = Math.max(t.max, c.price);
  }
  // Inside a tier, pricier cards are rarer: each card's weight is 1 / price. A tier's average is then n / sum(1/price).
  for (const t of tiers) {
    t.inv = t.cards.reduce((s, c) => s + 1 / c.price, 0);
    t.mean = t.cards.length ? t.cards.length / t.inv : 0;
  }
  // Tilt the base chances toward the top (t > 0) or bottom (t < 0) until the average pull = rtp x price.
  const base = MODES[mode].base;
  const probs = k => {
    const w = tiers.map((t, i) => t.cards.length ? base[i] * Math.exp(k * i) : 0);
    const sum = w.reduce((a, b) => a + b, 0);
    return w.map(x => x / sum);
  };
  const ev = k => probs(k).reduce((s, p, i) => s + p * tiers[i].mean, 0);
  let a = -4, b = 4;
  for (let i = 0; i < 60; i++) { const m = (a + b) / 2; if (ev(m) < rtp * P) a = m; else b = m; }
  const p = probs((a + b) / 2);
  tiers.forEach((t, i) => { t.p = p[i]; });
  const all = cards.slice().sort((x, y) => y.price - x.price);
  return {
    pack, mode, tiers, count: cards.length,
    min: all.length ? all[all.length - 1].price : 0,
    max: all.length ? all[0].price : 0,
    ev: tiers.reduce((s, t) => s + t.p * t.mean, 0),
    top: all.slice(0, 24),
  };
}

function rand() { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 2 ** 32; }

export function pull(pool) {
  let r = rand(), tier = pool.tiers[pool.tiers.length - 1];
  for (const t of pool.tiers) { if (!t.cards.length) continue; if (r < t.p) { tier = t; break; } r -= t.p; }
  if (!tier.cards.length) tier = pool.tiers.find(t => t.cards.length);
  if (!tier) return null;   // empty pack (its sets aren't in the data); the game hides those
  let x = rand() * tier.inv;
  for (const c of tier.cards) { x -= 1 / c.price; if (x <= 0) return { card: c, tier }; }
  return { card: tier.cards[tier.cards.length - 1], tier };
}

export function tierOf(price, packPrice) {
  const r = price / packPrice;
  return TIERS.find(t => r >= t.lo && r < t.hi) || TIERS[0];
}
