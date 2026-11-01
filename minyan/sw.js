// keeps the app working offline; always tries the network first so updates arrive
const CACHE = 'minyan-v1';
const FILES = ['./', 'index.html', 'app.js', 'app.css', 'leaflet.js', 'leaflet.css', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('minyan-') && k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  // only the app's own files and the Firebase code; live data, maps and routes go straight to the network
  const u = new URL(e.request.url);
  const own = u.origin === location.origin && u.pathname.startsWith(new URL('./', self.registration.scope).pathname);
  if (e.request.method !== 'GET' || !(own || /(^|\.)gstatic\.com$/.test(u.hostname))) return;
  e.respondWith(fetch(e.request).then(r => {
    const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r;
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
