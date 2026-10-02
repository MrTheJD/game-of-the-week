// Pack Rip: buy digital packs with play money, rip them, and pull real Pokémon cards at real market prices.
// Sell back at 100% of market value, keep them, fill set binders, level up, and chase grails.
import { load, save, wipe } from "../../shared/storage.js";
import { haptic, hapticButton, setHaptics } from "../../shared/haptics.js";
import { PACKS, CATEGORIES } from "./packs.js";
import { TIERS, MODES, buildPool, pull, rand } from "./odds.js";
import { sfx, setSound, confetti, coins, slam, tilt } from "./fx.js";
import * as M from "./meta.js";

const GAME = "pack-rip";
const BUYBACK_DAYS = 7;          // full market value for 7 days after the pull, like the real app
const LATE_BUYBACK = 0.9;        // after that, 90%
const DAILY = [2, 3, 5, 5, 10, 10, 25];
const QTYS = [1, 5, 10];
const RETURNS = [
  { v: 0.9, name: "Real app", blurb: "About what the real apps pay out. You'll slowly lose." },
  { v: 1, name: "Fair", blurb: "On average you get back exactly what you pay." },
  { v: 1.05, name: "Friendly", blurb: "A small edge in your favor. You'll slowly win." },
  { v: 1.15, name: "Generous", blurb: "Packs are worth more than they cost." },
];

const FRESH = {
  v: 2, balance: 0, deposited: 0, withdrawn: 0, bonus: 0, spent: 0, packs: 0, pulled: 0,
  cards: [], withdrawals: [], modes: {}, cat: "pokemon", sel: {}, rake: 0, qty: 1,
  daily: { day: null, streak: 0 }, freeDay: null, spinDay: null, welcomed: false,
  lv: 1, xp: 0, xp2Until: 0, pity: 0, tickets: {}, quests: null, ach: {}, achSeen: {}, done: {},
  st: { epics: 0, legends: 0, grails: 0, best: 0, bundles: 0 },
  settings: { rtp: 1.05, sound: true, haptics: true, fast: false },
};
let S = load(GAME, FRESH);
S.settings = { ...FRESH.settings, ...S.settings };
for (const k of Object.keys(FRESH)) if (S[k] === undefined) S[k] = structuredClone(FRESH[k]);
if (S.v < 2) {   // saves from the first version: rebuild the new stats from the pull history
  S.v = 2;
  for (const c of S.cards) { const i = TIERS.findIndex(t => t.id === c.t); if (i === 3) S.st.epics++; if (i === 4) S.st.legends++; if (i === 5) S.st.grails++; S.st.best = Math.max(S.st.best, c.v); }
  M.addXP(S, S.cards.reduce((s, c) => s + M.xpForPack(c.pp || 0), 0));
}
setHaptics(S.settings.haptics); setSound(S.settings.sound);
function persist() {
  // keep the save small: sold cards only matter for history, so keep the latest 1,500 of them
  const sold = S.cards.filter(c => c.s === "sold");
  if (sold.length > 1800) { const drop = new Set(sold.slice(1500).map(c => c.u)); S.cards = S.cards.filter(c => !drop.has(c.u)); }
  owned = null;
  if (!save(GAME, S)) toast("Storage is full: sell or ship some cards");
}

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
const tierIdx = (id) => Math.max(0, TIERS.findIndex(t => t.id === id));
const vault = () => S.cards.filter(c => c.s === "vault");
const buyback = (c) => round2(c.v * (Date.now() - c.at < BUYBACK_DAYS * 864e5 ? 1 : LATE_BUYBACK));
const vaultValue = () => round2(vault().reduce((s, c) => s + buyback(c), 0));
const net = () => round2(S.balance + vaultValue() + S.withdrawn - S.deposited);
const dur = (ms) => { const m = Math.max(0, Math.round(ms / 60000)); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; };
const wait = (ms) => new Promise(r => setTimeout(r, ms));
let owned = null;   // card ids you own right now (vault or shipped)
function ownedIds() { if (!owned) owned = new Set(S.cards.filter(c => c.s === "vault" || c.s === "shipped").map(c => c.id)); return owned; }
const stat = (k) => k === "packs" ? S.packs : k === "spent" ? S.spent : k === "lv" ? S.lv : k === "unique" ? ownedIds().size : k === "sets" ? Object.keys(S.done).length : (S.st[k] || 0);

let DATA = null;
const pools = new Map();
function poolFor(pack) {
  const mode = S.modes[pack.id] || "normal", hot = isHot(pack), key = `${pack.id}|${mode}|${S.settings.rtp}|${hot}`;
  if (!pools.has(key)) pools.set(key, buildPool(pack, DATA, mode, S.settings.rtp + (hot ? M.HOT_BOOST : 0)));
  return pools.get(key);
}
const isHot = (pack) => M.hotPack(PACKS).pack === pack;

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
    <nav class="tabs" id="tabs">${TABS.map(([id, name]) => `<button data-tab="${id}">${ICONS[id]}<span>${name}</span><i class="badge"></i></button>`).join("")}</nav>
    <div id="rip"></div>
    <div class="toast" id="toast"></div>`;
  $("#tabs").addEventListener("click", e => { const b = e.target.closest("button"); if (b) { haptic("tick"); sfx.tap(); go(b.dataset.tab); } });
}

function go(t) {
  if (t !== tab) { selectMode = false; selected.clear(); }
  tab = t;
  if (!(t === "collection" && selectMode)) { const bar = $(".selbar"); if (bar) bar.remove(); }
  document.querySelectorAll("#tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === t));
  renderTop(); badges();
  const v = $("#view"); v.scrollTop = 0; v.innerHTML = ""; v.onclick = null;
  clearInterval(tickerTimer); clearInterval(hotTimer);
  ({ packs: viewPacks, showroom: viewShowroom, collection: viewCollection, rewards: viewRewards, account: viewAccount })[t](v);
}

// Red dots on tabs when something is waiting.
function badges() {
  const day = today(), qs = M.questsFor(S, day);
  const rewards = S.daily.day !== day || S.freeDay !== day || S.spinDay !== day || S.rake >= 1
    || qs.some(q => q.prog >= q.n && !q.claimed) || M.ACHIEVEMENTS.some(a => !S.ach[a.id] && stat(a.stat) >= a.goal);
  const binders = Object.keys(DATA.sets).some(id => !S.done[id] && setComplete(id));
  const set = (id, on) => { const b = document.querySelector(`#tabs [data-tab="${id}"] .badge`); if (b) b.classList.toggle("on", !!on); };
  set("rewards", rewards); set("collection", binders);
}

let shownBalance = null;
function renderTop() {
  const top = $("#top");
  const left = tab === "packs"
    ? `<button class="cat-btn" id="cat">${esc(CATEGORIES.find(c => c.id === S.cat).name)} <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="m6 9 6 6 6-6"/></svg></button>`
    : `<div class="title">${TABS.find(x => x[0] === tab)[1]}</div>`;
  const rk = M.rank(S), pct = Math.min(100, S.xp / M.xpNeed(S.lv) * 100);
  top.className = "top" + (tab === "packs" ? "" : " solid");
  top.innerHTML = `${left}<div class="topr"><button class="lvl" id="lvl" style="--rk:${rk.color};--p:${pct}%" aria-label="Level ${S.lv}"><span>${S.lv}</span></button>
    <div class="bal"><div class="amt money" id="amt">${money(shownBalance ?? S.balance)}</div><button class="plus" id="plus" aria-label="Add funds"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><path d="M12 5v14M5 12h14"/></svg></button></div></div>`;
  $("#plus").onclick = () => { haptic("tick"); sheetFunds(); };
  $("#lvl").onclick = () => { haptic("tick"); go("rewards"); };
  const cat = $("#cat"); if (cat) cat.onclick = () => { haptic("tick"); sheetCategory(); };
  if (shownBalance !== S.balance) animateBalance();
}
function refreshLevel() {
  const b = $("#lvl"); if (!b) return;
  const rk = M.rank(S); b.style.setProperty("--rk", rk.color); b.style.setProperty("--p", Math.min(100, S.xp / M.xpNeed(S.lv) * 100) + "%"); b.querySelector("span").textContent = S.lv;
}
function animateBalance() {
  const els = [$("#amt"), $("#ripbal")].filter(Boolean);
  const from = shownBalance ?? S.balance, to = S.balance;
  shownBalance = to;
  for (const el of els) {
    if (from === to) { el.textContent = money(to); continue; }
    el.classList.remove("up", "down"); el.classList.add(to > from ? "up" : "down");
    const t0 = performance.now(), d = 700;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / d), e = 1 - Math.pow(1 - k, 3);
      el.textContent = money(from + (to - from) * e);
      if (k < 1) requestAnimationFrame(step); else setTimeout(() => el.classList.remove("up", "down"), 500);
    };
    requestAnimationFrame(step);
  }
}
function setBalance(delta) { S.balance = round2(S.balance + delta); persist(); animateBalance(); if (tab === "packs") updateBuy(); }

let toastTimer;
function toast(msg) {
  const t = $("#toast"); if (!t) return;
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove("show"), 2400);
}

// ---------- sheets ----------
function sheet(html, onOpen) {
  const scrim = h(`<div class="scrim"></div>`), sh = h(`<div class="sheet"><div class="grab"></div>${html}</div>`);
  document.body.append(scrim, sh);
  requestAnimationFrame(() => { scrim.classList.add("open"); sh.classList.add("open"); });
  const close = () => { scrim.classList.remove("open"); sh.classList.remove("open"); setTimeout(() => { scrim.remove(); sh.remove(); }, 300); };
  scrim.onclick = close;
  let y0 = null;
  sh.addEventListener("touchstart", e => { y0 = sh.scrollTop <= 0 ? e.touches[0].clientY : null; }, { passive: true });
  sh.addEventListener("touchmove", e => { if (y0 == null) return; const dy = e.touches[0].clientY - y0; if (dy > 0) { sh.style.transition = "none"; sh.style.transform = `translateY(${dy}px)`; } }, { passive: true });
  sh.addEventListener("touchend", e => { if (y0 == null) return; sh.style.transition = ""; const dy = e.changedTouches[0].clientY - y0; sh.style.transform = ""; if (dy > 90) close(); y0 = null; });
  onOpen && onOpen(sh, close);
  return close;
}

function sheetCategory() {
  sheet(`<h2>Packs</h2>${CATEGORIES.map(c => `<button class="row" data-c="${c.id}" style="width:100%;text-align:left"><div class="grow"><b>${esc(c.name)}</b><small>${packsIn(c.id).length} packs</small></div>${S.cat === c.id ? "✓" : ""}</button>`).join("")}`,
    (sh, close) => sh.addEventListener("click", e => { const b = e.target.closest("[data-c]"); if (!b) return; S.cat = b.dataset.c; persist(); haptic("tick"); close(); go("packs"); }));
}

function sheetFunds() {
  const amts = [10, 25, 50, 100, 500, 1000];
  sheet(`<h2>Add funds</h2><p>It's play money, so it's free. The Account tab keeps track of how much you've added, so you can see whether you're really up.</p>
    <div class="chips" style="margin:14px 0">${amts.map(a => `<button data-a="${a}">$${a.toLocaleString()}</button>`).join("")}</div>`,
    (sh, close) => sh.addEventListener("click", e => {
      const b = e.target.closest("[data-a]"); if (!b) return;
      const a = +b.dataset.a; S.deposited += a; setBalance(a); haptic("ok"); sfx.coin(); coins(b, $("#amt"), 8); toast(`Added ${money(a)}`); close();
      if (tab === "account") go("account");
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
    ${isHot(pack) ? `<p class="hotnote">🔥 Hot pack right now: +${M.HOT_BOOST * 100}% value for ${dur(M.hotPack(PACKS).ends - Date.now())}</p>` : ""}
    ${oddsBar(pool.tiers)}
    <div style="margin-top:6px">${pool.tiers.filter(t => t.cards.length).map(t => `
      <div class="row"><span class="dot" style="color:${t.color}"></span><div class="grow"><b>${t.name}</b><small>${short(t.min)} – ${short(t.max)} · ${t.cards.length.toLocaleString()} cards</small></div><b>${pct(t.p)}</b></div>`).join("")}</div>
    <p style="font-size:13px">Average pull: <b style="color:#fff">${money(pool.ev)}</b> (${Math.round(pool.ev / pack.price * 100)}% of the price). Odds style: ${MODES[pool.mode].name}. Every ${M.PITY} packs without an Epic, the next one is guaranteed Epic or better.</p>
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
  const t = c.t ? tierById(c.t) : tierFor(value, packPrice);
  return `<button class="tile ${extra}" data-card="${esc(c.id)}" ${c.u ? `data-u="${c.u}"` : ""} style="--tc:${t.color}">
    <img loading="lazy" src="${imgSmall(c)}" alt="${esc(c.name || c.n)}" onerror="this.style.visibility='hidden'">
    <div class="val"><span class="money">${short(value)}</span><i style="background:${t.color}"></i></div></button>`;
}
function tierFor(price, packPrice) { const r = price / packPrice; return TIERS.find(t => r >= t.lo && r < t.hi) || TIERS[0]; }

function cardViewer(imgUrl, html, onOpen) {
  return sheet(`<div class="tiltwrap"><div class="tiltcard" id="tc"><img src="${imgUrl}" alt=""><div class="shine"></div></div></div>${html}`, (sh, close) => {
    const tc = $("#tc", sh); tilt(tc, $(".shine", tc)); onOpen && onOpen(sh, close);
  });
}
function previewCard(c) {
  if (!c) return;
  const set = DATA.sets[c.set], have = ownedIds().has(c.id);
  cardViewer(imgLarge(c), `<h2 style="text-align:center;margin-bottom:4px">${esc(c.name)}</h2>
    <p style="text-align:center;margin:0">${esc(set ? set.name : c.set)} · ${esc(c.r || "")}</p>
    <p style="text-align:center;font-size:26px;font-weight:800;color:#fff;margin:8px 0">${money(c.price)}</p>
    <p style="text-align:center;margin:0">${have ? "✅ In your collection" : "Not in your collection yet"}</p>`);
}

// ---------- PACKS (store) ----------
let curPack = null, tickerTimer = 0, hotTimer = 0;
const FEED = [];
function packsIn(cat) { return PACKS.filter(p => p.cat === cat); }
function packArt(p, extra = "") {
  const L = p.look, logo = p.logo === "ball" || !DATA.sets[p.logo] ? `<div class="ball"></div>` : `<img src="${DATA.sets[p.logo].logo}" alt="" loading="lazy">`;
  const words = p.label.split(" "), lastWord = words.pop();
  return `<div class="pack ${L.style} ${extra}" style="--a:${L.a};--b:${L.b};--edge:${L.edge};--glow:${L.glow}">
    <div class="crimp t"></div>
    <div class="body"><div class="fx"></div>${L.style === "split" ? `<div class="lower"></div>` : ""}<div class="shine"></div><div class="sparkle"></div>
      <div class="brand"><div class="mark">R</div><div class="chip">PACK RIP</div></div>
      <div class="word">RIP</div>
      <div class="emblem">${logo}</div>
      <div class="plabel">${esc(words.join(" "))} <span>${esc(lastWord)}</span></div></div>
    <div class="crimp b"></div>${isHot(p) ? `<div class="hotrib">🔥 HOT +${M.HOT_BOOST * 100}%</div>` : ""}</div>`;
}

function viewPacks(v) {
  if (!packsIn(S.cat).length) S.cat = (CATEGORIES.find(c => packsIn(c.id).length) || CATEGORIES[0]).id;
  const list = packsIn(S.cat);
  curPack = list.find(p => p.id === S.sel[S.cat]) || list[0];
  v.innerHTML = `<div class="store" id="store" style="--glow:${curPack.look.glow}">
    <div class="rays"></div>
    <div class="ticker" id="ticker"></div>
    <div class="carousel" id="car">${list.map(p => `<div class="slide" data-p="${p.id}">${packArt(p)}<div class="ptag money">${isHot(p) ? "🔥 " : ""}${short(p.price)}</div></div>`).join("")}</div>
    <div class="pinfo"><div class="pname" id="pname"></div><div class="prow"><button class="inside" id="inside"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>What's Inside?</button></div></div>
    <div class="stats"><div class="stat"><small>Min Value</small><b class="money" id="pmin"></b></div><div class="stat mid"><small>Max Pull</small><b class="money" id="pmax"></b></div><div class="stat right"><small>Adjust Odds</small><button id="podds"></button></div></div>
    <div class="pity" id="pity"></div>
    <div class="buy-wrap"><div class="qty" id="qty">${QTYS.map(q => `<button data-q="${q}" class="${S.qty === q ? "on" : ""}">×${q}</button>`).join("")}</div>
      <div class="buy" id="buy" role="button" tabindex="0"><span id="buyt"></span></div><div id="ticketrow"></div></div></div>`;
  const car = $("#car"), slides = [...car.children];
  const fit = () => {
    const mid = car.scrollLeft + car.clientWidth / 2;
    let best = null, bestD = 1e9;
    for (const s of slides) {
      const c = s.offsetLeft + s.offsetWidth / 2, d = (c - mid) / s.offsetWidth, ad = Math.abs(d);
      const pk = s.firstElementChild;
      pk.style.transform = `translateZ(${-ad * 90}px) rotateY(${Math.max(-1.5, Math.min(1.5, d)) * -24}deg) scale(${1 - Math.min(ad, 1.5) * 0.18})`;
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
  car.addEventListener("click", e => {
    const s = e.target.closest(".slide"); if (!s) return;
    if (s.dataset.p !== curPack.id) s.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    else { const pk = s.firstElementChild; pk.classList.remove("wiggle"); void pk.offsetWidth; pk.classList.add("wiggle"); haptic("tick"); sfx.tick(3); }
  });
  $("#inside").onclick = () => { haptic("tick"); sheetInside(curPack); };
  $("#podds").onclick = () => { haptic("tick"); sheetOdds(curPack); };
  $("#qty").onclick = e => { const b = e.target.closest("[data-q]"); if (!b) return; S.qty = +b.dataset.q; persist(); haptic("tick"); sfx.tap(); $("#qty").querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b)); updateBuy(); };
  hapticButton($("#buy"), () => buy(curPack, S.qty));
  updatePackInfo();
  // Size the packs to the room left over, so the Buy button always shows without scrolling.
  const store = $("#store"), rest = [".ticker", ".pinfo", ".stats", ".pity", ".buy-wrap"].reduce((s, q) => s + $(q, store).offsetHeight, 0);
  const packH = Math.max(170, v.clientHeight - rest - 56);
  store.style.setProperty("--pw", Math.round(Math.min(230, Math.min(window.innerWidth * 0.56, packH * 0.63))) + "px");
  const start = slides.find(s => s.dataset.p === curPack.id);
  requestAnimationFrame(() => { car.scrollLeft = start.offsetLeft + start.offsetWidth / 2 - car.clientWidth / 2; fit(); });
  startTicker();
  hotTimer = setInterval(() => { if (tab === "packs") updatePackInfo(); }, 30000);
  if (!S.welcomed) welcome();
}

function startTicker() {
  const el = $("#ticker"); if (!el) return;
  const show = () => {
    let f = M.fakePull(PACKS, poolFor, pull);
    if (!f) return;
    FEED.unshift(f); FEED.length = Math.min(FEED.length, 30);
    const item = h(`<div class="tick"><i style="background:${f.tier.color}"></i><b>${esc(f.who)}</b> pulled <b style="color:${f.tier.color}">${esc(f.card.name)}</b> · ${short(f.card.price)}<span> · ${esc(f.pack.name)}</span></div>`);
    const old = el.firstElementChild;
    if (old) { old.classList.add("out"); setTimeout(() => old.remove(), 400); }
    el.appendChild(item);
  };
  show(); tickerTimer = setInterval(show, 3800);
}

function updatePackInfo() {
  if (tab !== "packs" || !curPack) return;
  const pool = poolFor(curPack);
  $("#store").style.setProperty("--glow", curPack.look.glow);
  const hot = isHot(curPack);
  $("#pname").innerHTML = `${esc(curPack.name)}${hot ? ` <span class="hotpill">🔥 ${dur(M.hotPack(PACKS).ends - Date.now())}</span>` : ""}`;
  $("#pmin").textContent = money(pool.min);
  $("#pmax").textContent = short(pool.max);
  $("#podds").innerHTML = `${MODES[S.modes[curPack.id] || "normal"].name} ›`;
  const left = M.PITY - S.pity;
  $("#pity").innerHTML = `<div class="pbar"><i style="width:${Math.min(100, S.pity / M.PITY * 100)}%"></i></div><span>${left <= 1 ? "⚡ Next pull is a guaranteed <b>Epic+</b>" : `⚡ Guaranteed <b>Epic+</b> in ${left} packs`}</span>`;
  updateBuy();
}
function updateBuy() {
  const b = $("#buy"); if (!b || !curPack) return;
  const cost = curPack.price * S.qty, poor = S.balance < cost;
  b.classList.toggle("poor", poor);
  b.style.setProperty("--glow", curPack.look.glow);
  $("#buyt").textContent = poor ? `Add funds (${money(cost)})` : S.qty === 1 ? `Buy for ${money(cost)}` : `Buy ${S.qty} for ${money(cost)}`;
  const n = S.tickets[curPack.id] || 0, tr = $("#ticketrow");
  tr.innerHTML = n ? `<div class="btn gold ticket" id="useticket" role="button">🎟 Use free ticket (${n})</div>` : "";
  if (n) hapticButton($("#useticket"), () => buy(curPack, 1, "ticket"));
}

function welcome() {
  S.welcomed = true; S.bonus += 100; setBalance(100);
  sheet(`<h2>Welcome to Pack Rip</h2><p>Here's <b style="color:#fff">$100</b> in play money to start. Pick a pack, rip it, and pull real Pokémon cards at real market prices.</p>
    <p>Sell what you pull for 100% of market value, or keep it to fill your set binders. Level up, finish daily quests and spin the wheel for more. Nothing here costs real money.</p>
    <div class="btns"><button class="btn green" id="ok">Let's rip</button></div>`, (sh, close) => { $("#ok", sh).onclick = () => { haptic("ok"); close(); }; });
}

// Buy n packs (free: "daily" | "ticket" | undefined)
function buy(pack, n = 1, free) {
  const cost = free ? 0 : pack.price * n;
  if (S.balance < cost) { sheetFunds(); return; }
  if (free === "ticket") { S.tickets[pack.id]--; if (!S.tickets[pack.id]) delete S.tickets[pack.id]; }
  const pool = poolFor(pack), recs = [];
  for (let i = 0; i < n; i++) {
    const r = pull(pool, S.pity >= M.PITY - 1 ? M.PITY_TIER : 0);
    const ti = TIERS.indexOf(TIERS.find(t => t.id === r.tier.id));
    S.pity = ti >= M.PITY_TIER ? 0 : S.pity + 1;
    if (ti === 3) S.st.epics++; if (ti === 4) S.st.legends++; if (ti === 5) S.st.grails++;
    S.st.best = Math.max(S.st.best, r.card.price);
    recs.push({ u: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), id: r.card.id, n: r.card.name, set: r.card.set, r: r.card.r, v: r.card.price,
      img: r.card.img, t: r.tier.id, pk: pack.id, pp: free ? 0 : pack.price, at: Date.now(), s: "new" });
  }
  if (cost) { setBalance(-cost); S.spent = round2(S.spent + cost); S.rake = round2(S.rake + cost * M.rank(S).rate); }
  S.packs += n; S.pulled = round2(S.pulled + recs.reduce((s, r) => s + r.v, 0));
  if (n >= 10) S.st.bundles++;
  const ups = M.addXP(S, M.xpForPack(pack.price) * n * (Date.now() < S.xp2Until ? 2 : 1));
  const day = today();
  const doneQ = [...M.questProgress(S, day, { k: "rip", n }), ...M.questProgress(S, day, { k: "spend", n: cost }),
    ...M.questProgress(S, day, { k: "tier", t: Math.max(...recs.map(r => tierIdx(r.t))) }), ...(n >= 10 ? M.questProgress(S, day, { k: "multi" }) : [])];
  S.cards.unshift(...recs);
  persist(); refreshLevel();
  haptic("buy"); sfx.buy();
  openRip(pack, recs, free, ups, doneQ);
}

// ---------- RIP ----------
function openRip(pack, recs, free, ups, doneQ) {
  const rip = $("#rip"), n = recs.length;
  // reveal the best card last
  const order = recs.slice().sort((a, b) => a.v - b.v);
  rip.style.setProperty("--glow", pack.look.glow);
  rip.style.setProperty("--tier", TIERS[0].color);
  rip.innerHTML = `<div class="rays"></div><div class="dim"></div><div class="flash"></div>
    <button class="close" id="rclose" aria-label="Close">✕</button>
    <div class="riptop"><span class="count" id="count">${n > 1 ? `1 / ${n}` : ""}</span><span class="ripbal money" id="ripbal">${money(S.balance)}</span></div>
    <div class="stage" id="stage">
      <div class="card3d" id="c3d"><div class="flip" id="flip"><div class="face back"><div class="logo">R</div><div class="backglow"></div></div><div class="face front"><img id="cimg" alt=""><div class="holo"></div></div></div></div>
      <div class="ripack" id="rpk"><div class="ghost">${packArt(pack)}</div><div class="half top-half">${packArt(pack)}</div><div class="half bot-half">${packArt(pack)}</div><div class="tear" id="tear"></div>${n > 1 ? `<div class="bundle">×${n}</div>` : ""}</div>
    </div>
    <div class="hint" id="hint">${S.settings.fast ? "Tap to rip" : "Swipe across the top to rip →"}</div>
    <div class="tray" id="tray"></div>
    <button class="skip" id="skip" style="display:none">Skip ››</button>
    <div class="result" id="res"></div>`;
  rip.classList.add("open");
  shownBalance = S.balance;
  const preload = order.map(r => { const im = new Image(); im.src = imgLarge(r); return im; });
  let stage = "pack", idx = 0, busy = false;
  const c3d = $("#c3d"), img = $("#cimg"), hint = $("#hint");

  // ---- tear ----
  const rpk = $("#rpk"), tear = $("#tear");
  let x0 = null, prog = 0, lastBuzz = 0;
  const torn = () => {
    if (stage !== "pack") return; stage = "torn";
    tear.style.width = "100%"; sfx.tear(); haptic("hit");
    rpk.classList.add("torn"); hint.textContent = "";
    if (n > 1) $("#skip").style.display = "";
    setTimeout(() => showCard(0), 350);
  };
  rpk.addEventListener("pointerdown", e => { x0 = e.clientX; rpk.setPointerCapture(e.pointerId); rpk.classList.add("held"); });
  rpk.addEventListener("pointermove", e => {
    if (x0 == null || stage !== "pack") return;
    prog = Math.max(prog, Math.min(1, (e.clientX - x0) / (rpk.offsetWidth * 0.8)));
    tear.style.width = prog * 100 + "%";
    if (prog - lastBuzz > 0.15) { lastBuzz = prog; haptic("tick"); sfx.tick(Math.round(prog * 8)); }
    if (prog >= 0.75) torn();
  });
  rpk.addEventListener("pointerup", e => {
    rpk.classList.remove("held");
    if (stage === "pack" && Math.abs(e.clientX - (x0 ?? e.clientX)) < 8) { tear.style.transition = "width .3s"; tear.style.width = "100%"; setTimeout(torn, 260); }
    x0 = null;
  });

  // ---- one card ----
  function showCard(i) {
    idx = i; const r = order[i];
    c3d.className = "card3d"; c3d.style.transform = "";
    rip.style.setProperty("--tier", TIERS[0].color);
    img.src = imgLarge(r); img.onerror = () => { img.onerror = null; img.src = imgSmall(r); };
    $("#count").textContent = n > 1 ? `${i + 1} / ${n}` : "";
    $("#res").classList.remove("show");
    void c3d.offsetWidth;
    c3d.classList.add("up"); sfx.rise();
    setTimeout(() => { stage = "back"; hint.textContent = n > 1 ? `Tap to reveal · ${i + 1} of ${n}` : "Tap to reveal"; }, 450);
  }
  tilt(c3d, $(".holo", c3d));
  // Tapping the card: reveal it, or (multi) move on to the next one.
  hapticButton(c3d, () => {
    if (busy) return;
    if (stage === "back") reveal(order[idx]);
    else if (stage === "shown" && n > 1 && idx < n - 1) next();
  });

  async function reveal(r, quick = false) {
    busy = true; stage = "revealing"; hint.textContent = "";
    const ti = tierIdx(r.t), tier = TIERS[ti];
    // the tease: the glow climbs tier by tier up to what you pulled
    if (!quick) {
      c3d.classList.add("charging");
      for (let s = 0; s <= ti; s++) {
        rip.style.setProperty("--tier", TIERS[s].color);
        c3d.classList.remove("pulse"); void c3d.offsetWidth; c3d.classList.add("pulse");
        sfx.step(s); if (s) haptic("tick");
        if (s === 3 && ti >= 4) { rip.classList.add("dark"); sfx.rumble(); c3d.classList.add("quake"); haptic("hit"); }
        await wait(s < ti ? (s >= 3 ? 520 : 300) : 120);
      }
      c3d.classList.remove("charging", "quake");
    }
    rip.style.setProperty("--tier", tier.color);
    try { await Promise.race([preload[order.indexOf(r)].decode(), wait(2000)]); } catch { /* show what we have */ }
    sfx.flip(); c3d.classList.add("flipped");
    await wait(quick ? 250 : 480);
    revealed(r, ti, quick);
    busy = false;
  }

  function revealed(r, ti, quick) {
    stage = "shown";
    const tier = TIERS[ti];
    sfx.reveal(ti);
    if (ti >= 3) {
      $(".flash", rip).classList.remove("go"); void rip.offsetWidth; $(".flash", rip).classList.add("go");
      c3d.classList.add("shiny");
      confetti([tier.color, "#fff", "#ffd66b"], ti - 2);
      slam(ti === 5 ? "GRAIL!!" : ti === 4 ? "LEGENDARY!" : "EPIC!", tier.color, ti === 5);
    }
    if (ti >= 4) { c3d.classList.add("shake"); haptic("big"); } else haptic(ti >= 2 ? "hit" : "ok");
    setTimeout(() => rip.classList.remove("dark"), 900);
    if (n === 1) singleResult(r, ti);
    else {
      const set = DATA.sets[r.set];
      $("#res").innerHTML = `<div style="text-align:center"><span class="tierban">${tier.name.toUpperCase()}</span>
        <div class="rname">${esc(r.n)}</div><div class="rsub">${esc(set ? set.name : r.set)}</div><div class="rval money" id="rv">$0.00</div></div>
        ${idx < n - 1 ? `<div class="btns"><div role="button" class="btn" id="nextc">Next card ›</div></div>` : ""}`;
      $("#res").classList.add("show");
      countUp($("#rv"), r.v, ti >= 4 ? 1200 : 500);
      if (idx < n - 1) { hint.textContent = ""; hapticButton($("#nextc"), () => { if (!busy) next(); }); }
      else setTimeout(summary, quick ? 300 : 1300);
    }
  }

  function next() {
    // the shown card shrinks into the tray
    const r = order[idx];
    addToTray(r);
    c3d.classList.add("away");
    stage = "moving";
    setTimeout(() => showCard(idx + 1), 260);
  }
  function addToTray(r) {
    const t = TIERS[tierIdx(r.t)];
    const th = h(`<div class="tthumb" style="--tc:${t.color}"><img src="${imgSmall(r)}" alt=""></div>`);
    $("#tray").appendChild(th);
  }

  $("#skip").onclick = async () => {
    if (busy || stage === "pack") return;
    haptic("tick");
    $("#skip").style.display = "none";
    // reveal the best remaining one with full effect, the rest instantly
    const rest = order.slice(idx + (stage === "shown" ? 1 : 0));
    if (stage === "shown") addToTray(order[idx]);
    for (const r of rest.slice(0, -1)) addToTray(r);
    idx = n - 1;
    const best = order[n - 1];
    c3d.className = "card3d up"; img.src = imgLarge(best);
    await wait(80);
    reveal(best, tierIdx(best.t) < 3);
  };

  // ---- single card result ----
  function singleResult(r, ti) {
    const tier = TIERS[ti], set = DATA.sets[r.set], paid = r.pp, d = round2(r.v - paid);
    $("#res").innerHTML = `<div style="text-align:center">
      <span class="tierban">${tier.name.toUpperCase()}</span>
      <div class="rname">${esc(r.n)}${ownedIds().has(r.id) ? "" : ` <span class="newtag">NEW</span>`}</div><div class="rsub">${esc(set ? set.name : r.set)}${r.r ? " · " + esc(r.r) : ""}</div>
      <div class="rval money"><span id="rv">$0.00</span>${paid ? `<span class="delta ${d >= 0 ? "pos" : "neg"}">${d >= 0 ? "+" : "−"}${money(Math.abs(d))}</span>` : `<span class="delta pos">FREE</span>`}</div></div>
      <div class="btns two" id="acts"><div role="button" class="btn" id="keep">Keep</div><div role="button" class="btn green" id="sell">Sell ${money(r.v)}</div></div>`;
    $("#res").classList.add("show");
    countUp($("#rv"), r.v, ti >= 4 ? 1400 : 700);
    hapticButton($("#sell"), () => decide([r], [], $("#sell")));
    hapticButton($("#keep"), () => decide([], [r], $("#keep")));
  }

  // ---- bundle summary ----
  function summary() {
    stage = "summary";
    $("#skip").style.display = "none"; hint.textContent = ""; $("#count").textContent = "";
    $("#stage").classList.add("gone"); $("#tray").classList.add("gone");
    const total = round2(order.reduce((s, r) => s + r.v, 0)), paid = order.reduce((s, r) => s + r.pp, 0), d = round2(total - paid);
    const sorted = order.slice().sort((a, b) => b.v - a.v), mark = new Set();
    $("#res").classList.add("show", "sum");
    const draw = () => {
      const sellSum = round2(sorted.filter(r => mark.has(r.u)).reduce((s, r) => s + r.v, 0));
      $("#res").innerHTML = `<div class="sumhead"><div><small>Bundle of ${n}</small><div class="rval money">${money(total)} ${paid ? `<span class="delta ${d >= 0 ? "pos" : "neg"}">${d >= 0 ? "+" : "−"}${money(Math.abs(d))}</span>` : ""}</div></div></div>
        <p class="sumhint">Tap cards to mark them to sell. The rest go to your collection.</p>
        <div class="sumgrid">${sorted.map(r => { const t = TIERS[tierIdx(r.t)]; return `<button class="stile ${mark.has(r.u) ? "sell" : ""}" data-u="${r.u}" style="--tc:${t.color}"><img src="${imgSmall(r)}" alt=""><div class="sv money">${short(r.v)}</div>${ownedIds().has(r.id) ? "" : `<div class="snew">NEW</div>`}</button>`; }).join("")}</div>
        <div class="btns two" id="acts"><div role="button" class="btn" id="keepall">${mark.size ? `Sell ${mark.size}, keep ${n - mark.size}` : "Keep all"}</div><div role="button" class="btn green" id="sellall">Sell all ${money(total)}</div></div>`;
      $("#res").querySelector(".sumgrid").onclick = e => { const b = e.target.closest("[data-u]"); if (!b) return; mark.has(b.dataset.u) ? mark.delete(b.dataset.u) : mark.add(b.dataset.u); haptic("tick"); sfx.tap(); draw(); };
      hapticButton($("#keepall"), () => decide(sorted.filter(r => mark.has(r.u)), sorted.filter(r => !mark.has(r.u)), $("#keepall")));
      hapticButton($("#sellall"), () => decide(sorted, [], $("#sellall")));
    };
    draw();
  }

  // ---- sell / keep ----
  function decide(sell, keep, fromEl) {
    const day = today(), before = ownedIds();
    const sum = round2(sell.reduce((s, r) => s + r.v, 0));
    for (const r of sell) { r.s = "sold"; r.sv = r.v; r.st = Date.now(); }
    const fresh = new Set(keep.filter(r => !before.has(r.id)).map(r => r.id)).size;
    for (const r of keep) r.s = "vault";
    if (sum) { setBalance(sum); sfx.coin(); coins(fromEl, $("#ripbal"), Math.min(18, 4 + sell.length * 2)); doneQ.push(...M.questProgress(S, day, { k: "sell", n: sum })); }
    if (keep.length) { doneQ.push(...M.questProgress(S, day, { k: "keep", n: keep.length })); if (fresh) doneQ.push(...M.questProgress(S, day, { k: "new", n: fresh })); }
    persist();
    toast(sum && keep.length ? `Sold ${money(sum)} · kept ${keep.length}` : sum ? `Sold for ${money(sum)}` : fresh ? `Kept · ${fresh} new for your binders` : "Added to your collection");
    // newly finished sets
    for (const id of new Set(keep.map(r => r.set))) if (!S.done[id] && setComplete(id)) { setTimeout(() => { slam("SET COMPLETE!", "#ffd66b", true); confetti(["#ffd66b", "#fff", "#2fbf71"], 3); sfx.win(); }, 500); toast(`📘 ${DATA.sets[id].name} complete! Claim it in Binders`); }
    const again = free !== "daily" && (free === "ticket" ? (S.tickets[pack.id] || 0) > 0 : S.balance >= pack.price * n);
    const label = free === "daily" ? "See packs" : free === "ticket" ? (again ? `Use another ticket` : "See packs") : again ? `Rip again ${n > 1 ? "×" + n + " " : ""}${money(pack.price * n)}` : "Add funds";
    $("#acts").outerHTML = `<div class="btns two"><button class="btn" id="back">Done</button><div role="button" class="btn ${again ? "green pulsebtn" : ""}" id="again">${label}</div></div>`;
    $("#back").onclick = () => { haptic("tick"); closeRip(); };
    hapticButton($("#again"), () => {
      if (!again) { closeRip(); if (free !== "daily" && free !== "ticket") sheetFunds(); return; }
      buy(pack, n, free === "ticket" ? "ticket" : undefined);
    });
    afterRip(ups, doneQ);
    ups = []; doneQ = [];
  }
  $("#rclose").onclick = () => closeRip();
}

// Level-ups and finished quests, shown once the cards are dealt with.
function afterRip(ups, doneQ) {
  if (doneQ.length) setTimeout(() => { sfx.win(); toast(`✅ Quest done: ${doneQ[0].text}. Claim in Rewards`); }, 900);
  if (!ups.length) return;
  let cash = 0; const tickets = [];
  for (const lv of ups) { const r = M.levelReward(lv, PACKS); cash += r.cash; if (r.ticket) { tickets.push(r.ticket); S.tickets[r.ticket.id] = (S.tickets[r.ticket.id] || 0) + 1; } }
  S.bonus = round2(S.bonus + cash); setBalance(cash);
  const lv = ups[ups.length - 1], rk = M.rank(S), newRank = M.RANKS.find(r => r.at === lv);
  setTimeout(() => {
    const ov = h(`<div class="levelup"><div class="lvring" style="--rk:${rk.color}"><small>LEVEL</small><b>${lv}</b></div>
      ${newRank ? `<div class="lvrank" style="color:${rk.color}">${rk.name} rank! ${Math.round(rk.rate * 100)}% rakeback</div>` : ""}
      <div class="lvrew">+${money(cash)}${tickets.map(t => `<div>🎟 Free ${esc(t.name)}</div>`).join("")}</div>
      <button class="btn green" style="max-width:260px">Nice!</button></div>`);
    document.body.appendChild(ov);
    sfx.level(); haptic("big"); confetti([rk.color, "#fff", "#ffd66b", "#2fbf71"], 3, 0.35);
    ov.querySelector("button").onclick = () => { ov.classList.add("out"); setTimeout(() => ov.remove(), 300); };
  }, 700);
  refreshLevel();
}

function closeRip() {
  for (const c of S.cards) if (c.s === "new") c.s = "vault";
  persist();
  $("#rip").classList.remove("open", "dark"); $("#rip").innerHTML = "";
  go(tab);
}
function countUp(el, to, d) {
  const t0 = performance.now();
  const step = (t) => { const k = Math.min(1, (t - t0) / d), e = 1 - Math.pow(1 - k, 3); el.textContent = money(to * e); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

// ---------- SHOWROOM ----------
function viewShowroom(v) {
  const best = S.cards.filter(c => c.s !== "sold").sort((a, b) => b.v - a.v).slice(0, 12);
  const bestEver = S.cards.slice().sort((a, b) => b.v - a.v).slice(0, 12);
  const packs = PACKS.slice().sort((a, b) => a.price - b.price);
  while (FEED.length < 8) { const f = M.fakePull(PACKS, poolFor, pull); if (!f) break; FEED.push(f); }
  v.innerHTML = `<div class="pad">
    <h3 style="margin-top:6px">Live hits</h3>
    <div class="hscroll">${FEED.slice(0, 12).map(f => `<button class="case" data-card="${esc(f.card.id)}"><div class="glass" style="--tc:${f.tier.color}"><img loading="lazy" src="${imgSmall(f.card)}" alt=""></div><div class="plinth"></div><b class="money" style="color:${f.tier.color}">${short(f.card.price)}</b><small>${esc(f.who)}</small></button>`).join("")}</div>
    <h3>Your display case</h3>
    ${best.length ? `<div class="hscroll">${best.map(c => `<button class="case" data-u="${c.u}"><div class="glass" style="--tc:${tierById(c.t).color}"><img loading="lazy" src="${imgSmall(c)}" alt=""></div><div class="plinth"></div><b class="money">${short(c.v)}</b><small>${esc(c.n)}</small></button>`).join("")}</div>`
      : `<div class="panel empty">Cards you keep go on display here. Go rip a pack!</div>`}
    ${bestEver.length ? `<h3>Best pulls ever</h3><div class="hscroll">${bestEver.map(c => `<button class="case" data-u="${c.u}"><div class="glass" style="--tc:${tierById(c.t).color}"><img loading="lazy" src="${imgSmall(c)}" alt=""></div><div class="plinth"></div><b class="money">${short(c.v)}</b><small>${esc(c.n)}${c.s === "sold" ? " (sold)" : ""}</small></button>`).join("")}</div>` : ""}
    ${packs.map(p => { const pool = poolFor(p); return `<h3>${esc(p.name)} · ${short(p.price)} <span style="text-transform:none;letter-spacing:0;font-weight:500">chase cards</span></h3>
      <div class="hscroll">${pool.top.slice(0, 8).map(c => `<button class="case" data-card="${esc(c.id)}"><div class="glass"><img loading="lazy" src="${imgSmall(c)}" alt=""></div><div class="plinth"></div><b class="money">${short(c.price)}</b><small>${esc(c.name)}</small></button>`).join("")}</div>`; }).join("")}
  </div>`;
  v.onclick = e => {
    const u = e.target.closest("[data-u]"); if (u) return cardSheet(S.cards.find(c => c.u === u.dataset.u));
    const c = e.target.closest("[data-card]"); if (c) previewCard(DATA.byId.get(c.dataset.card));
  };
}

// ---------- COLLECTION ----------
let colTab = "vault", colSort = "value", selectMode = false, binderSort = "progress";
const selected = new Set();
function setCards(id) { return DATA.bySet.get(id) || []; }
function setHave(id) { const o = ownedIds(); return setCards(id).filter(c => o.has(c.id)).length; }
function setComplete(id) { const all = setCards(id); return all.length > 0 && setHave(id) === all.length; }
const setReward = (id) => Math.round(20 + setCards(id).reduce((s, c) => s + c.price, 0) * 0.05);

function viewCollection(v) {
  const vc = vault(), shipped = S.cards.filter(c => c.s === "shipped");
  const segs = [["vault", "Vault"], ["binders", "Binders"], ["shipped", "Shipped"], ["history", "History"]];
  let body = "";
  if (colTab === "binders") body = bindersHTML();
  else {
    let list = colTab === "vault" ? vc : colTab === "shipped" ? shipped : S.cards;
    list = list.slice().sort(colSort === "value" ? (a, b) => b.v - a.v : (a, b) => b.at - a.at);
    body = `${colTab !== "history" ? `<div class="seg" style="margin-bottom:14px;max-width:240px" id="csort"><button data-s="value" class="${colSort === "value" ? "on" : ""}">Value</button><button data-s="new" class="${colSort === "new" ? "on" : ""}">Newest</button></div>` : ""}
    ${!list.length ? `<div class="empty">${colTab === "vault" ? "Cards you keep land here. Sell them back any time." : colTab === "shipped" ? "Cards you ship home live here for good." : "Every card you pull shows up here."}</div>`
      : colTab === "history" ? `<div class="panel" style="padding:4px 14px">${list.slice(0, 200).map(c => `<div class="row hist" data-u="${c.u}"><img loading="lazy" src="${imgSmall(c)}" alt=""><div class="grow"><b>${esc(c.n)}</b><small>${esc((PACKS.find(p => p.id === c.pk) || {}).name || "")}${c.pp ? "" : " (free)"} · ${new Date(c.at).toLocaleDateString()}</small></div><div style="text-align:right"><b class="money">${money(c.v)}</b><small>${c.s === "sold" ? `<span class="pos">Sold</span>` : c.s === "shipped" ? "Shipped" : "In vault"}</small></div></div>`).join("")}</div>`
      : `<div class="grid" id="cgrid">${list.slice(0, 600).map(c => tileHTML(c, colTab === "vault" ? buyback(c) : c.v, c.pp || 1, selected.has(c.u) ? "sel" : "")).join("")}</div>${list.length > 600 ? `<p class="empty">Showing your top 600 of ${list.length.toLocaleString()}.</p>` : ""}`}`;
  }
  const u = ownedIds().size;
  v.innerHTML = `<div class="pad">
    <div class="panel" style="display:flex;justify-content:space-between;align-items:center">
      <div><small style="color:var(--dim)">Collection value</small><div class="bigval money">${money(vaultValue())}</div><small style="color:var(--dim)">${vc.length.toLocaleString()} in your vault · ${u.toLocaleString()} of ${DATA.cards.length.toLocaleString()} cards collected</small></div>
      ${colTab === "vault" && vc.length ? `<button class="btn" style="width:auto;height:40px" id="selbtn">${selectMode ? "Cancel" : "Select"}</button>` : ""}
    </div>
    <div class="seg" style="margin:14px 0 10px" id="ctabs">${segs.map(([id, n]) => `<button data-t="${id}" class="${colTab === id ? "on" : ""}">${n}</button>`).join("")}</div>
    ${body}
    <div style="height:${selectMode ? 80 : 0}px"></div></div>`;
  $("#ctabs").onclick = e => { const b = e.target.closest("[data-t]"); if (b) { colTab = b.dataset.t; selectMode = false; selected.clear(); haptic("tick"); go("collection"); } };
  const cs = $("#csort"); if (cs) cs.onclick = e => { const b = e.target.closest("[data-s]"); if (b) { colSort = b.dataset.s; haptic("tick"); go("collection"); } };
  const bs = $("#bsort"); if (bs) bs.onclick = e => { const b = e.target.closest("[data-s]"); if (b) { binderSort = b.dataset.s; haptic("tick"); go("collection"); } };
  const sb = $("#selbtn"); if (sb) sb.onclick = () => { selectMode = !selectMode; selected.clear(); haptic("tick"); go("collection"); };
  v.querySelectorAll("[data-u]").forEach(el => el.addEventListener("click", () => {
    const c = S.cards.find(x => x.u === el.dataset.u);
    if (selectMode) { selected.has(c.u) ? selected.delete(c.u) : selected.add(c.u); el.classList.toggle("sel"); haptic("tick"); renderSelBar(); }
    else cardSheet(c);
  }));
  v.querySelectorAll("[data-set]").forEach(el => el.addEventListener("click", () => { haptic("tick"); binderSheet(el.dataset.set); }));
  v.querySelectorAll("[data-claimset]").forEach(el => el.addEventListener("click", e => { e.stopPropagation(); claimSet(el.dataset.claimset, el); }));
  if (selectMode) renderSelBar();
}

function bindersHTML() {
  const ids = Object.keys(DATA.sets);
  const rows = ids.map(id => ({ id, s: DATA.sets[id], have: setHave(id), all: setCards(id).length })).filter(r => r.all);
  const doneN = rows.filter(r => r.have === r.all).length;
  rows.sort(binderSort === "progress" ? (a, b) => (b.have / b.all) - (a.have / a.all) || b.s.date.localeCompare(a.s.date) : (a, b) => b.s.date.localeCompare(a.s.date));
  return `<div class="seg" style="margin-bottom:14px;max-width:280px" id="bsort"><button data-s="progress" class="${binderSort === "progress" ? "on" : ""}">Progress</button><button data-s="date" class="${binderSort === "date" ? "on" : ""}">Newest set</button></div>
    <p class="sumhint" style="margin-top:0">${rows.length} sets · ${doneN} complete. Finish a set to claim a bonus. Selling a card takes it out of your binder.</p>
    <div class="binders">${rows.map(r => { const p = r.have / r.all, done = r.have === r.all, claimed = S.done[r.id];
      return `<div class="binder ${done ? "done" : ""}" data-set="${r.id}" role="button">
        <div class="blogo"><img loading="lazy" src="${r.s.logo}" alt=""></div>
        <div class="grow"><b>${esc(r.s.name)}</b><small>${esc(r.s.series)} · ${r.s.date.slice(0, 4)}</small>
          <div class="prog"><i style="width:${p * 100}%"></i></div><small>${r.have} / ${r.all}${done ? (claimed ? " · ✅ Complete" : "") : ""}</small></div>
        ${done && !claimed ? `<button class="btn gold claim" data-claimset="${r.id}">Claim ${money(setReward(r.id))}</button>` : ""}</div>`; }).join("")}</div>`;
}
function claimSet(id, el) {
  if (S.done[id] || !setComplete(id)) return;
  const amt = setReward(id); S.done[id] = Date.now(); S.bonus = round2(S.bonus + amt); setBalance(amt);
  sfx.win(); haptic("big"); confetti(["#ffd66b", "#fff", "#2fbf71"], 3); coins(el, $("#amt"), 14); toast(`📘 Set bonus +${money(amt)}`);
  setTimeout(() => go("collection"), 900);
}
function binderSheet(id) {
  const s = DATA.sets[id], all = setCards(id), o = ownedIds();
  const counts = new Map(); for (const c of S.cards) if (c.s === "vault" || c.s === "shipped") counts.set(c.id, (counts.get(c.id) || 0) + 1);
  const have = all.filter(c => o.has(c.id)).length, value = round2(all.reduce((t, c) => t + c.price, 0));
  sheet(`<div style="text-align:center"><img src="${s.logo}" alt="" style="max-height:56px;max-width:70%"><h2 style="margin:8px 0 2px">${esc(s.name)}</h2>
    <p style="margin:0">${have} of ${all.length} collected · whole set worth ${money(value)}</p><div class="prog"><i style="width:${have / all.length * 100}%"></i></div>
    <p style="margin:4px 0 12px">Complete it for a ${money(setReward(id))} bonus.</p></div>
    <div class="grid bgrid">${all.map(c => `<button class="tile ${o.has(c.id) ? "" : "missing"}" data-card="${esc(c.id)}"><img loading="lazy" src="${imgSmall(c)}" alt="" onerror="this.style.visibility='hidden'"><div class="val"><span class="money">${short(c.price)}</span>${counts.get(c.id) > 1 ? `<span>×${counts.get(c.id)}</span>` : ""}</div></button>`).join("")}</div>`,
    (sh) => sh.addEventListener("click", e => { const t = e.target.closest("[data-card]"); if (t) previewCard(DATA.byId.get(t.dataset.card)); }));
}

function renderSelBar() {
  let bar = $(".selbar");
  if (!bar) { bar = h(`<div class="selbar"></div>`); document.body.appendChild(bar); }
  const cards = S.cards.filter(c => selected.has(c.u)), total = round2(cards.reduce((s, c) => s + buyback(c), 0));
  bar.innerHTML = `<button class="btn" id="selall" style="flex:1">${selected.size === vault().length ? "None" : "All"}</button><button class="btn" id="seldupes" style="flex:1">Dupes</button><button class="btn green" id="sellsel" style="flex:2" ${cards.length ? "" : "disabled"}>Sell ${cards.length || ""} for ${money(total)}</button>`;
  $("#selall").onclick = () => { if (selected.size === vault().length) selected.clear(); else vault().forEach(c => selected.add(c.u)); haptic("tick"); go("collection"); };
  // select every extra copy (keeps one of each card for the binders)
  $("#seldupes").onclick = () => {
    selected.clear(); const seen = new Set(S.cards.filter(c => c.s === "shipped").map(c => c.id));
    for (const c of vault().sort((a, b) => b.v - a.v)) { if (seen.has(c.id)) selected.add(c.u); else seen.add(c.id); }
    haptic("tick"); go("collection"); toast(selected.size ? `${selected.size} duplicates selected` : "No duplicates");
  };
  $("#sellsel").onclick = () => {
    for (const c of cards) { c.sv = buyback(c); c.s = "sold"; c.st = Date.now(); }
    M.questProgress(S, today(), { k: "sell", n: total });
    setBalance(total); sfx.coin(); haptic("ok"); coins($("#sellsel"), $("#amt"), 12); toast(`Sold ${cards.length} for ${money(total)}`);
    selected.clear(); selectMode = false; go("collection");
  };
}
function cardSheet(c) {
  if (!c) return;
  const set = DATA.sets[c.set], t = tierById(c.t), pack = PACKS.find(p => p.id === c.pk);
  const left = BUYBACK_DAYS * 864e5 - (Date.now() - c.at), bb = buyback(c);
  cardViewer(imgLarge(c), `<div style="text-align:center"><span class="tierban" style="--tier:${t.color}">${t.name.toUpperCase()}</span>
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
      const s = $("#sell", sh); if (s) hapticButton(s, () => { c.s = "sold"; c.sv = bb; c.st = Date.now(); M.questProgress(S, today(), { k: "sell", n: bb }); setBalance(bb); sfx.coin(); coins(s, $("#amt"), 8); toast(`Sold for ${money(bb)}`); close(); setTimeout(() => go(tab), 300); });
      const p = $("#ship", sh); if (p) p.onclick = () => {
        haptic("tick");
        sheet(`<h2>Ship ${esc(c.n)}?</h2><p>It leaves your vault and goes in Shipped for good. You won't be able to sell it back, but it's yours forever and it still counts in your binders.</p>
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
  const rk = M.rank(S), nx = M.RANKS[M.RANKS.indexOf(rk) + 1];
  const freeUsed = S.freeDay === t, spun = S.spinDay === t, qs = M.questsFor(S, t);
  const achs = M.ACHIEVEMENTS.map(a => ({ ...a, have: stat(a.stat), claimed: !!S.ach[a.id] })).sort((a, b) => (b.have >= b.goal && !b.claimed) - (a.have >= a.goal && !a.claimed) || a.claimed - b.claimed);
  const N = M.WHEEL.length, seg = 360 / N;
  v.innerHTML = `<div class="pad">
    <div class="panel lvpanel" style="--rk:${rk.color}"><div class="lvbig"><b>${S.lv}</b><small>LEVEL</small></div>
      <div class="grow"><b style="font-size:18px;color:${rk.color}">${rk.name} rank</b><div class="prog"><i style="width:${S.xp / M.xpNeed(S.lv) * 100}%"></i></div>
      <small style="color:var(--dim)">${S.xp.toLocaleString()} / ${M.xpNeed(S.lv).toLocaleString()} XP${Date.now() < S.xp2Until ? ` · <b style="color:#c9a2ff">2× XP for ${dur(S.xp2Until - Date.now())}</b>` : ""}</small></div></div>

    <div class="panel"><div style="display:flex;justify-content:space-between;align-items:baseline"><b style="font-size:18px">Lucky spin</b><small style="color:var(--dim)">once a day</small></div>
      <div class="wheelwrap"><div class="pointer"></div><div class="wheel" id="wheel" style="background:conic-gradient(${M.WHEEL.map((w, i) => `${w.c} ${i * seg}deg ${(i + 1) * seg}deg`).join(",")})">
        ${M.WHEEL.map((w, i) => `<span style="transform:rotate(${i * seg + seg / 2}deg)"><em>${w.label}</em></span>`).join("")}<div class="hub"></div></div></div>
      <div role="button" class="btn ${spun ? "" : "green"}" id="spin" ${spun ? "disabled" : ""}>${spun ? "Spun today. Back tomorrow" : "Spin!"}</div></div>

    <div class="panel"><b style="font-size:18px">Daily quests</b><p style="color:var(--dim);margin:4px 0 6px">New ones every day.</p>
      ${qs.map((q, i) => `<div class="quest ${q.claimed ? "claimed" : ""}"><div class="grow"><b>${esc(q.text)}</b><div class="prog"><i style="width:${q.prog / q.n * 100}%"></i></div><small>${q.k === "spend" || q.k === "sell" ? `${money(q.prog)} / ${money(q.n)}` : `${q.prog} / ${q.n}`}</small></div>
        ${q.claimed ? `<span class="qdone">✓</span>` : q.prog >= q.n ? `<div role="button" class="btn gold qclaim" data-q="${i}">+$${q.reward}</div>` : `<span class="qrew">$${q.reward}</span>`}</div>`).join("")}</div>

    <div class="panel"><b style="font-size:18px">Daily reward</b><p style="color:var(--dim);margin:4px 0 0">Come back every day. The 7th day in a row pays the most.</p>
      <div class="streak">${DAILY.map((a, i) => { const done = claimed ? i < ((S.daily.streak - 1) % 7) + 1 : i < streakNow % 7; return `<div class="${done ? "done" : ""} ${!claimed && i === nextDay ? "today" : ""}">Day ${i + 1}<b>$${a}</b></div>`; }).join("")}</div>
      <div role="button" class="btn ${claimed ? "" : "green"}" id="daily" ${claimed ? "disabled" : ""}>${claimed ? "Claimed today. Back tomorrow" : `Claim $${DAILY[nextDay]}`}</div></div>

    <div class="panel"><b style="font-size:18px">Free daily pack</b><p style="color:var(--dim);margin:4px 0 12px">One free Starter Pack every day.</p>
      <div role="button" class="btn ${freeUsed ? "" : "gold"}" id="free" ${freeUsed ? "disabled" : ""}>${freeUsed ? "Opened today. Back tomorrow" : "Rip free pack"}</div></div>

    <div class="panel"><div style="display:flex;justify-content:space-between;align-items:baseline"><b style="font-size:18px">Rakeback</b><span style="color:var(--dim)">${Math.round(rk.rate * 100)}% at ${rk.name}</span></div>
      <p style="color:var(--dim);margin:6px 0 12px">Every pack you buy pays a little back. ${nx ? `Reach level ${nx.at} for ${nx.name} (${Math.round(nx.rate * 100)}%).` : "Top rank reached."}</p>
      <div role="button" class="btn ${S.rake >= 0.01 ? "green" : ""}" id="rake" ${S.rake >= 0.01 ? "" : "disabled"}>${S.rake >= 0.01 ? `Claim ${money(S.rake)} rakeback` : "Nothing to claim yet"}</div></div>

    <h3>Achievements · ${achs.filter(a => a.claimed).length} / ${achs.length}</h3>
    <div class="panel" style="padding:4px 14px">${achs.map(a => `<div class="row ach ${a.claimed ? "claimed" : ""}"><div class="grow"><b>${a.claimed ? "🏆 " : ""}${esc(a.name)}</b><small>${esc(a.what)}</small>
      ${!a.claimed && a.have < a.goal ? `<div class="prog thin"><i style="width:${Math.min(100, a.have / a.goal * 100)}%"></i></div>` : ""}</div>
      ${a.claimed ? `<small>✓</small>` : a.have >= a.goal ? `<div role="button" class="btn gold qclaim" data-a="${a.id}">+$${a.reward}</div>` : `<small>$${a.reward}</small>`}</div>`).join("")}</div>
  </div>`;

  if (!spun) hapticButton($("#spin"), () => spin());
  const d = $("#daily"); if (!claimed) hapticButton(d, () => {
    const amt = DAILY[nextDay]; S.daily = { day: t, streak: streakNow + 1 }; S.bonus += amt; setBalance(amt); sfx.coin(); coins(d, $("#amt"), 8); toast(`+${money(amt)} daily reward`); setTimeout(() => go("rewards"), 600);
  });
  const f = $("#free"); if (!freeUsed) hapticButton(f, () => { S.freeDay = t; persist(); buy(PACKS.find(p => p.id === "starter"), 1, "daily"); });
  const r = $("#rake"); if (S.rake >= 0.01) hapticButton(r, () => { const a = S.rake; S.rake = 0; S.bonus = round2(S.bonus + a); setBalance(a); sfx.coin(); coins(r, $("#amt"), 8); toast(`+${money(a)} rakeback`); setTimeout(() => go("rewards"), 600); });
  v.querySelectorAll(".qclaim").forEach(b => hapticButton(b, () => {
    let amt = 0;
    if (b.dataset.q != null) { const q = qs[+b.dataset.q]; if (q.claimed) return; q.claimed = true; amt = q.reward; }
    else { const a = M.ACHIEVEMENTS.find(x => x.id === b.dataset.a); if (S.ach[a.id]) return; S.ach[a.id] = Date.now(); amt = a.reward; }
    S.bonus = round2(S.bonus + amt); setBalance(amt); sfx.win(); confetti(["#ffd66b", "#fff"], 1, 0.5); coins(b, $("#amt"), 10); toast(`+${money(amt)}`);
    setTimeout(() => go("rewards"), 700);
  }));
}

let spinning = false;
async function spin() {
  if (spinning || S.spinDay === today()) return;
  spinning = true; S.spinDay = today(); persist();
  const i = M.spinResult(), N = M.WHEEL.length, seg = 360 / N, prize = M.WHEEL[i];
  const target = 360 * 6 + (360 - (i * seg + seg / 2)) + (rand() - 0.5) * seg * 0.6;
  const wheel = $("#wheel"), dur = 4200;
  wheel.style.transition = `transform ${dur}ms cubic-bezier(.12,.75,.1,1)`;
  wheel.style.transform = `rotate(${target}deg)`;
  // ticking that slows down with the wheel
  const t0 = performance.now(); let last = -1;
  const tickLoop = (t) => {
    const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3.2), pos = Math.floor(e * target / seg);
    if (pos !== last) { last = pos; sfx.spin(pos); if (pos % 2 === 0) haptic("tick"); }
    if (k < 1) requestAnimationFrame(tickLoop);
  };
  requestAnimationFrame(tickLoop);
  await wait(dur + 150);
  let msg = "";
  if (prize.cash) { S.bonus += prize.cash; setBalance(prize.cash); msg = `+${money(prize.cash)}`; coins(wheel, $("#amt"), 14); }
  if (prize.pack) { S.tickets[prize.pack] = (S.tickets[prize.pack] || 0) + 1; msg = `Free ${PACKS.find(p => p.id === prize.pack).name}! Check the store`; }
  if (prize.xp2) { S.xp2Until = Date.now() + 3600e3; msg = "2× XP for an hour!"; }
  persist(); sfx.win(); haptic("big"); confetti(["#ffd66b", "#fff", prize.c], 2, 0.4); slam(prize.label, "#ffd66b");
  toast(msg); spinning = false;
  setTimeout(() => { if (tab === "rewards") go("rewards"); }, 1500);
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
      <div class="kv"><span>Epics · Legendaries · Grails</span><b>${S.st.epics} · ${S.st.legends} · ${S.st.grails}</b></div>
      <div class="kv"><span>Cards collected</span><b>${ownedIds().size.toLocaleString()} / ${DATA.cards.length.toLocaleString()}</b></div>
      <div class="kv"><span>Funds added</span><b class="money">${money(S.deposited)}</b></div>
      <div class="kv"><span>Free rewards</span><b class="money">${money(S.bonus)}</b></div>
      <div class="kv"><span>Cashed out</span><b class="money">${money(S.withdrawn)}</b></div>
      <div class="kv"><span>Best pull</span><b>${best ? `${esc(best.n)} · ${money(best.v)}` : "–"}</b></div></div>
    ${S.withdrawals.length ? `<h3>Withdrawal history</h3><div class="panel" style="padding:4px 14px">${S.withdrawals.slice(0, 10).map(w => `<div class="row"><span style="color:var(--green);font-size:20px">✓</span><div class="grow"><b>Cash out</b><small>${new Date(w.at).toLocaleDateString([], { dateStyle: "medium" })}</small></div><b class="money">${money(w.a)}</b></div>`).join("")}</div>` : ""}
    <h3>Pack return</h3>
    <div class="panel" style="padding:6px 14px">${RETURNS.map(r => `<button class="row" data-rtp="${r.v}" style="width:100%;text-align:left"><div class="grow"><b>${r.name} · ${Math.round(r.v * 100)}%</b><small>${r.blurb}</small></div>${S.settings.rtp === r.v ? `<span style="color:var(--green);font-size:20px">✓</span>` : ""}</button>`).join("")}</div>
    <h3>Settings</h3>
    <div class="panel" style="padding:4px 14px">
      <label class="switch-row"><span>Fast rips<br><small style="color:var(--dim)">Tap the pack to tear it instead of swiping</small></span><input type="checkbox" id="fast" ${S.settings.fast ? "checked" : ""}></label>
      <label class="switch-row"><span>Sound</span><input type="checkbox" id="snd" ${S.settings.sound ? "checked" : ""}></label>
      <label class="switch-row"><span>Haptics<br><small style="color:var(--dim)">iPhone needs iOS 17.4 or later</small></span><input type="checkbox" id="hap" ${S.settings.haptics ? "checked" : ""}></label>
      <div class="kv"><span>Card prices from</span><b>${esc(DATA.updated)}</b></div>
      <div class="kv"><span>Cards in the game</span><b>${DATA.cards.length.toLocaleString()} from ${Object.keys(DATA.sets).length} sets</b></div>
    </div>
    <div class="btns"><a class="btn" href="../../" style="text-decoration:none;color:inherit">← Game of the Week</a><button class="btn red" id="reset">Reset everything</button></div>
  </div>`;
  $("#add").onclick = () => { haptic("tick"); sheetFunds(); };
  $("#out").onclick = () => { haptic("tick"); sheetCashOut(); };
  v.querySelectorAll("[data-rtp]").forEach(b => b.onclick = () => { S.settings.rtp = +b.dataset.rtp; persist(); pools.clear(); haptic("tick"); go("account"); });
  $("#fast").onchange = e => { S.settings.fast = e.target.checked; persist(); };
  $("#snd").onchange = e => { S.settings.sound = e.target.checked; setSound(e.target.checked); persist(); };
  $("#hap").onchange = e => { S.settings.haptics = e.target.checked; setHaptics(e.target.checked); persist(); haptic("ok"); };
  $("#reset").onclick = () => sheet(`<h2>Reset everything?</h2><p>Your balance, collection, binders, levels and stats are wiped. This can't be undone.</p>
    <div class="btns two"><button class="btn" id="no">Cancel</button><button class="btn red" id="yes">Reset</button></div>`,
    (sh, close) => { $("#no", sh).onclick = close; $("#yes", sh).onclick = () => { wipe(GAME); S = structuredClone(FRESH); shownBalance = null; persist(); close(); go("packs"); }; });
}

// ---------- start ----------
async function start() {
  document.body.innerHTML = `<div class="loading"><div class="spinner"></div>Loading cards…</div>`;
  try {
    const raw = await (await fetch("data/cards.json")).json();
    const cards = raw.cards.map(([id, name, r, price, img, v]) => ({ id, name, r, price, img, v, set: id.slice(0, id.indexOf("-")) }));
    const num = (id) => { const m = id.slice(id.indexOf("-") + 1).match(/\d+/); return m ? +m[0] : 0; };
    const bySet = new Map();
    for (const c of cards) { if (!bySet.has(c.set)) bySet.set(c.set, []); bySet.get(c.set).push(c); }
    for (const list of bySet.values()) list.sort((a, b) => num(a.id) - num(b.id) || a.id.localeCompare(b.id));
    DATA = { updated: raw.updated, sets: raw.sets, cards, byId: new Map(cards.map(c => [c.id, c])), bySet };
  } catch (e) {
    document.body.innerHTML = `<div class="loading">Couldn't load the card list. Check your connection and reload.</div>`;
    return;
  }
  // Packs whose cards aren't in the data (or have too few) are hidden.
  for (let i = PACKS.length - 1; i >= 0; i--) { if (poolFor(PACKS[i]).count < 8) PACKS.splice(i, 1); }
  for (const c of S.cards) if (c.s === "new") c.s = "vault";
  shell(); go("packs");
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("../../sw.js", { scope: "../../" }).catch(() => {});
}
start();
