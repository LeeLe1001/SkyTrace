/**
 * Component - 组件基类
 * 借鉴 Flighty Coordinator 的职责分离，每个组件管理自己的 DOM
 */
class Component {
    /**
     * @param {string|HTMLElement} container - 容器元素或选择器
     * @param {Store} store - 可选，绑定的 Store
     */
    constructor(container, store = null) {
        this._el = typeof container === 'string'
            ? document.querySelector(container)
            : container;
        this._store = store;
        this._unsubscribers = [];
        this._mounted = false;
    }

    get el() { return this._el; }

    /** 绑定 Store 的 key，变化时自动调用 render */
    bind(storeKey, renderFn) {
        if (!this._store) return;
        const unsub = this._store.subscribe(storeKey, (value) => {
            if (this._mounted) renderFn.call(this, value);
        });
        this._unsubscribers.push(unsub);
    }

    /** 挂载：开始监听 */
    mount() { this._mounted = true; this.onMount(); }

    /** 卸载：清理监听器 */
    unmount() {
        this._mounted = false;
        this._unsubscribers.forEach(fn => fn());
        this._unsubscribers = [];
        this.onUnmount();
    }

    /** 子类覆盖 */
    onMount() {}
    onUnmount() {}

    /** 渲染 HTML */
    render(html) { if (this._el) this._el.innerHTML = html; }

    /** 事件委托 */
    on(event, selector, handler) {
        this._el?.addEventListener(event, (e) => {
            const target = e.target.closest(selector);
            if (target) handler.call(this, e, target);
        });
    }
}
