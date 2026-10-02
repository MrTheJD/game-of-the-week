// The odds math. Like the real app, every pack shows six tiers by card value, from Common to Grail, with a
// chance for each. The chances are worked out from the actual cards in the pack, so that the average pull is
// worth what the "return" setting says (1.00 = on average you get back what you pay).
export const TIERS = [
  { id: "common",    name: "Common",    color: "#9aa6ab", lo: 0,    hi: 0.4 },
  { id: "uncommon",  name: "Uncommon",  color: "#36c46f", lo: 0.4,  hi: 0.8 },
  { id: "rare",      name: "Rare",      color: "#3b8bff", lo: 0.8,  hi: 1.25 },
  { id: "epic",      name: "Epic",      color: "#a35bff", lo: 1.25, hi: 2 },
  { id: "legendary", name: "Legendary", color: "#ff9f1a", lo: 2,    hi: 5 },
  { id: "grail",     name: "Grail",     color: "#ff3d6e", lo: 5,    hi: Infinity },
];

// "Adjust Odds": same average, different swinginess.
export const MODES = {
  safe:   { name: "Safe",   blurb: "Fewer duds, fewer grails. Steadier balance.", base: [14, 36, 32, 10, 6, 2] },
  normal: { name: "Normal", blurb: "The classic mix.",                             base: [28, 31, 20, 9, 8, 4] },
  risky:  { name: "Risky",  blurb: "More duds, but grails hit twice as often.",    base: [44, 22, 11, 7, 8, 8] },
};

// "all", "series:XY", or set ids -> set ids present in the data
export function setIds(sets, data) {
  const list = Array.isArray(sets) ? sets : [sets], all = Object.keys(data.sets), out = new Set();
  for (const s of list) {
    if (s === "all") all.forEach(id => out.add(id));
    else if (s.startsWith("series:")) { const name = s.slice(7); all.filter(id => data.sets[id].series === name).forEach(id => out.add(id)); }
    else if (data.sets[s]) out.add(s);
  }
  return [...out];
}

// Build a pack's pool: cards in its value window, split into tiers, with odds that hit the target return.
export function buildPool(pack, data, mode = "normal", rtp = 1) {
  const P = pack.price, ids = new Set(setIds(pack.sets, data));
  const lo = P * pack.floor, hi = P * pack.cap, re = pack.match ? new RegExp(pack.match, "i") : null;
  const cards = data.cards.filter(c => ids.has(c.set) && c.price >= lo && c.price <= hi && c.price >= 0.01 && (!re || re.test(c.name)));
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
  // Tilt the base chances toward the top (k > 0) or bottom (k < 0) until the average pull = rtp x price.
  const base = MODES[mode].base;
  const probs = k => {
    const w = tiers.map((t, i) => t.cards.length ? base[i] * Math.exp(k * i) : 0);
    const sum = w.reduce((a, b) => a + b, 0) || 1;
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

export function rand() { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 2 ** 32; }

// One pull. minTier (0-5) forces at least that tier when the pack has one (the guaranteed-hit meter).
export function pull(pool, minTier = 0) {
  const ok = pool.tiers.map((t, i) => t.cards.length && i >= minTier);
  if (!ok.some(Boolean)) return pull(pool, 0);
  const total = pool.tiers.reduce((s, t, i) => s + (ok[i] ? t.p : 0), 0);
  let r = rand() * total, tier = null;
  for (let i = 0; i < pool.tiers.length; i++) { if (!ok[i]) continue; tier = pool.tiers[i]; if (r < tier.p) break; r -= tier.p; }
  if (!tier) return null;
  let x = rand() * tier.inv;
  for (const c of tier.cards) { x -= 1 / c.price; if (x <= 0) return { card: c, tier }; }
  return { card: tier.cards[tier.cards.length - 1], tier };
}
