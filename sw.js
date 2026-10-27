// Garde le Carnet dans le téléphone pour qu'il s'ouvre même sans réseau au salon.
const CACHE = "carnet-20261027-223306";
const FICHIERS = ["./", "index.html", "manifest.webmanifest", "src/stockage-iphone.js", "src/essai-capacitor.js",
  "src/depart.js", "assets/logo/dilerna-logo.webp", "icones/icone-180.png", "icones/icone-192.png", "icones/icone-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FICHIERS)));
  self.skipWaiting();
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
// Réseau d'abord (pour recevoir les nouvelles versions), sinon ce qui est gardé dans le téléphone
// (sans passer par la mémoire du navigateur, sinon une ancienne version peut rester 10 minutes)
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.pathname.endsWith("version.json")) return; // toujours le vrai réseau
  const req = url.origin === location.origin ? fetch(url.href, { cache: "no-cache", credentials: "same-origin" }) : fetch(e.request);
  e.respondWith(req
    .then(r => {
      if (r.ok) { const copie = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copie)); }
      return r;
    })
    .catch(() => caches.match(e.request, { ignoreSearch: true })));
});
