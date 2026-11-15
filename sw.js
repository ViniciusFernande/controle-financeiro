const CACHE_NAME = 'fersales-financas-v3';
const STATIC_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './seed.js',
  './firebase-config.js',
  './logo.jpg',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
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
  const url = event.request.url;
  if (
    event.request.method !== 'GET' ||
    !url.startsWith(self.location.origin)
  ) {
    return;
  }

  // Network-first para sempre puxar atualizações do GitHub quando estiver online
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
