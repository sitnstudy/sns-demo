// This worker intentionally stores nothing. It exists only to make the hosted
// Quode catalog installable; Quodes and generated exercises remain network-only.
async function clearAllCaches() {
  const names = await caches.keys();
  await Promise.all(names.map((name) => caches.delete(name)));
}

self.addEventListener("install", (event) => {
  event.waitUntil(clearAllCaches().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(clearAllCaches().then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  if (event.request.method === "GET") {
    event.respondWith(
      fetch(event.request, { cache: "no-store" }).catch(() => new Response("", {
        status: 503,
        statusText: "Network unavailable",
      })),
    );
  }
});
