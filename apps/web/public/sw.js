/* Orcadom service worker — cache version 0.12.0 (release tag v0.12.0) */
/* eslint-disable */
importScripts('https://storage.googleapis.com/workbox-cdn/releases/7.3.0/workbox-sw.js');

const APP_VERSION = '0.12.0';
const CACHE_PREFIX = 'orcadom';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);
const CACHE_ENABLED = !LOCAL_HOSTS.has(self.location.hostname);

workbox.setConfig({ debug: false });
workbox.core.setCacheNameDetails({ prefix: CACHE_PREFIX, suffix: APP_VERSION });
workbox.core.skipWaiting();
workbox.core.clientsClaim();
workbox.precaching.cleanupOutdatedCaches();

function isApiRequest({ url }) {
  return url.pathname === '/backend' || url.pathname.startsWith('/backend/');
}

function isStaticAsset({ request, url }) {
  if (isApiRequest({ url })) return false;
  if (url.pathname === '/sw.js' || url.pathname === '/manifest.webmanifest') return false;
  return ['style', 'script', 'font', 'image'].includes(request.destination);
}

if (CACHE_ENABLED) {
  workbox.routing.registerRoute(
    isStaticAsset,
    new workbox.strategies.CacheFirst({
      cacheName: CACHE_PREFIX + '-assets-' + APP_VERSION,
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 80,
          maxAgeSeconds: 30 * 24 * 60 * 60,
        }),
      ],
    }),
  );

  workbox.routing.registerRoute(
    ({ request }) => request.mode === 'navigate',
    new workbox.strategies.NetworkFirst({
      cacheName: CACHE_PREFIX + '-shell-' + APP_VERSION,
      networkTimeoutSeconds: 8,
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 20,
          maxAgeSeconds: 24 * 60 * 60,
        }),
      ],
    }),
  );

  workbox.routing.registerRoute(
    isApiRequest,
    new workbox.strategies.NetworkFirst({
      cacheName: CACHE_PREFIX + '-api-' + APP_VERSION,
      networkTimeoutSeconds: 8,
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 30,
          maxAgeSeconds: 60,
        }),
      ],
    }),
  );
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX + '-') && !key.includes(APP_VERSION))
          .map((key) => caches.delete(key)),
      ),
    ),
  );
});

self.addEventListener('push', (event) => {
  let payload = { title: 'Orcadom', body: '', url: '/dashboard', tag: undefined };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    if (event.data) payload.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      data: { url: payload.url || '/dashboard' },
      tag: payload.tag,
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/dashboard', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const existing = windows.find((client) => client.url.startsWith(self.location.origin));
      if (existing) {
        existing.postMessage({ type: 'ORCADOM_NAVIGATE', url: target });
        return existing.focus();
      }
      return self.clients.openWindow(target);
    }),
  );
});
