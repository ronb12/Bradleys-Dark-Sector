/* Dark Sector offline shell: generated version token is replaced by scripts/build-pwa.mjs. */
const CACHE_VERSION = "__DS_CACHE_VERSION__";
const CACHE_NAME = "dark-sector-" + CACHE_VERSION;
const CACHE_PREFIX = "dark-sector-";
const APP_SHELL = ["/", "/index.html", "/manifest.webmanifest", "/icons/dark-sector-192.png", "/icons/dark-sector-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL);
    const response = await fetch("/pwa-precache.json", { cache: "no-store" });
    if (!response.ok) throw new Error("PWA pre-cache inventory unavailable");
    const assets = await response.json();
    if (!Array.isArray(assets)) throw new Error("Invalid asset inventory");
    // Code chunks are required to launch offline; fail installation if missing.
    const critical = assets.filter((url) => url.startsWith("/assets/"));
    await cache.addAll(critical);
    // Models, textures and sound packs are optional during installation. Best
    // effort caching avoids blocking app updates when a large optional asset fails.
    const optional = assets.filter((url) => !url.startsWith("/assets/") && !APP_SHELL.includes(url));
    for (let i = 0; i < optional.length; i += 6) {
      await Promise.allSettled(optional.slice(i, i + 6).map((url) => cache.add(url)));
    }
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/pvp/") || url.pathname === "/lobbies") return;
  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) (await caches.open(CACHE_NAME)).put("/index.html", response.clone());
        return response;
      } catch {
        return (await caches.match("/index.html")) || Response.error();
      }
    })());
    return;
  }
  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok && response.type === "basic" && /.(?:js|css|png|jpg|jpeg|webp|svg|glb|fbx|wav|ogg|woff2?|json|webmanifest)$/i.test(url.pathname)) {
        (await caches.open(CACHE_NAME)).put(request, response.clone());
      }
      return response;
    } catch {
      return Response.error();
    }
  })());
});
