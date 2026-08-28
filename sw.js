const CACHE_NAME = 'sos-forest-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/dashboard.html',
  '/css/style.css',
  '/js/app.js',
  '/js/wilayas.js',
  '/js/firebase-config.js',
  '/js/nasa-api.js',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('nasa.gov') ||
      event.request.url.includes('googleapis.com') ||
      event.request.url.includes('firebaseio.com') ||
      event.request.url.includes('openstreetmap.org')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response('Service unavailable', { status: 503 });
      })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request).then((response) => {
        if (response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      });
    }).catch(() => {
      if (event.request.destination === 'document') {
        return caches.match('/index.html');
      }
    })
  );
});

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const options = {
    body: data.body || 'تنبيه جديد关于 الحرائق',
    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect fill="%23e74c3c" width="192" height="192" rx="32"/><text x="96" y="130" font-size="100" text-anchor="middle" fill="white">🔥</text></svg>',
    badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect fill="%23e74c3c" width="96" height="96" rx="16"/><text x="48" y="68" font-size="50" text-anchor="middle" fill="white">🔥</text></svg>',
    vibrate: [200, 100, 200],
    tag: 'sos-forest-alert',
    data: { url: '/dashboard.html' }
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'SOS FOREST ALGERIA', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data?.url || '/dashboard.html')
  );
});
