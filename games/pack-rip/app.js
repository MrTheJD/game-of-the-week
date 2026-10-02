// Pack Rip: buy digital packs with play money, rip them, and pull real Pokémon cards at real market prices.
// Sell back at 100% of market value, keep them in your collection, or "ship" them home.
import { load, save, wipe } from "../../shared/storage.js";
import { haptic, hapticButton, setHaptics } from "../../shared/haptics.js";
import { PACKS, CATEGORIES } from "./packs.js";
import { TIERS, MODES, buildPool, pull, setIds } from "./odds.js";

const GAME = "pack-rip";
const BUYBACK_DAYS = 7;          // full market value for 7 days after the pull, like the real app
const LATE_BUYBACK = 0.9;        // after that, 90%
const LEVELS = [
  { name: "Bronze", at: 0, rate: 0.01 }, { name: "Silver", at: 250, rate: 0.02 }, { name: "Gold", at: 1000, rate: 0.03 },
  { name: "Platinum", at: 5000, rate: 0.04 }, { name: "Diamond", at: 25000, rate: 0.05 },
];
const DAILY = [2, 3, 5, 5, 10, 10, 25];   // daily reward by streak day
const RETURNS = [
  { v: 0.9, name: "Real app", blurb: "About what the real apps pay out. You'll slowly lose." },
  { v: 1, name: "Fair", blurb: "On average you get back exactly what you pay." },
  { v: 1.05, name: "Friendly", blurb: "A small edge in your favor. You'll slowly win." },
  { v: 1.15, name: "Generous", blurb: "Packs are worth more than they cost." },
];

const FRESH = {
  v: 1, balance: 0, deposited: 0, withdrawn: 0, bonus: 0, spent: 0, packs: 0, pulled: 0,
  cards: [], withdrawals: [], modes: {}, cat: "pokemon", sel: {}, rake: 0,
  daily: { day: null, streak: 0 }, freeDay: null, welcomed: false,
  settings: { rtp: 1.05, sound: true, haptics: true },
};
let S = load(GAME, FRESH);
S.settings = { ...FRESH.settings, ...S.settings };
setHaptics(S.settings.haptics);
const persist = () => save(GAME, S);

// ---------- helpers ----------
const $ = (sel, root = document) => root.querySelector(sel);
const h = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (n) => (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const short = (n) => n >= 1000 ? "$" + (n / 1000).toLocaleString("en-US", { maximumFractionDigits: n >= 10000 ? 0 : 1 }) + "k" : n >= 100 ? "$" + Math.round(n) : money(n);
const round2 = (n) => Math.round(n * 100) / 100;
const today = () => new Date().toLocaleDateString("en-CA");
const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toLocaleDateString("en-CA"); };
const imgSmall = (c) => `https://images.pokemontcg.io/${c.img}.png`;
const imgLarge = (c) => `https://images.pokemontcg.io/${c.img}_hires.png`;
const tierById = (id) => TIERS.find(t => t.id === id) || TIERS[0];
const level = () => { let l = LEVELS[0]; for (const x of LEVELS) if (S.spent >= x.at) l = x; return l; };
const vault = () => S.cards.filter(c => c.s === "vault");
const vaultValue = () => round2(vault().reduce((s, c) => s + buyback(c), 0));
const buyback = (c) => round2(c.v * (Date.now() - c.at < BUYBACK_DAYS * 864e5 ? 1 : LATE_BUYBACK));
const net = () => round2(S.balance + vaultValue() + S.withdrawn - S.deposited);

let DATA = null;                  // { updated, sets, cards: [{id,name,r,price,img,v,set}] }
const pools = new Map();
function poolFor(pack) {
  const mode = S.modes[pack.id] || "normal", key = `${pack.id}|${mode}|${S.settings.rtp}`;
  if (!pools.has(key)) pools.set(key, buildPool(pack, DATA, mode, S.settings.rtp));
  return pools.get(key);
}

// ---------- sound (tiny synth, no files) ----------
let AC = null;
function ac() { if (!AC) try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch { /* no audio */ } return AC; }
document.addEventListener("pointerdown", () => { const a = ac(); if (a && a.state === "suspended") a.resume(); }, { once: false, passive: true });
function tone(freq, dur = 0.15, type = "sine", vol = 0.12, when = 0) {
  const a = S.settings.sound && ac(); if (!a) return;
  const t = a.currentTime + when, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.05);
}
function noise(dur = 0.3, vol = 0.18) {
  const a = S.settings.sound && ac(); if (!a) return;
  const buf = a.createBuffer(1, a.sampleRate * dur, a.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  src.buffer = buf; f.type = "highpass"; f.frequency.value = 1800; g.gain.value = vol;
  src.connect(f).connect(g).connect(a.destination); src.start();
}
const sfx = {
  tap: () => tone(660, 0.05, "triangle", 0.05),
  tear: () => noise(0.35, 0.2),
  flip: () => { tone(300, 0.12, "triangle", 0.06); tone(520, 0.12, "triangle", 0.05, 0.06); },
  reveal: (i) => { const notes = [523, 659, 784, 1047, 1319, 1568]; for (let k = 0; k <= i; k++) tone(notes[k], 0.5 + i * 0.08, i >= 4 ? "sawtooth" : "sine", i >= 4 ? 0.05 : 0.09, k * 0.07); },
  coin: () => { tone(1320, 0.08, "square", 0.04); tone(1760, 0.18, "square", 0.04, 0.07); },
};

// ---------- shell ----------
const ICONS = {
  packs: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 3h8a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm11 2.5 1.6.4a2 2 0 0 1 1.4 2.4l-2.6 10.3a2 2 0 0 1-.4.8V5.5Z"/></svg>',
  showroom: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 4h16v4H4zM5 9h14v11H5zm3 3v5h3v-5zm5 0v3h3v-3z"/></svg>',
  collection: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 4h7v7H4zm9 0h7v7h-7zM4 13h7v7H4zm9 0h7v7h-7z"/></svg>',
  rewards: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 8h-2.2A3 3 0 0 0 12 4.8 3 3 0 0 0 6.2 8H4v4h1v8h14v-8h1V8Zm-6-1.5a1.2 1.2 0 1 1 1.2 1.5H14V6.5ZM8.8 6.5A1.2 1.2 0 0 1 10 7v1H8.8a.75.75 0 0 1 0-1.5ZM11 18H7v-6h4v6Zm6 0h-4v-6h4v6Z"/></svg>',
  account: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 4a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7Zm0 14a8 8 0 0 1-6-2.7c.8-1.8 3.3-3 6-3s5.2 1.2 6 3a8 8 0 0 1-6 2.7Z"/></svg>',
};
const TABS = [["packs", "Packs"], ["showroom", "Showroom"], ["collection", "Collection"], ["rewards", "Rewards"], ["account", "Account"]];
let tab = "packs";

function shell() {
  document.body.innerHTML = `
    <header class="top" id="top"></header>
    <main id="view"></main>
    <nav class="tabs" id="tabs">${TABS.map(([id, name]) => `<button data-tab="${id}">${ICONS[id]}<span>${name}</span></button>`).join("")}</nav>
    <div id="rip"></div>
    <div class="toast" id="toast"></div>`;
  $("#tabs").addEventListener("click", e => { const b = e.target.closest("button"); if (b) { haptic("tick"); go(b.dataset.tab); } });
}

function go(t) {
  if (t !== tab) { selectMode = false; selected.clear(); }
  tab = t;
  if (!(t === "collection" && selectMode)) { const bar = $(".selbar"); if (bar) bar.remove(); }
  document.querySelectorAll("#tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === t));
  renderTop();
  const v = $("#view"); v.scrollTop = 0; v.innerHTML = ""; v.onclick = null;
  ({ packs: viewPacks, showroom: viewShowroom, collection: viewCollection, rewards: viewRewards, account: viewAccount })[t](v);
}

let shownBalance = null;
function renderTop() {
  const top = $("#top");
  const left = tab === "packs"
    ? `<button class="cat-btn" id="cat">${esc(CATEGORIES.find(c => c.id === S.cat).name)} <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="m6 9 6 6 6-6"/></svg></button>`
    : `<div class="title">${TABS.find(x => x[0] === tab)[1]}</div>`;
  top.className = "top" + (tab === "packs" ? "" : " solid");
  top.innerHTML = `${left}<div class="bal"><div class="amt money" id="amt">${money(shownBalance ?? S.balance)}</div><button class="plus" id="plus" aria-label="Add funds"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><path d="M12 5v14M5 12h14"/></svg></button></div>`;
  $("#plus").onclick = () => { haptic("tick"); sheetFunds(); };
  const cat = $("#cat"); if (cat) cat.onclick = () => { haptic("tick"); sheetCategory(); };
  if (shownBalance !== S.balance) animateBalance();
}
function animateBalance() {
  const el = $("#amt"); if (!el) return;
  const from = shownBalance ?? S.balance, to = S.balance;
  shownBalance = to;
  if (from === to) { el.textContent = money(to); return; }
  el.classList.remove("up", "down"); el.classList.add(to > from ? "up" : "down");
  const t0 = performance.now(), dur = 600;
  const step = (t) => {
    const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    el.textContent = money(from + (to - from) * e);
    if (k < 1) requestAnimationFrame(step); else setTimeout(() => el.classList.remove("up", "down"), 500);
  };
  requestAnimationFrame(step);
}
function setBalance(delta) { S.balance = round2(S.balance + delta); persist(); animateBalance(); if (tab === "packs") updateBuy(); }

let toastTimer;
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}

// ---------- sheets ----------
function sheet(html, onOpen) {
  const scrim = h(`<div class="scrim"></div>`), sh = h(`<div class="sheet"><div class="grab"></div>${html}</div>`);
  document.body.append(scrim, sh);
  requestAnimationFrame(() => { scrim.classList.add("open"); sh.classList.add("open"); });
  const close = () => { scrim.classList.remove("open"); sh.classList.remove("open"); setTimeout(() => { scrim.remove(); sh.remove(); }, 300); };
  scrim.onclick = close;
  // swipe down to close
  let y0 = null;
  sh.addEventListener("touchstart", e => { y0 = sh.scrollTop <= 0 ? e.touches[0].clientY : null; }, { passive: true });
  sh.addEventListener("touchmove", e => { if (y0 == null) return; const dy = e.touches[0].clientY - y0; if (dy > 0) { sh.style.transition = "none"; sh.style.transform = `translateY(${dy}px)`; } }, { passive: true });
  sh.addEventListener("touchend", e => { if (y0 == null) return; sh.style.transition = ""; const dy = e.changedTouches[0].clientY - y0; sh.style.transform = ""; if (dy > 90) close(); y0 = null; });
  onOpen && onOpen(sh, close);
  return close;
}

function sheetCategory() {
  sheet(`<h2>Packs</h2>${CATEGORIES.map(c => `<button class="row" data-c="${c.id}" style="width:100%;text-align:left"><div class="grow"><b>${esc(c.name)}</b><small>${PACKS.filter(p => p.cat === c.id).length} packs</small></div>${S.cat === c.id ? "✓" : ""}</button>`).join("")}`,
    (sh, close) => sh.addEventListener("click", e => { const b = e.target.closest("[data-c]"); if (!b) return; S.cat = b.dataset.c; persist(); haptic("tick"); close(); go("packs"); }));
}

function sheetFunds() {
  const amts = [10, 25, 50, 100, 500, 1000];
  sheet(`<h2>Add funds</h2><p>It's play money, so it's free. The Account tab keeps track of how much you've added, so you can see whether you're really up.</p>
    <div class="chips" style="margin:14px 0">${amts.map(a => `<button data-a="${a}">$${a.toLocaleString()}</button>`).join("")}</div>`,
    (sh, close) => sh.addEventListener("click", e => {
      const b = e.target.closest("[data-a]"); if (!b) return;
      const a = +b.dataset.a; S.deposited += a; setBalance(a); haptic("ok"); sfx.coin(); toast(`Added ${money(a)}`); close();
      if (tab === "account") go("account"); else if (tab === "packs") updateBuy();
    }));
}

function sheetCashOut() {
  const opts = [5, 25, 100].filter(a => a <= S.balance);
  sheet(`<h2>Cash out</h2><p>Minimum withdrawal is $5. Cashing out banks your winnings: the money leaves your balance and counts as profit you kept.</p>
    <div class="panel"><div class="kv"><span>Withdrawable cash</span><b class="pos money">${money(S.balance)}</b></div></div>
    <div class="chips" style="margin:14px 0">${opts.map(a => `<button data-a="${a}">$${a}</button>`).join("")}${S.balance >= 5 ? `<button data-a="all">All</button>` : ""}</div>
    ${S.balance < 5 ? `<p>You need at least $5 to cash out.</p>` : ""}`,
    (sh, close) => sh.addEventListener("click", e => {
      const b = e.target.closest("[data-a]"); if (!b) return;
      const a = b.dataset.a === "all" ? S.balance : +b.dataset.a;
      S.withdrawn = round2(S.withdrawn + a); S.withdrawals.unshift({ a, at: Date.now() }); S.withdrawals = S.withdrawals.slice(0, 50);
      setBalance(-a); haptic("ok"); sfx.coin(); toast(`Cashed out ${money(a)}`); close(); go("account");
    }));
}

function oddsBar(tiers) { return `<div class="bar">${tiers.filter(t => t.p > 0.0005).map(t => `<i style="flex:${t.p};background:${t.color}"></i>`).join("")}</div>`; }
const pct = (p) => p >= 0.1 ? (p * 100).toFixed(1) + "%" : p >= 0.001 ? (p * 100).toFixed(2) + "%" : "<0.1%";

function sheetInside(pack) {
  const pool = poolFor(pack), nSets = new Set(pool.tiers.flatMap(t => t.cards.map(c => c.set))).size;
  sheet(`<h2>${esc(pack.name)} · ${money(pack.price)}</h2>
    ${oddsBar(pool.tiers)}
    <div style="margin-top:6px">${pool.tiers.filter(t => t.cards.length).map(t => `
      <div class="row"><span class="dot" style="color:${t.color}"></span><div class="grow"><b>${t.name}</b><small>${short(t.min)} – ${short(t.max)} · ${t.cards.length} cards</small></div><b>${pct(t.p)}</b></div>`).join("")}</div>
    <p style="font-size:13px">Average pull: <b style="color:#fff">${money(pool.ev)}</b> (${Math.round(pool.ev / pack.price * 100)}% of the price, set in Account → Pack return). Odds style: ${MODES[pool.mode].name}.</p>
    <h3>Top cards</h3>
    <div class="grid">${pool.top.slice(0, 12).map(c => tileHTML(c, c.price, pack.price)).join("")}</div>
    <p style="font-size:12px;margin-top:14px">${pool.count.toLocaleString()} cards from ${nSets} set${nSets === 1 ? "" : "s"}. Prices are TCGplayer market prices for raw cards via pokemontcg.io, from ${esc(DATA.updated)}.</p>`,
    (sh) => sh.addEventListener("click", e => { const t = e.target.closest("[data-card]"); if (t) previewCard(DATA.byId.get(t.dataset.card)); }));
}

function sheetOdds(pack) {
  const cur = S.modes[pack.id] || "normal";
  sheet(`<h2>Adjust odds</h2><p>Same average value, different ride.</p>
    ${Object.entries(MODES).map(([id, m]) => { const p = buildPool(pack, DATA, id, S.settings.rtp);
      return `<button class="mode ${id === cur ? "on" : ""}" data-m="${id}"><b>${m.name}</b><small>${m.blurb} Grail chance ${pct(p.tiers[5].p)}.</small>${oddsBar(p.tiers)}</button>`; }).join("")}`,
    (sh, close) => sh.addEventListener("click", e => {
      const b = e.target.closest("[data-m]"); if (!b) return;
      S.modes[pack.id] = b.dataset.m; persist(); haptic("tick"); close(); updatePackInfo();
    }));
}

function tileHTML(c, value, packPrice, extra = "") {
  const t = tierById(c.t || tierFor(value, packPrice));
  return `<button class="tile ${extra}" data-card="${esc(c.id)}" ${c.u ? `data-u="${c.u}"` : ""}>
    <img loading="lazy" src="${imgSmall(c)}" alt="${esc(c.name || c.n)}" onerror="this.style.visibility='hidden'">
    <div class="val"><span class="money">${short(value)}</span><i style="background:${t.color}"></i></div></button>`;
}
function tierFor(price, packPrice) { const r = price / packPrice; return (TIERS.find(t => r >= t.lo && r < t.hi) || TIERS[0]).id; }

function previewCard(c) {
  if (!c) return;
  const set = DATA.sets[c.set];
  sheet(`<img class="cardbig" src="${imgLarge(c)}" alt="">
    <h2 style="text-align:center;margin-bottom:4px">${esc(c.name)}</h2>
    <p style="text-align:center;margin:0">${esc(set ? set.name : c.set)} · ${esc(c.r || "")}</p>
    <p style="text-align:center;font-size:26px;font-weight:800;color:#fff;margin:8px 0">${money(c.price)}</p>`);
}

// ---------- PACKS (store) ----------
let curPack = null;
function packsIn(cat) { return PACKS.filter(p => p.cat === cat); }
function packArt(p) {
  const L = p.look, logo = p.logo === "ball" || !DATA.sets[p.logo] ? `<div class="ball"></div>` : `<img src="${DATA.sets[p.logo].logo}" alt="">`;
  const words = p.label.split(" "), lastWord = words.pop();
  return `<div class="pack ${L.style}" style="--a:${L.a};--b:${L.b};--edge:${L.edge};--glow:${L.glow}">
    <div class="crimp t"></div>
    <div class="body"><div class="fx"></div>${L.style === "split" ? `<div class="lower"></div>` : ""}<div class="shine"></div>
      <div class="brand"><div class="mark">R</div><div class="chip">PACK RIP</div></div>
      <div class="word">RIP</div>
      <div class="emblem">${logo}</div>
      <div class="plabel">${esc(words.join(" "))} <span>${esc(lastWord)}</span></div></div>
    <div class="crimp b"></div></div>`;
}

function viewPacks(v) {
  if (!packsIn(S.cat).length) S.cat = (CATEGORIES.find(c => packsIn(c.id).length) || CATEGORIES[0]).id;
  const list = packsIn(S.cat);
  const want = S.sel[S.cat] || list[0].id;
  curPack = list.find(p => p.id === want) || list[0];
  v.innerHTML = `<div class="store" id="store" style="--glow:${curPack.look.glow}">
    <div class="rays"></div>
    <div class="carousel" id="car">${list.map(p => `<div class="slide" data-p="${p.id}">${packArt(p)}<div class="ptag money">${short(p.price)}</div></div>`).join("")}</div>
    <div class="pinfo"><div class="pname" id="pname"></div><button class="inside" id="inside"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>What's Inside?</button></div>
    <div class="stats"><div class="stat"><small>Min Value</small><b class="money" id="pmin"></b></div><div class="stat mid"><small>Max Pull</small><b class="money" id="pmax"></b></div><div class="stat right"><small>Adjust Odds</small><button id="podds"></button></div></div>
    <div class="buy-wrap"><div class="buy" id="buy" role="button" tabindex="0"><span id="buyt"></span></div></div></div>`;
  const car = $("#car");
  const slides = [...car.children];
  const fit = () => {
    const mid = car.scrollLeft + car.clientWidth / 2;
    let best = null, bestD = 1e9;
    for (const s of slides) {
      const c = s.offsetLeft + s.offsetWidth / 2, d = (c - mid) / s.offsetWidth, ad = Math.abs(d);
      const pk = s.firstElementChild;
      pk.style.transform = `translateZ(${-ad * 80}px) rotateY(${Math.max(-1.5, Math.min(1.5, d)) * -22}deg) scale(${1 - Math.min(ad, 1.5) * 0.18})`;
      pk.style.opacity = String(1 - Math.min(ad, 2) * 0.25);
      if (ad < bestD) { bestD = ad; best = s; }
    }
    if (best && best.dataset.p !== curPack.id) {
      curPack = PACKS.find(p => p.id === best.dataset.p); S.sel[S.cat] = curPack.id; persist();
      haptic("tick"); sfx.tap(); updatePackInfo();
    }
    slides.forEach(s => s.classList.toggle("on", s === best));
  };
  let raf = 0;
  car.addEventListener("scroll", () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(fit); }, { passive: true });
  car.addEventListener("click", e => { const s = e.target.closest(".slide"); if (s && s.dataset.p !== curPack.id) s.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" }); });
  updatePackInfo();
  // Size the packs to the room left over, so the Buy button always shows without scrolling.
  const store = $("#store"), rest = [".pinfo", ".stats", ".buy-wrap"].reduce((s, q) => s + $(q, store).offsetHeight, 0);
  const packH = Math.max(200, v.clientHeight - rest - 60);
  store.style.setProperty("--pw", Math.round(Math.min(230, Math.min(window.innerWidth * 0.56, packH * 0.63))) + "px");
  const start = slides.find(s => s.dataset.p === curPack.id);
  requestAnimationFrame(() => { car.scrollLeft = start.offsetLeft + start.offsetWidth / 2 - car.clientWidth / 2; fit(); });
  $("#inside").onclick = () => { haptic("tick"); sheetInside(curPack); };
  $("#podds").onclick = () => { haptic("tick"); sheetOdds(curPack); };
  hapticButton($("#buy"), () => buy(curPack));
  updatePackInfo();
  if (!S.welcomed) welcome();
}

function updatePackInfo() {
  if (tab !== "packs" || !curPack) return;
  const pool = poolFor(curPack);
  $("#store").style.setProperty("--glow", curPack.look.glow);
  $("#pname").textContent = curPack.name;
  $("#pmin").textContent = money(pool.min);
  $("#pmax").textContent = short(pool.max);
  $("#podds").innerHTML = `${MODES[S.modes[curPack.id] || "normal"].name} ›`;
  updateBuy();
}
function updateBuy() {
  const b = $("#buy"); if (!b) return;
  const poor = S.balance < curPack.price;
  b.classList.toggle("poor", poor);
  b.style.setProperty("--glow", curPack.look.glow);
  $("#buyt").textContent = poor ? `Add funds to buy (${money(curPack.price)})` : `Buy for ${money(curPack.price)}`;
}

function welcome() {
  S.welcomed = true; S.bonus += 100; setBalance(100);
  sheet(`<h2>Welcome to Pack Rip</h2><p>Here's <b style="color:#fff">$100</b> in play money to start. Pick a pack, rip it, and pull real Pokémon cards at real market prices.</p>
    <p>Keep what you pull, or sell it back for 100% of market value. Grab free money every day in Rewards. Nothing here costs real money.</p>
    <div class="btns"><button class="btn green" id="ok">Let's rip</button></div>`, (sh, close) => { $("#ok", sh).onclick = () => { haptic("ok"); close(); }; });
}

function buy(pack, free = false) {
  if (!free && S.balance < pack.price) { sheetFunds(); return; }
  const pool = poolFor(pack);
  const { card, tier } = pull(pool);
  if (!free) { setBalance(-pack.price); S.spent = round2(S.spent + pack.price); S.rake = round2(S.rake + pack.price * level().rate); }
  S.packs++; S.pulled = round2(S.pulled + card.price);
  const rec = { u: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), id: card.id, n: card.name, set: card.set, r: card.r, v: card.price,
    img: card.img, t: tier.id, pk: pack.id, pp: free ? 0 : pack.price, at: Date.now(), s: "new" };
  S.cards.unshift(rec);
  persist();
  haptic("buy");
  openRip(pack, rec, free);
}

// ---------- RIP ----------
function openRip(pack, rec, free) {
  const rip = $("#rip"), tier = tierById(rec.t), ti = TIERS.indexOf(tier);
  rip.style.setProperty("--glow", pack.look.glow);
  rip.style.setProperty("--tier", tier.color);
  rip.innerHTML = `<div class="rays"></div><canvas id="confetti"></canvas><div class="flash"></div>
    <button class="close" id="rclose" aria-label="Close">✕</button>
    <div class="stage">
      <div class="card3d" id="c3d"><div class="flip"><div class="face back"><div class="logo">R</div></div><div class="face front"><img id="cimg" alt=""><div class="holo"></div></div></div></div>
      <div class="ripack" id="rpk"><div class="ghost">${packArt(pack)}</div><div class="half top-half">${packArt(pack)}</div><div class="half bot-half">${packArt(pack)}</div><div class="tear" id="tear"></div></div>
    </div>
    <div class="hint" id="hint">Swipe across the top to rip →</div>
    <div class="result" id="res"></div>`;
  rip.classList.add("open");
  $("#rclose").style.display = "none";
  const img = $("#cimg"); img.src = imgLarge(rec);
  img.onerror = () => { img.onerror = null; img.src = imgSmall(rec); };
  let stage = "pack";

  // Tear: drag sideways across the pack. A tap rips it too.
  const rpk = $("#rpk"), tear = $("#tear");
  let x0 = null, prog = 0, lastBuzz = 0;
  const done = () => {
    if (stage !== "pack") return; stage = "torn";
    tear.style.width = "100%"; sfx.tear(); haptic("hit");
    rpk.classList.add("torn"); $("#hint").textContent = "";
    setTimeout(() => { $("#c3d").classList.add("up"); }, 250);
    setTimeout(() => { stage = "back"; $("#hint").textContent = "Tap to reveal"; armFlip(); }, 900);
  };
  rpk.addEventListener("pointerdown", e => { x0 = e.clientX; rpk.setPointerCapture(e.pointerId); });
  rpk.addEventListener("pointermove", e => {
    if (x0 == null || stage !== "pack") return;
    prog = Math.max(prog, Math.min(1, (e.clientX - x0) / (rpk.offsetWidth * 0.8)));
    tear.style.width = prog * 100 + "%";
    if (prog - lastBuzz > 0.2) { lastBuzz = prog; haptic("tick"); tone(400 + prog * 600, 0.04, "triangle", 0.03); }
    if (prog >= 0.75) done();
  });
  rpk.addEventListener("pointerup", e => { if (stage === "pack" && Math.abs(e.clientX - (x0 ?? e.clientX)) < 8) { tear.style.transition = "width .35s"; tear.style.width = "100%"; setTimeout(done, 300); } x0 = null; });

  const armFlip = () => {
    const c3d = $("#c3d");
    const off = hapticButton(c3d, async () => {
      if (stage !== "back") return; stage = "flipping"; off();
      $("#hint").textContent = "";
      try { await Promise.race([img.decode(), new Promise(r => setTimeout(r, 2500))]); } catch { /* show what we have */ }
      sfx.flip(); c3d.classList.add("flipped");
      setTimeout(() => revealed(), 550);
    });
  };

  const revealed = () => {
    const c3d = $("#c3d");
    sfx.reveal(ti);
    if (ti >= 3) { $(".flash").classList.add("go"); c3d.classList.add("shiny"); confetti(ti); }
    if (ti >= 4) { c3d.classList.add("shake"); haptic("big"); } else haptic(ti >= 2 ? "hit" : "ok");
    const set = DATA.sets[rec.set], paid = rec.pp, d = round2(rec.v - paid);
    $("#res").innerHTML = `<div style="text-align:center">
      <span class="tierban">${tier.name.toUpperCase()}</span>
      <div class="rname">${esc(rec.n)}</div><div class="rsub">${esc(set ? set.name : rec.set)}${rec.r ? " · " + esc(rec.r) : ""}</div>
      <div class="rval money"><span id="rv">$0.00</span>${paid ? `<span class="delta ${d >= 0 ? "pos" : "neg"}">${d >= 0 ? "+" : "−"}${money(Math.abs(d))}</span>` : `<span class="delta pos">FREE</span>`}</div></div>
      <div class="btns two" id="acts"><div role="button" class="btn" id="keep">Keep</div><div role="button" class="btn green" id="sell">Sell ${money(rec.v)}</div></div>`;
    $("#res").classList.add("show");
    countUp($("#rv"), rec.v, ti >= 4 ? 1400 : 700);
    hapticButton($("#sell"), () => decide("sell"));
    hapticButton($("#keep"), () => decide("keep"));
  };

  const decide = (what) => {
    if (what === "sell") { rec.s = "sold"; rec.sv = rec.v; rec.st = Date.now(); setBalance(rec.v); sfx.coin(); toast(`Sold for ${money(rec.v)}`); }
    else { rec.s = "vault"; toast("Added to your collection"); }
    persist();
    const again = !free && S.balance >= pack.price;
    $("#acts").outerHTML = `<div class="btns two"><button class="btn" id="back">Done</button><div role="button" class="btn ${again ? "green" : ""}" id="again">${free ? "See packs" : again ? `Rip again ${money(pack.price)}` : "Add funds"}</div></div>`;
    $("#back").onclick = () => { haptic("tick"); closeRip(); };
    hapticButton($("#again"), () => {
      if (free) { closeRip(); return; }
      if (S.balance < pack.price) { closeRip(); sheetFunds(); return; }
      buy(pack);
    });
  };
  // If they close mid-way, the card goes to the collection.
  $("#rclose").onclick = () => { if (rec.s === "new") { rec.s = "vault"; persist(); } closeRip(); };
  setTimeout(() => { if ($("#rclose")) $("#rclose").style.display = ""; }, 1200);
}
function closeRip() {
  for (const c of S.cards) if (c.s === "new") c.s = "vault";
  persist();
  $("#rip").classList.remove("open"); $("#rip").innerHTML = "";
  go(tab);
}
function countUp(el, to, dur) {
  const t0 = performance.now();
  const step = (t) => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = money(to * e); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
function confetti(ti) {
  const cv = $("#confetti"); if (!cv) return;
  const dpr = devicePixelRatio || 1, W = cv.width = innerWidth * dpr, H = cv.height = innerHeight * dpr;
  const ctx = cv.getContext("2d"), cols = [TIERS[ti].color, "#fff", "#ffd66b", TIERS[Math.max(0, ti - 1)].color];
  const n = ti >= 5 ? 220 : ti >= 4 ? 140 : 70;
  const ps = Array.from({ length: n }, () => ({ x: W / 2, y: H * 0.42, vx: (Math.random() - 0.5) * 22 * dpr, vy: (Math.random() * -18 - 4) * dpr, r: (3 + Math.random() * 4) * dpr, c: cols[Math.floor(Math.random() * cols.length)], a: Math.random() * 6 }));
  const t0 = performance.now();
  const step = (t) => {
    const k = (t - t0) / 2200; ctx.clearRect(0, 0, W, H); if (k >= 1 || !cv.isConnected) return;
    for (const p of ps) { p.x += p.vx; p.y += p.vy; p.vy += 0.6 * dpr; p.vx *= 0.985; p.a += 0.2;
      ctx.globalAlpha = 1 - k; ctx.fillStyle = p.c; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r); ctx.restore(); }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// ---------- SHOWROOM ----------
function viewShowroom(v) {
  const best = S.cards.slice().sort((a, b) => b.v - a.v).slice(0, 12);
  const packs = PACKS.slice().sort((a, b) => a.price - b.price);
  v.innerHTML = `<div class="pad">
    <h3 style="margin-top:6px">Your best pulls</h3>
    ${best.length ? `<div class="hscroll">${best.map(c => `<button class="case" data-u="${c.u}"><div class="glass"><img loading="lazy" src="${imgSmall(c)}" alt=""></div><div class="plinth"></div><b class="money">${short(c.v)}</b><small>${esc(c.n)}</small></button>`).join("")}</div>`
      : `<div class="panel empty">Your best pulls go on display here. Go rip a pack!</div>`}
    ${packs.map(p => { const pool = poolFor(p); return `<h3>${esc(p.name)} · ${short(p.price)} <span style="text-transform:none;letter-spacing:0;font-weight:500">chase cards</span></h3>
      <div class="hscroll">${pool.top.slice(0, 8).map(c => `<button class="case" data-card="${esc(c.id)}"><div class="glass"><img loading="lazy" src="${imgSmall(c)}" alt=""></div><div class="plinth"></div><b class="money">${short(c.price)}</b><small>${esc(c.name)}</small></button>`).join("")}</div>`; }).join("")}
  </div>`;
  v.onclick = (e => {
    const u = e.target.closest("[data-u]"); if (u) return cardSheet(S.cards.find(c => c.u === u.dataset.u));
    const c = e.target.closest("[data-card]"); if (c) previewCard(DATA.byId.get(c.dataset.card));
  });
}

// ---------- COLLECTION ----------
let colTab = "vault", colSort = "value", selectMode = false;
const selected = new Set();
function viewCollection(v) {
  const vc = vault(), shipped = S.cards.filter(c => c.s === "shipped");
  let list = colTab === "vault" ? vc : colTab === "shipped" ? shipped : S.cards;
  list = list.slice().sort(colSort === "value" ? (a, b) => b.v - a.v : (a, b) => b.at - a.at);
  v.innerHTML = `<div class="pad">
    <div class="panel" style="display:flex;justify-content:space-between;align-items:center">
      <div><small style="color:var(--dim)">Collection value</small><div class="bigval money">${money(vaultValue())}</div><small style="color:var(--dim)">${vc.length} card${vc.length === 1 ? "" : "s"} in your vault</small></div>
      ${colTab === "vault" && vc.length ? `<button class="btn" style="width:auto;height:40px" id="selbtn">${selectMode ? "Cancel" : "Select"}</button>` : ""}
    </div>
    <div class="seg" style="margin:14px 0 10px" id="ctabs">${[["vault", "Vault"], ["shipped", "Shipped"], ["history", "History"]].map(([id, n]) => `<button data-t="${id}" class="${colTab === id ? "on" : ""}">${n}</button>`).join("")}</div>
    ${colTab !== "history" ? `<div class="seg" style="margin-bottom:14px;max-width:240px" id="csort"><button data-s="value" class="${colSort === "value" ? "on" : ""}">Value</button><button data-s="new" class="${colSort === "new" ? "on" : ""}">Newest</button></div>` : ""}
    ${!list.length ? `<div class="empty">${colTab === "vault" ? "Cards you keep land here. Sell them back any time." : colTab === "shipped" ? "Cards you ship home live here for good." : "Every card you pull shows up here."}</div>`
      : colTab === "history" ? `<div class="panel" style="padding:4px 14px">${list.slice(0, 200).map(c => `<div class="row hist" data-u="${c.u}"><img loading="lazy" src="${imgSmall(c)}" alt=""><div class="grow"><b>${esc(c.n)}</b><small>${esc((PACKS.find(p => p.id === c.pk) || {}).name || "")}${c.pp ? "" : " (free)"} · ${new Date(c.at).toLocaleDateString()}</small></div><div style="text-align:right"><b class="money">${money(c.v)}</b><small>${c.s === "sold" ? `<span class="pos">Sold</span>` : c.s === "shipped" ? "Shipped" : "In vault"}</small></div></div>`).join("")}</div>`
      : `<div class="grid" id="cgrid">${list.map(c => tileHTML(c, colTab === "vault" ? buyback(c) : c.v, c.pp || 1, selected.has(c.u) ? "sel" : "")).join("")}</div>`}
    <div style="height:${selectMode ? 80 : 0}px"></div></div>`;
  $("#ctabs").onclick = e => { const b = e.target.closest("[data-t]"); if (b) { colTab = b.dataset.t; selectMode = false; selected.clear(); haptic("tick"); go("collection"); } };
  const cs = $("#csort"); if (cs) cs.onclick = e => { const b = e.target.closest("[data-s]"); if (b) { colSort = b.dataset.s; haptic("tick"); go("collection"); } };
  const sb = $("#selbtn"); if (sb) sb.onclick = () => { selectMode = !selectMode; selected.clear(); haptic("tick"); go("collection"); };
  v.querySelectorAll("[data-u]").forEach(el => el.addEventListener("click", () => {
    const c = S.cards.find(x => x.u === el.dataset.u);
    if (selectMode) { selected.has(c.u) ? selected.delete(c.u) : selected.add(c.u); el.classList.toggle("sel"); haptic("tick"); renderSelBar(); }
    else cardSheet(c);
  }));
  if (selectMode) renderSelBar();
}
function renderSelBar() {
  let bar = $(".selbar");
  if (!bar) { bar = h(`<div class="selbar"></div>`); document.body.appendChild(bar); }
  const cards = S.cards.filter(c => selected.has(c.u)), total = round2(cards.reduce((s, c) => s + buyback(c), 0));
  bar.innerHTML = `<button class="btn" id="selall" style="flex:1">${selected.size === vault().length ? "None" : "All"}</button><button class="btn green" id="sellsel" style="flex:2" ${cards.length ? "" : "disabled"}>Sell ${cards.length || ""} for ${money(total)}</button>`;
  $("#selall").onclick = () => { if (selected.size === vault().length) selected.clear(); else vault().forEach(c => selected.add(c.u)); haptic("tick"); go("collection"); };
  $("#sellsel").onclick = () => {
    for (const c of cards) { c.sv = buyback(c); c.s = "sold"; c.st = Date.now(); }
    setBalance(total); sfx.coin(); haptic("ok"); toast(`Sold ${cards.length} for ${money(total)}`);
    selected.clear(); selectMode = false; go("collection");
  };
}
function cardSheet(c) {
  if (!c) return;
  const set = DATA.sets[c.set], t = tierById(c.t), pack = PACKS.find(p => p.id === c.pk);
  const left = BUYBACK_DAYS * 864e5 - (Date.now() - c.at), bb = buyback(c);
  sheet(`<img class="cardbig" src="${imgLarge(c)}" alt="">
    <div style="text-align:center"><span class="tierban" style="--tier:${t.color}">${t.name.toUpperCase()}</span>
    <h2 style="margin:10px 0 2px">${esc(c.n)}</h2><p style="margin:0">${esc(set ? set.name : c.set)}${c.r ? " · " + esc(c.r) : ""}</p></div>
    <div class="panel" style="margin-top:14px">
      <div class="kv"><span>Market value</span><b class="money">${money(c.v)}</b></div>
      <div class="kv"><span>Pulled from</span><b>${esc(pack ? pack.name : "")}${c.pp ? ` (${money(c.pp)})` : " (free)"}</b></div>
      <div class="kv"><span>Pulled</span><b>${new Date(c.at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</b></div>
      ${c.s === "vault" ? `<div class="kv"><span>Buyback</span><b>${left > 0 ? `100% for ${Math.ceil(left / 864e5)} more day${Math.ceil(left / 864e5) === 1 ? "" : "s"}` : `${LATE_BUYBACK * 100}% (after ${BUYBACK_DAYS} days)`}</b></div>` : ""}
      ${c.s === "sold" ? `<div class="kv"><span>Sold for</span><b class="pos money">${money(c.sv)}</b></div>` : ""}
    </div>
    ${c.s === "vault" ? `<div class="btns two"><button class="btn" id="ship">Ship to me</button><div role="button" class="btn green" id="sell">Sell ${money(bb)}</div></div>`
      : c.s === "shipped" ? `<p style="text-align:center">Shipped home. This one's yours for good.</p>` : ""}`,
    (sh, close) => {
      const s = $("#sell", sh); if (s) hapticButton(s, () => { c.s = "sold"; c.sv = bb; c.st = Date.now(); setBalance(bb); sfx.coin(); toast(`Sold for ${money(bb)}`); close(); go(tab); });
      const p = $("#ship", sh); if (p) p.onclick = () => {
        haptic("tick");
        sheet(`<h2>Ship ${esc(c.n)}?</h2><p>It leaves your vault and goes in Shipped for good. You won't be able to sell it back, but it's yours forever and it still counts in your best pulls.</p>
          <div class="btns two"><button class="btn" id="no">Cancel</button><button class="btn gold" id="yes">Ship it</button></div>`,
          (sh2, close2) => { $("#no", sh2).onclick = close2; $("#yes", sh2).onclick = () => { c.s = "shipped"; persist(); haptic("ok"); toast("Shipped! 📦"); close2(); close(); go(tab); }; });
      };
    });
}

// ---------- REWARDS ----------
function viewRewards(v) {
  const t = today(), claimed = S.daily.day === t;
  const streakNow = claimed ? S.daily.streak : (S.daily.day === yesterday() ? S.daily.streak : 0);
  const nextDay = claimed ? null : (streakNow % 7);
  const lv = level(), li = LEVELS.indexOf(lv), nx = LEVELS[li + 1];
  const freeUsed = S.freeDay === t;
  v.innerHTML = `<div class="pad">
    <div class="panel"><b style="font-size:18px">Daily reward</b><p style="color:var(--dim);margin:4px 0 0">Come back every day. The 7th day in a row pays the most.</p>
      <div class="streak">${DAILY.map((a, i) => { const done = claimed ? i < ((S.daily.streak - 1) % 7) + 1 : i < streakNow % 7; return `<div class="${done ? "done" : ""} ${!claimed && i === nextDay ? "today" : ""}">Day ${i + 1}<b>$${a}</b></div>`; }).join("")}</div>
      <div role="button" class="btn ${claimed ? "" : "green"}" id="daily" ${claimed ? "disabled" : ""}>${claimed ? "Claimed today. Back tomorrow" : `Claim $${DAILY[nextDay]}`}</div></div>
    <div class="panel"><b style="font-size:18px">Free daily pack</b><p style="color:var(--dim);margin:4px 0 12px">One free Starter Pack every day.</p>
      <div role="button" class="btn ${freeUsed ? "" : "gold"}" id="free" ${freeUsed ? "disabled" : ""}>${freeUsed ? "Opened today. Back tomorrow" : "Rip free pack"}</div></div>
    <div class="panel"><div style="display:flex;justify-content:space-between;align-items:baseline"><b style="font-size:18px">${lv.name} level</b><span style="color:var(--dim)">${Math.round(lv.rate * 100)}% rakeback</span></div>
      <div class="prog"><i style="width:${nx ? Math.min(100, (S.spent - lv.at) / (nx.at - lv.at) * 100) : 100}%"></i></div>
      <small style="color:var(--dim)">${nx ? `${money(nx.at - S.spent)} more in packs to reach ${nx.name} (${Math.round(nx.rate * 100)}% rakeback)` : "Top level reached"}</small>
      <p style="color:var(--dim);margin:12px 0">Every pack you buy pays back a little. It adds up here.</p>
      <div role="button" class="btn ${S.rake >= 0.01 ? "green" : ""}" id="rake" ${S.rake >= 0.01 ? "" : "disabled"}>${S.rake >= 0.01 ? `Claim ${money(S.rake)} rakeback` : "Nothing to claim yet"}</div></div>
  </div>`;
  const d = $("#daily"); if (!claimed) hapticButton(d, () => {
    const amt = DAILY[nextDay]; S.daily = { day: t, streak: streakNow + 1 }; S.bonus += amt; setBalance(amt); sfx.coin(); toast(`+${money(amt)} daily reward`); go("rewards");
  });
  const f = $("#free"); if (!freeUsed) hapticButton(f, () => { S.freeDay = t; persist(); buy(PACKS.find(p => p.id === "starter"), true); });
  const r = $("#rake"); if (S.rake >= 0.01) hapticButton(r, () => { const a = S.rake; S.rake = 0; S.bonus = round2(S.bonus + a); setBalance(a); sfx.coin(); toast(`+${money(a)} rakeback`); go("rewards"); });
}

// ---------- ACCOUNT ----------
function viewAccount(v) {
  const n = net(), best = S.cards.reduce((b, c) => (!b || c.v > b.v ? c : b), null);
  v.innerHTML = `<div class="pad">
    <div class="panel"><small style="color:var(--dim)">Balance</small><div class="bigval money">${money(S.balance)}</div>
      <div class="btns two"><button class="btn green" id="add">Add funds</button><button class="btn" id="out">Cash out</button></div></div>
    <div class="panel"><div style="display:flex;justify-content:space-between;align-items:baseline"><b style="font-size:18px">Are you up?</b><b class="money ${n >= 0 ? "pos" : "neg"}" style="font-size:22px">${n >= 0 ? "+" : ""}${money(n)}</b></div>
      <p style="color:var(--dim);font-size:13px;margin:4px 0 8px">Balance + collection value + cashed out − funds added. Free rewards count in your favor.</p>
      <div class="kv"><span>Packs opened</span><b>${S.packs.toLocaleString()}</b></div>
      <div class="kv"><span>Spent on packs</span><b class="money">${money(S.spent)}</b></div>
      <div class="kv"><span>Value pulled</span><b class="money">${money(S.pulled)}</b></div>
      <div class="kv"><span>Pull return</span><b>${S.spent ? Math.round(S.pulled / S.spent * 100) + "%" : "–"}</b></div>
      <div class="kv"><span>Funds added</span><b class="money">${money(S.deposited)}</b></div>
      <div class="kv"><span>Free rewards</span><b class="money">${money(S.bonus)}</b></div>
      <div class="kv"><span>Cashed out</span><b class="money">${money(S.withdrawn)}</b></div>
      <div class="kv"><span>Best pull</span><b>${best ? `${esc(best.n)} · ${money(best.v)}` : "–"}</b></div></div>
    ${S.withdrawals.length ? `<h3>Withdrawal history</h3><div class="panel" style="padding:4px 14px">${S.withdrawals.slice(0, 10).map(w => `<div class="row"><span style="color:var(--green);font-size:20px">✓</span><div class="grow"><b>Cash out</b><small>${new Date(w.at).toLocaleDateString([], { dateStyle: "medium" })}</small></div><b class="money">${money(w.a)}</b></div>`).join("")}</div>` : ""}
    <h3>Pack return</h3>
    <div class="panel" style="padding:6px 14px">${RETURNS.map(r => `<button class="row" data-rtp="${r.v}" style="width:100%;text-align:left"><div class="grow"><b>${r.name} · ${Math.round(r.v * 100)}%</b><small>${r.blurb}</small></div>${S.settings.rtp === r.v ? `<span style="color:var(--green);font-size:20px">✓</span>` : ""}</button>`).join("")}</div>
    <h3>Settings</h3>
    <div class="panel" style="padding:4px 14px">
      <label class="switch-row"><span>Sound</span><input type="checkbox" id="snd" ${S.settings.sound ? "checked" : ""}></label>
      <label class="switch-row"><span>Haptics<br><small style="color:var(--dim)">iPhone needs iOS 17.4 or later</small></span><input type="checkbox" id="hap" ${S.settings.haptics ? "checked" : ""}></label>
      <div class="kv"><span>Card prices from</span><b>${esc(DATA.updated)}</b></div>
    </div>
    <div class="btns"><a class="btn" href="../../" style="text-decoration:none;color:inherit">← Game of the Week</a><button class="btn red" id="reset">Reset everything</button></div>
  </div>`;
  $("#add").onclick = () => { haptic("tick"); sheetFunds(); };
  $("#out").onclick = () => { haptic("tick"); sheetCashOut(); };
  v.querySelectorAll("[data-rtp]").forEach(b => b.onclick = () => { S.settings.rtp = +b.dataset.rtp; persist(); pools.clear(); haptic("tick"); go("account"); });
  $("#snd").onchange = e => { S.settings.sound = e.target.checked; persist(); };
  $("#hap").onchange = e => { S.settings.haptics = e.target.checked; setHaptics(e.target.checked); persist(); haptic("ok"); };
  $("#reset").onclick = () => sheet(`<h2>Reset everything?</h2><p>Your balance, collection, history and stats are wiped. This can't be undone.</p>
    <div class="btns two"><button class="btn" id="no">Cancel</button><button class="btn red" id="yes">Reset</button></div>`,
    (sh, close) => { $("#no", sh).onclick = close; $("#yes", sh).onclick = () => { wipe(GAME); S = structuredClone(FRESH); shownBalance = null; persist(); close(); go("packs"); }; });
}

// ---------- start ----------
async function start() {
  document.body.innerHTML = `<div class="loading">Loading cards…</div>`;
  try {
    const raw = await (await fetch("data/cards.json")).json();
    const cards = raw.cards.map(([id, name, r, price, img, v]) => ({ id, name, r, price, img, v, set: id.slice(0, id.indexOf("-")) }));
    DATA = { updated: raw.updated, sets: raw.sets, cards, byId: new Map(cards.map(c => [c.id, c])) };
  } catch (e) {
    document.body.innerHTML = `<div class="loading">Couldn't load the card list. Check your connection and reload.</div>`;
    return;
  }
  // Packs whose sets aren't in the snapshot (or have too few cards) are hidden.
  for (let i = PACKS.length - 1; i >= 0; i--) { const ids = setIds(PACKS[i].sets); if (!ids.some(id => DATA.sets[id]) || poolFor(PACKS[i]).count < 6) PACKS.splice(i, 1); }
  for (const c of S.cards) if (c.s === "new") c.s = "vault";
  shell(); go("packs");
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("../../sw.js", { scope: "../../" }).catch(() => {});
}
start();
