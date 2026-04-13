// SW — Network First, compatible con GitHub Pages y Netlify
const BUILD = '20260413';
const CACHE  = 'inv-' + BUILD;

// Detecta la base del sitio automáticamente
const BASE = self.location.pathname.replace(/\/sw\.js$/, '');

const ASSETS = [
  BASE + '/',
  BASE + '/index.html',
  BASE + '/styles.css',
  BASE + '/app.js',
  BASE + '/firebase.js',
];

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS).catch(() => {})) // ignora errores de assets opcionales
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request, { cache: 'no-store' })
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
