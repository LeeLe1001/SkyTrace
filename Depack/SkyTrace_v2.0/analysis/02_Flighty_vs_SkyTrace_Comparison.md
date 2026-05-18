# Flighty vs SkyTrace 架构对比分析

> 对比两个项目的架构差异，为 SkyTrace v2.0 改造提供方向

---

## 1. 宏观对比

| 维度 | Flighty (iOS 原生) | SkyTrace (Web 应用) |
|------|-------------------|---------------------|
| **平台** | iOS (Swift/ObjC) | Web (Python + Vanilla JS) |
| **架构模式** | Coordinator + MVVM | Flask 单体 MVC |
| **UI 技术** | UIKit + SwiftUI + Storyboard | Vanilla JS + innerHTML |
| **状态管理** | ViewModel + 双向绑定 | 全局变量 + 手动渲染 |
| **数据持久化** | CoreData + GRDB (双持久化) | SQLAlchemy + JSON 文件 |
| **网络层** | HTTPClient → RequestFactory → API Client | requests 直接调用 |
| **序列化** | Protobuf (高压缩比) | JSON |
| **依赖注入** | Coordinator 模式 | 无 (全局依赖) |
| **模块化** | 9 个 Feature Bundle | 单文件 |
| **测试** | XCTest (推断) | 16 个 pytest 回归测试 |

---

## 2. 架构层次对比

### 2.1 Flighty 分层架构

```
┌─── UI Layer ───────────────────────────────────────┐
│  ViewControllers (UIKit)  │  SwiftUI Views          │
│  Coordinators (23个)      │  BaseHostingController  │
│  ViewModels (16+个)       │                         │
├─── Domain/Service Layer ───────────────────────────┤
│  Services: SyncControllerService, UserController    │
│  Repositories: AirportCodesRepo, FlightMapRepo...   │
│  Providers: AirlineLogoProvider, CachedImage...     │
├─── Data Access Layer ──────────────────────────────┤
│  ApiModels (Swift types wrapping Protobuf)          │
│  HTTPClient → NetworkRequestFactory → API Clients   │
│  Protobuf (com.flighty.proto.*)                     │
├─── Persistence Layer ──────────────────────────────┤
│  CoreData (42 model versions, .momd)                │
│  GRDB/SQLite (reactive queries, FTS)                │
│  Caches: SyncCache, CalendarSubmitterCache...       │
└────────────────────────────────────────────────────┘
```

### 2.2 SkyTrace 当前分层

```
┌─── UI Layer ───────────────────────────────────────┐
│  index.html + app.js (3500行)                       │
│  Leaflet 地图 + 手动 DOM 操作                        │
├─── Backend Layer (app.py 3000行) ──────────────────┤
│  路由处理 + 认证 + API 调用 + 业务逻辑 (混在一起)      │
├─── Data Layer ─────────────────────────────────────┤
│  storage.py (SQLAlchemy models + CRUD)              │
│  JSON 文件 (airports/airlines/schedules)            │
└────────────────────────────────────────────────────┘
```

**关键差异:** Flighty 有明确的分层边界和接口抽象，SkyTrace 业务逻辑与基础设施混在一起。

---

## 3. 数据模型对比

### 3.1 Flighty 数据模型 (42 个 CoreData Entity)

```
Flight ──────→ Airline, Equipment
  ├── departureSchedule (Schedule)
  ├── arrivalSchedule (Schedule)
  ├── departureAirport (Airport)
  ├── arrivalAirport (Airport)
  ├── codeshares (Codeshare[])
  ├── inbound (Flight)
  ├── flightPlan (FlightPlan)
  ├── weather (Weather)
  ├── delayForecast (DelayForecast)
  ├── ticket (Ticket)
  ├── planePosition (PlanePosition)
  └── appearsIn (Search[])

Airport → iata, icao, name, city, region, country, lat, lng, timezone
Schedule → time, terminal, gate, belt, baggageBelt, checkinCounter, runway*
DelayForecast → onTime, early, late15, late30, late45, canceled, diverted
Weather → conditionIdentifier, temperature, schedule, isNight
Ticket → bookingCode, seatNumber, cabinClass, seatPosition
```

### 3.2 SkyTrace 数据模型 (3 个 SQLAlchemy Table)

```python
class Flight(Base):
    # 所有字段扁平存储在一个表中
    flight_no, airline, departure, arrival
    date, dep_time, arr_time
    dep_terminal, arr_terminal, dep_gate, arr_gate
    aircraft, seat, cabin_class, notes
    stopover, arr_day_offset, status
    connected_group  # 联程分组
```

**关键差异:**

| 方面 | Flighty | SkyTrace |
|------|---------|----------|
| 实体数量 | 42 | 3 |
| 关系建模 | 完整外键关联 | 字符串字段存储 |
| 机场模型 | 独立 Entity (含时区/坐标) | 字符串 (查 JSON 文件) |
| 航司模型 | 独立 Entity (含联系方式/联盟) | 字符串 (查 JSON 文件) |
| 时刻表 | 独立 Schedule Entity | 字符串字段 (dep_time/arr_time) |
| 延误预测 | DelayForecast Entity + 统计 | 无 |
| 天气 | Weather Entity | Open-Meteo 实时查询 |
| 机型 | Equipment Entity | 字符串字段 |
| 代码共享 | Codeshare Entity | 不支持 |

---

## 4. 网络层对比

### 4.1 Flighty 网络层

```
┌─────────────────────────────────────────────┐
│ HTTPClient                                  │
│  ├── 通用 HTTP 方法 (GET/POST/PUT/DELETE)    │
│  ├── Header 配置 (Auth, User-Agent...)       │
│  ├── 请求/响应日志                            │
│  └── 错误处理                                │
├─────────────────────────────────────────────┤
│ NetworkRequestFactory                       │
│  ├── 环境切换 (prod/beta/test)              │
│  ├── byNumber(flightNumber, date)           │
│  ├── byRoute(from, to, date)                │
│  └── 请求对象工厂                             │
├─────────────────────────────────────────────┤
│ Request Objects (类型安全)                   │
│  ├── HTTPRequest (基础)                      │
│  ├── SearchRequest                          │
│  ├── SubscribeToFlightRequest               │
│  ├── FlightSyncPollingRequest               │
│  ├── RegisterDeviceRequest                  │
│  ├── UploadReceiptRequest                   │
│  └── 20+ 其他 Request 类型                   │
├─────────────────────────────────────────────┤
│ API Clients                                 │
│  ├── AnalyticsClient                        │
│  ├── LiveActivityApiClient                   │
│  └── RetailNetworkRequestFactory             │
├─────────────────────────────────────────────┤
│ 序列化: Protocol Buffers                     │
│  包: com.flighty.proto.api                  │
│  包: com.flighty.proto.polaris              │
└─────────────────────────────────────────────┘
```

### 4.2 SkyTrace 网络层

```python
# app.py 中直接使用 urllib / requests
def http_get_json(url, headers=None, timeout=10):
    req = urllib.request.Request(url)
    req.add_header('User-Agent', 'SkyTrace-Monitor/1.0')
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode())
```

**关键差异:**
- Flighty: 类型安全的 Request 对象 → 编译时检查
- SkyTrace: 字符串 URL 拼接 → 运行时错误
- Flighty: Protobuf 序列化 (更小、更快)
- SkyTrace: JSON 序列化 (更通用、更大)

---

## 5. 状态管理对比

### 5.1 Flighty (MVVM)

```
View ──bind──→ ViewModel ──call──→ Service/Repository
  ↑                                    │
  └────────── 响应式更新 ──────────────┘

Coordinator 管理导航流，ViewModel 管理状态
```

### 5.2 SkyTrace (无模式)

```
全局变量 ←── API 响应
    │
    ▼
手动调用 renderXxx() → DOM 操作
```

---

## 6. 可复用资源对比

### 6.1 Flighty 可复用资源

| 类别 | 数量 | 说明 |
|------|------|------|
| ViewControllers | 80+ | 按功能模块组织 |
| Coordinators | 23 | 导航流管理 |
| ViewModels | 16+ | MVVM 状态层 |
| Storyboards | 15 | UI 布局 (编译后) |
| NIBs | 57 | 可复用视图组件 |
| CoreData Entities | 42 | 完整数据模型 |
| Protobuf Messages | 60+ | API 契约 |
| Request Types | 25+ | 类型安全请求 |
| Cache Types | 8+ | 多层缓存策略 |
| Fonts | 4 | Noway 字体家族 |

### 6.2 SkyTrace 可复用资源

| 类别 | 数量 | 说明 |
|------|------|------|
| 机场数据 | 3,251 | 5 语言，含时区 |
| 航司数据 | 228 | 含 Logo |
| 航司 Logo | 300+ | PNG + SVG |
| i18n 翻译 | 5 语言 | zh/en/ja/ko/es |
| 航站楼映射 | 60+ 机场 | 航司→航站楼映射 |
| 测试用例 | 16 | pytest 回归测试 |
| PWA 配置 | manifest + SW | 离线支持 |

---

## 7. 改造优先级矩阵

基于以上分析，SkyTrace v2.0 应按以下优先级进行 Flighty 化改造：

### 🔴 P0 - 架构基础 (必须先做)
1. **前端模块化** - 拆分 app.js 为多个模块
2. **状态管理** - 引入集中式状态管理
3. **组件化 UI** - 引入组件抽象
4. **后端分层** - 拆分 app.py 为 Service/Repository 层

### 🟡 P1 - 功能增强
5. **数据模型重构** - 机场/航司/时刻表拆分为独立模型
6. **缓存层** - 添加数据缓存策略
7. **请求层抽象** - Request Factory 模式
8. **路由此系统** - 前端路由 + History 管理

### 🟢 P2 - 体验提升
9. **响应式更新** - 数据驱动的 UI 渲染
10. **类型安全** - TypeScript 迁移
11. **动画系统** - Lottie 风格动画
12. **实时更新** - WebSocket 航班状态推送
