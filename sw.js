const CACHE_NAME = 'talara-v25';

self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => self.clients.claim());

self.addEventListener('fetch', event => {
  // Ignorar errores de Chrome Extensions y solo procesar lo necesario
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