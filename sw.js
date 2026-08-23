// ---------------------------------------------
// SERVICE WORKER
// This is a special script that runs separately from your page,
// in the background, even when the tab is closed. Its job here is
// simple: let the app open even with no internet connection.
//
// IMPORTANT DESIGN CHOICE (given the caching issues we hit before):
// This uses a "network-first" strategy — always try to fetch the
// LATEST version from the internet first. Only if that fails
// (you're offline / no signal) does it serve the saved copy.
// This means you will never get stuck on an old version again —
// worst case, you just fall back to whatever was last successfully loaded.
// ---------------------------------------------

// Bump this version number any time you want to force everyone's
// saved copy to be replaced (rarely needed, since network-first
// already keeps things fresh whenever you have signal).
const CACHE_NAME = 'attendance-cache-v1';

const FILES_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Runs once when the service worker is first installed.
// We pre-save a copy of every core file.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(FILES_TO_CACHE))
  );
  self.skipWaiting(); // activate this new version immediately, don't wait
});

// Runs when a new version of this service worker takes over.
// Deletes any old, outdated caches so they don't pile up.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Runs every time the page requests a file (HTML, CSS, JS, etc).
self.addEventListener('fetch', (event) => {
  event.respondWith(
    // 1. Try the network first (gets you the latest version).
    fetch(event.request)
      .then((response) => {
        // If it succeeded, save a fresh copy for next time you're offline.
        const responseCopy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseCopy));
        return response;
      })
      // 2. If the network fails (no signal), fall back to the saved copy.
      .catch(() => caches.match(event.request))
  );
});
