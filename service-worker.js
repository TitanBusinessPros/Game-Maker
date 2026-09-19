// Minimal service worker - exists mainly to make the app-shell pages
// (index.html/admin.html/producer.html) installable as a PWA at all
// (that's the one thing a manifest.json alone can't do on its own on
// most platforms). Network-first, not cache-first: this project's real
// functionality (sign-in, saving maps, the shared asset library) needs
// live Firebase access anyway, so a stale cached copy should only ever
// be a soft fallback for "you're offline right now," never something
// that keeps someone using an old version while they're actually online.
// Bump CACHE_NAME any time the shell files themselves change enough to
// matter offline - it's what actually invalidates the old cache entries,
// since there's no build step here to hash filenames automatically.
const CACHE_NAME = 'gm-shell-v1';
const SHELL_FILES = [
  './index.html',
  './admin.html',
  './producer.html',
  './play.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Only ever intercept same-origin GET requests for the shell files
  // themselves - everything else (Firebase Auth/Firestore/Storage calls,
  // the Google Identity Services script, any cross-origin request at
  // all) goes straight to the network untouched, exactly as if this
  // service worker didn't exist.
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  const isShellFile = SHELL_FILES.some((f) => req.url.endsWith(f.replace('./', '/')));
  if (!isShellFile) return;
  event.respondWith(
    fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
      return res;
    }).catch(() => caches.match(req))
  );
});
