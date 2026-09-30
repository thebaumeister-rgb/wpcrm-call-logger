const CACHE_NAME = "wpcrm-call-logger-v20";
const ASSETS = [
  "./entry-tools.js?v=20",
  "./papaparse.min.js",
  "./",
  "./index.html",
  "./styles.css?v=20",
  "./app.js?v=20",
  "./manifest.webmanifest?v=20",
  "./icon-192.png",
  "./icon-512.png",
  "./START-HERE.html",
  "./icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key.startsWith("wpcrm-call-logger-") && key !== CACHE_NAME).map((key) => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(async () => {
      const cache = await caches.open(CACHE_NAME);
      return await cache.match(event.request, { ignoreSearch: true }) || await cache.match("./index.html");
    }));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request);
    })
  );
});
