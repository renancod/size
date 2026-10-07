// Cache do app para abrir rápido e funcionar com sinal fraco na obra (os dados sempre vêm da API).
const CACHE = 'compras-size-v3';
const ARQUIVOS = ['./', './index.html', './style.css', './config.js', './app.js', './manifest.json', './icon-180.png', './icon-192.png', './icon-512.png', './logo.png'];

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
