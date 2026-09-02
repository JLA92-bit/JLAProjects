const CACHE_NAME = 'vantage-point-v2';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './src/style.css',
  './src/main.js',
  './src/components/panzoom.js',
  './src/components/scene.js',
  './src/components/casefile.js',
  './src/components/accusation.js',
  './src/state/store.js',
  './data/case.json',
  './data/level-1-clues.json',
  './data/level-2-clues.json',
  './data/level-3-clues.json',
  './data/level-4-clues.json',
  './data/level-5-clues.json',
  './scenes/level-1.svg',
  './scenes/level-2.svg',
  './scenes/level-3.svg',
  './scenes/level-4.svg',
  './scenes/level-5.svg',
  './icons/icon-192.svg',
  './icons/icon-512.svg',
  './icons/icon-maskable-512.svg',
  './src/brand/wordmark.svg',
  './src/brand/wordmark-stacked.svg',
  './src/brand/pin.svg',
  './src/brand/magnifier.svg',
  './src/brand/grain.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Cache-first for same-origin GETs, falling back to network then cache-store.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => cached);
    })
  );
});
