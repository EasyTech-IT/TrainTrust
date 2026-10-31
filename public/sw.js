const CACHE = 'tt-shell-v5';
const SHELL = ['./', 'index.html', 'css/app.css', 'css/glass.css', 'js/app.js', 'js/api.js', 'js/ui.js', 'js/icons.js', 'js/content.js', 'js/map.js', 'js/config.js', 'fonts/plus-jakarta-sans-latin-wght-normal.woff2', 'icons/icon-192.png', 'img/logo.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

// Netzwerk zuerst, Cache als Offline-Fallback. Die API wird nie vom Service Worker zwischengespeichert.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('index.html')))
  );
});
