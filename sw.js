/**
 * SkyTrace Service Worker v7 - Network First + Offline Cache
 *
 * 策略:
 * - 静态资源 (JS/CSS/图标): stale-while-revalidate (先缓存后更新)
 * - API 请求: network-first (优先网络, 失败用缓存)
 * - 地图瓦片: cache-first (优先缓存, 大幅提升地图加载速度)
 * - HTML 页面: network-first (确保最新)
 */

const CACHE_VERSION = 'skytrace-v25';
const STATIC_CACHE = CACHE_VERSION + '-static';
const API_CACHE    = CACHE_VERSION + '-api';
const TILE_CACHE   = CACHE_VERSION + '-tiles';

// 预缓存核心资源
const PRECACHE_URLS = [
  './',
  './static/css/style.css',
  './static/js/static-mode.js',
  './static/js/app.js',
  './static/js/i18n.js',
  './static/lib/leaflet.js',
  './static/lib/leaflet.css',
  './static/lib/arc.js',
  './static/lib/html2canvas.min.js',
  './static/lib/leaflet-heat.js',
  './static/icons/icon-192.png',
  './static/icons/icon-512.png',
  './static/icons/apple-touch-icon.png',
  './favicon.ico',
  './static/manifest.json',
  './data/airports.json',
  './data/airlines.json',
];

// ==================== Install ====================
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// ==================== Activate ====================
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names =>
      Promise.all(
        names
          .filter(name => name !== STATIC_CACHE && name !== API_CACHE && name !== TILE_CACHE)
          .map(name => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ==================== Fetch ====================
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 跳过非 GET 请求
  if (event.request.method !== 'GET') return;

  // 1. 地图瓦片: cache-first (大幅提升地图体验)
  if (url.hostname.includes('basemaps.cartocdn.com') ||
      url.hostname.includes('tile.openstreetmap.org')) {
    event.respondWith(cacheFirst(event.request, TILE_CACHE));
    return;
  }

  // 2. API 请求: network-first
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(event.request, API_CACHE));
    return;
  }

  // 3. 静态资源: stale-while-revalidate (不缓存sw.js自身)
  if (url.pathname.startsWith('/static/')) {
    event.respondWith(networkFirst(event.request, STATIC_CACHE));
    return;
  }

  // 4. HTML 页面: network-first
  if (event.request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(networkFirst(event.request, STATIC_CACHE));
    return;
  }

  // 默认: network-first
  event.respondWith(networkFirst(event.request, STATIC_CACHE));
});

// ==================== 缓存策略 ====================

/** Cache-first: 优先缓存, 无缓存才走网络 (适合地图瓦片) */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    return new Response('', { status: 408, statusText: 'Offline' });
  }
}

/** Network-first: 优先网络, 网络失败用缓存 */
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    // 👇 关键修改：强制 Safari 绕过本地磁盘缓存，真正去网络请求！
    const fetchReq = new Request(request.url, {
      method: request.method,
      headers: request.headers,
      cache: 'no-cache' // 给 Safari 的一记重锤
    });
    
    const response = await fetch(fetchReq);
    if (response.ok) {
      const cacheKey = stripQuery(request);
      cache.put(cacheKey, response.clone());
    }
    return response;
  } catch (err) {
    const cacheKey = stripQuery(request);
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
    if (request.headers.get('accept')?.includes('text/html')) {
      const fallback = await cache.match('/');
      if (fallback) return fallback;
    }
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

/** Stale-while-revalidate: 先返回缓存, 后台更新 */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cacheKey = stripQuery(request);
  const cached = await cache.match(cacheKey);

  const fetchPromise = fetch(request).then(response => {
    if (response.ok) {
      cache.put(cacheKey, response.clone());
    }
    return response;
  }).catch(() => null);

  if (cached) {
    fetchPromise; // fire-and-forget
    return cached;
  }

  const response = await fetchPromise;
  return response || new Response('Offline', { status: 503 });
}

/** 去掉 URL query string 用于缓存匹配 */
function stripQuery(request) {
  const url = new URL(request.url);
  url.search = '';
  return new Request(url.toString(), { headers: request.headers });
}
