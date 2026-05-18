# SkyTrace × Flighty 全面融合实施计划

> 不分析，直接干。每个步骤都有具体文件路径和可复制代码。
> 目标：把 SkyTrace 的数据和功能，套进 Flighty 的 UI 设计语言和架构模式。

---

## 📋 总览：新增/修改文件清单

```
skytrace-handover-2026-05-17/
├── static/
│   ├── fonts/                          # 🆕 新增目录
│   │   ├── Noway-Light.otf             # 从 Flighty 复制
│   │   ├── Noway-Regular.otf           # 从 Flighty 复制
│   │   ├── Noway-Medium.otf            # 从 Flighty 复制
│   │   └── Noway-Bold.otf              # 从 Flighty 复制
│   ├── animations/                     # 🆕 新增目录
│   │   ├── radar-dark.json             # 从 Flighty 复制
│   │   └── radar-light.json            # 从 Flighty 复制
│   ├── sounds/                         # 🆕 新增目录
│   │   ├── good.wav                    # 从 Flighty 复制
│   │   ├── non-urgent.wav              # 从 Flighty 复制
│   │   └── bad.wav                     # 从 Flighty 复制
│   ├── css/
│   │   ├── style.css                   # 🔧 大幅修改
│   │   └── flighty-theme.css           # 🆕 Flighty 设计系统
│   └── js/
│       ├── app.js                      # 🔧 渐进修改
│       └── lib/
│           ├── store.js                # 🆕 状态管理
│           ├── component.js            # 🆕 组件基类
│           ├── sound-manager.js        # 🆕 音效管理
│           └── lottie-utils.js         # 🆕 Lottie 工具
├── templates/                          # 🆕 新增目录 (Jinja2 模板化)
│   ├── base.html                       # 🆕 基础布局
│   ├── components/
│   │   ├── flight_card.html            # 🆕 航班卡片组件
│   │   ├── status_badge.html           # 🆕 状态徽章
│   │   ├── countdown.html              # 🆕 倒计时组件
│   │   └── empty_state.html            # 🆕 空状态
│   └── pages/
│       ├── home.html                   # 🆕 首页
│       ├── flight_detail.html          # 🆕 航班详情
│       ├── stats.html                  # 🆕 统计页
│       └── settings.html               # 🆕 设置页
├── index.html                          # 🔧 重构为 SPA 入口
└── app.py                              # 🔧 添加模板渲染路由
```

---

## 阶段 1️⃣ 资源迁移（30 分钟）

### Step 1.1 复制字体

```bash
cp /Users/leele/Documents/Flighty_Depack/extracted/resources/fonts/Noway-*.otf \
   /Users/leele/Documents/Flighty_Depack/skytrace-handover-2026-05-17/static/fonts/
```

### Step 1.2 复制 Lottie 动画

```bash
cp /Users/leele/Documents/Flighty_Depack/extracted/resources/animations/radar-animation-dark.json \
   /Users/leele/Documents/Flighty_Depack/skytrace-handover-2026-05-17/static/animations/radar-dark.json
cp /Users/leele/Documents/Flighty_Depack/extracted/resources/animations/radar-animation-light.json \
   /Users/leele/Documents/Flighty_Depack/skytrace-handover-2026-05-17/static/animations/radar-light.json
```

### Step 1.3 复制音效

```bash
cp /Users/leele/Documents/Flighty_Depack/extracted/resources/sounds/Good.wav \
   /Users/leele/Documents/Flighty_Depack/skytrace-handover-2026-05-17/static/sounds/good.wav
cp /Users/leele/Documents/Flighty_Depack/extracted/resources/sounds/NonUrgent.wav \
   /Users/leele/Documents/Flighty_Depack/skytrace-handover-2026-05-17/static/sounds/non-urgent.wav
cp /Users/leele/Documents/Flighty_Depack/extracted/resources/sounds/Bad.wav \
   /Users/leele/Documents/Flighty_Depack/skytrace-handover-2026-05-17/static/sounds/bad.wav
```

---

## 阶段 2️⃣ Flighty 设计系统 CSS（核心样式文件）

### Step 2.1 创建 `static/css/flighty-theme.css`

这个文件是整套 Flighty 设计语言的 CSS 实现，基于从 NIB/Storyboard 推断的规范：

```css
/* ============================================================
   Flighty Design System for SkyTrace v2.0
   基于 Flighty v2.9.2 IPA 逆向工程提取的 UI 规范
   ============================================================ */

/* ---------- 字体 ---------- */
@font-face {
    font-family: 'Noway';
    src: url('/static/fonts/Noway-Light.otf') format('opentype');
    font-weight: 300; font-style: normal;
}
@font-face {
    font-family: 'Noway';
    src: url('/static/fonts/Noway-Regular.otf') format('opentype');
    font-weight: 400; font-style: normal;
}
@font-face {
    font-family: 'Noway';
    src: url('/static/fonts/Noway-Medium.otf') format('opentype');
    font-weight: 500; font-style: normal;
}
@font-face {
    font-family: 'Noway';
    src: url('/static/fonts/Noway-Bold.otf') format('opentype');
    font-weight: 700; font-style: normal;
}

/* ---------- CSS 变量 (设计令牌) ---------- */
:root {
    /* 字体系统 */
    --font-primary: 'Noway', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    --font-mono: 'SF Mono', 'Menlo', monospace;

    /* 字号层级 (从 Flighty NIB 推断) */
    --text-3xl: 34px;    /* 巨幅: 仪表板核心数据 */
    --text-2xl: 28px;    /* 超大: 统计数字 */
    --text-xl:  22px;    /* 大标题: 倒计时数字 */
    --text-lg:  17px;    /* 标题: 航班号 */
    --text-base:15px;    /* 正文: 机场名/城市 */
    --text-sm:  13px;    /* 次要: 日期/时间 */
    --text-xs:  11px;    /* 辅助: 航站楼/登机口 */

    /* 间距系统 (8px 基准) */
    --space-1: 8px;
    --space-2: 16px;
    --space-3: 24px;
    --space-4: 32px;

    /* 圆角 */
    --radius-sm: 8px;
    --radius-md: 12px;
    --radius-lg: 16px;
    --radius-xl: 20px;
    --radius-full: 9999px;

    /* 阴影 */
    --shadow-card: 0 2px 12px rgba(0,0,0,0.08);
    --shadow-elevated: 0 8px 30px rgba(0,0,0,0.12);

    /* 深色主题 (默认) */
    --bg-primary: #0a0a0f;
    --bg-secondary: #14141f;
    --bg-card: #1a1a2e;
    --bg-card-hover: #222240;
    --bg-input: #1e1e32;

    --text-primary: #ffffff;
    --text-secondary: #94a3b8;
    --text-tertiary: #64748b;

    --border-color: #2a2a40;
    --border-light: #3a3a55;

    /* 语义色 (Flighty 风格) */
    --color-blue: #3b82f6;
    --color-green: #10b981;
    --color-yellow: #f59e0b;
    --color-red: #ef4444;
    --color-purple: #8b5cf6;

    /* 动画 */
    --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
    --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
    --duration-fast: 150ms;
    --duration-normal: 300ms;
    --duration-slow: 500ms;
}

/* 浅色主题 */
[data-theme="light"] {
    --bg-primary: #f8fafc;
    --bg-secondary: #f1f5f9;
    --bg-card: #ffffff;
    --bg-card-hover: #f8fafc;
    --bg-input: #f1f5f9;

    --text-primary: #0f172a;
    --text-secondary: #475569;
    --text-tertiary: #94a3b8;

    --border-color: #e2e8f0;
    --border-light: #f1f5f9;

    --shadow-card: 0 1px 3px rgba(0,0,0,0.06);
    --shadow-elevated: 0 4px 16px rgba(0,0,0,0.08);
}

/* ---------- 全局重置 ---------- */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
    font-family: var(--font-primary);
    font-size: var(--text-base);
    color: var(--text-primary);
    background: var(--bg-primary);
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    overflow-x: hidden;
}

/* ---------- 航班卡片 (FlightListCell.nib → CSS) ---------- */
.flight-card {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2);
    background: var(--bg-card);
    border-radius: var(--radius-md);
    border: 1px solid var(--border-color);
    cursor: pointer;
    transition: all var(--duration-fast) var(--ease-out);
    animation: cardEnter 0.4s var(--ease-spring) both;
}
.flight-card:hover {
    background: var(--bg-card-hover);
    border-color: var(--border-light);
    transform: translateY(-1px);
    box-shadow: var(--shadow-card);
}
.flight-card:active { transform: scale(0.99); }

.flight-card .airline-logo {
    width: 44px; height: 44px;
    border-radius: var(--radius-sm);
    background: #fff;
    flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}
.flight-card .airline-logo img {
    width: 32px; height: 32px;
    object-fit: contain;
}

.flight-card .flight-info {
    flex: 1; min-width: 0;
    display: flex; flex-direction: column; gap: 2px;
}

.flight-card .flight-number {
    font-weight: 700;
    font-size: var(--text-lg);
    letter-spacing: 0.5px;
    color: var(--text-primary);
}

.flight-card .flight-route {
    font-size: var(--text-sm);
    color: var(--text-secondary);
    display: flex; align-items: center; gap: 6px;
}
.flight-card .flight-route .arrow { color: var(--color-blue); font-size: 12px; }

.flight-card .flight-time {
    text-align: right;
    flex-shrink: 0;
}
.flight-card .flight-time .time {
    font-variant-numeric: tabular-nums;
    font-weight: 500;
    font-size: var(--text-base);
}
.flight-card .flight-time .date {
    font-size: var(--text-xs);
    color: var(--text-tertiary);
}

/* 航班卡片交错入场 */
.flight-card:nth-child(1) { animation-delay: 0.00s; }
.flight-card:nth-child(2) { animation-delay: 0.05s; }
.flight-card:nth-child(3) { animation-delay: 0.10s; }
.flight-card:nth-child(4) { animation-delay: 0.15s; }
.flight-card:nth-child(5) { animation-delay: 0.20s; }
.flight-card:nth-child(n+6) { animation-delay: 0.25s; }

@keyframes cardEnter {
    from { opacity: 0; transform: translateY(16px) scale(0.97); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
}

/* 历史航班卡片变体 */
.flight-card.past {
    opacity: 0.7;
}
.flight-card.past:hover { opacity: 0.9; }
.flight-card.past .flight-number { font-weight: 500; }

/* ---------- 状态徽章 (StatusView.nib → CSS) ---------- */
.status-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    border-radius: var(--radius-full);
    font-size: var(--text-xs);
    font-weight: 600;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    transition: all var(--duration-normal) var(--ease-out);
}
.status-badge.on-time     { background: #10b98120; color: #10b981; }
.status-badge.boarding    { background: #3b82f620; color: #3b82f6; }
.status-badge.in-flight   { background: #8b5cf620; color: #8b5cf6; }
.status-badge.landed      { background: #64748b20; color: #94a3b8; }
.status-badge.delayed     { background: #f59e0b20; color: #f59e0b; }
.status-badge.canceled    { background: #ef444420; color: #ef4444; }
.status-badge.diverted    { background: #ef444420; color: #ef4444; }

.status-badge .dot {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: currentColor;
    animation: pulse-dot 2s ease infinite;
}
@keyframes pulse-dot {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
}

/* ---------- 倒计时 (CountdownView.nib → CSS) ---------- */
.countdown {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: var(--space-3);
    background: var(--bg-card);
    border-radius: var(--radius-lg);
    border: 1px solid var(--border-color);
}
.countdown .days {
    font-family: var(--font-primary);
    font-weight: 300;
    font-size: var(--text-3xl);
    line-height: 1;
    letter-spacing: -2px;
    color: var(--color-blue);
    font-variant-numeric: tabular-nums;
}
.countdown .label {
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: 2px;
    color: var(--text-tertiary);
    margin-top: 4px;
}
.countdown .sub {
    font-size: var(--text-sm);
    color: var(--text-secondary);
    margin-top: 2px;
}

/* ---------- 到达预测卡片 ---------- */
.arrival-forecast {
    padding: var(--space-2);
    background: var(--bg-card);
    border-radius: var(--radius-lg);
    border: 1px solid var(--border-color);
}
.arrival-forecast .header {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 12px;
}
.arrival-forecast .header h3 {
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 1px;
}
.arrival-forecast .eta {
    font-family: var(--font-primary);
    font-weight: 300;
    font-size: var(--text-2xl);
    color: var(--text-primary);
}
.arrival-forecast .probability-bars {
    display: flex; gap: 6px; margin-top: 12px;
}
.arrival-forecast .prob-bar {
    flex: 1; height: 4px; border-radius: 2px;
    background: var(--border-color);
    transition: background var(--duration-normal);
}
.arrival-forecast .prob-bar.on-time  { background: var(--color-green); }
.arrival-forecast .prob-bar.delayed { background: var(--color-yellow); }
.arrival-forecast .prob-bar.early   { background: var(--color-blue); }

/* ---------- 航司信息卡 (AirlineTile → CSS) ---------- */
.airline-card {
    display: flex; align-items: center; gap: 12px;
    padding: 12px;
    background: var(--bg-card);
    border-radius: var(--radius-md);
    border: 1px solid var(--border-color);
}
.airline-card .logo {
    width: 48px; height: 48px;
    border-radius: 10px;
    background: #fff; padding: 6px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    display: flex; align-items: center; justify-content: center;
}
.airline-card .logo img { width: 36px; height: 36px; object-fit: contain; }
.airline-card .info .name { font-weight: 600; font-size: var(--text-base); }
.airline-card .info .alliance { font-size: var(--text-xs); color: var(--text-tertiary); }

/* ---------- 机型信息卡 (EquipmentTile → CSS) ---------- */
.aircraft-card {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 14px;
    background: var(--bg-card);
    border-radius: var(--radius-md);
    border: 1px solid var(--border-color);
    font-size: var(--text-sm);
}
.aircraft-card .icon { font-size: 20px; }
.aircraft-card .model { font-weight: 500; }

/* ---------- 预订信息 (BookingInfo → CSS) ---------- */
.booking-info {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
    padding: 14px;
    background: var(--bg-card);
    border-radius: var(--radius-md);
    border: 1px solid var(--border-color);
}
.booking-info .item { display: flex; flex-direction: column; gap: 2px; }
.booking-info .item .label {
    font-size: var(--text-xs);
    color: var(--text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
}
.booking-info .item .value {
    font-size: var(--text-base);
    font-weight: 500;
}

/* ---------- 空状态 ---------- */
.empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px var(--space-3);
    text-align: center;
}
.empty-state .icon { font-size: 48px; margin-bottom: 16px; opacity: 0.3; }
.empty-state h3 { font-size: var(--text-lg); color: var(--text-secondary); margin-bottom: 4px; }
.empty-state p { font-size: var(--text-sm); color: var(--text-tertiary); }

/* ---------- 按钮 ---------- */
.btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 10px 20px;
    border-radius: var(--radius-full);
    font-family: var(--font-primary);
    font-size: var(--text-sm);
    font-weight: 600;
    border: none;
    cursor: pointer;
    transition: all var(--duration-fast) var(--ease-out);
    text-decoration: none;
}
.btn-primary {
    background: var(--color-blue);
    color: #fff;
}
.btn-primary:hover { filter: brightness(1.1); transform: translateY(-1px); }
.btn-primary:active { transform: scale(0.97); }

.btn-secondary {
    background: var(--bg-card);
    color: var(--text-primary);
    border: 1px solid var(--border-color);
}
.btn-secondary:hover { border-color: var(--border-light); }

.btn-ghost {
    background: transparent;
    color: var(--text-secondary);
}
.btn-ghost:hover { color: var(--text-primary); background: var(--bg-card); }

.btn-danger {
    background: #ef444420;
    color: var(--color-red);
}

/* FAB (浮动操作按钮) */
.fab {
    position: fixed;
    bottom: 24px; right: 24px;
    width: 56px; height: 56px;
    border-radius: 50%;
    background: var(--color-blue);
    color: #fff;
    border: none;
    font-size: 24px;
    cursor: pointer;
    box-shadow: 0 4px 20px rgba(59,130,246,0.4);
    transition: all var(--duration-fast) var(--ease-spring);
    z-index: 100;
    display: flex; align-items: center; justify-content: center;
}
.fab:hover { transform: scale(1.1); }
.fab:active { transform: scale(0.95); }

/* ---------- 雷达动画叠加层 ---------- */
.radar-overlay {
    position: fixed;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    pointer-events: none;
    z-index: 1000;
    display: none;
}
.radar-overlay.active { display: block; }

/* ---------- 页面切换动画 ---------- */
.page {
    display: none;
    animation: pageIn var(--duration-slow) var(--ease-out);
}
.page.active { display: block; }

@keyframes pageIn {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
}

/* ---------- 导航栏 (Flighty 风格底部标签栏) ---------- */
.tab-bar {
    position: fixed;
    bottom: 0; left: 0; right: 0;
    display: flex;
    background: var(--bg-card);
    border-top: 1px solid var(--border-color);
    padding: 8px 0 env(safe-area-inset-bottom, 0);
    z-index: 200;
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
}
.tab-bar .tab {
    flex: 1;
    display: flex; flex-direction: column; align-items: center;
    gap: 2px;
    padding: 6px 0;
    color: var(--text-tertiary);
    cursor: pointer;
    transition: color var(--duration-fast);
    border: none; background: none;
    font-family: var(--font-primary);
    font-size: var(--text-xs);
}
.tab-bar .tab.active { color: var(--color-blue); }
.tab-bar .tab .icon { font-size: 20px; }

/* ---------- 设置行 ---------- */
.settings-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px var(--space-2);
    background: var(--bg-card);
    border-bottom: 1px solid var(--border-color);
    cursor: pointer;
    transition: background var(--duration-fast);
}
.settings-row:hover { background: var(--bg-card-hover); }
.settings-row:first-child { border-radius: var(--radius-md) var(--radius-md) 0 0; }
.settings-row:last-child { border-radius: 0 0 var(--radius-md) var(--radius-md); border-bottom: none; }
.settings-row:only-child { border-radius: var(--radius-md); }

/* ---------- 输入框 ---------- */
.input {
    width: 100%;
    padding: 10px 14px;
    background: var(--bg-input);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-sm);
    color: var(--text-primary);
    font-family: var(--font-primary);
    font-size: var(--text-base);
    transition: border-color var(--duration-fast);
}
.input:focus { outline: none; border-color: var(--color-blue); }
.input::placeholder { color: var(--text-tertiary); }

/* ---------- 模态框 ---------- */
.modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.6);
    z-index: 300;
    display: flex; align-items: flex-end; justify-content: center;
    animation: fadeIn 0.2s ease;
}
.modal-sheet {
    width: 100%; max-width: 480px; max-height: 90vh;
    background: var(--bg-secondary);
    border-radius: var(--radius-xl) var(--radius-xl) 0 0;
    padding: var(--space-3);
    overflow-y: auto;
    animation: slideUp 0.3s var(--ease-spring);
}
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }

/* ---------- 响应式 ---------- */
@media (min-width: 768px) {
    body { max-width: 480px; margin: 0 auto; }
    .tab-bar { max-width: 480px; left: 50%; transform: translateX(-50%); }
}
```

---

## 阶段 3️⃣ JavaScript 架构层

### Step 3.1 创建 `static/js/lib/store.js`（状态管理，MVVM 风格）

```javascript
/**
 * Store - 简易响应式状态管理
 * 借鉴 Flighty ViewModel 的单向数据流模式
 */
class Store {
    constructor(initialState = {}) {
        this._state = { ...initialState };
        this._listeners = new Map();    // key -> Set<callback>
        this._wildcards = new Set();    // '*' 全局监听
    }

    /** 读取状态 */
    get(key) {
        return this._state[key];
    }

    /** 获取全部状态快照 */
    snapshot() {
        return { ...this._state };
    }

    /** 更新状态，自动通知订阅者 */
    set(key, value) {
        const prev = this._state[key];
        if (prev === value) return;
        this._state[key] = value;
        this._notify(key, value, prev);
    }

    /** 批量更新 (只通知一次) */
    batch(updates) {
        const changes = [];
        for (const [key, value] of Object.entries(updates)) {
            const prev = this._state[key];
            if (prev !== value) {
                this._state[key] = value;
                changes.push([key, value, prev]);
            }
        }
        // 批量通知
        for (const [key, value, prev] of changes) {
            this._notify(key, value, prev);
        }
    }

    /** 订阅特定 key */
    subscribe(key, callback) {
        if (!this._listeners.has(key)) {
            this._listeners.set(key, new Set());
        }
        this._listeners.get(key).add(callback);
        // 返回取消订阅函数
        return () => {
            const set = this._listeners.get(key);
            if (set) set.delete(callback);
        };
    }

    /** 订阅所有变化 */
    subscribeAll(callback) {
        this._wildcards.add(callback);
        return () => this._wildcards.delete(callback);
    }

    /** 内部通知 */
    _notify(key, value, prev) {
        const listeners = this._listeners.get(key);
        if (listeners) {
            listeners.forEach(fn => {
                try { fn(value, prev); } catch(e) { console.error('[Store]', key, e); }
            });
        }
        this._wildcards.forEach(fn => {
            try { fn(key, value, prev); } catch(e) { console.error('[Store:*]', e); }
        });
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
    currentPage: 'home',     // 'home' | 'flights' | 'map' | 'stats' | 'settings'
    currentTab: 'home',      // 底部标签
    theme: 'dark',
    modalOpen: false,
    editingFlightId: null,
    statusFilter: 'upcoming', // 'all' | 'upcoming' | 'completed'
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
```

### Step 3.2 创建 `static/js/lib/component.js`（组件基类）

```javascript
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
    mount() {
        this._mounted = true;
        this.onMount();
    }

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
    render(html) {
        if (this._el) this._el.innerHTML = html;
    }

    /** 事件委托 */
    on(event, selector, handler) {
        this._el?.addEventListener(event, (e) => {
            const target = e.target.closest(selector);
            if (target) handler.call(this, e, target);
        });
    }
}
```

### Step 3.3 创建 `static/js/lib/sound-manager.js`

```javascript
/**
 * SoundManager - 通知音效管理
 * 映射 Flighty 三档音效到 Web Audio API
 */
class SoundManager {
    constructor() {
        this._sounds = {};
        this._enabled = true;
        this._volume = 0.5;
        this._preloaded = false;
    }

    /** 预加载所有音效 */
    preload() {
        const files = {
            good: '/static/sounds/good.wav',
            nonUrgent: '/static/sounds/non-urgent.wav',
            bad: '/static/sounds/bad.wav',
        };
        for (const [name, url] of Object.entries(files)) {
            const audio = new Audio(url);
            audio.preload = 'auto';
            this._sounds[name] = audio;
        }
        this._preloaded = true;
    }

    /** 播放音效 */
    play(name) {
        if (!this._enabled) return;
        const audio = this._sounds[name];
        if (!audio) return;
        audio.volume = this._volume;
        audio.currentTime = 0;
        audio.play().catch(() => {});  // 忽略自动播放限制
    }

    /** 根据航班状态播放对应音效 */
    notifyFlightStatus(status) {
        const map = {
            'on_time': 'good',
            'landed': 'good',
            'checkin_open': 'nonUrgent',
            'boarding': 'nonUrgent',
            'delayed': 'bad',
            'canceled': 'bad',
            'diverted': 'bad',
        };
        const sound = map[status];
        if (sound) this.play(sound);
    }

    set enabled(val) {
        this._enabled = val;
        settingsStore.set('soundEnabled', val);
    }
    get enabled() { return this._enabled; }

    set volume(val) {
        this._volume = Math.max(0, Math.min(1, val));
        settingsStore.set('soundVolume', this._volume);
    }
    get volume() { return this._volume; }
}

const soundManager = new SoundManager();
```

### Step 3.4 创建 `static/js/lib/lottie-utils.js`

```javascript
/**
 * LottieUtils - 雷达动画管理
 */
const LottieUtils = {
    _playerEl: null,

    /** 初始化 Lottie player */
    init() {
        // 注入 Lottie Web Component
        if (!customElements.get('lottie-player')) {
            const script = document.createElement('script');
            script.src = 'https://unpkg.com/@lottiefiles/lottie-player@2.0.8/dist/lottie-player.js';
            document.head.appendChild(script);
        }
        this._ensurePlayer();
    },

    _ensurePlayer() {
        if (this._playerEl) return;
        this._playerEl = document.createElement('lottie-player');
        this._playerEl.id = 'radar-player';
        this._playerEl.setAttribute('background', 'transparent');
        this._playerEl.setAttribute('speed', '1');
        this._playerEl.setAttribute('loop', '');
        this._playerEl.style.cssText = 'display:none;position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:120px;height:120px;z-index:1001;pointer-events:none;';
        document.body.appendChild(this._playerEl);
        this.updateTheme();
    },

    /** 显示雷达动画 */
    show() {
        this._ensurePlayer();
        this.updateTheme();
        this._playerEl.style.display = 'block';
    },

    /** 隐藏雷达动画 */
    hide() {
        if (this._playerEl) {
            this._playerEl.style.display = 'none';
        }
    },

    /** 播放扫描一次后隐藏 */
    scanOnce() {
        this._ensurePlayer();
        this.updateTheme();
        this._playerEl.style.display = 'block';
        this._playerEl.setAttribute('loop', 'false');
        const handler = () => {
            this._playerEl.style.display = 'none';
            this._playerEl.setAttribute('loop', '');
            this._playerEl.removeEventListener('complete', handler);
        };
        this._playerEl.addEventListener('complete', handler);
    },

    /** 根据主题切换动画源 */
    updateTheme() {
        if (!this._playerEl) return;
        const isDark = uiStore.get('theme') === 'dark';
        this._playerEl.setAttribute('src',
            isDark ? '/static/animations/radar-dark.json'
                   : '/static/animations/radar-light.json'
        );
    },
};
```

---

## 阶段 4️⃣ HTML 重构（组件化）

### Step 4.1 修改 `index.html` — 添加 CSS 和 JS 依赖

在 `<head>` 中添加：

```html
<!-- Flighty 设计系统 -->
<link rel="stylesheet" href="static/css/flighty-theme.css?v=50">
```

在 `</body>` 前，其他脚本之后添加：

```html
<!-- Lottie Web Component -->
<script src="https://unpkg.com/@lottiefiles/lottie-player@2.0.8/dist/lottie-player.js" defer></script>
<!-- Flighty 化 JS 模块 -->
<script src="static/js/lib/store.js?v=50" defer></script>
<script src="static/js/lib/component.js?v=50" defer></script>
<script src="static/js/lib/sound-manager.js?v=50" defer></script>
<script src="static/js/lib/lottie-utils.js?v=50" defer></script>
<!-- 改造后的 app.js -->
<script src="static/js/app.js?v=50" defer></script>
```

### Step 4.2 在 `app.js` 中添加 Flighty 组件渲染函数

在 `app.js` 末尾追加以下函数（保持现有代码不变，渐进替换）：

```javascript
// ==================== Flighty 化组件渲染 ====================

/** 渲染航班卡片 (FlightListCell 风格) */
function renderFlighyFlightCard(flight) {
    const logoUrl = flight.airline
        ? `/static/img/airlines/${flight.airline.toLowerCase()}.png`
        : '/static/img/airlines/default.png';
    
    const statusClass = {
        'scheduled': 'on-time',
        'checkin': 'boarding',
        'boarding': 'boarding',
        'in-flight': 'in-flight',
        'completed': 'landed',
        'delayed': 'delayed',
        'canceled': 'canceled',
    }[flight.status] || 'on-time';

    return `
    <div class="flight-card" data-flight-id="${flight.id}" onclick="openFlightDetail('${flight.id}')">
        <div class="airline-logo">
            <img src="${logoUrl}" alt="${flight.airline}" onerror="this.style.display='none'">
        </div>
        <div class="flight-info">
            <span class="flight-number">${flight.flight_no || ''}</span>
            <span class="flight-route">
                ${flight.departure || '???'}
                <span class="arrow">→</span>
                ${flight.arrival || '???'}
            </span>
        </div>
        <div class="flight-time">
            <div class="time">${flight.dep_time || ''}</div>
            <div class="date">${flight.date || ''}</div>
        </div>
    </div>`;
}

/** 渲染状态徽章 */
function renderStatusBadge(status, text) {
    const classMap = {
        'scheduled': 'on-time',
        'checkin': 'boarding',
        'boarding': 'boarding',
        'in-flight': 'in-flight',
        'completed': 'landed',
        'delayed': 'delayed',
        'canceled': 'canceled',
        'diverted': 'diverted',
    };
    const cls = classMap[status] || 'on-time';
    const labels = {
        'scheduled': I18N.translate('statusScheduled'),
        'checkin': I18N.translate('statusCheckin'),
        'boarding': I18N.translate('statusBoarding'),
        'in-flight': I18N.translate('statusInFlight'),
        'completed': I18N.translate('statusCompleted'),
    };
    return `<span class="status-badge ${cls}"><span class="dot"></span>${text || labels[status] || status}</span>`;
}

/** 渲染倒计时组件 */
function renderCountdown(flight) {
    const depDate = new Date(flight.date + 'T' + (flight.dep_time || '00:00'));
    const now = new Date();
    const diffMs = depDate - now;
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) {
        return `<div class="countdown"><div class="days">✓</div><div class="label">已完成</div></div>`;
    }
    if (diffDays === 0) {
        const diffHours = Math.ceil(diffMs / (1000 * 60 * 60));
        return `<div class="countdown"><div class="days">${diffHours}h</div><div class="label">今天出发</div></div>`;
    }
    return `<div class="countdown"><div class="days">${diffDays}</div><div class="label">天后出发</div></div>`;
}

/** 刷新航班列表 (Flighy 风格) */
function refreshFlightCards() {
    const container = document.getElementById('flight-cards');
    if (!container) return;
    
    const allFlights = flightStore.get('flights');
    const filter = uiStore.get('statusFilter');
    
    let filtered;
    if (filter === 'upcoming') {
        filtered = allFlights.filter(f => ['scheduled','checkin','boarding','in-flight'].includes(f.status));
    } else if (filter === 'completed') {
        filtered = allFlights.filter(f => f.status === 'completed');
    } else {
        filtered = allFlights;
    }
    
    if (filtered.length === 0) {
        container.innerHTML = `
        <div class="empty-state">
            <div class="icon">✈️</div>
            <h3>${I18N.translate('emptyTrips')}</h3>
            <p>${I18N.translate('emptyHint')}</p>
        </div>`;
    } else {
        container.innerHTML = filtered.map(renderFlighyFlightCard).join('');
    }
}

/** 显示雷达扫描 */
function showRadarScan() {
    LottieUtils.scanOnce();
}

/** 主题切换 */
function toggleTheme() {
    const current = uiStore.get('theme');
    const next = current === 'dark' ? 'light' : 'dark';
    uiStore.set('theme', next);
    document.documentElement.setAttribute('data-theme', next);
    LottieUtils.updateTheme();
    localStorage.setItem('_skytrace_theme', next);
}

/** 初始化主题 */
function initTheme() {
    const saved = localStorage.getItem('_skytrace_theme') || 'dark';
    uiStore.set('theme', saved);
    document.documentElement.setAttribute('data-theme', saved);
    LottieUtils.updateTheme();
}
```

### Step 4.3 在合适时机调用初始化

在 `app.js` 的初始化流程末尾添加：

```javascript
// Flighty 化初始化
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    LottieUtils.init();
    
    // 在航班查询时触发雷达
    const origLookup = window.lookupFlight;
    if (origLookup) {
        window.lookupFlight = function(...args) {
            LottieUtils.show();
            const result = origLookup.apply(this, args);
            // 查询完成后隐藏 (在 API 回调中调用 LottieUtils.hide())
            return result;
        };
    }
    
    // 航班数据变化时刷新卡片 + 音效
    flightStore.subscribeAll((key, value) => {
        if (key === 'flights') {
            flightStore.set('upcomingFlights', value.filter(f => 
                ['scheduled','checkin','boarding','in-flight'].includes(f.status)
            ));
            flightStore.set('pastFlights', value.filter(f => f.status === 'completed'));
            refreshFlightCards();
        }
    });
});
```

---

## 阶段 5️⃣ 页面级组件

### Step 5.1 航线图页面嵌入雷达动画

在地图加载完成后显示雷达叠加：

```javascript
// 在 renderMap() 或地图初始化函数中添加
function initRadarOnMap() {
    const mapContainer = document.querySelector('.leaflet-container');
    if (!mapContainer) return;
    
    const radarEl = document.createElement('lottie-player');
    radarEl.id = 'map-radar';
    radarEl.setAttribute('background', 'transparent');
    radarEl.setAttribute('speed', '0.6');
    radarEl.setAttribute('loop', '');
    radarEl.setAttribute('src', 
        uiStore.get('theme') === 'dark'
            ? '/static/animations/radar-dark.json'
            : '/static/animations/radar-light.json'
    );
    radarEl.style.cssText = 'position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:200px;height:200px;opacity:0.4;pointer-events:none;z-index:500;display:none;';
    mapContainer.appendChild(radarEl);
    
    // 航班查询时显示
    const origLookup = window.lookupFlight;
    window.lookupFlight = function(...args) {
        radarEl.style.display = 'block';
        const result = origLookup?.apply(this, args);
        setTimeout(() => { radarEl.style.display = 'none'; }, 3000);
        return result;
    };
}
```

### Step 5.2 设置页面音效开关

在设置面板的渲染函数中添加：

```javascript
// 设置音效开关的 HTML
`
<div class="settings-row" onclick="soundManager.enabled = !soundManager.enabled">
    <span>🔔 ${I18N.translate('soundEffects') || '通知音效'}</span>
    <span>${soundManager.enabled ? '✅' : '❌'}</span>
</div>
`
```

---

## 阶段 6️⃣ 实施顺序（按文件依赖）

```
第 1 天（上午）: 资源复制
├── 复制 4 个 Noway 字体到 static/fonts/
├── 复制 2 个 Lottie JSON 到 static/animations/
└── 复制 3 个 WAV 音效到 static/sounds/

第 1 天（下午）: CSS 设计系统
├── 创建 static/css/flighty-theme.css  ← 完整代码见 Step 2.1
└── 在 index.html 中引入

第 2 天（上午）: JS 架构
├── 创建 static/js/lib/store.js       ← 完整代码见 Step 3.1
├── 创建 static/js/lib/component.js   ← 完整代码见 Step 3.2
├── 创建 static/js/lib/sound-manager.js ← 完整代码见 Step 3.3
└── 创建 static/js/lib/lottie-utils.js  ← 完整代码见 Step 3.4

第 2 天（下午）: 组件渲染函数
├── 在 app.js 末尾追加组件渲染函数   ← 完整代码见 Step 4.2
└── 在 index.html 引入所有新 JS

第 3 天: 页面整合 + 调试
├── 首页使用 flight-card 替换旧列表
├── 地图页嵌入雷达叠加
├── 设置页添加音效开关
└── 全局主题切换验证

第 4-5 天: 动画打磨
├── 卡片入场 stagger 动画
├── 状态徽章颜色过渡
├── 航线绘制动画
├── 页面切换动画
└── Lottie 交互联动
```

---

## ⚡ 最小可行版本（今天就上线）

如果只能做一件事，修改 `static/css/flighty-theme.css` + 在 `index.html` 引入。CSS 变量和卡片样式会立刻改变整个应用的外观。

```bash
# 最小改动
cp /Users/leele/Documents/Flighty_Depack/extracted/resources/fonts/Noway-*.otf \
   /Users/leele/Documents/Flighty_Depack/skytrace-handover-2026-05-17/static/fonts/

# 然后创建上述 static/css/flighty-theme.css 并引入
```
