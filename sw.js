const CACHE_NAME = 'micalorias-shell-v3';
const ASSETS = ['./','./index.html','./styles.css','./app.js','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/apple-touch-icon.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('micalorias-shell-') && key !== CACHE_NAME).map(key => caches.delete(key)))),self.clients.claim()]));
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(caches.match(request, { ignoreSearch: true }).then(cached => {
    if (cached) return cached;
    return fetch(request).catch(() => request.mode === 'navigate' ? caches.match('./index.html') : (typeof Response.error === 'function' ? Response.error() : new Response(null, { status: 408 })));
  }));
});
