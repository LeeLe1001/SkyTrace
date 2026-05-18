# SkyTrace v2.0 — Flighty UI & 动画全盘复用详细指南

> 基于 Flighty v2.9.2 IPA 提取的 398 个可复用资源文件  
> 目标: 将 Flighty 的 UI 设计语言和动画效果完整迁移到 SkyTrace Web 端  
> 日期: 2026-05-17

---

## 📦 可复用资源清单

### 一、动画资源 (2 个 Lottie JSON)

| 文件名 | 大小 | 用途 | 复用方式 |
|--------|------|------|----------|
| `radar-animation-dark.json` | 8.7 KB | 深色主题雷达扫描动画 | Lottie Web Player |
| `radar-animation-light.json` | 10.9 KB | 浅色主题雷达扫描动画 | Lottie Web Player |

**位置**: `extracted/resources/animations/`

### 二、字体资源 (4 个 Noway 家族)

| 字体文件 | 大小 | 字重 | CSS @font-face |
|----------|------|------|----------------|
| `Noway-Light.otf` | 44 KB | 300 | `font-weight: 300` |
| `Noway-Regular.otf` | 44 KB | 400 | `font-weight: 400` |
| `Noway-Medium.otf` | 46 KB | 500 | `font-weight: 500` |
| `Noway-Bold.otf` | 48 KB | 700 | `font-weight: 700` |

**位置**: `extracted/resources/fonts/`

### 三、声音资源 (3 个通知音效)

| 文件名 | 大小 | 用途 | 复用方式 |
|--------|------|------|----------|
| `Good.wav` | 405 KB | 正面通知 (准点/到达) | Web Audio API / `<audio>` |
| `NonUrgent.wav` | 669 KB | 普通提醒 (值机开放) | Web Audio API / `<audio>` |
| `Bad.wav` | 1.06 MB | 负面通知 (延误/取消) | Web Audio API / `<audio>` |

**位置**: `extracted/resources/sounds/`

### 四、UI 布局资源 (15 个 Storyboard + 22 个 NIB)

| 类别 | 数量 | 用途 |
|------|------|------|
| Storyboards | 15 | 完整页面布局 (编译后 .storyboardc) |
| NIBs (顶层) | 22 | 可复用视图组件 (编译后 .nib) |
| NIBs (storyboard 内) | 70 | 视图控制器内部视图 |
| **合计** | **107** | |

**Storyboard 清单** (含对应 SkyTrace 页面映射):

| Flighty Storyboard | SkyTrace 对应页面 | 布局信息 |
|---------------------|-------------------|----------|
| `LaunchScreen.storyboardc` | 开屏动画 | 品牌 Logo + 加载进度 |
| `LaunchScreen-Retail.storyboardc` | 开屏动画 (App Store 版) | 同上 |
| `LaunchScreen-Internal.storyboardc` | 开屏动画 (内测版) | 同上 |
| `ProfileViewController.storyboardc` | 个人主页 (`#/profile`) | 头像/统计/设置入口 |
| `ProfileHeaderViewController.storyboardc` | 个人主页头部 | 头像 + 飞行数据概览 |
| `ProfileStatsViewController.storyboardc` | 统计面板 (`#/stats`) | 数字卡片网格 |
| `ArrivalForecastViewController.storyboardc` | 到达预测 (核心功能) | 时间线 + 延误预测 |
| `EmptyArrivalForecastViewController.storyboardc` | 空状态 | 暂无预报时的占位 |
| `CrewViewController.storyboardc` | 机组信息 | 乘务员列表 |
| `OfferViewController.storyboardc` | 推广弹窗 | Pro 版本升级 |
| `ManageAccountViewController.storyboardc` | 账户管理 (`#/settings`) | 账户设置表单 |
| `ContactPrefaceViewController.storyboardc` | 联系人引导 | 通讯录授权引导 |
| `AddViaEmailViewController.storyboardc` | 邮箱添加 | 邮件添加航班 |
| `RecordOfChangesTileViewController.storyboardc` | 变更记录卡片 | 航班变更时间线 |
| `TripItActiveConnectionViewController.storyboardc` | TripIt 连接 | 第三方同步 |

**关键 NIB 组件清单** (含 Web 组件映射):

| Flighty NIB | 组件类型 | SkyTrace Web 组件 |
|-------------|----------|-------------------|
| `FlightListCell.nib` | 航班列表行 | `<flight-list-item>` |
| `SharedFlightListCell.nib` | 共享航班行 | `<flight-list-item shared>` |
| `PastFlightCell.nib` | 历史航班行 | `<flight-list-item past>` |
| `FlightDetailsViewController.nib` | 航班详情 | `<flight-detail-panel>` |
| `FlightDetailsSummaryViewController.nib` | 详情摘要 | `<flight-detail-summary>` |
| `FlightStatusBarViewController.nib` | 状态栏 | `<flight-status-bar>` |
| `CountdownView.nib` | 倒计时组件 | `<countdown-timer>` |
| `StatusView.nib` | 状态指示器 | `<status-badge>` |
| `AirlineTileViewController.nib` | 航司信息卡 | `<airline-card>` |
| `EquipmentTileViewController.nib` | 机型信息卡 | `<aircraft-card>` |
| `BookingInfoViewController.nib` | 预订信息 | `<booking-info-panel>` |
| `SettingsCell.nib` | 设置行 | `<settings-row>` |
| `NotificationCell.nib` | 通知行 | `<notification-item>` |
| `MemoryCell.nib` | 记忆/高光行 | `<memory-card>` |
| `AddFlightHelper.nib` | 添加航班引导 | `<add-flight-tooltip>` |
| `WelcomeBackHelper.nib` | 欢迎回来引导 | `<welcome-back-banner>` |
| `FirstPageEmptyStateView.nib` | 首页空状态 | `<empty-state>` |
| `RegularEmptyStateView.nib` | 通用空状态 | `<empty-state>` |
| `LapsedView.nib` | 过期提示 | `<lapsed-banner>` |
| `LapsedNotificationCell.nib` | 过期通知 | `<lapsed-notification>` |
| `MyHistoryTileViewController.nib` | 历史卡片 | `<history-tile>` |
| `PaywallSettingsBannerView.nib` | 付费设置横幅 | `<paywall-banner>` |

---

## 🎨 从 NIB 布局逆向还原 UI 设计规范

### 2.1 从 NIB 文件名推断的 UI 层级

```
Flighty 首页 (推断布局):
┌─────────────────────────────────────┐
│  FlightStatusBar (航班状态栏)         │  ← FlightStatusBarViewController.nib
├─────────────────────────────────────┤
│  Upcoming Flight Card                │
│  ┌───────────────────────────────┐  │
│  │ CountdownView (倒计时)        │  │  ← CountdownView.nib
│  │ ┌─────┐                      │  │
│  │ │Logo │ FlightListCell        │  │  ← FlightListCell.nib
│  │ └─────┘ CZ3101 北京→广州     │  │
│  │  T2    14:30  🛫  🛬  17:20  │  │
│  └───────────────────────────────┘  │
├─────────────────────────────────────┤
│  [历史航班列表]                       │
│  PastFlightCell ...                  │  ← PastFlightCell.nib
│  PastFlightCell ...                  │
├─────────────────────────────────────┤
│  FirstPageEmptyState (无航班时)      │  ← FirstPageEmptyStateView.nib
└─────────────────────────────────────┘
```

### 2.2 从 Storyboard 名称推断的页面信息架构

```
Flighty 信息架构 (对应 SkyTrace 路由):

#/ (首页)
  ├── FlightStatusBar (航班状态条)
  ├── FlightListCell[] (即将出行列表)
  ├── PastFlightCell[] (历史记录)
  └── EmptyState (空状态)

#/flight/:id (航班详情)
  ├── FlightDetailsSummary (摘要)
  ├── FlightStatusBar (实时状态)
  ├── ArrivalForecast (到达预测)         ← 核心差异化功能
  ├── CountdownView (倒计时)
  ├── Crew (机组信息)
  ├── EquipmentTile (机型信息)
  ├── RecordOfChanges (变更时间线)
  └── BookingInfo (预订信息)

#/stats (统计)
  ├── ProfileHeader (头部概览)
  └── ProfileStats (统计卡片)

#/settings (设置)
  ├── ManageAccount (账户管理)
  ├── SettingsCell[] (设置项列表)
  └── PaywallSettingsBanner (Pro 推广)

#/profile (个人)
  └── Profile (个人主页)
```

---

## 🎬 动画复用方案

### 3.1 Lottie 雷达动画

**Flighty 原始用途**: 航班搜索/刷新时的雷达扫描动画

**SkyTrace 复用场景**:
- 🔍 航班查询等待动画 (替换现有 loading spinner)
- 📡 航班状态刷新动画
- 🗺️ 地图加载动画

**实现方案**:

```html
<!-- 1. 引入 Lottie Web Player -->
<script src="https://unpkg.com/@lottiefiles/lottie-player@2.0.8/dist/lottie-player.js"></script>

<!-- 2. 主题自适应雷达动画 -->
<lottie-player 
  id="radar-animation"
  src="/static/animations/radar-animation-dark.json"
  background="transparent"
  speed="1"
  style="width: 120px; height: 120px;"
  loop
  autoplay>
</lottie-player>
```

```javascript
// 3. 主题切换: 深色/浅色模式自动切换动画源
function updateRadarAnimation() {
    const player = document.getElementById('radar-animation');
    const isDark = document.documentElement.classList.contains('dark');
    player.src = isDark 
        ? '/static/animations/radar-animation-dark.json'
        : '/static/animations/radar-animation-light.json';
}

// 4. 航班查询时触发雷达动画
async function lookupFlight(flightNumber) {
    const player = document.getElementById('radar-animation');
    player.style.display = 'block';
    player.play();
    
    try {
        const result = await api.lookupFlight(flightNumber);
        // 成功: 播放一次完整扫描后隐藏
        player.addEventListener('complete', () => {
            player.style.display = 'none';
        }, { once: true });
        player.setAttribute('loop', 'false');
    } catch (err) {
        // 失败: 立即停止
        player.stop();
        player.style.display = 'none';
    }
}
```

### 3.2 地图上叠加雷达扫描效果

```javascript
// 在地图中心叠加雷达扫描动画 (用于航班搜索时)
class RadarOverlay {
    constructor(map) {
        this._map = map;
        this._container = L.DomUtil.create('div', 'radar-overlay');
        this._container.innerHTML = `
            <lottie-player 
                src="/static/animations/radar-animation-dark.json"
                background="transparent"
                speed="0.8"
                style="width: 200px; height: 200px; opacity: 0.6;"
                loop autoplay>
            </lottie-player>
        `;
        this._container.style.cssText = `
            position: absolute;
            top: 50%; left: 50%;
            transform: translate(-50%, -50%);
            pointer-events: none;
            z-index: 1000;
            display: none;
        `;
        map.getContainer().appendChild(this._container);
    }
    
    show() { this._container.style.display = 'block'; }
    hide() { this._container.style.display = 'none'; }
}
```

---

## 🔊 声音复用方案

### 4.1 通知音效系统

```javascript
// lib/sound-manager.js
class SoundManager {
    constructor() {
        this.sounds = {
            good: new Audio('/static/sounds/Good.wav'),
            nonUrgent: new Audio('/static/sounds/NonUrgent.wav'),
            bad: new Audio('/static/sounds/Bad.wav')
        };
        this._enabled = true;
        this._volume = 0.5;
    }

    // 航班状态变化 → 对应音效
    notifyFlightStatus(status) {
        const soundMap = {
            'on_time': 'good',           // 准点 → Good.wav
            'landed': 'good',            // 已到达 → Good.wav
            'checkin_open': 'nonUrgent', // 值机开放 → NonUrgent.wav
            'boarding': 'nonUrgent',     // 开始登机 → NonUrgent.wav
            'delayed': 'bad',            // 延误 → Bad.wav
            'canceled': 'bad',           // 取消 → Bad.wav
            'diverted': 'bad'            // 备降 → Bad.wav
        };
        
        const sound = soundMap[status];
        if (sound) this.play(sound);
    }

    play(name) {
        if (!this._enabled) return;
        const audio = this.sounds[name];
        if (audio) {
            audio.volume = this._volume;
            audio.currentTime = 0;  // 从头播放
            audio.play().catch(() => {});  // 忽略自动播放限制
        }
    }

    // 设置面板中控制
    set enabled(val) { this._enabled = val; }
    set volume(val) { this._volume = Math.max(0, Math.min(1, val)); }
}

// 全局实例
const soundManager = new SoundManager();

// 使用示例: 航班状态轮询回调
function onFlightStatusChange(flight, oldStatus, newStatus) {
    soundManager.notifyFlightStatus(newStatus);
    // ... UI 更新
}
```

---

## 🎨 设计系统映射 (Flighty → SkyTrace CSS)

### 5.1 字体系统

```css
/* static/css/fonts.css */
@font-face {
    font-family: 'Noway';
    src: url('/static/fonts/Noway-Light.otf') format('opentype');
    font-weight: 300;
    font-style: normal;
}
@font-face {
    font-family: 'Noway';
    src: url('/static/fonts/Noway-Regular.otf') format('opentype');
    font-weight: 400;
    font-style: normal;
}
@font-face {
    font-family: 'Noway';
    src: url('/static/fonts/Noway-Medium.otf') format('opentype');
    font-weight: 500;
    font-style: normal;
}
@font-face {
    font-family: 'Noway';
    src: url('/static/fonts/Noway-Bold.otf') format('opentype');
    font-weight: 700;
    font-style: normal;
}

:root {
    --font-primary: 'Noway', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    
    /* 从 Flighty 推断的字号层级 */
    --text-xs: 11px;      /* 辅助文字: 航站楼/登机口 */
    --text-sm: 13px;      /* 次要信息: 日期/时间 */
    --text-base: 15px;    /* 正文: 机场名/城市 */
    --text-lg: 17px;      /* 标题: 航班号 */
    --text-xl: 22px;      /* 大标题: 倒计时数字 */
    --text-2xl: 28px;     /* 超大: 统计数字 */
    --text-3xl: 34px;     /* 巨幅: 仪表板核心数据 */
}
```

### 5.2 NIB → CSS 组件映射

每个 Flighty NIB 对应一个 SkyTrace CSS 组件类:

```css
/* ===== FlightListCell.nib → .flight-list-item ===== */
.flight-list-item {
    display: flex;
    align-items: center;
    padding: 16px;
    border-radius: 12px;
    background: var(--card-bg);
    gap: 12px;
}
.flight-list-item .airline-logo {
    width: 40px; height: 40px;
    border-radius: 8px;
}
.flight-list-item .flight-route {
    flex: 1;
}
.flight-list-item .flight-number {
    font-family: var(--font-primary);
    font-weight: 700;
    font-size: var(--text-lg);
    letter-spacing: 0.5px;
}
.flight-list-item .route-cities {
    font-size: var(--text-sm);
    color: var(--text-secondary);
}
.flight-list-item .flight-time {
    text-align: right;
    font-variant-numeric: tabular-nums;
}

/* ===== CountdownView.nib → .countdown-timer ===== */
.countdown-timer {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 20px;
}
.countdown-timer .days-left {
    font-family: var(--font-primary);
    font-weight: 300;
    font-size: var(--text-3xl);
    line-height: 1;
    letter-spacing: -1px;
}
.countdown-timer .label {
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: 2px;
    color: var(--text-tertiary);
    margin-top: 4px;
}

/* ===== StatusView.nib → .status-badge ===== */
.status-badge {
    display: inline-flex;
    align-items: center;
    padding: 4px 10px;
    border-radius: 20px;
    font-size: var(--text-xs);
    font-weight: 500;
    letter-spacing: 0.5px;
}
.status-badge.on-time    { background: #10b98120; color: #10b981; }
.status-badge.delayed    { background: #f59e0b20; color: #f59e0b; }
.status-badge.canceled   { background: #ef444420; color: #ef4444; }
.status-badge.in-flight  { background: #3b82f620; color: #3b82f6; }

/* ===== AirlineTileViewController.nib → .airline-card ===== */
.airline-card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    border-radius: 10px;
    background: var(--card-bg);
}
.airline-card .logo {
    width: 48px; height: 48px;
    border-radius: 10px;
    background: #fff;
    padding: 4px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
}
.airline-card .info .name {
    font-weight: 600;
    font-size: var(--text-base);
}
.airline-card .info .alliance {
    font-size: var(--text-xs);
    color: var(--text-tertiary);
}

/* ===== EquipmentTileViewController.nib → .aircraft-card ===== */
.aircraft-card {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    border-radius: 8px;
    background: var(--card-bg);
}
.aircraft-card .icon { font-size: 24px; }
.aircraft-card .model { font-weight: 500; }
.aircraft-card .reg { font-size: var(--text-xs); color: var(--text-tertiary); }

/* ===== BookingInfoViewController.nib → .booking-info ===== */
.booking-info {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    padding: 14px;
    border-radius: 10px;
    background: var(--card-bg);
}
.booking-info .field-label {
    font-size: var(--text-xs);
    color: var(--text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
}
.booking-info .field-value {
    font-size: var(--text-base);
    font-weight: 500;
}

/* ===== ArrivalForecast → .arrival-forecast ===== */
.arrival-forecast {
    padding: 16px;
    border-radius: 14px;
    background: linear-gradient(135deg, var(--card-bg), var(--card-bg-alt));
}
.arrival-forecast .eta {
    font-family: var(--font-primary);
    font-size: var(--text-2xl);
    font-weight: 300;
}
.arrival-forecast .delay-probability {
    display: flex;
    gap: 6px;
    margin-top: 12px;
}
.arrival-forecast .prob-bar {
    flex: 1;
    height: 4px;
    border-radius: 2px;
    background: var(--border-color);
}
.arrival-forecast .prob-bar.high { background: #10b981; }
.arrival-forecast .prob-bar.medium { background: #f59e0b; }
.arrival-forecast .prob-bar.low { background: #ef4444; }
```

---

## 📐 页面级 UI 布局还原

### 6.1 首页布局 (基于 Flighty 首页推断)

```html
<!-- SkyTrace v2.0 首页 (Flighty 化) -->
<div id="home-page" class="page">
    <!-- 状态栏 -->
    <flight-status-bar></flight-status-bar>
    
    <!-- 即将出行航班卡片 -->
    <section class="upcoming-flights">
        <div class="section-header">
            <h2 data-i18n="myTrips">我的行程</h2>
            <span class="badge" id="upcoming-count">3</span>
        </div>
        
        <div class="flight-cards" id="upcoming-list">
            <!-- FlightListCell 风格卡片 -->
            <flight-list-item 
                v-for="flight in upcomingFlights"
                :flight="flight">
            </flight-list-item>
        </div>
    </section>
    
    <!-- 雷达搜索按钮 (中间悬浮) -->
    <button class="fab-radar" id="btn-search" title="航班查询">
        <lottie-player 
            src="/static/animations/radar-animation-dark.json"
            width="60" height="60"
            loop autoplay>
        </lottie-player>
    </button>
    
    <!-- 历史航班列表 -->
    <section class="past-flights">
        <div class="section-header">
            <h2 data-i18n="filterCompleted">已完成</h2>
        </div>
        
        <div class="flight-cards" id="past-list">
            <flight-list-item 
                v-for="flight in pastFlights"
                :flight="flight"
                :variant="'past'">
            </flight-list-item>
        </div>
    </section>
    
    <!-- 空状态 (无航班时) -->
    <empty-state 
        v-if="flights.length === 0"
        icon="✈️"
        :message="i18n('emptyTrips')">
    </empty-state>
</div>
```

### 6.2 航班详情页 (基于 Flighty 详情页推断)

```html
<!-- SkyTrace v2.0 航班详情页 (Flighty 化) -->
<div id="flight-detail-page" class="page">
    <!-- 摘要卡片 -->
    <flight-detail-summary :flight="flight"></flight-detail-summary>
    
    <!-- 实时状态条 -->
    <flight-status-bar 
        :status="flight.status"
        :countdown="countdown">
    </flight-status-bar>
    
    <!-- 到达预测 (核心差异化) -->
    <arrival-forecast 
        :eta="flight.arr_time"
        :delay-stats="delayStats">
    </arrival-forecast>
    
    <!-- 关键时间线 -->
    <div class="timeline">
        <div class="timeline-item" v-for="event in timeline">
            <countdown-timer :target="event.time"></countdown-timer>
            <span class="label">{{ event.label }}</span>
        </div>
    </div>
    
    <!-- 航司信息 -->
    <airline-card :airline="flight.airline"></airline-card>
    
    <!-- 机型信息 -->
    <aircraft-card :aircraft="flight.aircraft"></aircraft-card>
    
    <!-- 机组信息 -->
    <crew-list :crew="flight.crew"></crew-list>
    
    <!-- 变更记录 -->
    <change-record-tile :changes="flight.changes"></change-record-tile>
    
    <!-- 预订信息 -->
    <booking-info :booking="flight.booking"></booking-info>
</div>
```

---

## 🎯 分阶段实施计划

### Phase 1: 字体和基础样式 (1-2 天)

1. 复制 Noway 字体到 `static/fonts/`
2. 编写 `static/css/fonts.css` 并引入
3. 更新 `:root` CSS 变量，使用 Noway 字体
4. 在 `style.css` 中应用新的字体变量到全局

**验收标准**: 所有文字使用 Noway 字体，字号层级与 Flighty 一致

### Phase 2: 动画集成 (1 天)

1. 复制 Lottie 动画到 `static/animations/`  
2. 引入 Lottie Web Player (CDN 或本地)
3. 实现 `<lottie-player>` 主题切换
4. 在航班查询流程中接入雷达动画
5. 在地图层叠叠加雷达效果

**验收标准**: 查询航班时显示雷达扫描动画，主题切换时动画源切换

### Phase 3: 声音系统 (0.5 天)

1. 复制声音文件到 `static/sounds/`
2. 实现 `SoundManager` 类
3. 在设置面板添加声音开关
4. 在航班状态变化回调中接入音效

**验收标准**: 状态变化时有对应音效，设置面板可控制开关

### Phase 4: CSS 组件实现 (3-5 天)

按优先级逐个实现 CSS 组件:
1. `FlightListCell` → `.flight-list-item` (最核心)
2. `CountdownView` → `.countdown-timer`
3. `StatusView` → `.status-badge`
4. `FlightDetailsSummary` → `.flight-detail-summary`
5. `AirlineTile` → `.airline-card`
6. `EquipmentTile` → `.aircraft-card`
7. `BookingInfo` → `.booking-info`
8. `ArrivalForecast` → `.arrival-forecast`
9. `EmptyState` → `.empty-state`
10. `SettingsCell` → `.settings-row`

**验收标准**: 每个组件在视觉上与 Flighty 一致 (参考 NIB 布局推理)

### Phase 5: 页面布局重构 (3-5 天)

1. 重构首页为 Flighty 风格双区布局 (即将出行 + 历史)
2. 重构航班详情页为信息卡片流
3. 添加到达预测组件 (SkyTrace 可利用已有 API 数据)
4. 添加变更记录时间线

**验收标准**: 页面信息架构与 Flighty 对齐，视觉风格一致

### Phase 6: 动画精髓 (2-3 天)

1. 卡片入场动画 (staggered fadeInUp)
2. 状态变化过渡动画 (badge 颜色渐变)
3. 地图航线绘制动画 (arc 渐入)
4. 雷达扫描位置同步 (查询时地图中心叠加)
5. 页面切换动画 (slide + fade)

```css
/* 卡片入场动画 */
.flight-list-item {
    animation: cardEnter 0.4s ease both;
}
.flight-list-item:nth-child(1) { animation-delay: 0.05s; }
.flight-list-item:nth-child(2) { animation-delay: 0.10s; }
.flight-list-item:nth-child(3) { animation-delay: 0.15s; }
/* ... */

@keyframes cardEnter {
    from {
        opacity: 0;
        transform: translateY(16px) scale(0.97);
    }
    to {
        opacity: 1;
        transform: translateY(0) scale(1);
    }
}

/* 状态徽章颜色过渡 */
.status-badge {
    transition: background-color 0.3s ease, color 0.3s ease;
}

/* 航线绘制动画 */
.flight-arc {
    stroke-dasharray: 1000;
    stroke-dashoffset: 1000;
    animation: drawArc 1.5s ease forwards;
}
@keyframes drawArc {
    to { stroke-dashoffset: 0; }
}
```

---

## 📊 完整文件迁移清单

```
SkyTrace v2.0 新增文件:
├── static/
│   ├── fonts/
│   │   ├── Noway-Light.otf          ← 从 Flighty 复制
│   │   ├── Noway-Regular.otf        ← 从 Flighty 复制
│   │   ├── Noway-Medium.otf         ← 从 Flighty 复制
│   │   └── Noway-Bold.otf           ← 从 Flighty 复制
│   ├── animations/
│   │   ├── radar-animation-dark.json  ← 从 Flighty 复制
│   │   └── radar-animation-light.json ← 从 Flighty 复制
│   ├── sounds/
│   │   ├── Good.wav                 ← 从 Flighty 复制
│   │   ├── NonUrgent.wav            ← 从 Flighty 复制
│   │   └── Bad.wav                  ← 从 Flighty 复制
│   └── css/
│       ├── fonts.css                ← 新建 (字体定义)
│       ├── flighty-components.css   ← 新建 (NIB → CSS 组件)
│       └── flighty-animations.css   ← 新建 (入场/过渡动画)
└── static/js/
    └── lib/
        ├── sound-manager.js         ← 新建 (音效管理)
        └── lottie-utils.js          ← 新建 (Lottie 主题管理)
```

---

## ⚠️ 注意事项

1. **Noway 字体版权**: 这是商业字体，仅在 SkyTrace 项目中使用，不可重新分发
2. **Lottie 动画版权**: 从 Flighty 提取，仅用于 SkyTrace 内部开发参考
3. **声音文件**: 同上，仅用于 SkyTrace 内部
4. **NIB 文件不可直接用于 Web**: 编译后的 .nib 仅用于分析布局参考，不可直接渲染
5. **Storyboard 类似**: 仅用于推断页面信息架构和布局层级
6. **webp 格式**: 部分资源可能需要格式转换才能在 Web 上使用
