/**
 * SkyTrace Service Worker
 * 缓存策略: 网络优先，离线回退到缓存
 */

const CACHE_NAME = 'skytrace-v2';
const PRECACHE_URLS = [
  '/',
  '/static/css/style.css',
  '/static/js/app.js',
  '/static/js/i18n.js',
  '/static/manifest.json',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/arc@0.1.1/arc.js',
  'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js',
];

// 安装: 预缓存核心资源
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// 激活: 清理旧缓存
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names =>
      Promise.all(
        names.filter(name => name !== CACHE_NAME).map(name => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

// 请求拦截: 网络优先，失败回退缓存
self.addEventListener('fetch', event => {
  // 跳过 API 请求的缓存（保持实时性）
  if (event.request.url.includes('/api/')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // 缓存成功的 GET 请求
        if (response.ok && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
