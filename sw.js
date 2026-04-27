/**
 * SkyTrace Service Worker v8.1
 *
 * 策略:
 * - 静态资源 (JS/CSS/图标): network-first (确保最新, 失败用缓存)
 * - API 请求: network-first (保留完整 query, 避免年份等参数被错误复用)
 * - 地图瓦片: network-first + cache fallback (减少空白瓦片长期驻留)
 * - HTML 页面: network-first (确保最新)
 */

const SW_QUERY_VERSION = new URL(self.location.href).searchParams.get('v') || '49';
const SW_TIMESTAMP = '20260427b';
const CACHE_VERSION = `skytrace-v${SW_QUERY_VERSION}-${SW_TIMESTAMP}`;
const STATIC_CACHE = CACHE_VERSION + '-static';
const API_CACHE    = CACHE_VERSION + '-api';
const TILE_CACHE   = CACHE_VERSION + '-tiles';

// 预缓存核心资源（不含 HTML 页面和大型 data JSON，避免重复请求）
const PRECACHE_URLS = [
  './static/css/style.css',
  './static/js/time-utils.js',
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
];

// ==================== Install ====================
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then(cache => cache.addAll(PRECACHE_URLS))
      // 不调用 skipWaiting() 以避免 SW 立即激活导致页面隐性重载
      // 新 SW 会在用户下次导航/重新打开时自动激活
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

// ==================== Message (允许页面主动触发 skipWaiting) ====================
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[SW] Page requested skipWaiting, activating now');
    self.skipWaiting();
  }
});

// ==================== Fetch ====================
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 跳过非 GET 请求
  if (event.request.method !== 'GET') return;

  // 1. 地图瓦片: cache-first（先展示缓存避免空白, 后台静默更新）
  if (url.hostname.includes('basemaps.cartocdn.com') ||
      url.hostname.includes('tile.openstreetmap.org')) {
    event.respondWith(cacheThenNetwork(event.request, TILE_CACHE, { stripQueryKey: false }));
    return;
  }

  // 2. API 请求: network-first
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(event.request, API_CACHE, { stripQueryKey: false }));
    return;
  }

  // 3. 静态资源: network-first (确保最新版本)
  if (url.pathname.startsWith('/static/')) {
    event.respondWith(networkFirst(event.request, STATIC_CACHE));
    return;
  }

  // 4. HTML 页面: network-only（不缓存，避免重复请求循环）
  if (event.request.headers.get('accept')?.includes('text/html')) {
    // 不拦截 HTML 请求，直接走网络
    return;
  }

  // 默认: network-first
  event.respondWith(networkFirst(event.request, STATIC_CACHE));
});

// ==================== 缓存策略 ====================

/** Network-first: 优先网络, 网络失败用缓存 */
async function networkFirst(request, cacheName, options = {}) {
  const { stripQueryKey = true } = options;
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
      const cacheKey = stripQueryKey ? stripQuery(request) : request;
      cache.put(cacheKey, response.clone());
    }
    return response;
  } catch (err) {
    const cacheKey = stripQueryKey ? stripQuery(request) : request;
    const cached = await cache.match(cacheKey);
    if (cached) return cached;
    if (request.headers.get('accept')?.includes('text/html')) {
      const fallback = await cache.match('/');
      if (fallback) return fallback;
    }
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
  }
}

/** Cache-then-Network: 立即返回缓存（避免瓦片空白），然后静默更新缓存 */
async function cacheThenNetwork(request, cacheName, options = {}) {
  const { stripQueryKey = true } = options;
  const cache = await caches.open(cacheName);
  const cacheKey = stripQueryKey ? stripQuery(request) : request;
  const cached = await cache.match(cacheKey);

  // 后台异步更新
  const networkPromise = fetch(request, { cache: 'no-cache' })
    .then(response => {
      if (response.ok) cache.put(cacheKey, response.clone());
      return response;
    })
    .catch(() => null);

  // 有缓存立刻返回，不等网络
  if (cached) {
    networkPromise; // 不 await，静默更新
    return cached;
  }

  // 无缓存时等网络
  try {
    const response = await networkPromise;
    if (response) return response;
  } catch (e) { /* fall through */ }

  return new Response('Tile unavailable', { status: 404 });
}

/** 去掉 URL query string 用于缓存匹配 */
function stripQuery(request) {
  const url = new URL(request.url);
  url.search = '';
  return new Request(url.toString(), { headers: request.headers });
}
