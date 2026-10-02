// Builds games/pack-rip/data/cards.json: a snapshot of every Pokémon card the free Pokémon TCG API (pokemontcg.io)
// has a TCGplayer market price for, from every set. The game reads only this file, so it works offline and never
// waits on the API. Run it again any time to refresh prices (it takes a while; the API is slow and flaky):
//   node tools/build-pack-rip-data.mjs          (optional: PTCG_KEY=your-key for higher rate limits)
import { writeFile } from "node:fs/promises";
import { getJSON } from "./get.mjs";

const API = "https://api.pokemontcg.io/v2";
const OUT = new URL("../games/pack-rip/data/cards.json", import.meta.url);
const PAGE = 250;

// Which printing's price counts as "the" price of a card, best first.
const VARIANTS = ["holofoil", "normal", "1stEditionHolofoil", "1stEdition", "unlimitedHolofoil", "unlimited", "reverseHolofoil"];
function pickPrice(tcg) {
  const p = tcg && tcg.prices;
  if (!p) return null;
  for (const v of VARIANTS) if (p[v] && p[v].market > 0) return { v, price: p[v].market };
  for (const [v, x] of Object.entries(p)) if (x && x.market > 0) return { v, price: x.market };
  return null;
}

const sets = (await getJSON(`${API}/sets?pageSize=500&select=id,name,series,releaseDate,images,total`)).data;
console.log(`${sets.length} sets`);

const rows = [];
async function page(n) {
  const r = await getJSON(`${API}/cards?page=${n}&pageSize=${PAGE}&orderBy=id&select=id,name,rarity,images,tcgplayer`);
  for (const c of r.data) {
    const pp = pickPrice(c.tcgplayer);
    if (!pp || !c.images) continue;
    // Compact row: [id, name, rarity, price, image path ("sv3pt5/199"), printing]
    const img = c.images.small.replace("https://images.pokemontcg.io/", "").replace(/\.png$/, "");
    rows.push([c.id, c.name, c.rarity || "", Math.round(pp.price * 100) / 100, img, pp.v]);
  }
  return r.totalCount;
}
const total = await page(1);
const pages = Math.ceil(total / PAGE), failed = [];
console.log(`${total} cards, ${pages} pages`);
for (let n = 2; n <= pages; n++) {
  try { await page(n); console.log(`page ${n}/${pages}: ${rows.length} priced so far`); }
  catch (e) { failed.push(n); console.log(`page ${n} FAILED (${e.message}), will retry at the end`); }
}
for (const n of failed) { try { await page(n); console.log(`page ${n} ok on retry`); } catch (e) { console.log(`page ${n} still failing, skipped`); } }

const seen = new Set(), cards = rows.filter(r => !seen.has(r[0]) && seen.add(r[0]));
const setIdOf = id => id.slice(0, id.indexOf("-"));
const have = new Set(cards.map(c => setIdOf(c[0])));
const out = { updated: new Date().toISOString().slice(0, 10), sets: {}, cards };
for (const s of sets) if (have.has(s.id)) out.sets[s.id] = { name: s.name, series: s.series, date: s.releaseDate, logo: s.images.logo, symbol: s.images.symbol };
await writeFile(OUT, JSON.stringify(out));
console.log(`\n${cards.length} cards from ${Object.keys(out.sets).length} sets -> ${OUT.pathname}`);
