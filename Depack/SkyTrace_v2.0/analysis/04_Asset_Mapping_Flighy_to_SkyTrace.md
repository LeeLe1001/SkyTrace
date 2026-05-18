# 从 Flighty 到 SkyTrace 的资产复用对照表

> Flighty 提取资源目录: `/Users/leele/Documents/Flighty_Depack/extracted/`  
> SkyTrace 当前目录: `/Users/leele/Documents/Flighty_Depack/skytrace-handover-2026-05-17/`

---

## 1. UI 层资产复用

### 1.1 Flighty Storyboard/NIB → SkyTrace Web 组件

| Flighty 源 (iOS) | SkyTrace v2.0 目标 (Web) | 复用方式 |
|-------------------|--------------------------|----------|
| `FlightListCell.nib` | `components/flight-list.js` | 参考 Cell 布局: 航司 Logo + 航班号 + 航线 + 时间线 |
| `FlightDetailsViewController.storyboardc` | `components/flight-detail.js` | 参考详情页信息层级 |
| `MapViewController.storyboardc` | `components/map-view.js` | 参考地图页布局: 筛选器 + 图层切换 + 图例 |
| `SearchContainerViewController.storyboardc` | `components/search-panel.js` | 参考搜索页交互流程 |
| `SettingsViewController.storyboardc` | `components/settings-panel.js` | 参考设置分组: 通用/API/备份 |

### 1.2 Flighty Coordinator → SkyTrace Router

| Flighty Coordinator | SkyTrace 路由 | 功能 |
|---------------------|---------------|------|
| `AppCoordinator` | `router.js` | 根路由管理 |
| `FlightDetailsCoordinator` | `#/flight/:id` | 航班详情页 |
| `OnboardingCoordinator` | `#/setup` | 首次设置 |
| `PaywallCoordinator` | `#/pro` (未来) | 付费推广 |
| `SettingsCoordinator` | `#/settings` | 设置页 |
| `ProfileCoordinator` | `#/profile` | 个人主页 |

---

## 2. 数据层资产复用

### 2.1 Flighty CoreData Entity → SkyTrace SQLAlchemy Model

| Flighty Entity | SkyTrace 表 | 复用字段 |
|----------------|-------------|----------|
| `Flight` | `flights` (增强) | `flightNumber`, `fullFlightNumber`, `callsign`, `distanceInKm`, `isArchived` |
| `Airport` | `airports` (新表) | `iata`, `icao`, `name`, `city`, `country`, `lat`, `lon`, `timezoneString` |
| `Airline` | `airlines` (新表) | `iata`, `icao`, `name`, `callsign`, `alliance`, `isActive` |
| `Schedule` | `flight_schedules` (新表) | `terminal`, `gate`, `belt`, `baggageBelt`, `checkinCounter`, `runwayConcrete` |
| `Weather` | API 实时查询 | `conditionIdentifier`, `temperature`, `isNight` |
| `Ticket` | `flights` 已有字段 | `bookingCode`→`seat`, `cabinClass`→`cabin_class`, `seatPosition` |
| `DelayForecast` | `delay_forecasts` (新表) | `onTime`, `early`, `late15`, `late30`, `late45`, `canceled`, `diverted` |
| `PlanePosition` | API 实时查询 | `altitudeInFt`, `lng`, `lat`, `speedInMph`, `directionInDeg` |

### 2.2 Flighty Protobuf → SkyTrace JSON Schema

| Flighty Proto Message | SkyTrace 使用 | 字段数 |
|-----------------------|---------------|--------|
| `Flight` | 航班查询响应模型 | 6 嵌套对象, 20+ 字段 |
| `Airport` | 机场数据模型 | 10+ 字段 |
| `Airline` | 航司数据模型 | 12+ 字段 |
| `Schedule` | 时刻表模型 | 10+ 字段 |
| `Weather` | 天气信息模型 | 4 字段 |
| `DelayForecast` | 延误预测 | 8 字段 |
| `FlightPoint` | 飞行路径点 | 坐标+高度+速度 |
| `NearbyPlane` | 附近飞机 (未来功能) | 航班号+坐标+高度+机型 |

---

## 3. 网络层复用

### 3.1 Flighty Request 模式 → SkyTrace API Client

| Flighty Pattern | SkyTrace 实现 |
|-----------------|---------------|
| `HTTPRequest` 基类 → 方法/路径/查询/请求体 | `ApiClient` 基类 → `request(method, path, body)` |
| `NetworkRequestFactory` → 环境切换 | `config.py` → `ENV` 切换 (dev/prod) |
| `SearchRequest` → 航班查询 | `FlightLookupRequest` → 多 API 源 fallback |
| 请求/响应日志 | `middleware/logging.py` |
| Protobuf 序列化 | JSON (保持 Web 原生) |

### 3.2 Flighty API Endpoint → SkyTrace 对照

| Flighty 域 | SkyTrace 替代 |
|------------|---------------|
| `api.flightyapp.com` | 自建 `/api/flight/lookup` |
| `api.flightyapp.com/analytics` | 自建 `/api/stats` |
| `live.flighty.app/` (实时更新) | `/api/flight/status` (轮询) |
| Mapbox 地图样式 | Leaflet + OpenStreetMap (已有) |
| FlightAware 链接 | 外部链接 (已有) |

---

## 4. 可直接复用的文件级资产

### 4.1 数据文件 (直接拷贝到 SkyTrace v2.0)

| Flighty 源文件 | 目标路径 | 用途 |
|----------------|----------|------|
| `airports.csv` / `airports.json` | `data/airports.json` | 已有，可对照补充字段 |
| `airlines.csv` / `airlines.json` | `data/airlines.json` | 已有，可对照补充字段 |
| `radar-animation-dark.json` | `static/animations/radar-dark.json` | Lottie 动画 (需 Lottie Web) |
| `radar-animation-light.json` | `static/animations/radar-light.json` | Lottie 动画 (需 Lottie Web) |

### 4.2 知识资产 (转换为 SkyTrace 数据)

| Flighty 知识 | SkyTrace 应用 |
|--------------|---------------|
| 23 个 Coordinator 命名 | 前端路由设计参考 |
| 16 个 ViewModel 属性 | Store 状态 key 设计参考 |
| 42 个 CoreData Entity 关系 | 数据模型设计参考 |
| 60+ 个 Protobuf Message | API 响应 JSON Schema |
| 8 种缓存类型 | 分层缓存策略参考 |
| `FlightStatus` 枚举 (scheduled/in_flight/landed/diverted/canceled) | 已有 status 字段扩展 |
| `FlightPhase` 枚举 (checkin/boarding/departed/en_route/arrived) | 航班状态时间线 |
| `StaticAssetKindProto` 枚举 | 静态资源分类 |

---

## 5. 不需要复用的 Flighty 资产

| 资产 | 原因 |
|------|------|
| UIKit Storyboards/.nibs | iOS 专用，Web 不需要 |
| CoreData .momd 文件 | iOS 专用持久化框架 |
| Protobuf .proto 定义 | JSON 更适合 Web |
| Swift ViewModels | 语言不兼容 |
| iOS-only frameworks (ActivityKit/WidgetKit) | 平台限制 |
| AppCenter/Amplitude SDK | 已有 Application Insights |
| 内购/IAP 逻辑 | Web 应用不需要 |
| Mapbox iOS SDK | 已有 Leaflet |
