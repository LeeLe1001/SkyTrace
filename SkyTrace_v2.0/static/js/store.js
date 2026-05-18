/**
 * SkyTrace v2.0 — 集中式状态管理 Store
 * 
 * 用法:
 *   import { store } from './store.js';
 *   store.set('flights', newFlights);
 *   store.on('flights', (flights) => renderList(flights));
 */
class Store {
  constructor(initial = {}) {
    this._state = { ...initial };
    this._listeners = {};   // key → Set<callback>
    this._onceTokens = {};  // token → { key, fn }
    this._tokenId = 0;
  }

  /** 读取状态 (返回副本以阻止直接修改) */
  get(key) {
    const val = this._state[key];
    return Array.isArray(val) ? [...val] : (typeof val === 'object' && val !== null ? { ...val } : val);
  }

  /** 写入状态，自动通知所有订阅者 */
  set(key, value) {
    const old = this._state[key];
    this._state[key] = value;
    if (old !== value) {
      (this._listeners[key] || []).forEach(fn => {
        try { fn(value, old); } catch (e) { console.error('[Store]', key, e); }
      });
    }
  }

  /** 订阅变更，返回取消订阅函数 */
  on(key, fn) {
    if (!this._listeners[key]) this._listeners[key] = new Set();
    this._listeners[key].add(fn);
    return () => this._listeners[key].delete(fn);
  }

  /** 一次性订阅 */
  once(key, fn) {
    const wrapper = (val, old) => { fn(val, old); };
    const token = ++this._tokenId;
    this._onceTokens[token] = { key, fn: wrapper };
    const unsub = this.on(key, wrapper);
    const origUnsub = () => {
      unsub();
      delete this._onceTokens[token];
    };
    return origUnsub;
  }

  /** 批量更新 (只触发一次通知) */
  batch(updates) {
    Object.entries(updates).forEach(([key, value]) => {
      this._state[key] = value;
    });
    Object.keys(updates).forEach(key => {
      (this._listeners[key] || []).forEach(fn => {
        try { fn(this._state[key], undefined); } catch (e) { console.error('[Store]', key, e); }
      });
    });
  }

  /** 清空指定 key */
  clear(key) {
    this.set(key, undefined);
  }

  /** 获取当前全部状态快照 */
  snapshot() {
    return { ...this._state };
  }
}

// 全局单例
export const store = new Store({
  // 认证
  user: null,           // { id, username, display_name, is_admin } | null
  authNeeded: false,    // 是否需要登录
  needsSetup: false,    // 是否需要初始化管理员

  // 航班数据
  flights: [],          // Flight[]
  filteredFlights: [],  // 当前筛选后的航班
  currentFlightId: null,

  // UI 状态
  view: 'home',         // 'home' | 'flights' | 'calendar' | 'settings'
  theme: localStorage.getItem('skytrace-theme') || 'dark',
  locale: localStorage.getItem('skytrace-locale') || 'zh',
  offline: !navigator.onLine,

  // 筛选
  statusFilter: 'upcoming', // 'all' | 'upcoming' | 'completed'
  statsYear: 'all',
});

// 主题持久化
store.on('theme', (theme) => {
  localStorage.setItem('skytrace-theme', theme);
  document.documentElement.setAttribute('data-theme', theme);
});

// 语言持久化
store.on('locale', (locale) => {
  localStorage.setItem('skytrace-locale', locale);
});

export default Store;
