/**
 * SeyalPro Service Worker
 * App Shell Caching & Offline Fallback Handler
 */

const CACHE_NAME = "seyalpro-app-shell-v2";

const STATIC_ASSETS = [
  "/",
  "/favicon.ico",
  "/dummy-logo.svg",
  "/manifest.json",
];

// Install: pre-cache critical shell assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn("[SW] Asset caching failed:", err);
      });
    })
  );
  self.skipWaiting();
});

// Activate: clean old cache versions
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch: Strategy
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // 1. Bypass all API calls and Supabase endpoints (these are managed by IndexedDB & Auth)
  if (
    url.pathname.startsWith("/api/") ||
    url.hostname.includes("supabase.co") ||
    event.request.method !== "GET"
  ) {
    return;
  }

  // 2a. Code bundles (JS/CSS): Network-First, cache only as offline fallback.
  // Cache-first here served stale app code after deploys/dev edits.
  if (
    url.pathname.startsWith("/_next/") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".js")
  ) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          return cached || new Response("", { status: 404 });
        })
    );
    return;
  }

  // 2b. Images & fonts (rarely change): Cache-First
  if (
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".ico") ||
    url.pathname.endsWith(".woff2") ||
    url.pathname.endsWith(".woff")
  ) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request)
          .then((response) => {
            if (response && response.status === 200) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            }
            return response;
          })
          .catch(() => new Response("", { status: 404 }));
      })
    );
    return;
  }

  // 3. Navigation (HTML Pages): Network-First with Cache fallback
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          if (cached) return cached;
          const fallback = await caches.match("/");
          if (fallback) return fallback;
          return new Response(
            `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>SeyalPro - Offline Mode</title><meta name="viewport" content="width=device-width,initial-scale=1"/><style>body{font-family:system-ui,-apple-system,sans-serif;background:#0f172a;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;padding:24px;box-sizing:border-box;text-align:center}.card{max-width:420px;background:#1e293b;padding:32px;border-radius:20px;border:1px solid #334155;box-shadow:0 20px 25px -5px rgba(0,0,0,0.5)}h1{font-size:1.25rem;font-weight:700;margin:12px 0 8px}p{color:#94a3b8;font-size:0.875rem;line-height:1.5;margin:0 0 20px}.badge{display:inline-block;padding:4px 12px;background:#d97706;color:#fff;font-size:0.75rem;font-weight:700;border-radius:9999px;margin-bottom:12px}.btn{background:#2563eb;color:#fff;border:none;padding:10px 20px;border-radius:12px;font-size:0.875rem;font-weight:600;cursor:pointer;transition:all .15s}.btn:hover{background:#1d4ed8}</style></head><body><div class="card"><div class="badge">OFFLINE MODE</div><h1>SeyalPro Local Terminal</h1><p>You are working offline. Your billing records and local data are preserved and will automatically synchronize when connected.</p><button class="btn" onclick="window.history.back()">Return to Last Screen</button></div></body></html>`,
            {
              headers: { "Content-Type": "text/html" },
            }
          );
        })
    );
    return;
  }
});
