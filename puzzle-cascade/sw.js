const CACHE_NAME = 'puzzle-cascade-v1';

const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './shared/css/theme.css',
  './shared/css/layout.css',
  './shared/js/save-manager.js',
  './shared/js/sound-manager.js',
  './shared/js/ui.js',
  './shared/js/app.js',
  './games/01-sliding/sliding.js',
  './games/02-memory/memory.js',
  './games/03-match3/match3.js',
  './games/04-maze/maze.js',
  './games/05-sokoban/sokoban.js',
  './games/06-wordsearch/wordsearch.js',
  './games/07-merge2048/merge2048.js',
  './games/08-jigsaw/jigsaw.js',
  './games/09-simon/simon.js',
  './games/10-lightsout/lightsout.js',
  './icons/icon-192.svg',
  './icons/icon-512.svg',
  './icons/icon-maskable-512.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Cache-first for the app shell, network-first fallback for anything else
// (e.g. the Google Fonts stylesheet, which caches itself via its own headers).
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (response.ok && event.request.url.startsWith(self.location.origin)) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached);
    })
  );
});
