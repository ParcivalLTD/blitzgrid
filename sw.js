const CACHE_NAME = 'drop-chess-v5';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  '/src/styles/theme.css',
  '/src/styles/layout.css',
  '/src/main.js',
  '/src/engine/constants.js',
  '/src/engine/chessRules.js',
  '/src/engine/GameEngine.js',
  '/src/engine/BotAI.js',
  '/src/engine/puzzles.js',
  '/src/art/icons.js',
  '/src/art/pieces.js',
  '/src/art/avatars.js',
  '/src/art/badges.js',
  '/src/audio/SoundEngine.js',
  '/src/net/MultiplayerClient.js',
  '/src/state/persistence.js',
  '/src/ui/BoardRenderer.js',
  '/src/ui/HudController.js',
  '/src/ui/VfxCanvas.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.pathname.startsWith('/api/') || url.pathname === '/health') {
    return;
  }
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res.ok && url.origin === self.location.origin) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
