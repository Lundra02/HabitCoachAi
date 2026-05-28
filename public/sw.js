const CACHE_NAME = "habitcoach-v2";
const ASSETS_TO_CACHE = [
  "/",
  "/index.html",
  "/login.html",
  "/signup.html",
  "/reset-password.html",
  "/reset-password.js",
  "/verify.html",
  "/verify.js",
  "/style.css",
  "/script.js",
  "/manifest.json",
  "/icon-192.svg",
  "/icon-512.svg",
  "https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js",
  "https://cdn.jsdelivr.net/npm/chart.js"
];

// Install: pre-cache static assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        ASSETS_TO_CACHE.map((asset) => cache.add(asset))
      );
    }).then(() => self.skipWaiting())
  );
});

// Activate: clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: serve cached shell, network first for APIs
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Bypass API calls (do not cache dynamic backend endpoints)
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Cache-first strategy for static assets, fall back to network
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      
      return fetch(event.request).then((response) => {
        // If response is valid, cache it for future offline usage
        if (response && response.status === 200 && response.type === "basic") {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      }).catch(() => {
        // If network fetch fails and user is offline, return index.html for navigation routes
        if (event.request.mode === "navigate") {
          return caches.match("/index.html");
        }
      });
    })
  );
});
