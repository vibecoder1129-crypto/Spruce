// Spruce service worker (slice 11). It keeps one thing: the offline page and the static files it
// needs. Pages always come from the network; only when that fails is the offline page shown.
// No page, API answer or customer data is ever cached here.
const CACHE = "spruce-offline-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const page = await fetch("/offline", { cache: "reload" });
      if (!page.ok) throw new Error("The offline page didn't load.");
      const html = await page.clone().text();
      await cache.put("/offline", page);
      // Its styles and scripts (content-hashed, the same for everyone).
      const files = new Set(html.match(/\/_next\/static\/[^"'\s)\\]+/g) ?? []);
      // One missing file mustn't stop the offline page itself from working.
      await Promise.allSettled([...files].map((file) => cache.add(file)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/offline")));
    return;
  }
  const url = new URL(request.url);
  if (url.origin === self.location.origin && url.pathname.startsWith("/_next/static/")) {
    event.respondWith(fetch(request).catch(async () => (await caches.match(request)) ?? Response.error()));
  }
});
