// Offline safety net: keeps the last successfully loaded itinerary readable without network.
// Online behaviour is unchanged (network first); cached copies are only served on failure.
const VERSION = "v1";
const STATIC = `static-${VERSION}`;
const PAGES = `pages-${VERSION}`;
const DATA = `data-${VERSION}`;
const OFFLINE_HEADER = "x-offline-snapshot";
const CACHED_AT = "x-cached-at";

// Paths below are relative to wherever the app is mounted (supports a sub-path deployment).
const ROOT = new URL(self.registration.scope).pathname.replace(/\/$/, "");
const rel = (pathname) => (pathname.startsWith(ROOT) ? pathname.slice(ROOT.length) : pathname);

// Trip info and plan only — enough to see where to go next and where to sleep.
const DATA_PATHS = [/^\/api\/trips\/[0-9a-f-]{36}$/, /^\/api\/trips\/[0-9a-f-]{36}\/plan$/];

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (![STATIC, PAGES, DATA].includes(key)) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

async function stamp(res) {
  const headers = new Headers(res.headers);
  headers.set(CACHED_AT, new Date().toISOString());
  return new Response(await res.clone().blob(), { status: res.status, statusText: res.statusText, headers });
}

async function networkFirst(req, cacheName, markOffline) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, await stamp(res));
    return res;
  } catch (err) {
    const hit = await cache.match(req);
    if (!hit) throw err;
    if (!markOffline) return hit;
    const headers = new Headers(hit.headers);
    headers.set(OFFLINE_HEADER, hit.headers.get(CACHED_AT) || "");
    return new Response(await hit.blob(), { status: hit.status, headers });
  }
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;
  const path = rel(url.pathname);

  if (path.startsWith("/_next/static/")) {
    e.respondWith(
      caches.open(STATIC).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
    return;
  }
  if (DATA_PATHS.some((re) => re.test(path))) {
    e.respondWith(networkFirst(req, DATA, true));
    return;
  }
  if (req.mode === "navigate" && path.startsWith("/t/")) {
    e.respondWith(
      networkFirst(req, PAGES, false).catch(async () => {
        // Any cached page of the same trip can boot the client app.
        const trip = ROOT + path.split("/").slice(0, 3).join("/");
        const cache = await caches.open(PAGES);
        return (await cache.match(trip)) || (await cache.match(req, { ignoreSearch: true })) || Response.error();
      }),
    );
  }
});
