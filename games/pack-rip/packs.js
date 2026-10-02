// The packs in the store. Edit freely: price, which sets the cards come from, the value window, and the look.
//   sets:  set ids from data/cards.json, or a group name below
//   floor: the cheapest card that can come out, as a share of the price (0.3 = 30% of the price)
//   cap:   the most valuable card that can come out, as a multiple of the price (20 = 20x)
//   look:  pack colors: a = foil, b = dark facets, edge = crimp metal, glow = button and light
//   logo:  "ball" for the Poké Ball badge, or a set id to show that set's logo
// The priciest raw card in the data is about $2,300, so packs above ~$400 would have no Grail tier.
export const GROUPS = {
  mega: ["me55", "me5", "me4", "me3", "me2pt5", "me2", "me1"],
  sv: ["rsv10pt5", "zsv10pt5", "sv10", "sv9", "sv8pt5", "sv8", "sv7", "sv6pt5", "sv4pt5", "sv3pt5", "sv3", "sv2"],
  swsh: ["swsh12pt5", "swsh12pt5gg", "swsh12", "swsh12tg", "swsh11", "swsh11tg", "swsh9", "swsh9tg", "swsh7", "cel25", "cel25c", "swsh45sv"],
  sm: ["sm115", "sma", "sm12", "xy12"],
  wotc: ["base1", "base2", "base3", "base5", "gym1", "gym2", "neo1", "neo2", "neo3", "neo4"],
};
GROUPS.modern = [...GROUPS.mega, ...GROUPS.sv];
GROUPS.all = [...GROUPS.modern, ...GROUPS.swsh, ...GROUPS.sm, ...GROUPS.wotc];

export const PACKS = [
  { id: "starter",   name: "Starter Pack",   label: "POKÉMON STARTER PACK",  price: 1,    sets: "modern", floor: 0.01, cap: 20,  cat: "pokemon",
    look: { a: "#f26a1b", b: "#1c1c1f", edge: "#c75a1c", glow: "#f26a1b", style: "split" }, logo: "ball" },
  { id: "bronze",    name: "Bronze Pack",    label: "POKÉMON BRONZE PACK",   price: 10,   sets: "modern", floor: 0.2, cap: 20,   cat: "pokemon",
    look: { a: "#c9773f", b: "#3a2214", edge: "#9c5a2e", glow: "#d0814a", style: "facets" }, logo: "ball" },
  { id: "silver",    name: "Silver Pack",    label: "POKÉMON SILVER PACK",   price: 25,   sets: ["modern", "swsh"], floor: 0.25, cap: 20, cat: "pokemon",
    look: { a: "#c9d1d6", b: "#2a2f33", edge: "#9aa3a8", glow: "#b8c2c8", style: "facets" }, logo: "ball" },
  { id: "sapphire",  name: "Sapphire Pack",  label: "POKÉMON SAPPHIRE PACK", price: 50,   sets: ["modern", "swsh", "sm"], floor: 0.3, cap: 20, cat: "pokemon",
    look: { a: "#2f6bff", b: "#0d1a3d", edge: "#2a55c4", glow: "#3b7bff", style: "facets" }, logo: "ball" },
  { id: "gold",      name: "Gold Pack",      label: "POKÉMON GOLD PACK",     price: 100,  sets: "all", floor: 0.3, cap: 20,      cat: "pokemon",
    look: { a: "#e8a63a", b: "#3a2608", edge: "#d48a2a", glow: "#e8a63a", style: "facets" }, logo: "ball" },
  { id: "platinum",  name: "Platinum Pack",  label: "POKÉMON PLATINUM PACK", price: 250,  sets: "all", floor: 0.3, cap: 20,      cat: "pokemon",
    look: { a: "#e9eef2", b: "#20262b", edge: "#c3ccd2", glow: "#dfe7ec", style: "facets" }, logo: "ball" },

  { id: "s151",      name: "151 Pack",       label: "SCARLET & VIOLET 151",  price: 5,    sets: ["sv3pt5"], floor: 0.02, cap: 60,   cat: "sets",
    look: { a: "#e8443a", b: "#1b1b1f", edge: "#b8322b", glow: "#ef4b42", style: "split" }, logo: "sv3pt5" },
  { id: "prismatic", name: "Prismatic Pack", label: "PRISMATIC EVOLUTIONS",  price: 25,   sets: ["sv8pt5"], floor: 0.1, cap: 60,    cat: "sets",
    look: { a: "#d86bff", b: "#1d1030", edge: "#a54ad6", glow: "#d86bff", style: "prism" }, logo: "sv8pt5" },
  { id: "skies",     name: "Evolving Skies", label: "EVOLVING SKIES",        price: 25,   sets: ["swsh7"], floor: 0.1, cap: 60,     cat: "sets",
    look: { a: "#2fb5c9", b: "#0b2228", edge: "#1f8a99", glow: "#3cc6da", style: "facets" }, logo: "swsh7" },
  { id: "vintage",   name: "Vintage Pack",   label: "WOTC VINTAGE PACK",     price: 50,   sets: "wotc", floor: 0.2, cap: 30,     cat: "vintage",
    look: { a: "#f2c94c", b: "#25313b", edge: "#2d6cb5", glow: "#f2c94c", style: "classic" }, logo: "base1" },
  { id: "vintage-hi", name: "Vintage Gold",  label: "WOTC HOLO PACK",        price: 250,  sets: "wotc", floor: 0.3, cap: 20,     cat: "vintage",
    look: { a: "#ffd66b", b: "#2a1a05", edge: "#c99a2e", glow: "#ffcc4d", style: "facets" }, logo: "base1" },
];

export const CATEGORIES = [
  { id: "pokemon", name: "Pokémon" },
  { id: "sets", name: "Set Packs" },
  { id: "vintage", name: "Vintage" },
];
