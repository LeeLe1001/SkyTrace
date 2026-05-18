/**
 * SkyTrace v2.0 Sprint 4 — SSE 客户端
 * 
 * 用法:
 *   import { sseClient } from './sse.js';
 *   sseClient.connect();
 *   sseClient.on('flight_update', (data) => { store.set('flights', ...); });
 */
import { store } from './store.js';

class SSEClient {
  constructor() {
    this._source = null;
    this._listeners = {};
    this._reconnectTimer = null;
    this._reconnectDelay = 1000;
  }

  /** 连接到 SSE 流 */
  connect() {
    if (this._source) this.disconnect();

    const url = '/api/events';
    this._source = new EventSource(url);

    this._source.onopen = () => {
      store.set('offline', false);
      this._reconnectDelay = 1000; // 重置重连延迟
    };

    this._source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        (this._listeners[event.type] || []).forEach(fn => fn(data));
      } catch (e) {
        console.warn('[SSE] Parse error:', e);
      }
    };

    // 自定义事件监听
    ['flight_update', 'flight_deleted', 'settings_changed'].forEach(evt => {
      this._source.addEventListener(evt, (event) => {
        try {
          const data = JSON.parse(event.data);
          (this._listeners[evt] || []).forEach(fn => fn(data));
        } catch (e) {}
      });
    });

    this._source.onerror = () => {
      this.disconnect();
      this._scheduleReconnect();
    };
  }

  /** 监听特定事件 */
  on(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
    return () => {
      this._listeners[event] = this._listeners[event].filter(f => f !== fn);
    };
  }

  /** 断开 */
  disconnect() {
    if (this._source) {
      this._source.close();
      this._source = null;
    }
  }

  /** 自动重连 (指数退避) */
  _scheduleReconnect() {
    if (this._reconnectTimer) return;
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this.connect();
      this._reconnectDelay = Math.min(this._reconnectDelay * 2, 30000);
    }, this._reconnectDelay);
  }
}

export const sseClient = new SSEClient();
export default SSEClient;
