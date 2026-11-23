const CACHE = 'ragot-v25';
const FILES = ['./', 'index.html', 'manifest.json', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', e => {
  // Un fichier manquant (ex: une icône) n'empêche plus de mettre les autres en cache
  e.waitUntil(caches.open(CACHE).then(c => Promise.allSettled(FILES.map(f => c.add(f)))));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

// Réseau d'abord (toujours la dernière version), cache en secours hors ligne.
// Firebase, Netlify Functions et les autres sites ne passent pas par le cache.
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/.netlify/') || u.pathname.startsWith('/api/')) return;
  e.respondWith(
    fetch(r)
      .then(res => {
        if (res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(r, cp)); }
        return res;
      })
      .catch(() => caches.match(r).then(m => m || (r.mode === 'navigate' ? caches.match('index.html') : Response.error())))
  );
});

// Toucher une notification ramène dans l'app
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(l => l.length ? l[0].focus() : clients.openWindow('./'))
  );
});

// Notification reçue quand l'app est fermée (envoyée par la fonction push)
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) {}
  const n = d.data || d;
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(l => {
      if (l.some(c => c.visibilityState === 'visible')) return;   // app déjà ouverte : pas de doublon
      return self.registration.showNotification(n.title || 'RAGOT', { body: n.body || '', tag: n.room || 'ragot', data: { room: n.room } });
    })
  );
});
