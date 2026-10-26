const CACHE = 'bens-bike-trip-v5-stunt-control';
const ROOT = '/BensBikeTrip/';
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll([ROOT, ROOT + 'manifest.webmanifest', ROOT + 'icon.svg'])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))), self.clients.claim()]));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(request).then(response => {
    if (response.ok) { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(request, copy)); }
    return response;
  }).catch(() => caches.match(request).then(response => response || (request.mode === 'navigate' ? caches.match(ROOT) : Response.error()))));
});
