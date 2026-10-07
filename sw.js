// keeps the game working offline; always tries the network first so updates arrive
const CACHE = 'astro-v5';
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  // only the game's own files, fonts and the Firebase code; live data always goes straight to the network
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || !(u.origin === location.origin || /(^|\.)gstatic\.com$|fonts\.googleapis\.com$/.test(u.hostname))) return;
  e.respondWith(fetch(e.request).then(r => {
    const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r;
  }).catch(() => caches.match(e.request, {ignoreSearch: true})));
});
