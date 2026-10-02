// Haptics, carried over from Shelfie.
// Android: navigator.vibrate. iPhones have no vibrate API, but Safari (iOS 17.4+) ticks when the person toggles an
// <input type="checkbox" switch>. Since iOS 26.5 a switch clicked by script no longer ticks, so for the moments that
// matter (buy, flip) a transparent label with a hidden switch is laid over the button: the finger lands on the label,
// the label hands the tap to the switch (tick), and the tap is passed on. Older iPhones also tick from script clicks.
let enabled = true;
export function setHaptics(on) { enabled = !!on; }

let hidden = null;
function scriptTick() {
  try {
    if (!hidden) {
      hidden = document.createElement("label");
      hidden.setAttribute("aria-hidden", "true");
      hidden.style.cssText = "position:fixed;left:-60px;top:-60px;width:1px;height:1px;opacity:0;pointer-events:none";
      hidden.innerHTML = '<input type="checkbox" switch tabindex="-1">';
      document.body.appendChild(hidden);
    }
    hidden.click();
  } catch { /* no haptics is fine */ }
}

const PATTERNS = { tick: 8, ok: 15, buy: [10, 30, 10], hit: [20, 40, 20], big: [30, 50, 30, 50, 120] };
// kind: tick | ok | buy | hit | big
export function haptic(kind = "tick") {
  if (!enabled) return;
  try { if (navigator.vibrate) { navigator.vibrate(PATTERNS[kind] || 10); return; } } catch { /* ignore */ }
  scriptTick();
}

// Lay a haptic overlay over `target`. onTap runs on every real tap. Returns a function that removes it.
export function hapticButton(target, onTap) {
  const label = document.createElement("label");
  label.className = "hap";
  label.style.cssText = "position:absolute;inset:0;z-index:5;cursor:pointer;-webkit-tap-highlight-color:transparent";
  const input = document.createElement("input");
  input.type = "checkbox"; input.setAttribute("switch", ""); input.tabIndex = -1;
  input.style.cssText = "position:absolute;opacity:0;pointer-events:none;width:1px;height:1px";
  input.addEventListener("click", e => e.stopPropagation());
  label.appendChild(input);
  label.addEventListener("click", e => {
    if (e.target === input) return;
    if (!enabled) { e.preventDefault(); }
    if (navigator.vibrate && enabled) try { navigator.vibrate(10); } catch { /* ignore */ }
    onTap(e);
  });
  if (getComputedStyle(target).position === "static") target.style.position = "relative";
  target.appendChild(label);
  return () => label.remove();
}
