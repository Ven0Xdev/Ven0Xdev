/**
 * Nexora service worker.
 *
 * Honesty contract (mirrors the backend's provenance rules): a response
 * served from cache is ALWAYS marked so the page can label it. Live/mutating
 * traffic is NEVER cached and NEVER faked while offline.
 *
 *  - Real-time streaming (`/stream/`) is never intercepted — SSE must reach
 *    the network or fail visibly, never serve a stale event from cache.
 *  - Non-GET requests (POST/DELETE/...) are never intercepted — a write
 *    must reach the server or fail; it is never silently "succeeded" from
 *    the service worker.
 *  - Per-user endpoints (watchlist/portfolio/chat) are never cached, so one
 *    browser profile can never see another user's cached private data.
 *  - Every other API GET is network-first: on success the fresh response is
 *    returned untouched (no cache markers) and a *copy* is stored with an
 *    `X-Nexora-Cached-At` timestamp. On network failure, the stored copy is
 *    returned with `X-Nexora-Cache: offline-fallback` added — the client
 *    reads that header to render "Offline — cached data" and must never
 *    treat such a response as live.
 */

const CACHE_VERSION = "v1";
const SHELL_CACHE = `nexora-shell-${CACHE_VERSION}`;
const API_CACHE = `nexora-api-${CACHE_VERSION}`;
const CURRENT_CACHES = new Set([SHELL_CACHE, API_CACHE]);

const PRECACHE_URLS = [
  "/",
  "/offline.html",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
];

// Endpoints that carry per-user private data — never cached, so one
// browser profile can never be shown another user's offline data.
const NEVER_CACHE_PATH_FRAGMENTS = ["/watchlist", "/portfolio", "/chat/", "/auth/"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url)));
    })()
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => !CURRENT_CACHES.has(n)).map((n) => caches.delete(n)));
      await self.clients.claim();
    })()
  );
});

function isApiRequest(url) {
  return url.pathname.includes("/api/v1/");
}

function isStreamRequest(url) {
  return url.pathname.includes("/stream/");
}

function isPrivatePath(url) {
  return NEVER_CACHE_PATH_FRAGMENTS.some((fragment) => url.pathname.includes(fragment));
}

function isNextInternalFetch(request, url) {
  // Client-side router transitions fetch RSC payloads, not full navigations
  // — never intercept these, or we risk corrupting Next's own router cache.
  return request.headers.get("RSC") === "1" || url.searchParams.has("_rsc");
}

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname === "/favicon.ico" ||
    url.pathname === "/manifest.webmanifest" ||
    /\.(png|svg|ico|woff2?)$/.test(url.pathname)
  );
}

async function cloneWithHeader(response, headerName, headerValue) {
  const headers = new Headers(response.headers);
  headers.set(headerName, headerValue);
  const body = await response.clone().blob();
  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

/** Cache-first: correct for hashed, immutable Next.js build assets. */
async function cacheFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) cache.put(request, response.clone());
  return response;
}

/**
 * Network-first for API reads: fresh data is returned untouched (never
 * marked as cached); on failure, the last stored copy is returned tagged
 * `X-Nexora-Cache: offline-fallback` with its original store-time
 * `X-Nexora-Cached-At` timestamp intact.
 */
async function networkFirstApi(request) {
  const cache = await caches.open(API_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const stamped = await cloneWithHeader(response, "X-Nexora-Cached-At", new Date().toISOString());
      cache.put(request, stamped);
    }
    return response;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cloneWithHeader(cached, "X-Nexora-Cache", "offline-fallback");
    throw err; // nothing cached — let the page see a real network failure
  }
}

/** Network-first for page navigations, falling back to the offline shell. */
async function navigationFallback(request) {
  try {
    return await fetch(request);
  } catch {
    const shell = await caches.open(SHELL_CACHE);
    const cached = await shell.match(request);
    return cached || (await shell.match("/offline.html"));
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // never intercept writes

  const url = new URL(request.url);
  if (isStreamRequest(url)) return; // never intercept SSE/live streaming
  if (isNextInternalFetch(request, url)) return;

  if (isApiRequest(url)) {
    if (isPrivatePath(url)) return; // never cache per-user private data
    event.respondWith(networkFirstApi(request));
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(navigationFallback(request));
  }
});

/** Silently refresh cached API entries when the page confirms connectivity
 * is back — keeps the cache warm without disturbing the live page, which
 * re-fetches fresh data on its own via the 'nexora:resync' event. */
async function revalidateApiCache() {
  const cache = await caches.open(API_CACHE);
  const requests = await cache.keys();
  await Promise.allSettled(
    requests.map(async (req) => {
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok) {
          const stamped = await cloneWithHeader(fresh, "X-Nexora-Cached-At", new Date().toISOString());
          await cache.put(req, stamped);
        }
      } catch {
        // still unreachable — leave the existing cache entry as-is
      }
    })
  );
}

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
  if (event.data?.type === "REVALIDATE_API_CACHE") event.waitUntil(revalidateApiCache());
});
