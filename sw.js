const CACHE_VERSION = 'v2';
const CACHE_NAME = 'sos-forest-' + CACHE_VERSION;
const STATIC_CACHE = 'sos-forest-static-' + CACHE_VERSION;
const DYNAMIC_CACHE = 'sos-forest-dynamic-' + CACHE_VERSION;

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/app.js',
  '/js/wilayas.js',
  '/js/firebase-config.js',
  '/js/nasa-api.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png'
];

const EXTERNAL_API_CACHE = [
  'firemap.live',
  'geo.firemap.live',
  'nasa.gov',
  'firms.modaps.eosdis.nasa.gov',
  'openweathermap.org'
];

// Install
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => {
        return Promise.all(
          keys
            .filter(key => key !== STATIC_CACHE && key !== DYNAMIC_CACHE)
            .map(key => {
              console.log('[SW] Deleting old cache:', key);
              return caches.delete(key);
            })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET
  if (request.method !== 'GET') return;

  // Skip chrome-extension and other non-http
  if (!url.protocol.startsWith('http')) return;

  // External APIs - network first, no cache
  if (isExternalAPI(url.hostname)) {
    event.respondWith(networkFirst(request));
    return;
  }

  // FireMap iframe - network only
  if (url.hostname.includes('firemap.live')) {
    event.respondWith(
      fetch(request).catch(() => {
        return new Response('', { status: 503, statusText: 'Offline' });
      })
    );
    return;
  }

  // Static assets - cache first
  if (isStaticAsset(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Navigation - network first, fallback to cache
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstWithFallback(request));
    return;
  }

  // Everything else - stale while revalidate
  event.respondWith(staleWhileRevalidate(request));
});

// Strategies
function cacheFirst(request) {
  return caches.match(request)
    .then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(STATIC_CACHE).then(cache => cache.put(request, clone));
        }
        return response;
      });
    });
}

function networkFirst(request) {
  return fetch(request)
    .then(response => {
      if (response.ok) {
        const clone = response.clone();
        caches.open(DYNAMIC_CACHE).then(cache => cache.put(request, clone));
      }
      return response;
    })
    .catch(() => caches.match(request));
}

function networkFirstWithFallback(request) {
  return fetch(request)
    .then(response => {
      if (response.ok) {
        const clone = response.clone();
        caches.open(DYNAMIC_CACHE).then(cache => cache.put(request, clone));
      }
      return response;
    })
    .catch(() => {
      return caches.match(request)
        .then(cached => cached || caches.match('/index.html'));
    });
}

function staleWhileRevalidate(request) {
  return caches.match(request).then(cached => {
    const fetchPromise = fetch(request).then(response => {
      if (response.ok) {
        const clone = response.clone();
        caches.open(DYNAMIC_CACHE).then(cache => cache.put(request, clone));
      }
      return response;
    }).catch(() => cached);

    return cached || fetchPromise;
  });
}

function isStaticAsset(pathname) {
  return pathname.endsWith('.css') ||
         pathname.endsWith('.js') ||
         pathname.endsWith('.png') ||
         pathname.endsWith('.ico') ||
         pathname.endsWith('.json') ||
         pathname.endsWith('.svg');
}

function isExternalAPI(hostname) {
  return EXTERNAL_API_CACHE.some(domain => hostname.includes(domain));
}

// Push notifications
self.addEventListener('push', (event) => {
  let data = { title: 'SOS FOREST ALGERIA', body: 'تنبيه جديد关于 الحرائق' };
  if (event.data) {
    try { data = event.data.json(); } catch (e) { data.body = event.data.text(); }
  }

  const options = {
    body: data.body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    vibrate: [200, 100, 200],
    tag: 'sos-forest-alert',
    renotify: true,
    data: { url: '/index.html' },
    actions: [
      { action: 'open', title: 'فتح التطبيق' },
      { action: 'dismiss', title: 'تجاهل' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'SOS FOREST ALGERIA', options)
  );
});

// Notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(clientList => {
        for (const client of clientList) {
          if (client.url.includes('/index.html') && 'focus' in client) {
            return client.focus();
          }
        }
        return clients.openWindow(event.notification.data?.url || '/index.html');
      })
  );
});

// Background sync
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-reports') {
    event.waitUntil(syncReports());
  }
});

async function syncReports() {
  try {
    const cache = await caches.open('pending-reports');
    const keys = await cache.keys();
    for (const request of keys) {
      const response = await cache.match(request);
      const data = await response.json();
      // Report will be synced when online
      console.log('[SW] Syncing report:', data);
      await cache.delete(request);
    }
  } catch (e) {
    console.error('[SW] Sync failed:', e);
  }
}
