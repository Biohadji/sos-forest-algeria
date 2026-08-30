const CACHE_VERSION = 'v2';
const CACHE_NAME = 'paw-emergency-' + CACHE_VERSION;

const STATIC_ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/translations.js',
  './js/wilayas.js',
  './js/fire-prediction.js',
  './js/shelter-plans.js',
  './manifest.json'
];

// Install
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
      .catch(err => {
        console.error('[SW] Cache install failed:', err);
        return self.skipWaiting();
      })
  );
});

// Activate - clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => {
        return Promise.all(
          keys
            .filter(key => key !== CACHE_NAME)
            .map(key => caches.delete(key))
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch - network first
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  try {
    const url = new URL(request.url);
    if (!url.protocol.startsWith('http')) return;
  } catch (e) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(request, clone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(request)
          .then(cached => {
            if (cached) return cached;
            if (request.mode === 'navigate') {
              return caches.match('./index.html');
            }
            return new Response('Offline', { status: 503 });
          });
      })
  );
});

// Push notifications
self.addEventListener('push', (event) => {
  let data = { title: 'PAW Emergency', body: 'تنبيه جديد عن الحرائق' };
  if (event.data) {
    try { data = event.data.json(); } catch (e) { data.body = event.data.text(); }
  }

  const options = {
    body: data.body,
    icon: './icons/icon-192.png',
    badge: './icons/icon-192.png',
    vibrate: [200, 100, 200],
    tag: 'paw-emergency-alert',
    renotify: true,
    data: { url: './index.html' }
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'PAW Emergency', options)
  );
});

// Notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        for (const client of clientList) {
          if (client.url.includes('index.html') && 'focus' in client) {
            return client.focus();
          }
        }
        return clients.openWindow(event.notification.data?.url || './index.html');
      })
  );
});
