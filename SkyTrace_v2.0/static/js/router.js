/**
 * SkyTrace v2.0 — 简易 Hash Router
 * 
 * 路由表:
 *   #home      → HomeView
 *   #flights   → FlightsView
 *   #calendar  → CalendarView
 * 
 * 用法:
 *   import { router } from './router.js';
 *   router.register('#home', new HomeView(container));
 *   router.start();
 */
class Router {
  constructor() {
    this._views = {};       // hash → Component
    this._current = null;
    this._onChange = null;  // (hash) => void
  }

  /** 注册路由 */
  register(hash, componentOrFactory) {
    this._views[hash] = componentOrFactory;
  }

  /** 设置路由变更回调 */
  onChange(fn) {
    this._onChange = fn;
  }

  /** 启动路由监听 */
  start() {
    window.addEventListener('hashchange', () => this._resolve());
    this._resolve();
  }

  /** 导航到指定路由 */
  navigate(hash) {
    location.hash = hash;
  }

  /** 解析当前 hash */
  _resolve() {
    const hash = location.hash || '#home';

    // 卸载当前视图
    if (this._current) {
      this._current.unmount();
      this._current = null;
    }

    // 挂载目标视图 (支持 getter 和 Component 实例)
    const target = this._views[hash];
    if (!target) {
      console.warn('[Router] Unknown route:', hash);
      return;
    }

    const view = typeof target === 'function' ? target() : target;
    if (view && typeof view.mount === 'function') {
      view.mount();
      this._current = view;
    }

    if (this._onChange) this._onChange(hash);
  }

  /** 获取当前路由 */
  get currentHash() {
    return location.hash || '#home';
  }
}

// 全局单例
export const router = new Router();

export default Router;
