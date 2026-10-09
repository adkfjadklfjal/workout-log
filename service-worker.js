// 오프라인 지원: 앱 파일을 모두 캐시해 두고, 인터넷이 없어도 캐시에서 열림.
// 인터넷이 되면 캐시를 먼저 보여 주고 뒤에서 새 파일을 받아 두므로(stale-while-revalidate)
// 파일을 고치면 다음에 앱을 열 때 반영됨. 파일 목록을 바꾸면 CACHE_VERSION을 올릴 것.
const CACHE_VERSION = "v1";
const CACHE_NAME = `workout-${CACHE_VERSION}`;

// 서비스 워커 위치 기준 상대 경로
const APP_FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      // cache: "reload" → 브라우저 HTTP 캐시가 아니라 서버에서 새로 받아 저장
      .then((cache) => cache.addAll(APP_FILES.map((url) => new Request(url, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("workout-") && k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // 외부 요청은 건드리지 않음

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      // 페이지 이동(주소 뒤 ?·# 포함)은 모두 index.html로
      const cacheKey = request.mode === "navigate" ? "./index.html" : request;
      const cached = await cache.match(cacheKey, { ignoreSearch: true });

      const network = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(cacheKey, response.clone());
          return response;
        })
        .catch(() => null);

      if (cached) {
        event.waitUntil(network); // 뒤에서 새 버전 받아 두기
        return cached;
      }
      const fresh = await network;
      if (fresh) return fresh;
      // 캐시에도 없고 오프라인이면 페이지 이동은 앱 첫 화면으로
      if (request.mode === "navigate") {
        const fallback = await cache.match("./index.html");
        if (fallback) return fallback;
      }
      return new Response("오프라인이에요", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    })
  );
});
