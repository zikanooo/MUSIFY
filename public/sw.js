const CACHE_STATIC_NAME = 'nanzmusify-static-v2';
const CACHE_DATA_NAME = 'nanzmusify-api-v2';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/logo.png',
  '/banner.png',
  '/app.js',
  '/player.js',
  '/fullplayer.js',
  '/miniplayer.js',
  '/home.js',
  '/library.js',
  '/liked.js',
  '/search.js',
  '/album.js',
  '/artist.js',
  '/profile.js',
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/lucide@latest'
];

// Install Event - Pre-cache Static Shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_STATIC_NAME).then((cache) => {
      console.log('[SW] Pre-caching static assets');
      return Promise.allSettled(
        STATIC_ASSETS.map((url) => {
          return fetch(url).then((res) => {
            if (res.status === 200 || res.type === 'opaque') {
              return cache.put(url, res);
            }
          }).catch((err) => {
            console.warn('[SW] Failed to cache:', url, err);
          });
        })
      );
    }).then(() => self.skipWaiting())
  );
});

// Activate Event - Clean Up Old Caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_STATIC_NAME && key !== CACHE_DATA_NAME) {
            console.log('[SW] Removing old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - Handle Offline & Caching
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Ignore non-GET requests or chrome-extension URLs
  if (request.method !== 'GET' || !url.protocol.startsWith('http')) {
    return;
  }

  // 1. Navigation requests -> Network first, fallback to cached index.html
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => {
        return caches.match('/index.html', { ignoreSearch: true }) || caches.match('/', { ignoreSearch: true });
      })
    );
    return;
  }

  // 2. API Routes -> Network first, save success to cache, fallback to cache on offline
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_DATA_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match(request, { ignoreSearch: true }).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // Fallback JSON for offline API requests
            return new Response(
              JSON.stringify({ status: false, offline: true, message: 'Anda sedang offline (PWA Offline Mode)' }),
              { headers: { 'Content-Type': 'application/json' } }
            );
          });
        })
    );
    return;
  }

  // 3. Static Assets (JS, PNG, WebP, CSS, Manifest, CDN scripts) -> Cache first, fallback to network
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch background update for cache freshness if online
        if (navigator.onLine) {
          fetch(request).then((networkResponse) => {
            if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
              caches.open(CACHE_STATIC_NAME).then((cache) => {
                cache.put(request, networkResponse);
              });
            }
          }).catch(() => {});
        }
        return cachedResponse;
      }

      return fetch(request).then((networkResponse) => {
        if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_STATIC_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // If image fails offline, fallback to logo or FI placeholder
        if (request.headers.get('accept')?.includes('image')) {
          return caches.match('/logo.png');
        }
      });
    })
  );
});
