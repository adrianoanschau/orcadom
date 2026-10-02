import { readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import workboxBuild from 'workbox-build';
import { formatAppVersion } from '../src/lib/app-version.mjs';
import { readReleaseVersion } from '../src/lib/release-version.mjs';

const webDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = join(webDir, 'public');

/** Mesmo valor de `NEXT_PUBLIC_APP_VERSION` em `next.config.ts`. */
const version = formatAppVersion(readReleaseVersion(webDir), process.env.APP_VERSION_SUFFIX);

const manifestSource = readFileSync(join(webDir, 'src/app/manifest.ts'), 'utf8');
const startUrl = /start_url:\s*'([^']+)'/.exec(manifestSource)?.[1];
if (!startUrl || !startUrl.startsWith('/')) {
  throw new Error('start_url ausente em src/app/manifest.ts');
}

for (const entry of readdirSync(publicDir)) {
  if (entry.startsWith('workbox-')) {
    rmSync(join(publicDir, entry), { recursive: true, force: true });
  }
}

const workboxDir = await workboxBuild.copyWorkboxLibraries(publicDir);

const source = `/* Orcadom service worker — cache version ${version} */
/* eslint-disable */
importScripts('/${workboxDir}/workbox-sw.js');

const APP_VERSION = '${version}';
const CACHE_PREFIX = 'orcadom';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);
const CACHE_ENABLED = !LOCAL_HOSTS.has(self.location.hostname);

const SHELL_CACHE = CACHE_PREFIX + '-shell-' + APP_VERSION;
const API_CACHE = CACHE_PREFIX + '-api-' + APP_VERSION;
const ASSET_CACHE = CACHE_PREFIX + '-assets-' + APP_VERSION;
const PRECACHE_CACHE = CACHE_PREFIX + '-precache-' + APP_VERSION;
const OFFLINE_URL = '/offline';
const START_URL = '${startUrl}';
const NETWORK_TIMEOUT_SECONDS = 4;
const WEEK_SECONDS = 7 * 24 * 60 * 60;

const ASSET_URLS = [
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-512-maskable.png',
];

workbox.setConfig({
  debug: false,
  modulePathPrefix: '/${workboxDir}/',
});
workbox.core.skipWaiting();
workbox.core.clientsClaim();

function isApiRequest(url) {
  return url.pathname === '/backend' || url.pathname.startsWith('/backend/');
}

function isAuthApi(url) {
  return (
    url.pathname === '/backend/auth' ||
    url.pathname.startsWith('/backend/auth/') ||
    url.pathname.includes('/logout')
  );
}

function isCacheableApiGet({ request, url }) {
  if (request.method !== 'GET') return false;
  if (!isApiRequest(url)) return false;
  if (isAuthApi(url)) return false;
  return true;
}

function isRscRequest({ request, url }) {
  if (request.method !== 'GET' || request.mode === 'navigate' || isApiRequest(url)) return false;
  if (request.headers.get('Next-Router-Prefetch') === '1') return false;
  if (request.headers.get('RSC') === '1' || url.searchParams.has('_rsc')) return true;
  return (request.headers.get('Accept') || '').includes('text/x-component');
}

function isStaticAsset({ request, url }) {
  if (isApiRequest(url)) return false;
  if (url.pathname === '/sw.js' || url.pathname.startsWith('/${workboxDir}')) return false;
  if (url.pathname === '/manifest.webmanifest' || url.pathname.startsWith('/icons/')) return true;
  return ['style', 'script', 'font', 'image'].includes(request.destination);
}

function cachePlugins(maxEntries, maxAgeSeconds) {
  return [
    new workbox.cacheableResponse.CacheableResponsePlugin({ statuses: [200] }),
    {
      cacheWillUpdate: async ({ response }) => {
        if (!response || response.redirected) return null;
        return response;
      },
    },
    new workbox.expiration.ExpirationPlugin({
      maxEntries: maxEntries,
      maxAgeSeconds: maxAgeSeconds,
    }),
  ];
}

const rscCacheKeyPlugin = {
  cacheKeyWillBeUsed: async ({ request }) => {
    const url = new URL(request.url);
    url.searchParams.delete('_rsc');
    return url.href;
  },
};

const apiCacheKeyPlugin = {
  cacheKeyWillBeUsed: async ({ request }) => {
    const url = new URL(request.url);
    const household = request.headers.get('x-household-id');
    if (household) url.searchParams.set('__household', household);
    return url.href;
  },
};

async function precacheUrl(cache, path, required) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    redirect: 'manual',
    cache: 'reload',
  });
  if (response.status !== 200) {
    if (required) throw new Error('Precache falhou: ' + path + ' (' + response.status + ')');
    return;
  }
  await cache.put(path, response);
}

if (CACHE_ENABLED) {
  self.addEventListener('install', (event) => {
    event.waitUntil(
      (async () => {
        const precache = await caches.open(PRECACHE_CACHE);
        const shell = await caches.open(SHELL_CACHE);
        const assets = await caches.open(ASSET_CACHE);
        await precacheUrl(precache, OFFLINE_URL, true);
        await precacheUrl(shell, OFFLINE_URL, true);
        for (const path of ASSET_URLS) await precacheUrl(assets, path, true);
        await precacheUrl(shell, START_URL, false);
      })(),
    );
  });

  workbox.routing.registerRoute(
    isStaticAsset,
    new workbox.strategies.CacheFirst({
      cacheName: ASSET_CACHE,
      plugins: cachePlugins(80, 30 * 24 * 60 * 60),
    }),
  );

  workbox.routing.registerRoute(
    ({ request }) => request.mode === 'navigate',
    new workbox.strategies.NetworkFirst({
      cacheName: SHELL_CACHE,
      networkTimeoutSeconds: NETWORK_TIMEOUT_SECONDS,
      plugins: cachePlugins(40, WEEK_SECONDS),
    }),
  );

  workbox.routing.registerRoute(
    isRscRequest,
    new workbox.strategies.NetworkFirst({
      cacheName: SHELL_CACHE,
      networkTimeoutSeconds: NETWORK_TIMEOUT_SECONDS,
      plugins: [rscCacheKeyPlugin].concat(cachePlugins(40, WEEK_SECONDS)),
    }),
  );

  workbox.routing.registerRoute(
    isCacheableApiGet,
    new workbox.strategies.NetworkFirst({
      cacheName: API_CACHE,
      networkTimeoutSeconds: NETWORK_TIMEOUT_SECONDS,
      plugins: [apiCacheKeyPlugin].concat(cachePlugins(60, WEEK_SECONDS)),
    }),
  );

  workbox.routing.setCatchHandler(async ({ request }) => {
    if (request.mode === 'navigate') {
      const offline =
        (await caches.match(OFFLINE_URL, { cacheName: PRECACHE_CACHE })) ||
        (await caches.match(OFFLINE_URL));
      if (offline) return offline;
    }
    return Response.error();
  });
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX + '-') && !key.endsWith('-' + APP_VERSION))
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
`;

writeFileSync(join(publicDir, 'sw.js'), source);
console.log(`Wrote public/sw.js for v${version} (workbox /${workboxDir}/, start ${startUrl})`);
