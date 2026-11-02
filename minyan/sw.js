// keeps the app working offline; always tries the network first so updates arrive.
// Only app files are cached: user settings live in localStorage/IndexedDB and are never touched here.
const CACHE = 'minyan-v2.0.0';
const FILES = ['./', 'index.html', 'app.js', 'app.css', 'leaflet.js', 'leaflet.css', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('minyan-') && k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  const own = u.origin === location.origin && u.pathname.startsWith(new URL('./', self.registration.scope).pathname);
  if (e.request.method !== 'GET' || u.pathname.endsWith('version.json') || !(own || /(^|\.)gstatic\.com$/.test(u.hostname))) return;
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok){ const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request, {ignoreSearch: true})));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const id = e.notification.data && e.notification.data.id;
  e.waitUntil(self.clients.matchAll({type: 'window', includeUncontrolled: true}).then(cs => {
    const c = cs[0];
    if (c){ c.focus(); if (id) c.postMessage({open: id}); return; }
    return self.clients.openWindow(id ? './?m=' + id : './');
  }));
});
