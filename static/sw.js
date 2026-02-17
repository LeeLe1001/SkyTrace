/**
 * SkyTrace Service Worker v4
 * 缓存策略: 网络优先，离线回退到缓存
 */

const CACHE_NAME = 'skytrace-v4';
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

// 安装: 预缓存核心资源，立即激活
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
  );
});

// 激活: 清理所有旧缓存，立即接管
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
  // 跳过 API 请求和 SW 自身
  if (event.request.url.includes('/api/') || event.request.url.includes('sw.js')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response.ok && event.request.method === 'GET') {
          // 缓存时去掉版本参数
          const cacheKey = new Request(event.request.url.split('?')[0]);
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(cacheKey, clone));
        }
        return response;
      })
      .catch(() => {
        // 离线回退: 去掉版本参数查找缓存
        const cacheKey = new Request(event.request.url.split('?')[0]);
        return caches.match(cacheKey).then(r => r || caches.match(event.request));
      })
  );
});
