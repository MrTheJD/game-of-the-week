// Builds games/pack-rip/data/cards.json: a snapshot of card names, images and TCGplayer market prices
// from the free Pokémon TCG API (pokemontcg.io). The game reads only this file, so it works offline and
// never waits on the API. Run it again any time to refresh prices:
//   node tools/build-pack-rip-data.mjs          (optional: PTCG_KEY=your-key for higher rate limits)
//   ONLY=sv8pt5,sv2 node tools/build-pack-rip-data.mjs    re-fetches just those sets and keeps the rest
import { readFile, writeFile } from "node:fs/promises";
import { getJSON } from "./get.mjs";

const API = "https://api.pokemontcg.io/v2";
const OUT = new URL("../games/pack-rip/data/cards.json", import.meta.url);

// The sets the game knows about. Packs in games/pack-rip/packs.js pick from these.
export const SETS = [
  // Mega Evolution
  "me55", "me5", "me4", "me3", "me2pt5", "me2", "me1",
  // Scarlet & Violet
  "rsv10pt5", "zsv10pt5", "sv10", "sv9", "sv8pt5", "sv8", "sv7", "sv6pt5", "sv4pt5", "sv3pt5", "sv3", "sv2",
  // Sword & Shield
  "swsh12pt5", "swsh12pt5gg", "swsh12", "swsh12tg", "swsh11", "swsh11tg", "swsh9", "swsh9tg", "swsh7", "cel25", "cel25c", "swsh45sv",
  // Sun & Moon, XY
  "sm115", "sma", "sm12", "xy12",
  // Wizards of the Coast era
  "base1", "base2", "base3", "base5", "gym1", "gym2", "neo1", "neo2", "neo3", "neo4",
];

// Which printing's price counts as "the" price of a card, best first.
const VARIANTS = ["holofoil", "normal", "1stEditionHolofoil", "1stEdition", "unlimitedHolofoil", "unlimited", "reverseHolofoil"];

function pickPrice(tcg) {
  const p = tcg && tcg.prices;
  if (!p) return null;
  for (const v of VARIANTS) if (p[v] && p[v].market > 0) return { v, price: p[v].market };
  for (const [v, x] of Object.entries(p)) if (x && x.market > 0) return { v, price: x.market };
  return null;
}

// If a set fails to download (the API is flaky), keep that set's cards from the last snapshot.
let prev = null;
try { prev = JSON.parse(await readFile(OUT, "utf8")); } catch { /* first run */ }

const out = { updated: new Date().toISOString().slice(0, 10), sets: {}, cards: [] };
const ONLY = process.env.ONLY ? process.env.ONLY.split(",") : null;
for (const id of SETS) {
  if (ONLY && !ONLY.includes(id)) {
    if (prev && prev.sets[id]) { out.sets[id] = prev.sets[id]; out.cards.push(...prev.cards.filter(c => c[0].startsWith(id + "-"))); }
    continue;
  }
  try {
    const s = (await getJSON(`${API}/sets/${id}`)).data;
    const rows = [];
    let page = 1, got = 0;
    for (;;) {
      const r = await getJSON(`${API}/cards?q=set.id:${id}&page=${page}&pageSize=250&select=id,name,number,rarity,supertype,images,tcgplayer`);
      for (const c of r.data) {
        got++;
        const pp = pickPrice(c.tcgplayer);
        if (!pp || !c.images) continue;
        // Compact row: [id, name, rarity, price, image path ("sv3pt5/199"), printing]
        const img = c.images.small.replace("https://images.pokemontcg.io/", "").replace(/\.png$/, "");
        rows.push([c.id, c.name, c.rarity || "", Math.round(pp.price * 100) / 100, img, pp.v]);
      }
      if (page * r.pageSize >= r.totalCount) break;
      page++;
    }
    console.log(`${id.padEnd(12)} ${s.name.padEnd(36)} ${rows.length}/${got} cards with prices`);
    if (!rows.length) continue;   // brand-new sets have no prices yet
    out.sets[id] = { name: s.name, series: s.series, date: s.releaseDate, logo: s.images.logo, symbol: s.images.symbol };
    out.cards.push(...rows);
  } catch (e) {
    const old = prev && prev.sets[id];
    console.log(`${id.padEnd(12)} FAILED (${e.message})${old ? ", kept last snapshot" : ""}`);
    if (old) { out.sets[id] = old; out.cards.push(...prev.cards.filter(c => c[0].startsWith(id + "-"))); }
  }
}
await writeFile(OUT, JSON.stringify(out));
console.log(`\n${out.cards.length} cards from ${Object.keys(out.sets).length} sets -> ${OUT.pathname}`);
