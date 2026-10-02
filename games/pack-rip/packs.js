// The packs in the store. Edit freely: price, which cards, the value window, and the look.
//   sets:  "all", "series:<Series name>" (every set in that era), or set ids like "sv3pt5"
//   match: optional name filter (a regular expression), for theme packs like "Charizard"
//   floor: the cheapest card that can come out, as a share of the price (0.3 = 30% of the price)
//   cap:   the most valuable card that can come out, as a multiple of the price (20 = 20x)
//   look:  a = foil color, b = dark base, edge = crimp metal, glow = button and light, style = facets | split | prism | classic
//   logo:  "ball" for the Poké Ball badge, or a set id to show that set's logo
// The priciest raw card in the data is a few thousand dollars, so packs above ~$400 would have no Grail tier.
const L = (a, b, edge, glow, style = "facets") => ({ a, b, edge, glow, style });

export const PACKS = [
  // ---- general packs, every set ----
  { id: "starter",   cat: "pokemon", name: "Starter Pack",  label: "POKÉMON STARTER PACK",  price: 1,   sets: "all", floor: 0.01, cap: 20, look: L("#f26a1b", "#1c1c1f", "#c75a1c", "#f26a1b", "split"), logo: "ball" },
  { id: "bronze",    cat: "pokemon", name: "Bronze Pack",   label: "POKÉMON BRONZE PACK",   price: 10,  sets: "all", floor: 0.2,  cap: 20, look: L("#c9773f", "#3a2214", "#9c5a2e", "#d0814a"), logo: "ball" },
  { id: "silver",    cat: "pokemon", name: "Silver Pack",   label: "POKÉMON SILVER PACK",   price: 25,  sets: "all", floor: 0.25, cap: 20, look: L("#c9d1d6", "#2a2f33", "#9aa3a8", "#b8c2c8"), logo: "ball" },
  { id: "sapphire",  cat: "pokemon", name: "Sapphire Pack", label: "POKÉMON SAPPHIRE PACK", price: 50,  sets: "all", floor: 0.3,  cap: 20, look: L("#2f6bff", "#0d1a3d", "#2a55c4", "#3b7bff"), logo: "ball" },
  { id: "gold",      cat: "pokemon", name: "Gold Pack",     label: "POKÉMON GOLD PACK",     price: 100, sets: "all", floor: 0.3,  cap: 20, look: L("#e8a63a", "#3a2608", "#d48a2a", "#e8a63a"), logo: "ball" },
  { id: "emerald",   cat: "pokemon", name: "Emerald Pack",  label: "POKÉMON EMERALD PACK",  price: 175, sets: "all", floor: 0.3,  cap: 20, look: L("#2fd38a", "#062a1c", "#1f9e66", "#34e39a"), logo: "ball" },
  { id: "platinum",  cat: "pokemon", name: "Platinum Pack", label: "POKÉMON PLATINUM PACK", price: 250, sets: "all", floor: 0.3,  cap: 20, look: L("#e9eef2", "#20262b", "#c3ccd2", "#dfe7ec"), logo: "ball" },

  // ---- eras ----
  { id: "e-wotc",  cat: "eras", name: "WOTC Vintage",     label: "WOTC VINTAGE PACK",   price: 50, sets: ["series:Base", "series:Gym", "series:Neo", "series:E-Card"], floor: 0.2, cap: 30, look: L("#f2c94c", "#25313b", "#2d6cb5", "#f2c94c", "classic"), logo: "base1" },
  { id: "e-ex",    cat: "eras", name: "EX Era",           label: "EX ERA PACK",         price: 25, sets: ["series:EX"], floor: 0.15, cap: 40,  look: L("#ff5a5a", "#2a0d0d", "#c43a3a", "#ff5a5a"), logo: "ex12" },
  { id: "e-dp",    cat: "eras", name: "Diamond & Pearl",  label: "DIAMOND & PEARL PACK", price: 25, sets: ["series:Diamond & Pearl", "series:Platinum"], floor: 0.15, cap: 40, look: L("#7fb2ff", "#0e1a33", "#5a86d6", "#8ab9ff"), logo: "dp1" },
  { id: "e-hgss",  cat: "eras", name: "HeartGold SoulSilver", label: "HGSS ERA PACK",   price: 25, sets: ["series:HeartGold & SoulSilver"], floor: 0.15, cap: 40, look: L("#ffd166", "#2a2208", "#c9a03a", "#ffd166"), logo: "hgss1" },
  { id: "e-bw",    cat: "eras", name: "Black & White",    label: "BLACK & WHITE PACK",  price: 25, sets: ["series:Black & White"], floor: 0.15, cap: 40, look: L("#e6e6e6", "#111111", "#8a8a8a", "#d0d0d0", "split"), logo: "bw1" },
  { id: "e-xy",    cat: "eras", name: "XY Era",           label: "XY ERA PACK",         price: 25, sets: ["series:XY"], floor: 0.15, cap: 40,  look: L("#3fa9f5", "#0a1d2e", "#2a7fc0", "#4ab3ff"), logo: "xy1" },
  { id: "e-sm",    cat: "eras", name: "Sun & Moon",       label: "SUN & MOON PACK",     price: 25, sets: ["series:Sun & Moon"], floor: 0.15, cap: 40, look: L("#ff9f43", "#2a1505", "#d07a28", "#ffab55"), logo: "sm1" },
  { id: "e-swsh",  cat: "eras", name: "Sword & Shield",   label: "SWORD & SHIELD PACK", price: 25, sets: ["series:Sword & Shield"], floor: 0.15, cap: 40, look: L("#5ad1ff", "#0a1f2a", "#3a9cc4", "#5ad1ff"), logo: "swsh1" },
  { id: "e-sv",    cat: "eras", name: "Scarlet & Violet", label: "SCARLET & VIOLET PACK", price: 25, sets: ["series:Scarlet & Violet"], floor: 0.15, cap: 40, look: L("#c45aff", "#1f0a2a", "#8f3ac4", "#d06bff"), logo: "sv1" },
  { id: "e-mega",  cat: "eras", name: "Mega Evolution",   label: "MEGA EVOLUTION PACK", price: 25, sets: ["series:Mega Evolution"], floor: 0.15, cap: 40, look: L("#ff4fa3", "#2a0a1a", "#c43a7d", "#ff5fae", "prism"), logo: "me1" },

  // ---- single sets ----
  { id: "s151",      cat: "sets", name: "151 Pack",         label: "SCARLET & VIOLET 151", price: 5,   sets: ["sv3pt5"], floor: 0.02, cap: 60, look: L("#e8443a", "#1b1b1f", "#b8322b", "#ef4b42", "split"), logo: "sv3pt5" },
  { id: "prismatic", cat: "sets", name: "Prismatic Pack",   label: "PRISMATIC EVOLUTIONS", price: 25,  sets: ["sv8pt5"], floor: 0.1, cap: 60,  look: L("#d86bff", "#1d1030", "#a54ad6", "#d86bff", "prism"), logo: "sv8pt5" },
  { id: "skies",     cat: "sets", name: "Evolving Skies",   label: "EVOLVING SKIES",       price: 25,  sets: ["swsh7"], floor: 0.1, cap: 60,   look: L("#2fb5c9", "#0b2228", "#1f8a99", "#3cc6da"), logo: "swsh7" },
  { id: "fates",     cat: "sets", name: "Hidden Fates",     label: "HIDDEN FATES",         price: 10,  sets: ["sm115", "sma"], floor: 0.05, cap: 60, look: L("#9a5bff", "#120a24", "#6a3ad1", "#a46bff"), logo: "sm115" },
  { id: "paldean",   cat: "sets", name: "Paldean Fates",    label: "PALDEAN FATES",        price: 10,  sets: ["sv4pt5"], floor: 0.05, cap: 60, look: L("#ffcf4a", "#251a05", "#c99a2e", "#ffcf4a"), logo: "sv4pt5" },
  { id: "zenith",    cat: "sets", name: "Crown Zenith",     label: "CROWN ZENITH",         price: 10,  sets: ["swsh12pt5", "swsh12pt5gg"], floor: 0.05, cap: 60, look: L("#ffd84a", "#0d1a33", "#c9a42e", "#ffd84a"), logo: "swsh12pt5" },
  { id: "celebr",    cat: "sets", name: "Celebrations",     label: "25TH CELEBRATIONS",    price: 10,  sets: ["cel25", "cel25c"], floor: 0.05, cap: 60, look: L("#ffcc33", "#2a0a0a", "#d4342e", "#ffcc33"), logo: "cel25" },
  { id: "rivals",    cat: "sets", name: "Destined Rivals",  label: "DESTINED RIVALS",      price: 10,  sets: ["sv10"], floor: 0.05, cap: 60,   look: L("#ff3b3b", "#1a0505", "#b02525", "#ff4a4a"), logo: "sv10" },
  { id: "base",      cat: "sets", name: "Base Set",         label: "BASE SET 1999",        price: 50,  sets: ["base1"], floor: 0.05, cap: 40,  look: L("#ffde59", "#1f3d7a", "#2d6cb5", "#ffde59", "classic"), logo: "base1" },
  { id: "rocket",    cat: "sets", name: "Team Rocket",      label: "TEAM ROCKET",          price: 25,  sets: ["base5"], floor: 0.05, cap: 40,  look: L("#e83a3a", "#0d0d0d", "#8a1f1f", "#ff4444", "split"), logo: "base5" },

  // ---- themes (any set, filtered by name) ----
  { id: "t-zard",   cat: "themes", name: "Charizard Pack",   label: "CHARIZARD COLLECTION", price: 50, sets: "all", match: "charizard", floor: 0.05, cap: 60, look: L("#ff6a1a", "#2a0d02", "#d4501a", "#ff7a2a"), logo: "ball" },
  { id: "t-pika",   cat: "themes", name: "Pikachu Pack",     label: "PIKACHU COLLECTION",   price: 10, sets: "all", match: "pikachu", floor: 0.05, cap: 60, look: L("#ffe14a", "#2a2405", "#d4b22a", "#ffe14a", "split"), logo: "ball" },
  { id: "t-eevee",  cat: "themes", name: "Eeveelution Pack", label: "EEVEELUTIONS",         price: 25, sets: "all", match: "^(dark |shining |radiant |)(eevee|vaporeon|jolteon|flareon|espeon|umbreon|leafeon|glaceon|sylveon)\\b", floor: 0.05, cap: 60, look: L("#c98a5a", "#24160c", "#9c6a42", "#d79a68", "prism"), logo: "ball" },
  { id: "t-mew",    cat: "themes", name: "Mew & Mewtwo",     label: "MEW & MEWTWO",         price: 25, sets: "all", match: "^(shining |dark |)(mew|mewtwo)\\b", floor: 0.05, cap: 60, look: L("#ff8ad8", "#24102a", "#c45aa8", "#ff8ad8", "prism"), logo: "ball" },
  { id: "t-ghost",  cat: "themes", name: "Gengar Pack",      label: "GHOST COLLECTION",     price: 10, sets: "all", match: "^(dark |shining |radiant |)(gastly|haunter|gengar|mega gengar)\\b", floor: 0.05, cap: 60, look: L("#8a5cff", "#0d0818", "#5a3ad1", "#9a6bff"), logo: "ball" },
  { id: "t-birds",  cat: "themes", name: "Legendary Birds",  label: "LEGENDARY BIRDS",      price: 25, sets: "all", match: "^(dark |shining |galarian |)(articuno|zapdos|moltres|lugia|ho-oh)\\b", floor: 0.05, cap: 60, look: L("#4ad9ff", "#04202a", "#2aa3c4", "#4ad9ff"), logo: "ball" },
  { id: "t-dragon", cat: "themes", name: "Dragon Pack",      label: "DRAGON COLLECTION",    price: 25, sets: "all", match: "^(dark |shining |mega |radiant |)(dragonite|rayquaza|garchomp|salamence|dialga|palkia|giratina|kyurem|zekrom|reshiram|dragapult|gyarados)\\b", floor: 0.05, cap: 60, look: L("#2fe0a0", "#04241a", "#1fa874", "#2fe0a0"), logo: "ball" },
  { id: "t-trainer", cat: "themes", name: "Trainer Gallery", label: "FULL ART TRAINERS",    price: 25, sets: "all", match: "^(?!.*(ex|gx|v|vmax|vstar)$)(.*'s |professor|boss|marnie|lillie|iono|cynthia|erika|misty|n$|rosa|serena|elesa|skyla|acerola|nessa|sabrina)", floor: 0.1, cap: 60, look: L("#ff7ab8", "#2a0a1c", "#c44a8a", "#ff7ab8", "split"), logo: "ball" },
];

export const CATEGORIES = [
  { id: "pokemon", name: "Pokémon" },
  { id: "eras", name: "Eras" },
  { id: "sets", name: "Set Packs" },
  { id: "themes", name: "Theme Packs" },
];
