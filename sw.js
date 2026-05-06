const CACHE_NAME = 'kiro-v26';

self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.map(k => {
    if (k !== CACHE_NAME) return caches.delete(k);
  }))));
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  // REPARACIÓN: Solo procesar peticiones HTTP GET para evitar errores en la consola
  if (event.request.method !== 'GET' || !event.request.url.startsWith('http')) return;

  event.respondWith(
    caches.match(event.request).then(res => {
      return res || fetch(event.request).then(networkRes => {
        if (!networkRes || networkRes.status !== 200 || networkRes.type !== 'basic') return networkRes;
        const cacheClone = networkRes.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, cacheClone));
        return networkRes;
      });
    })
  );
});