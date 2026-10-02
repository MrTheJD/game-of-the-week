// Offline support for the whole hub. Pages are network first (so updates show up) with the cached copy as the
// offline fallback. Everything else from this site is cached the first time it loads. Card images from
// images.pokemontcg.io are kept in their own cache so ripped cards still show offline.
const CACHE = "gotw-v1";
const IMG_CACHE = "gotw-img";
const IMG_HOSTS = ["images.pokemontcg.io"];
const IMG_MAX = 600;

self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(["./", "index.html"])).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith("gotw-v") && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

async function trimImages() {
  const c = await caches.open(IMG_CACHE), keys = await c.keys();
  for (let i = 0; i < keys.length - IMG_MAX; i++) await c.delete(keys[i]);
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (IMG_HOSTS.includes(url.hostname)) {
    e.respondWith(caches.open(IMG_CACHE).then(c => c.match(req).then(hit => hit || fetch(req).then(r => {
      if (r.ok || r.type === "opaque") { c.put(req, r.clone()); trimImages(); }
      return r;
    }))));
    return;
  }
  if (url.origin !== location.origin) return;
  // Pages, scripts, styles and data: network first, so a new version shows up right away; cache when offline.
  e.respondWith(fetch(req, { cache: "no-cache" }).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return r;
  }).catch(() => caches.match(req, { ignoreSearch: true })));
});
