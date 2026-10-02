// Effects: a tiny synth for sound (no audio files), confetti, flying coins, screen flash and the big text slam.
let soundOn = true;
export function setSound(on) { soundOn = !!on; }

let AC = null;
function ac() { if (!AC) try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch { /* no audio */ } return AC; }
document.addEventListener("pointerdown", () => { const a = ac(); if (a && a.state === "suspended") a.resume(); }, { passive: true });

function tone(freq, dur = 0.15, type = "sine", vol = 0.12, when = 0, slideTo = 0) {
  const a = soundOn && ac(); if (!a) return;
  const t = a.currentTime + when, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.05);
}
function noise(dur = 0.3, vol = 0.18, hp = 1800, when = 0) {
  const a = soundOn && ac(); if (!a) return;
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  src.buffer = buf; f.type = "highpass"; f.frequency.value = hp; g.gain.value = vol;
  src.connect(f).connect(g).connect(a.destination); src.start(a.currentTime + when);
}
const NOTES = [523, 587, 659, 784, 880, 1047, 1175, 1319, 1568];
export const sfx = {
  tap: () => tone(660, 0.05, "triangle", 0.05),
  tick: (i = 0) => tone(400 + i * 60, 0.04, "triangle", 0.035),
  buy: () => { tone(880, 0.07, "square", 0.04); tone(1320, 0.1, "square", 0.04, 0.06); },
  tear: () => { noise(0.4, 0.22, 1500); tone(200, 0.3, "sawtooth", 0.03, 0, 80); },
  rise: () => tone(220, 0.5, "sine", 0.06, 0, 660),
  step: (i) => { tone(NOTES[i * 1 + 1] || 1500, 0.18, i >= 4 ? "sawtooth" : "triangle", i >= 4 ? 0.05 : 0.07); },
  rumble: () => { noise(1.2, 0.12, 60); tone(55, 1.2, "sawtooth", 0.06); },
  flip: () => { noise(0.12, 0.08, 3000); tone(300, 0.12, "triangle", 0.06); tone(520, 0.12, "triangle", 0.05, 0.06); },
  reveal: (i) => {
    const chord = [[0, 2], [0, 2, 4], [0, 2, 4, 5], [0, 2, 4, 5, 7], [0, 2, 4, 5, 7, 8], [0, 2, 4, 5, 7, 8]][i];
    chord.forEach((n, k) => tone(NOTES[n], 0.6 + i * 0.15, i >= 4 ? "sawtooth" : "sine", i >= 4 ? 0.045 : 0.08, k * 0.06));
    if (i >= 4) { tone(NOTES[8] * 2, 1.2, "sine", 0.05, 0.4); noise(0.6, 0.08, 4000, 0.05); }
  },
  coin: () => { tone(1320, 0.07, "square", 0.035); tone(1760, 0.16, "square", 0.035, 0.06); },
  level: () => [0, 2, 4, 7, 8].forEach((n, k) => tone(NOTES[n], 0.35, "square", 0.04, k * 0.09)),
  spin: (i) => tone(900 + (i % 3) * 120, 0.03, "square", 0.025),
  win: () => [4, 5, 7, 8].forEach((n, k) => tone(NOTES[n], 0.3, "triangle", 0.07, k * 0.08)),
};

// Confetti over the whole screen, in the given colors. power 1-3.
export function confetti(colors, power = 1, originY = 0.42) {
  const cv = document.createElement("canvas");
  cv.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:95";
  document.body.appendChild(cv);
  const dpr = devicePixelRatio || 1, W = cv.width = innerWidth * dpr, H = cv.height = innerHeight * dpr, ctx = cv.getContext("2d");
  const n = 60 * power + 20;
  const ps = Array.from({ length: n }, () => ({
    x: W / 2 + (Math.random() - 0.5) * 60 * dpr, y: H * originY, vx: (Math.random() - 0.5) * (14 + power * 7) * dpr, vy: (Math.random() * -16 - 6 - power * 2) * dpr,
    r: (3 + Math.random() * 4) * dpr, c: colors[Math.floor(Math.random() * colors.length)], a: Math.random() * 6, s: Math.random() < 0.3,
  }));
  const t0 = performance.now(), life = 1800 + power * 500;
  const step = (t) => {
    const k = (t - t0) / life; ctx.clearRect(0, 0, W, H);
    if (k >= 1) { cv.remove(); return; }
    for (const p of ps) {
      p.x += p.vx; p.y += p.vy; p.vy += 0.55 * dpr; p.vx *= 0.985; p.a += 0.18;
      ctx.globalAlpha = Math.min(1, 1.6 - k * 1.6); ctx.fillStyle = p.c; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a);
      if (p.s) { ctx.beginPath(); ctx.arc(0, 0, p.r * 0.7, 0, 7); ctx.fill(); } else ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r);
      ctx.restore();
    }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// Coins fly from one element to another (sell → balance).
export function coins(fromEl, toEl, n = 10) {
  if (!fromEl || !toEl) return;
  const a = fromEl.getBoundingClientRect(), b = toEl.getBoundingClientRect();
  for (let i = 0; i < n; i++) {
    const c = document.createElement("div");
    c.className = "coin";
    const x0 = a.left + a.width / 2 + (Math.random() - 0.5) * a.width * 0.6, y0 = a.top + a.height / 2;
    c.style.left = x0 + "px"; c.style.top = y0 + "px";
    document.body.appendChild(c);
    const dx = b.left + b.width / 2 - x0, dy = b.top + b.height / 2 - y0, mx = (Math.random() - 0.5) * 160, delay = i * 45;
    c.animate([
      { transform: "translate(-50%,-50%) scale(.4)", opacity: 0 },
      { transform: `translate(calc(-50% + ${mx}px), calc(-50% - 80px)) scale(1.1)`, opacity: 1, offset: 0.35 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.5)`, opacity: 0.9 },
    ], { duration: 750, delay, easing: "cubic-bezier(.3,.6,.4,1)", fill: "both" }).onfinish = () => { c.remove(); if (i % 3 === 0) sfx.tick(8); };
  }
  setTimeout(() => { toEl.animate([{ transform: "scale(1)" }, { transform: "scale(1.15)" }, { transform: "scale(1)" }], { duration: 300 }); }, 700);
}

// Big text slammed onto the screen ("LEGENDARY!").
export function slam(text, color, big = false) {
  const el = document.createElement("div");
  el.className = "slam" + (big ? " big" : "");
  el.style.setProperty("--c", color);
  el.textContent = text;
  document.body.appendChild(el);
  el.animate([
    { transform: "translate(-50%,-50%) scale(3) rotate(-8deg)", opacity: 0 },
    { transform: "translate(-50%,-50%) scale(.92) rotate(-4deg)", opacity: 1, offset: 0.18 },
    { transform: "translate(-50%,-50%) scale(1.05) rotate(-4deg)", opacity: 1, offset: 0.3 },
    { transform: "translate(-50%,-50%) scale(1) rotate(-4deg)", opacity: 1, offset: 0.8 },
    { transform: "translate(-50%,-50%) scale(1.3) rotate(-4deg)", opacity: 0 },
  ], { duration: big ? 1900 : 1400, easing: "ease-out" }).onfinish = () => el.remove();
}

// Tilt an element toward the finger, with a moving holo shine. Returns a function that removes it.
export function tilt(el, shine) {
  const move = (e) => {
    const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `rotateY(${x * 24}deg) rotateX(${-y * 24}deg)`;
    if (shine) { shine.style.backgroundPosition = `${50 + x * 120}% ${50 + y * 120}%`; shine.style.opacity = "1"; }
  };
  const leave = () => { el.style.transform = ""; if (shine) shine.style.opacity = ""; };
  el.addEventListener("pointermove", move); el.addEventListener("pointerleave", leave); el.addEventListener("pointerup", leave);
  return () => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerleave", leave); el.removeEventListener("pointerup", leave); };
}
