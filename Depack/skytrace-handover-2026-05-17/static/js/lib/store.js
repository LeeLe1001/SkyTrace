/**
 * Store - 简易响应式状态管理
 * 借鉴 Flighty ViewModel 的单向数据流模式
 */
class Store {
    constructor(initialState = {}) {
        this._state = { ...initialState };
        this._listeners = new Map();
        this._wildcards = new Set();
    }

    get(key) { return this._state[key]; }

    snapshot() { return { ...this._state }; }

    set(key, value) {
        const prev = this._state[key];
        if (prev === value) return;
        this._state[key] = value;
        this._notify(key, value, prev);
    }

    batch(updates) {
        const changes = [];
        for (const [key, value] of Object.entries(updates)) {
            const prev = this._state[key];
            if (prev !== value) {
                this._state[key] = value;
                changes.push([key, value, prev]);
            }
        }
        for (const [key, value, prev] of changes) {
            this._notify(key, value, prev);
        }
    }

    subscribe(key, callback) {
        if (!this._listeners.has(key)) this._listeners.set(key, new Set());
        this._listeners.get(key).add(callback);
        return () => { const s = this._listeners.get(key); if (s) s.delete(callback); };
    }

    subscribeAll(callback) {
        this._wildcards.add(callback);
        return () => this._wildcards.delete(callback);
    }

    _notify(key, value, prev) {
        const listeners = this._listeners.get(key);
        if (listeners) listeners.forEach(fn => { try { fn(value, prev); } catch(e) { console.error('[Store]', key, e); } });
        this._wildcards.forEach(fn => { try { fn(key, value, prev); } catch(e) { console.error('[Store:*]', e); } });
    }
}

// ===== 全局 Store 实例 =====
const flightStore = new Store({
    flights: [],
    upcomingFlights: [],
    pastFlights: [],
    loading: false,
    error: null,
});

const uiStore = new Store({
    currentPage: 'home',
    currentTab: 'home',
    theme: 'dark',
    modalOpen: false,
    editingFlightId: null,
    statusFilter: 'upcoming',
    connectMode: false,
});

const authStore = new Store({
    user: null,
    isAdmin: false,
    isLoggedIn: false,
    loading: true,
});

const settingsStore = new Store({
    language: 'zh',
    theme: 'dark',
    soundEnabled: true,
    soundVolume: 0.5,
});
