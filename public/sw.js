const SHELL_VERSION = "saferoute-shell-v1.0.5";
const SHELL_URLS = [
  "/",
  "/manifest.webmanifest",
  "/icons/saferoute-192.png",
  "/icons/saferoute-512.png",
];
const HUMAN_REVIEW_PREFIXES = [
  "/tools/g5-spatial-review/",
  "/tools/rider-reference-review/",
  "/tools/operations-service-review/",
  "/artifacts/evals/screenshots/g5-",
  "/artifacts/evals/screenshots/rider-",
  "/artifacts/evals/screenshots/operations-",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_VERSION)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith("saferoute-shell-") && key !== SHELL_VERSION)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

async function networkFirstNavigation(request) {
  const cache = await caches.open(SHELL_VERSION);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put("/", response.clone());
    return response;
  } catch {
    const fallback = await cache.match("/");
    if (fallback) return fallback;
    return Response.error();
  }
}

async function cacheFirstStatic(request) {
  const cache = await caches.open(SHELL_VERSION);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

function isHumanReviewResource(url) {
  return HUMAN_REVIEW_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isHumanReviewResource(url)) {
    event.respondWith(fetch(request, { cache: "no-store" }));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (["script", "style", "image", "font", "manifest"].includes(request.destination)) {
    event.respondWith(cacheFirstStatic(request));
  }
});
