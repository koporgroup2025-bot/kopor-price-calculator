// Network-first service worker: always tries the network for the latest
// files first, and only falls back to the cache when offline. This keeps
// the app usable without a connection while avoiding the classic PWA trap
// of a stale cache-first strategy silently serving old code after every
// deploy. Bump CACHE_NAME whenever the precache list itself changes.
const CACHE_NAME = 'kopor-price-calc-v6';
const PRECACHE_URLS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './price-calculator.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // 'no-store' bypasses the browser's own HTTP cache too, not just the
  // Cache API - without it, "network-first" would still silently reuse a
  // recently-fetched HTTP-cached response instead of hitting the network.
  const freshRequest = new Request(event.request, { cache: 'no-store' });

  event.respondWith(
    fetch(freshRequest).then((response) => {
      if (response.ok && response.type === 'basic') {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
      }
      return response;
    }).catch(() => caches.match(event.request))
  );
});
