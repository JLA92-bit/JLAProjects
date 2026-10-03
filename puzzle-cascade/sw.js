const CACHE_NAME = 'josh-makes-puzzles-v9';

// Game folders under games/, in PUZZLES order (folder NN-<id> holds
// <id>.js + <id>.css). The app lazy-loads these on first launch; listing
// them here precaches them so every game still works offline. To add
// games 41+, append one 'NN-<id>' line per game.
const GAME_FOLDERS = [
  '01-sliding',
  '02-memory',
  '03-match3',
  '04-maze',
  '05-sokoban',
  '06-wordsearch',
  '07-merge2048',
  '08-jigsaw',
  '09-simon',
  '10-lightsout',
  '11-tictactoe',
  '12-whackmole',
  '13-connect4',
  '14-minesweeper',
  '15-hanoi',
  '16-pegsolitaire',
  '17-snake',
  '18-breakout',
  '19-colorflood',
  '20-sudoku',
  '21-reversi',
  '22-checkers',
  '23-battleship',
  '24-mastermind',
  '25-nonogram',
  '26-flowconnect',
  '27-ballsort',
  '28-bubbleshooter',
  '29-dotsboxes',
  '30-pyramidsolitaire',
  '31-tangram',
  '32-anagram',
  '33-wordguess',
  '34-airhockey',
  '35-marblemaze',
  '36-blockdrop',
  '37-runner',
  '38-towerdefense',
  '39-rhythmtap',
  '40-dominoes',
  '41-rushhour',
  '42-pipes',
  '43-blockfit',
  '44-stacker',
  '45-laser',
  '46-hashi',
  '47-kenken',
  '48-minigolf',
  '49-mahjong',
  '50-spotdiff',
];
const GAME_FILES = GAME_FOLDERS.map((f) => `./games/${f}/${f.replace(/^\d+-/, '')}`);

const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './shared/css/theme.css',
  './shared/css/layout.css',
  './shared/js/save-manager.js',
  './shared/js/sound-manager.js',
  './shared/js/ui.js',
  './shared/js/update-checker.js',
  './version.json',
  './shared/js/app.js',
  './shared/js/three-stage.js',
  './vendor/three.module.min.js',
  './vendor/three-addons/postprocessing/EffectComposer.js',
  './vendor/three-addons/postprocessing/MaskPass.js',
  './vendor/three-addons/postprocessing/OutputPass.js',
  './vendor/three-addons/postprocessing/Pass.js',
  './vendor/three-addons/postprocessing/RenderPass.js',
  './vendor/three-addons/postprocessing/ShaderPass.js',
  './vendor/three-addons/postprocessing/UnrealBloomPass.js',
  './vendor/three-addons/environments/RoomEnvironment.js',
  './vendor/three-addons/shaders/CopyShader.js',
  './vendor/three-addons/shaders/LuminosityHighPassShader.js',
  './vendor/three-addons/shaders/OutputShader.js',
  ...GAME_FILES.map((g) => `${g}.js`),
  ...GAME_FILES.map((g) => `${g}.css`),
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
// version.json is the one exception: the update-checker's whole point is
// to see the LATEST deployed version, so it must always hit the network
// first (cache is only a fallback for when the device is offline).
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (event.request.url.endsWith('/version.json') && event.request.url.startsWith(self.location.origin)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }
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
