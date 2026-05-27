// Bump VERSION when shell files (index.html, app.js, styles.css, icons, manifest) change.
// chats.md and avatars are network-first and bypass the cache version.
const VERSION = 'v1';
const CACHE = `wa-fake-${VERSION}`;
const SHELL = [
  './',
  './index.html',
  './app.js',
  './styles.css',
  './manifest.json',
  './assets/icons.svg',
  './assets/doodle.svg',
  './assets/icon.svg',
  './assets/icon-maskable.svg',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/icon-maskable-512.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL).catch(() => null)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Network-first paths (so edits to content show up on reload)
  const isContent = url.pathname.endsWith('/chats.md') || url.pathname.includes('/avatars/');
  // Also network-first for navigation requests (HTML), so app code/shell can update too
  const isNavigation = req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('/index.html');

  if (isContent || isNavigation) {
    event.respondWith(
      fetch(req, { cache: 'no-store' })
        .then(res => {
          // Cache a copy for offline fallback
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  // Cache-first for everything else (CSS, JS, SVG sprite, icons)
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        if (res.ok && url.origin === location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
        }
        return res;
      });
    })
  );
});
