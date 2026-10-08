// Cache do app para abrir rápido e funcionar com sinal fraco na obra (os dados sempre vêm da API).
const CACHE = 'size-v9';
const ARQUIVOS = ['./', './index.html', './style.css', './config.js', './app.js', './manifest.json', './icon-180.png', './icon-192.png', './icon-512.png', './logo.png', './fornecedor.html', './forn.js'];

self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQUIVOS))); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => {
    const c = r.clone();
    caches.open(CACHE).then(cache => cache.put(e.request, c));
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(l => {
    const c = l.find(x => x.url.startsWith(self.registration.scope));
    if (c) return c.navigate(url).then(w => (w || c).focus());
    return clients.openWindow(url);
  }));
});
