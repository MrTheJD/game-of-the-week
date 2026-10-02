// Saving on the phone. Every game gets its own key ("gotw.<game>"), so games never touch each other's saves.
// localStorage can be missing or throw (private mode, blocked site data); then the game still runs, it just forgets.
export function load(game, fallback) {
  try {
    const raw = localStorage.getItem("gotw." + game);
    return raw ? { ...fallback, ...JSON.parse(raw) } : structuredClone(fallback);
  } catch { return structuredClone(fallback); }
}
export function save(game, data) {
  try { localStorage.setItem("gotw." + game, JSON.stringify(data)); return true; } catch { return false; }
}
export function wipe(game) {
  try { localStorage.removeItem("gotw." + game); } catch { /* nothing saved anyway */ }
}
