// Service Worker for Syariah Swing Radar Pro - v1.9.8
const CACHE_NAME = 'syariah-radar-v1.9.8';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Purging old cache:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Network-first strategy with cache fallback
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. Navigation requests (HTML) & API calls: Always network, NEVER stale cache
  if (event.request.mode === 'navigate' || url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // 2. Static files (CSS/JS/Icons): Network first, fallback to cache
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && event.request.method === 'GET') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});

// -------------------------------------------------------------
// WEB PUSH NOTIFICATION EVENTS (PWA)
// -------------------------------------------------------------
self.addEventListener('push', (event) => {
  let payload = {
    title: '🔔 Syariah Swing Radar Pro',
    body: 'Sinyal baru saham syariah terdeteksi!',
    icon: '/static/icon-192.png',
    badge: '/static/icon-192.png',
    tag: 'syariah-radar-signal',
    url: '/'
  };

  try {
    if (event.data) {
      const json = event.data.json();
      payload = Object.assign(payload, json);
    }
  } catch (e) {
    if (event.data) payload.body = event.data.text();
  }

  const options = {
    body: payload.body,
    icon: payload.icon || '/static/icon-192.png',
    badge: payload.badge || '/static/icon-192.png',
    tag: payload.tag || 'syariah-radar-signal',
    vibrate: [250, 100, 250],
    data: { url: payload.url || '/' }
  };

  event.waitUntil(self.registration.showNotification(payload.title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) ? event.notification.data.url : '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
