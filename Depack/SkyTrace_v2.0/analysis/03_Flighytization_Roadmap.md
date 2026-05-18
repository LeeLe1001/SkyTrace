# SkyTrace v2.0 — Flighty 化改造路线图

> 将 Flighty 的架构精华注入 SkyTrace 的具体实施方案  
> 不重写代码，而是基于既有资产进行渐进式改造

---

## 改造总体策略

```
SkyTrace v1.0 (当前)          SkyTrace v2.0 (目标)
┌─────────────────┐          ┌─────────────────────────┐
│ Flask 单体巨石   │   ──→   │ 分层后端 (Service/Repo)  │
│ Vanilla JS 单文件│   ──→   │ 模块化前端 + 状态管理     │
│ 3 个数据表       │   ──→   │ 6+ 关联数据模型          │
│ 字符串 URL 拼接  │   ──→   │ Request Factory 模式      │
│ 全局变量状态     │   ──→   │ Store + Observer 模式     │
│ 手动 DOM 渲染    │   ──→   │ 响应式 Component 模式     │
│ JSON 序列化      │   ──→   │ 保留 JSON (Web 友好)      │
└─────────────────┘          └─────────────────────────┘
```

---

## 阶段 0: 保留什么

**SkyTrace 的现有优势，不需要改:**

| 资产 | 价值 | 行动 |
|------|------|------|
| 3,251 机场数据 (5语言) | 核心数据资产 | 保留，JSON → SQLite 缓存 |
| 228 航司 + 300 Logo | 展示必需 | 保留，Logo 代理服务 |
| 5 语言 i18n | 国际化基础 | 保留，抽象为 i18n Store |
| 航站楼映射 60+ 机场 | 专业数据 | 保留，升级为数据库表 |
| 16 个 pytest 测试 | 回归基础 | 保留，扩展覆盖 |
| PWA 配置 | 离线安装 | 保留，增强缓存策略 |
| GitHub Backup | 数据安全 | 保留，增加增量备份 |
| Azure 部署管线 | 生产环境 | 保留不变 |

---

## 阶段 1: 后端分层改造 (不改变 API 契约)

### 1.1 拆分 app.py → 模块化结构

```
app.py (当前 ~3000行 单文件)
    │
    ▼ 拆分为
backend/
├── app.py                  # Flask 实例 + 蓝图注册 (~100行)
├── config.py               # 配置管理
├── routes/
│   ├── auth.py             # /api/auth/* 
│   ├── flights.py          # /api/flights* 
│   ├── settings.py         # /api/settings*
│   ├── admin.py            # /api/admin/*
│   ├── backup.py           # /api/backup/*
│   ├── data.py             # /api/airports*, /api/airlines*
│   └── system.py           # /api/health, /api/version
├── services/
│   ├── flight_service.py   # 航班业务逻辑
│   ├── lookup_service.py   # Smart Lookup 业务
│   ├── user_service.py     # 用户管理业务
│   └── backup_service.py   # 备份业务逻辑
├── repositories/
│   ├── flight_repo.py      # 航班数据访问
│   ├── user_repo.py        # 用户数据访问
│   └── settings_repo.py    # 设置数据访问
├── clients/
│   ├── aviation_stack.py   # AviationStack API 客户端
│   ├── airlabs.py          # AirLabs API 客户端
│   └── aerodata.py         # AeroDataBox API 客户端
└── middleware/
    ├── auth.py             # 认证装饰器
    └── rate_limit.py       # 限流中间件
```

### 1.2 引入 Request Object 模式 (借鉴 Flighty)

```python
# 当前: 字符串拼接 URL
url = f"http://api.aviationstack.com/v1/flights?access_key={key}&flight_iata={flight_no}"

# v2.0: Request 对象模式
class FlightLookupRequest:
    """航班查询请求 - 内部委托到正确的 API Client"""
    def __init__(self, flight_number: str, date: str = None):
        self.flight_number = flight_number
        self.date = date
    
    def execute(self, clients: dict) -> FlightLookupResponse:
        """自动选择可用的 API Client，依次尝试"""
        for client_name in ['aviationstack', 'airlabs', 'aerodata']:
            client = clients.get(client_name)
            if client and client.is_configured():
                try:
                    return client.lookup(self)
                except APIError:
                    continue
        raise NoAvailableAPIError()
```

### 1.3 数据模型增强 (借鉴 Flighty 42 Entity 设计)

```
当前 3 个表:
  users ───→ user_settings
    │
    └── flights (所有字段扁平)

v2.0 6+ 个表:
  users ───→ user_settings
    │
    ├── flights ───→ schedules (dep/arr 分开)
    │     ├── airline_id → airlines 表
    │     ├── dep_airport_id → airports 表  
    │     ├── arr_airport_id → airports 表
    │     └── aircraft_type_id → aircraft_types 表
    │
    └── airport_visits (审计/统计)

新增缓存表:
  ├── cached_lookups     # API 查询缓存 (带 TTL)
  ├── terminal_mappings  # 航站楼映射升级为数据库表
  └── logo_cache         # Logo 本地缓存索引
```

---

## 阶段 2: 前端架构升级

### 2.1 模块拆分

```
static/js/app.js (当前 ~3500行)
    │
    ▼ 拆分为
static/js/
├── app.js                    # 入口 + Store 初始化 (~200行)
├── store/
│   ├── index.js              # Store 注册中心
│   ├── flightStore.js        # 航班数据 Store
│   ├── authStore.js          # 认证状态 Store
│   ├── uiStore.js            # UI 状态 Store
│   └── settingsStore.js      # 设置 Store
├── components/
│   ├── flight-list.js        # 航班列表组件
│   ├── flight-form.js        # 添加/编辑表单组件
│   ├── flight-detail.js      # 航班详情组件
│   ├── map-view.js           # 地图组件
│   ├── stats-dashboard.js    # 统计仪表板
│   └── settings-panel.js     # 设置面板
├── services/
│   ├── api.js                # API 请求封装
│   ├── lookup.js             # 航班查询服务
│   └── backup.js             # 备份服务
├── lib/
│   ├── store.js              # 简易响应式 Store 实现
│   ├── component.js          # 组件基类
│   └── router.js             # 简易路由
└── i18n.js                   # 保持不变
```

### 2.2 简易 Store 实现 (Observer 模式)

```javascript
// lib/store.js — 借鉴 Flighty ViewModel 的响应式思路
class Store {
    constructor(initialState = {}) {
        this._state = initialState;
        this._listeners = new Map();  // key → Set<callback>
    }

    getState(key) {
        return this._state[key];
    }

    setState(key, value) {
        if (this._state[key] === value) return;
        this._state[key] = value;
        this._notify(key, value);
    }

    subscribe(key, callback) {
        if (!this._listeners.has(key)) {
            this._listeners.set(key, new Set());
        }
        this._listeners.get(key).add(callback);
        // 返回 unsubscribe 函数
        return () => this._listeners.get(key)?.delete(callback);
    }

    _notify(key, value) {
        const listeners = this._listeners.get(key);
        if (listeners) {
            listeners.forEach(fn => fn(value));
        }
    }
}

// 全局 Store 实例
const flightStore = new Store({ flights: [], loading: false });
const authStore = new Store({ user: null, isAdmin: false });
const uiStore = new Store({ currentTab: 'home', theme: 'dark' });
```

### 2.3 组件基类 (借鉴 Flighty Coordinator 的职责分离)

```javascript
// lib/component.js
class Component {
    constructor(container, store) {
        this.container = container;   // DOM 容器元素
        this.store = store;           // 绑定的 Store
        this._unsubscribers = [];     // 取消订阅列表
        this._mounted = false;
    }

    // 订阅 Store 的特定 key，自动重绘
    bind(storeKey, renderFn) {
        const unsub = this.store.subscribe(storeKey, (value) => {
            if (this._mounted) renderFn.call(this, value);
        });
        this._unsubscribers.push(unsub);
    }

    mount() { this._mounted = true; this.onMount(); }
    unmount() { 
        this._mounted = false; 
        this._unsubscribers.forEach(fn => fn());
        this._unsubscribers = [];
        this.onUnmount();
    }

    // 子类覆盖
    onMount() {}
    onUnmount() {}
    template(data) { return ''; }  // 返回 HTML 字符串
    render(data) {
        this.container.innerHTML = this.template(data);
    }
}
```

---

## 阶段 3: 缓存策略 (借鉴 Flighty 多层缓存)

```
┌─────────────────────────────────────────────────┐
│ L1: 内存缓存 (LRU, ~100条目)                      │
│   机场/航司/航班查询结果                            │
├─────────────────────────────────────────────────┤
│ L2: IndexedDB / localStorage (PWA 离线)           │
│   用户航班列表、设置、i18n 文本                     │
├─────────────────────────────────────────────────┤
│ L3: 服务端数据库 (PostgreSQL)                     │
│   永久数据: users, flights, settings              │
├─────────────────────────────────────────────────┤
│ L4: 服务端缓存文件 (JSON)                         │
│   静态参考数据: airports.json, airlines.json       │
├─────────────────────────────────────────────────┤
│ L5: 外部 API (AviationStack/AirLabs/AeroDataBox)   │
│   实时航班查询、状态更新                            │
└─────────────────────────────────────────────────┘
```

---

## 阶段 4: 优先实施顺序

### Sprint 1: 后端分层 (不改 API)
1. 创建 `backend/` 目录结构
2. 拆分 `app.py` 路由到 `routes/*.py`
3. 提取 `services/` 层
4. 提取 `repositories/` 层
5. 保持所有现有 API 不变 (回归测试通过)

### Sprint 2: 前端模块化 (不改 UI)
1. 实现 `lib/store.js` 和 `lib/component.js`
2. 拆分 `app.js` 到 `store/` 和 `components/`
3. 保持现有 UI 外观不变
4. 所有 DOM 操作通过 Component 基类

### Sprint 3: 数据模型增强
1. 新增 `airlines` 表 (从 airlines.json 导入)
2. 新增 `airports` 表 (从 airports.json 导入)
3. 新增 `cached_lookups` 表
4. flights 表添加外键关联
5. 数据迁移脚本

### Sprint 4: 体验提升
1. Service Worker 增强 (更智能的缓存策略)
2. 响应式 UI 更新 (Store → Component 绑定)
3. 前端路由 (URL 状态保持)
4. 航班状态实时推送 (轮询 / WebSocket)

---

## 关键原则

1. **API 契约不变**: 现有前端调用的所有 `/api/*` 端点保持不变
2. **渐进式改造**: 每个 Sprint 都可独立上线
3. **测试先行**: 每次改造前补测试，保证回归通过
4. **保留优势**: SkyTrace 的 5 语言 i18n、60+ 航站楼映射、PWA 等优势不动
5. **借鉴不复制**: 学习 Flighty 的分层思想和模式，不复制其移动端特定实现
