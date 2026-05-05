var CACHE = 'talara-v20260505';
var FILES = ['./','./index.html','./styles.css','./app.js','./firebase.js','./manifest.json'];

self.addEventListener('install', function(e){
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function(c){ return c.addAll(FILES); }));
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k!==CACHE; }).map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e){
  // JS, HTML y CSS siempre de la red (nunca de caché)
  if (e.request.url.match(/\.(js|html|css)(\?|$)/)) {
    e.respondWith(
      fetch(e.request, {cache:'no-store'}).catch(function(){
        return caches.match(e.request);
      })
    );
    return;
  }
  // Resto: red primero, caché como respaldo
  e.respondWith(
    fetch(e.request).then(function(r){
      var clone = r.clone();
      caches.open(CACHE).then(function(c){ c.put(e.request, clone); });
      return r;
    }).catch(function(){ return caches.match(e.request); })
  );
});

self.addEventListener('message', function(e){
  if (e.data && e.data.type==='SKIP_WAITING') self.skipWaiting();
});
