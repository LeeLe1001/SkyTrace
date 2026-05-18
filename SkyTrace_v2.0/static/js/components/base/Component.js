/**
 * SkyTrace v2.0 — Component 基类
 * 
 * 用法:
 *   class FlightCard extends Component {
 *     render() {
 *       this.el.innerHTML = `<div>${this.props.flightNo}</div>`;
 *     }
 *   }
 *   const card = new FlightCard(container, { flightNo: 'CA1301' });
 *   card.mount();
 */
import { store } from './store.js';

export class Component {
  /**
   * @param {HTMLElement} container - 挂载容器
   * @param {Object} props - 组件属性
   */
  constructor(container, props = {}) {
    this.container = container;
    this.props = props;
    this.el = null;
    this._unsubs = [];
    this._mounted = false;
  }

  /** 创建 DOM 元素 (子类可覆盖) */
  createElement() {
    return document.createElement('div');
  }

  /** 渲染 (子类必须实现) */
  render() {
    // override in subclass
  }

  /** 订阅 Store 变更并自动重新渲染 */
  watch(key, renderFn) {
    const fn = renderFn ? renderFn.bind(this) : () => this.render();
    const unsub = store.on(key, fn);
    this._unsubs.push(unsub);
    return unsub;
  }

  /** 挂载到 DOM */
  mount() {
    if (this._mounted) return;
    this.el = this.createElement();
    if (this.container) {
      this.container.appendChild(this.el);
    }
    this.render();
    this._mounted = true;
  }

  /** 卸载 (清理订阅 + DOM) */
  unmount() {
    this._unsubs.forEach(fn => fn());
    this._unsubs = [];
    if (this.el && this.el.parentNode) {
      this.el.parentNode.removeChild(this.el);
    }
    this.el = null;
    this._mounted = false;
  }

  /** 重新挂载 */
  remount() {
    this.unmount();
    this.mount();
  }

  /** 快捷选择器 */
  $(selector) {
    return this.el ? this.el.querySelector(selector) : null;
  }
  $$(selector) {
    return this.el ? this.el.querySelectorAll(selector) : [];
  }
}

export default Component;
