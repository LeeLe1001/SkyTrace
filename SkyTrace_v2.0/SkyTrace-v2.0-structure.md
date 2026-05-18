# SkyTrace v2.0 — 架构改造实施方案

> **日期**: 2026-05-18  
> **基线**: SkyTrace v1.x (Flask 1600行巨石 + Vanilla JS 单文件)  
> **参考架构**: Flighty v2.9.2 (Coordinator+MVVM / CoreData+GRDB / Protobuf)  
> **改造原则**: API 契约不变、渐进式重构、每 Sprint 可独立发布

---

## 目标架构全景

```
┌──────────────────────────────────────────────────────────────┐
│                     FRONTEND (PWA)                           │
│  ┌───────────┐ ┌───────────┐ ┌──────────┐ ┌─────────────┐  │
│  │  Router   │ │  Store    │ │Component │ │ SSE Client   │  │
│  │(page.js)  │ │(store.js) │ │(.js)     │ │(sse.js)      │  │
│  └───────────┘ └───────────┘ └──────────┘ └─────────────┘  │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ Leaflet Map │ html2canvas │ i18n (vue-i18n style)    │    │
│  └──────────────────────────────────────────────────────┘    │
├──────────────────────────────────────────────────────────────┤
│                     BACKEND (Flask)                          │
│  ┌─────────┐ ┌──────────┐ ┌────────────┐ ┌──────────────┐  │
│  │ routes/ │ │services/ │ │repositories│ │  schemas/     │  │
│  │(Blueprint│ │(业务逻辑)│ │/(ORM)      │ │(Pydantic v2) │  │
│  └─────────┘ └──────────┘ └────────────┘ └──────────────┘  │
│  ┌──────────────────────────────────────────────────────┐    │
│  │ SQLAlchemy 2.0 │ Fernet │ Alembic Migrations         │    │
│  └──────────────────────────────────────────────────────┘    │
├──────────────────────────────────────────────────────────────┤
│                     DATA LAYER                               │
│  ┌────────────┐ ┌──────────┐ ┌──────────────────────────┐  │
│  │ PostgreSQL │ │  Redis   │ │ GitHub Backup (JSON)      │  │
│  │ (主存储)    │ │(缓存/WS) │ │                          │  │
│  └────────────┘ └──────────┘ └──────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

---

## 当前代码诊断（2026-05-18）

### 后端：`app.py` 分析

| 指标 | 数值 | 评估 |
|------|------|------|
| 总行数 | 1634 | 🔴 严重超标 (建议 <400) |
| 函数数 (路由) | 28 | 🟡 可拆分 |
| 内联数据（航站楼映射） | ~200 行 | 🔴 应在配置文件 |
| 业务逻辑 + 路由混合 | 是 | 🔴 无法单独测试 |
| 模块级全局变量 | 10+ | 🟡 不利于测试 |
| API 查询函数（3 个外部 API） | 混在路由文件中 | 🟠 应独立服务 |

**关键代码异味**:
1. `AIRLINE_TERMINAL_MAP` (~150 行) 和 `SINGLE_TERMINAL_AIRPORTS` (~50 行) 硬编码在 `app.py` 中
2. `query_aviationstack()` / `query_airlabs()` / `query_aerodata()` 三个 API 调用函数混在路由文件
3. `_http_get_json()` / `cache_flight_result()` / `find_in_local_data()` 是通用数据层逻辑
4. `get_flight_status_info()` 包含复杂的时区+倒计时业务逻辑
5. 所有路由函数直接访问 `g.current_user`、`session` 等 Flask 上下文

### 后端：`storage.py` 分析

| 指标 | 数值 | 评估 |
|------|------|------|
| 总行数 | ~530 | 🟡 中等 |
| 职责数 | 5 (ORM定义/连接管理/CRUD/序列化/迁移) | 🔴 违反 SRP |
| ORM Model 类 | 3 (User, UserSetting, Flight) | 🟢 可接受 |
| 全局单例 | 3 (`_ENGINE`, `_SESSION_FACTORY`, `_DATABASE_URL`) | 🟡 建议工厂化 |
| 手写迁移 | `_run_schema_migrations()` | 🔴 应使用 Alembic |

**关键代码异味**:
1. `Base` (DeclarativeBase) / Model 定义和 Session 工厂在同一文件
2. `_run_schema_migrations()` 手写 ALTER TABLE
3. `_normalize_flight_payload()` 同时做字段映射 + 默认值
4. `_serialize_flight()` 和 `_serialize_user()` 序列化逻辑混在 storage 层
5. `import_legacy_data_for_user()` 同时操作 Flights + Settings 两张表

### 前端：`app.js` 分析

| 指标 | 数值 | 评估 |
|------|------|------|
| 全局变量 | ~50 | 🔴 严重 |
| 功能模块 | 地图/列表/统计/设置/认证/日历 | 🔴 全在一个文件 |
| HTML 生成方式 | 字符串拼接 | 🟠 不安全的 XSS 风险 |
| 状态管理 | 全局变量 | 🔴 数据流不可追踪 |
| 事件绑定 | 内联 onclick | 🟠 应使用事件委托 |
| 第三方库 | Leaflet/arc.js/html2canvas/Leaflet.heat | 🟢 合理 |

### 前端：`index.html` 分析

| 指标 | 评估 |
|------|------|
| 内联 `<style>` 块 | 🔴 应提取到 CSS 文件 |
| 内联 `<script>` 块 (非引用) | 🔴 多个 hack 脚本 |
| SW 更新逻辑 | 🔴 复杂的重载防护代码 |
| 视口高度修复 | 🟡 应使用 CSS `dvh` 单位 |

---

## Sprint 1: 后端分层架构（API 契约不变）

### 目标
将 `app.py` (1634行) 拆分为 `routes/`、`services/`、`repositories/`、`schemas/`、`models/` 五层，保持所有 `/api/*` 端点行为**完全不变**。

### 新目录结构
```
SkyTrace_v2.0/
├── app.py                    # create_app() 工厂 (<100行)
├── config.py                 # 多环境配置
├── extensions.py             # Flask 扩展 (init_app 模式)
│
├── routes/                   # 路由层 (Blueprint, 薄路由)
│   ├── __init__.py           # register_blueprints()
│   ├── auth.py               # /api/auth/* + /api/setup
│   ├── admin.py              # /api/admin/*
│   ├── flights.py            # /api/flights/* (CRUD + connect/disconnect)
│   ├── lookup.py             # /api/flight/lookup + /api/flight/status
│   ├── settings.py           # /api/settings/*
│   ├── stats.py              # /api/stats
│   ├── data.py               # /api/airports, /api/airlines, /api/cache/stats
│   ├── backup.py             # /api/backup/github/*
│   └── system.py             # /api/health, /api/version, /api/weather, /api/logo-proxy
│
├── services/                 # 业务逻辑层 (纯 Python, 不依赖 Flask)
│   ├── __init__.py
│   ├── auth_service.py       # 认证/密码/速率限制
│   ├── flight_service.py     # 航班 CRUD + 联程
│   ├── lookup_service.py     # 3级降级查询 + 外部API调用
│   ├── stats_service.py      # 统计计算
│   ├── backup_service.py     # GitHub API 交互
│   └── settings_service.py   # 设置读写 + 加密/掩码
│
├── repositories/             # 数据访问层 (纯 SQLAlchemy)
│   ├── __init__.py
│   ├── user_repo.py          # User CRUD
│   ├── flight_repo.py        # Flight CRUD
│   └── settings_repo.py      # UserSetting CRUD
│
├── schemas/                  # 请求验证 (Pydantic v2)
│   ├── __init__.py
│   ├── auth.py               # LoginInput, SetupInput, PasswordChangeInput
│   ├── flight.py             # FlightInput, FlightConnectInput
│   ├── settings.py           # SettingsInput
│   └── backup.py             # BackupInput
│
├── models/                   # ORM 模型 (从 storage.py 拆出)
│   ├── __init__.py
│   ├── base.py               # DeclarativeBase
│   ├── user.py               # User
│   ├── flight.py             # Flight
│   └── settings.py           # UserSetting
│
├── storage.py                # [保留] 数据库引擎工厂 + session 管理
├── security_utils.py         # [保留] Fernet 加密
├── time_utils.py             # [保留] 时区工具
├── flight_monitor.py         # [保留] 独立监控脚本
│
├── data/                     # [保留] JSON 数据文件
├── static/                   # [保留] 前端资源 (Sprint 2 重构)
│
└── tests/
    ├── unit/
    │   ├── test_auth_service.py
    │   ├── test_flight_service.py
    │   └── test_stats_service.py
    └── integration/
        ├── test_multi_user_foundation.py
        ├── test_phase_two_regressions.py
        └── test_cleanup_regressions.py
```

### 关键代码设计

#### 1. `config.py` — 多环境配置

```python
import os

class Config:
    SECRET_KEY = os.environ.get('SKYTRACE_SECRET_KEY', 'dev-secret-key')
    DATA_DIR = os.environ.get('SKYTRACE_DATA_DIR', 'data')
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'
    PERMANENT_SESSION_LIFETIME = 30 * 24 * 3600  # 30 days

class DevelopmentConfig(Config):
    DEBUG = True
    SESSION_COOKIE_SECURE = False
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        'SKYTRACE_DATABASE_URL',
        'sqlite:///data/skytrace.db'
    )

class TestingConfig(Config):
    TESTING = True
    SESSION_COOKIE_SECURE = False
    SQLALCHEMY_DATABASE_URI = 'sqlite:///:memory:'

class ProductionConfig(Config):
    DEBUG = False
    SESSION_COOKIE_SECURE = os.environ.get('SKYTRACE_SECURE_COOKIES', '1') == '1'
    SQLALCHEMY_DATABASE_URI = os.environ.get('SKYTRACE_DATABASE_URL')

config = {
    'development': DevelopmentConfig,
    'testing': TestingConfig,
    'production': ProductionConfig,
}
```

#### 2. `extensions.py` — 无全局状态

```python
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

def init_extensions(app):
    db.init_app(app)
    with app.app_context():
        from models.base import Base
        Base.metadata.create_all(db.engine)
```

#### 3. `app.py` — 工厂模式 (<100 行)

```python
from flask import Flask
from config import config
from extensions import init_extensions
from routes import register_blueprints

def create_app(config_name='development'):
    app = Flask(__name__)
    app.config.from_object(config[config_name])

    init_extensions(app)
    register_blueprints(app)

    # 确保数据目录存在
    import os
    os.makedirs(app.config['DATA_DIR'], exist_ok=True)

    return app

if __name__ == '__main__':
    application = create_app('development')
    application.run(host='0.0.0.0', port=5000)
```

#### 4. `models/` — ORM 模型拆分为独立文件

```python
# models/base.py
from extensions import db

class Base(db.Model):
    __abstract__ = True

# models/user.py
class User(Base):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(64), unique=True)
    # ...

# models/flight.py
class Flight(Base):
    __tablename__ = 'flights'
    id = db.Column(db.String(36), primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'))
    # ...
```

#### 5. `routes/__init__.py` — Blueprint 注册

```python
def register_blueprints(app):
    from routes.auth import auth_bp
    from routes.admin import admin_bp
    from routes.flights import flights_bp
    from routes.lookup import lookup_bp
    from routes.settings import settings_bp
    from routes.stats import stats_bp
    from routes.data import data_bp
    from routes.backup import backup_bp
    from routes.system import system_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(admin_bp)
    app.register_blueprint(flights_bp)
    app.register_blueprint(lookup_bp)
    app.register_blueprint(settings_bp)
    app.register_blueprint(stats_bp)
    app.register_blueprint(data_bp)
    app.register_blueprint(backup_bp)
    app.register_blueprint(system_bp)
```

#### 6. `schemas/` — Pydantic 请求验证

```python
# schemas/auth.py
from pydantic import BaseModel, Field, field_validator

class LoginInput(BaseModel):
    username: str = Field(min_length=3, max_length=32)
    password: str = Field(min_length=6)

class SetupInput(BaseModel):
    username: str = Field(min_length=3, max_length=32)
    password: str = Field(min_length=6)
    display_name: str = Field(default='')

    @field_validator('username')
    @classmethod
    def username_chars(cls, v):
        allowed = set('abcdefghijklmnopqrstuvwxyz0123456789._-')
        if any(ch not in allowed for ch in v.lower()):
            raise ValueError('Username contains invalid characters')
        return v

# schemas/flight.py
class FlightInput(BaseModel):
    flight_no: str = ''
    airline: str = ''
    departure: str = ''
    arrival: str = ''
    date: str = ''
    dep_time: str = ''
    arr_time: str = ''
    dep_terminal: str = ''
    arr_terminal: str = ''
    dep_gate: str = ''
    arr_gate: str = ''
    aircraft: str = ''
    seat: str = ''
    cabin_class: str = 'economy'
    notes: str = ''
    stopover: str = ''
    arr_day_offset: int = 0
    status: str = 'scheduled'
    connected_group: str | None = None
```

#### 7. Routes 层 — 薄路由示例

```python
# routes/flights.py
from flask import Blueprint, request, jsonify, g
from schemas.flight import FlightInput, FlightConnectInput
from services.flight_service import FlightService
from routes._decorators import login_required

flights_bp = Blueprint('flights', __name__)

@flights_bp.route('/api/flights', methods=['GET'])
@login_required
def list_flights():
    user_id = g.current_user['id']
    flights = FlightService.list_for_user(user_id)
    return jsonify(flights)

@flights_bp.route('/api/flights', methods=['POST'])
@login_required
def add_flight():
    data = FlightInput(**request.json).model_dump()
    flight = FlightService.add_for_user(g.current_user['id'], data)
    return jsonify(flight)

@flights_bp.route('/api/flights/<flight_id>', methods=['PUT'])
@login_required
def update_flight(flight_id):
    data = FlightInput(**request.json).model_dump()
    flight = FlightService.update_for_user(g.current_user['id'], flight_id, data)
    if not flight:
        return jsonify({'error': 'Not found'}), 404
    return jsonify(flight)

@flights_bp.route('/api/flights/<flight_id>', methods=['DELETE'])
@login_required
def delete_flight(flight_id):
    ok = FlightService.delete_for_user(g.current_user['id'], flight_id)
    return jsonify({'success': ok})
```

#### 8. Services 层 — 业务逻辑

```python
# services/flight_service.py
from repositories.flight_repo import FlightRepository

class FlightService:
    """Flight business logic - no Flask dependency."""

    @staticmethod
    def list_for_user(user_id: int) -> list[dict]:
        return FlightRepository.list_by_user(user_id)

    @staticmethod
    def add_for_user(user_id: int, data: dict) -> dict:
        normalized = FlightService._normalize(data)
        return FlightRepository.create(user_id, normalized)

    @staticmethod
    def update_for_user(user_id: int, flight_id: str, data: dict) -> dict | None:
        normalized = FlightService._normalize({**data, 'id': flight_id})
        return FlightRepository.update(user_id, flight_id, normalized)

    @staticmethod
    def delete_for_user(user_id: int, flight_id: str) -> bool:
        return FlightRepository.delete(user_id, flight_id)

    @staticmethod
    def _normalize(data: dict) -> dict:
        import uuid
        return {
            'id': data.get('id') or str(uuid.uuid4())[:8],
            'flight_no': (data.get('flight_no') or '').strip(),
            'airline': (data.get('airline') or '').strip(),
            'departure': (data.get('departure') or '').strip(),
            'arrival': (data.get('arrival') or '').strip(),
            'date': (data.get('date') or '').strip(),
            'dep_time': (data.get('dep_time') or '').strip(),
            'arr_time': (data.get('arr_time') or '').strip(),
            'dep_terminal': (data.get('dep_terminal') or '').strip(),
            'arr_terminal': (data.get('arr_terminal') or '').strip(),
            'dep_gate': (data.get('dep_gate') or '').strip(),
            'arr_gate': (data.get('arr_gate') or '').strip(),
            'aircraft': (data.get('aircraft') or '').strip(),
            'seat': (data.get('seat') or '').strip(),
            'cabin_class': (data.get('class') or data.get('cabin_class') or 'economy').strip(),
            'notes': (data.get('notes') or '').strip(),
            'stopover': (data.get('stopover') or '').strip(),
            'arr_day_offset': int(data.get('arr_day_offset') or 0),
            'status': (data.get('status') or 'scheduled').strip(),
            'connected_group': (data.get('connected_group') or '').strip() or None,
        }
```

#### 9. Repositories 层 — 数据访问

```python
# repositories/flight_repo.py
from extensions import db
from models.flight import Flight

class FlightRepository:
    @staticmethod
    def list_by_user(user_id: int) -> list[dict]:
        flights = db.session.scalars(
            db.select(Flight)
            .where(Flight.user_id == user_id)
            .order_by(Flight.created_at.asc())
        ).all()
        return [_serialize(f) for f in flights]

    @staticmethod
    def create(user_id: int, data: dict) -> dict:
        flight = Flight(user_id=user_id, **data)
        db.session.add(flight)
        db.session.commit()
        return _serialize(flight)

    @staticmethod
    def update(user_id: int, flight_id: str, data: dict) -> dict | None:
        flight = db.session.scalar(
            db.select(Flight).where(
                Flight.user_id == user_id,
                Flight.id == flight_id
            )
        )
        if not flight:
            return None
        for key, value in data.items():
            if key != 'id':
                setattr(flight, key, value)
        db.session.commit()
        return _serialize(flight)

    @staticmethod
    def delete(user_id: int, flight_id: str) -> bool:
        flight = db.session.scalar(
            db.select(Flight).where(
                Flight.user_id == user_id,
                Flight.id == flight_id
            )
        )
        if not flight:
            return False
        db.session.delete(flight)
        db.session.commit()
        return True
```

### Sprint 1 验证标准

- [ ] 所有 16 个现有回归测试通过
- [ ] `curl` 测试全部 25+ 端点，响应格式完全不变
- [ ] `app.py` < 100 行
- [ ] 每个 route 文件 < 80 行
- [ ] Service 层可脱离 Flask 单独测试

---

## Sprint 2: 前端模块化

### 目标
消除 ±50 全局变量，引入 Store + Component + Router。

### 新前端结构
```
static/js/
├── main.js                  # 入口: initStore() + startRouter()
├── store.js                 # Store 类 (<80行)
├── router.js                # HashRouter (<60行)
├── api.js                   # fetchApi() 封装
│
├── utils/
│   ├── format.js            # formatTerminal / formatDuration / formatDate
│   ├── geo.js               # haversine / antimeridianFix / boundsCalc
│   └── dom.js               # delegate / qs / qsa / createElement
│
├── components/
│   ├── base/
│   │   ├── Component.js     # 基类: mount/unmount/subscribe
│   │   ├── Modal.js
│   │   └── Skeleton.js
│   ├── map/
│   │   ├── MapCore.js       # Leaflet 初始化 + 主题
│   │   ├── ArcLayer.js      # 弧线渲染
│   │   └── HeatLayer.js     # 热力图
│   ├── flights/
│   │   ├── FlightCard.js    # 单个航班卡片
│   │   ├── FlightList.js    # 列表容器
│   │   ├── FlightForm.js    # 添加/编辑表单
│   │   └── FlightDetail.js  # 详情模态框
│   ├── stats/
│   │   ├── StatsGrid.js
│   │   └── FunInsights.js
│   └── layout/
│       ├── Header.js
│       └── OfflineBanner.js
│
├── views/
│   ├── HomeView.js
│   ├── FlightsView.js
│   └── CalendarView.js
│
└── i18n/
    ├── engine.js             # t() / setLocale()
    └── locales/
        ├── zh.js
        ├── en.js
        ├── ja.js
        ├── ko.js
        └── es.js
```

### 核心组件设计

#### Store (`store.js`)
```javascript
class Store {
  constructor(initial = {}) {
    this._state = initial;
    this._listeners = {};
  }
  get(key) {
    return this._state[key];
  }
  set(key, value) {
    this._state[key] = value;
    (this._listeners[key] || []).forEach(fn => fn(value));
  }
  on(key, fn) {
    (this._listeners[key] = this._listeners[key] || []).push(fn);
    return () => {
      this._listeners[key] = this._listeners[key].filter(f => f !== fn);
    };
  }
}

export const store = new Store({
  flights: [],
  user: null,
  settings: {},
  offline: false,
  theme: 'dark',
  locale: 'zh',
  view: 'home'
});
```

#### Component (`components/base/Component.js`)
```javascript
export class Component {
  constructor(container, store) {
    this.container = container;
    this.store = store;
    this._unsubs = [];
    this._bound = {};
  }

  // Subscribe to store changes, auto-rerender
  watch(key, renderFn) {
    const unsub = this.store.on(key, () => {
      if (typeof renderFn === 'function') renderFn.call(this);
      else this.render();
    });
    this._unsubs.push(unsub);
  }

  mount() { this.render(); }
  unmount() {
    this._unsubs.forEach(fn => fn());
    if (this.container) this.container.innerHTML = '';
  }
  render() { /* override */ }
}
```

#### Router (`router.js`)
```javascript
class Router {
  constructor(views) {
    this.views = views; // {'#home': HomeView, '#flights': FlightsView}
    this._current = null;
    window.addEventListener('hashchange', () => this._resolve());
  }

  start() {
    this._resolve();
  }

  _resolve() {
    const hash = location.hash || '#home';
    const ViewClass = this.views[hash];
    if (!ViewClass) return;

    if (this._current) this._current.unmount();
    this._current = new ViewClass(document.getElementById('view-root'), store);
    this._current.mount();
  }
}
```

### 迁移路径

1. **提取 utils** → 无状态纯函数，零风险
2. **创建 Component 基类** → 建立组件模式
3. **逐个组件迁移** → 如先迁 FlightCard → FlightList → HomeView
4. **引入 Store** → 替换全局变量，组件通过 `watch()` 订阅
5. **启用 Router** → 支持 `/#flights`, `/#stats/:year`

### Sprint 2 验证标准
- [ ] 全局变量从 ~50 → ≤5 (`store`, `router`, `api`)
- [ ] `index.html` 中内联 `<script>` 从 6+ → 0
- [ ] `/#flights`、`/#stats`、`/#calendar` 深链接可用
- [ ] 所有 UI 功能与 v1.x 一致

---

## Sprint 3: 数据模型增强

### 目标
将扁平 `flights` 表拆分为 6+ 关联表，引入 Alembic 迁移。

### 新 ER 图

```
users ──< flights >── airlines
                   >── aircraft_types
                   >── airports (dep)
                   >── airports (arr)
                   >── terminals (dep)
                   >── terminals (arr)

flights ──< flight_events
flights ──< weather_records
```

### 新增表结构

| 表名 | 主键 | 关键字段 | 用途 |
|------|------|----------|------|
| `airlines` | `id` (INT PK) | `iata`, `icao`, `name`, `country`, `alliance`, `logo_url` | 航空公司 |
| `aircraft_types` | `id` (INT PK) | `icao_code`, `manufacturer`, `model_name`, `category` | 机型 |
| `airports` | `id` (INT PK) | `iata`, `icao`, `name`, `city`, `country`, `lat`, `lon`, `timezone` | 机场 |
| `terminals` | `id` (INT PK) | `airport_id` (FK), `terminal_code`, `name` | 航站楼 |
| `flight_events` | `id` (INT PK) | `flight_id` (FK), `event_type`, `old_value`, `new_value`, `source`, `recorded_at` | 状态事件 |
| `weather_records` | `id` (INT PK) | `flight_id` (FK), `airport_id` (FK), `condition`, `temp_c`, `wind_kmh` | 天气快照 |

### flights 表重构

```sql
-- 旧字段 → 新关系
airline (VARCHAR)     → airline_id (FK → airlines.id)
aircraft (VARCHAR)    → aircraft_type_id (FK → aircraft_types.id)
departure (VARCHAR)   → departure_airport_id (FK → airports.id)
arrival (VARCHAR)     → arrival_airport_id (FK → airports.id)
dep_terminal (VARCHAR)→ dep_terminal_id (FK → terminals.id)
arr_terminal (VARCHAR)→ arr_terminal_id (FK → terminals.id)
stopover (VARCHAR)    → stopover_airport_id (FK → airports.id)
```

### user_settings 表重构
```sql
-- 旧: 多个扁平 VARCHAR 列
-- 新: 单个 JSONB 列
ALTER TABLE user_settings ADD COLUMN settings_json JSONB DEFAULT '{}';
```

### Alembic 迁移
```bash
alembic init migrations
alembic revision --autogenerate -m "add lookup tables: airlines, aircraft, airports, terminals"
alembic revision -m "add flight_events table"
alembic revision -m "add weather_records table"
alembic revision -m "migrate user_settings to JSONB"
alembic upgrade head
```

### 数据迁移脚本 (`scripts/migrate_v1_to_v2.py`)
1. 从 `flights.airline` 去重提取 → `airlines`
2. 从 `flights.aircraft` 去重提取 → `aircraft_types`
3. 从 `flights.departure`/`arrival` 去重 + 静态 JSON 合并 → `airports`
4. 更新 `flights` 表的外键列
5. 迁移 `user_settings` 字段 → JSONB

### API 兼容适配
```python
# 在 Repository 序列化层重新组装为 v1 格式
def _serialize(flight):
    return {
        "id": flight.id,
        "airline": flight.airline.iata if flight.airline else "",
        "aircraft": flight.aircraft_type.icao_code if flight.aircraft_type else "",
        "departure": flight.dep_airport.iata if flight.dep_airport else "",
        "arrival": flight.arr_airport.iata if flight.arr_airport else "",
        # ... 其他字段不变
    }
```

### Sprint 3 验证标准
- [ ] Alembic upgrade/downgrade 正常执行
- [ ] 旧数据零丢失迁移
- [ ] 所有 API 端点响应与 v1.x 一致

---

## Sprint 4: 体验提升

### 4.1 响应式 UI

| 改进 | 现状 | 目标 |
|------|------|------|
| 布局 | 手动 `calc()` + 绝对定位 | CSS Grid + Flexbox |
| 视口高度 | JS 计算 `--app-height` | CSS `dvh` 单位 |
| 组件响应 | `window.resize` 监听 | CSS Container Queries |
| 加载状态 | 不一致的 spinner | 统一 Skeleton 组件 |
| 动画 | 无 | CSS `view-transition` |

### 4.2 实时推送 (SSE)

```
FlightMonitorService (定时任务)
  │  检测航班状态变化
  ▼
POST /api/internal/flight-events
  │
  ▼
SSE Stream: /api/events?user_id=123
  │
  ▼
前端 EventSource → store.set('flights', updated)
  │
  ▼
组件自动重渲染
```

**降级**: 不支持 SSE 时回退 5 分钟 `setInterval` 轮询。

### 4.3 PWA 增强

- `Web Share API`: 分享航班到系统
- `Background Sync`: Service Worker 离线操作队列
- 自定义安装按钮
- App Shortcuts (PWA manifest)

### 4.4 性能优化

- Vite 打包 + 代码分割
- `loading="lazy"` 图片
- API 分页 (`?page=1&per_page=50`)
- 地图使用矢量瓦片

### Sprint 4 验证标准
- [ ] Lighthouse PWA ≥ 95
- [ ] Lighthouse Performance ≥ 90
- [ ] SSE 推送 < 3 秒

---

## Sprint 依赖关系

```
Sprint 1 (后端分层) ───────────────┐
    │                                 │
    ├── Sprint 2 (前端模块化) ───┤   可并行
    │       │                         │
    │       └── Sprint 3 (数据模型) ┤ 依赖 Sprint 1
    │               │                 │
    │               └── Sprint 4 (体验) ┤ 依赖 2+3
```

---

## 关键决策

| 决策 | 理由 |
|------|------|
| 不引入重型前端框架 | ES Modules + 自定义 Store 足够，零构建依赖 |
| `flask-sqlalchemy` 替代裸 SQLAlchemy | 简化 session 管理、`db.Model` 基类 |
| Pydantic v2 做请求验证 | 类型安全、自动 422、IDE 友好 |
| Alembic 管理迁移 | 替代手写 `ALTER TABLE` |
| JSONB 替代扁平列 | `user_settings` 可灵活扩展 |
| SSE > WebSocket | 更简单、自动重连、PWA 友好 |
| API v1 契约完全不变 | 向后兼容是第一原则 |

---

## 文件变更总览

| Sprint | 新建 | 修改 | 删除 |
|--------|------|------|------|
| Sprint 1 | 27 文件 | 1 (`app.py`) | 0 |
| Sprint 2 | 25 文件 | 2 (`app.js`, `index.html`) | 0 |
| Sprint 3 | 12 文件 | 6 文件 | 0 |
| Sprint 4 | 10 文件 | 5 文件 | 0 |
| **合计** | **74 文件** | **14 文件** | **0** |

---

## 附录 A: 当前 API 端点完整列表

| 方法 | 端点 | 目标路由文件 |
|------|------|-------------|
| GET | `/api/auth/state` | `routes/auth.py` |
| POST | `/api/setup` | `routes/auth.py` |
| POST | `/api/auth/login` | `routes/auth.py` |
| POST | `/api/auth/logout` | `routes/auth.py` |
| PUT | `/api/auth/password` | `routes/auth.py` |
| GET | `/api/admin/users` | `routes/admin.py` |
| POST | `/api/admin/users` | `routes/admin.py` |
| DELETE | `/api/admin/users/<id>` | `routes/admin.py` |
| PUT | `/api/admin/users/<id>/password` | `routes/admin.py` |
| GET | `/api/flights` | `routes/flights.py` |
| POST | `/api/flights` | `routes/flights.py` |
| PUT | `/api/flights/<id>` | `routes/flights.py` |
| DELETE | `/api/flights/<id>` | `routes/flights.py` |
| POST | `/api/flights/connect` | `routes/flights.py` |
| POST | `/api/flights/disconnect` | `routes/flights.py` |
| GET | `/api/flight/lookup` | `routes/lookup.py` |
| GET | `/api/flight/status` | `routes/lookup.py` |
| GET | `/api/settings` | `routes/settings.py` |
| POST | `/api/settings` | `routes/settings.py` |
| POST | `/api/settings/test` | `routes/settings.py` |
| GET | `/api/stats` | `routes/stats.py` |
| GET | `/api/airports` | `routes/data.py` |
| GET | `/api/airports/search` | `routes/data.py` |
| GET | `/api/airlines` | `routes/data.py` |
| GET | `/api/cache/stats` | `routes/data.py` |
| POST | `/api/backup/github/test` | `routes/backup.py` |
| POST | `/api/backup/github/push` | `routes/backup.py` |
| POST | `/api/backup/github/pull` | `routes/backup.py` |
| GET | `/api/health` | `routes/system.py` |
| GET | `/api/version` | `routes/system.py` |
| GET | `/api/weather` | `routes/system.py` |
| GET | `/api/logo-proxy` | `routes/system.py` |

---

## 附录 B: 参考架构 — Flighty v2.9.2 深度分析摘要

### CoreData 模型 (42 版本, v42)

**核心实体**: `Flight`, `Airport`, `Airline`, `Schedule`, `Location`, `Equipment`, `Weather`, `DelayForecast`, `Codeshare`, `InboundFlight`, `FlightPlan`, `Search`, `User`, `Profile`, `Device`, `Setting`, `TripIt`, `CalendarSetting`

**Flight 实体关系**:
- `airline` (to-one → Airline)
- `departureAirport`, `arrivalAirport` (to-one → Airport)
- `departureSchedule`, `arrivalSchedule` (to-one → Schedule)
- `equipment` (to-one → Equipment)
- `codeshares` (to-many → Codeshare)
- `inbound` (to-one → InboundFlight)
- `weather` (to-one → Weather)
- `delayForecast` (to-one → DelayForecast)
- `appearsIn` (to-many → Search)
- `user` (to-one → User)

### Protobuf API Schema (`com.flighty.proto.api`)

**消息类型**: `Flight`, `Airport`, `Airline`, `Schedule`, `Equipment`, `Weather`, `DelayForecast`, `Codeshare`, `InboundFlight`, `FlightPlan`, `SingleFlightResponse`, `GetStaticAssetsResponse`

**事件类型**: `FlightChange`, `BaggageChangedEvent`, `EquipmentChangedEvent`, `FlightPlanFiledEvent`, `FlightStatusChangedEvent`, `GateChangedEvent`, `ScheduleChangedEvent`, `InboundScheduleChangedEvent`, `TailNumberChangedEvent`

### Coordinator + MVVM 架构

- **23 个 Coordinator**: `AppCoordinator` (根), `FlightDetailsCoordinator`, `OnboardingCoordinator`, `PaywallCoordinator`, `ProfileCoordinator`, `SettingsCoordinator`, `OfferCoordinator` 等
- **16+ 个 ViewModel**: `FlightLoaderViewModel`, `MapHudViewModel`, `LiveActivitySettingsViewModel`, `PaywallViewModel` 等
- **80+ 个 ViewController**: 分布在 9 个 Module Bundle 中

### 技术栈
- **UI**: UIKit (15 storyboardc + 57 nib) + SwiftUI (BaseHostingController 嵌入)
- **持久化**: CoreData (42 版本 .momd) + GRDB (SQLite FTS/复杂查询)
- **网络**: URLSession + Protobuf 序列化
- **地图**: MapKit + Mapbox (自定义风格)
- **动画**: Lottie (JSON 动画)
- **监控**: AppCenter + Amplitude
