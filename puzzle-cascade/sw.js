const CACHE_NAME = 'josh-makes-puzzles-v4';

const GAME_IDS = [
  '01-sliding/sliding', '02-memory/memory', '03-match3/match3', '04-maze/maze',
  '05-sokoban/sokoban', '06-wordsearch/wordsearch', '07-merge2048/merge2048',
  '08-jigsaw/jigsaw', '09-simon/simon', '10-lightsout/lightsout',
  '11-tictactoe/tictactoe', '12-whackmole/whackmole', '13-connect4/connect4',
  '14-minesweeper/minesweeper', '15-hanoi/hanoi', '16-pegsolitaire/pegsolitaire',
  '17-snake/snake', '18-breakout/breakout', '19-colorflood/colorflood',
  '20-sudoku/sudoku',
];

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
  './shared/js/three-stage.js',
  './vendor/three.module.min.js',
  ...GAME_IDS.map((g) => `./games/${g}.js`),
  ...GAME_IDS.map((g) => `./games/${g}.css`),
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
