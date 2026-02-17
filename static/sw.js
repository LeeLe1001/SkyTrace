/**
 * SkyTrace Service Worker v6 - NOOP (自毁模式)
 * 此 SW 唯一目的: 清除所有旧缓存, 然后让所有请求直接走网络
 * 不缓存任何内容, 不拦截任何请求
 */

// 安装: 立即激活, 不预缓存任何内容
self.addEventListener('install', () => {
  self.skipWaiting();
});

// 激活: 删除所有缓存, 接管所有客户端
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(names =>
      Promise.all(names.map(name => {
        console.log('[SW v6] Deleting cache:', name);
        return caches.delete(name);
      }))
    ).then(() => self.clients.claim())
  );
});

// 请求: 完全不拦截, 所有请求直接走网络
// 注意: 不调用 event.respondWith() = 浏览器正常处理请求
