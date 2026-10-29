// Cache do app para abrir rápido e funcionar com sinal fraco na obra (os dados sempre vêm da API).
const CACHE = 'size-v56';
const ARQUIVOS = ['./', './index.html', './style.css', './config.js', './app.js', './exec.js', './relatorio.js', './fvs.js', './med.js', './ctr.js', './ctr-doc.js', './orc.js', './relobra.js', './base.js', './prop.js', './crono.js', './sinapi.js', './empresa.js', './clientes.js', './portal.js','./push.js', './sw-registro.js', './manifest.json', './icon-180.png', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './logo.png', './fornecedor.html', './forn.js'];

// cache: 'reload' / 'no-cache': nunca usar a cópia do navegador (o GitHub Pages manda guardar 10 min),
// senão uma versão nova do app pode abrir com o style.css ou um .js antigos
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQUIVOS.map(u => new Request(u, { cache: 'reload' }))))); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request.mode === 'navigate' ? e.request : new Request(e.request, { cache: 'no-cache' })).then(r => {
    const c = r.clone();
    caches.open(CACHE).then(cache => cache.put(e.request, c));
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});

/* Aviso vindo do servidor (Firebase) com o app aberto ou fechado. O servidor manda só dados
 * (titulo, corpo, url, tag) e o aviso é montado aqui; sem a biblioteca do Firebase dentro do service worker. */
self.addEventListener('push', e => {
  let p = {};
  try { p = e.data ? e.data.json() : {}; } catch (x) { p = { corpo: e.data ? e.data.text() : '' }; }
  const d = (p.data && typeof p.data === 'object') ? p.data : (p.notification ? { titulo: p.notification.title, corpo: p.notification.body } : p);
  e.waitUntil(self.registration.showNotification(d.titulo || 'Size Engenharia', {
    body: d.corpo || '', icon: 'icon-192.png', badge: 'icon-192.png', tag: d.tag || undefined, data: { url: d.url || './' },
    vibrate: [200, 100, 200], renotify: !!d.tag
  }));
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

/* Diário de obra sem sinal: o app guarda os envios no IndexedDB "size-fila"; quando a internet volta,
 * o navegador acorda este service worker (Background Sync — Android e PC) mesmo com o app fechado. */
function idb() {
  return new Promise((ok, no) => {
    const r = indexedDB.open('size-fila', 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('ops', { keyPath: 'id' }); r.result.createObjectStore('cfg', { keyPath: 'k' }); };
    r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error);
  });
}
const pedir = (db, loja, modo, fn) => new Promise((ok, no) => { const t = db.transaction(loja, modo), r = fn(t.objectStore(loja)); t.oncomplete = () => ok(r && r.result); t.onerror = () => no(t.error); });
async function enviarFila() {
  const db = await idb();
  const cfg = {};
  (await pedir(db, 'cfg', 'readonly', s => s.getAll())).forEach(x => { cfg[x.k] = x.v; });
  if (!cfg.api || !cfg.token) return;
  const ops = (await pedir(db, 'ops', 'readonly', s => s.getAll())).sort((a, b) => a.criado - b.criado);
  let enviados = 0;
  for (const op of ops) {
    const r = await fetch(cfg.api, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ acao: op.acao, token: cfg.token, obra: op.obra, ...op.dados }) })
      .then(x => x.json()); // sem sinal: lança erro e o navegador tenta de novo mais tarde
    if (r.ok) { await pedir(db, 'ops', 'readwrite', s => s.delete(op.id)); enviados++; }
    else { op.erro = r.erro; op.tentativas = (op.tentativas || 0) + 1; await pedir(db, 'ops', 'readwrite', s => s.put(op)); }
  }
  if (enviados) {
    (await clients.matchAll({ includeUncontrolled: true })).forEach(c => c.postMessage({ tipo: 'fila-enviada', enviados }));
    if (self.registration.showNotification && Notification.permission === 'granted' && !(await clients.matchAll({ type: 'window' })).some(c => c.visibilityState === 'visible'))
      self.registration.showNotification('Diário de obra enviado', { body: enviados + (enviados === 1 ? ' envio guardado subiu' : ' envios guardados subiram') + ' quando o sinal voltou.', icon: 'icon-192.png', badge: 'icon-192.png', tag: 'fila' });
  }
}
self.addEventListener('sync', e => { if (e.tag === 'size-fila') e.waitUntil(enviarFila()); });
