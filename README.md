# ✈️ SkyTrace — 个人航旅管理系统

> *Record every takeoff. Trace your sky.*
>
> 记录你的每一次飞行，在世界地图上绘制属于自己的天空轨迹。

![Python](https://img.shields.io/badge/Python-3.8+-3776ab?logo=python&logoColor=white)
![Flask](https://img.shields.io/badge/Flask-2.0+-000000?logo=flask)
![Leaflet](https://img.shields.io/badge/Leaflet-1.9-199900?logo=leaflet)
![PWA](https://img.shields.io/badge/PWA-Installable-5a0fc8?logo=pwa)
![i18n](https://img.shields.io/badge/i18n-5%20Languages-f59e0b)
![License](https://img.shields.io/badge/License-MIT-green)

---

## 📖 目录

- [项目简介](#-项目简介)
- [核心功能](#-核心功能)
- [技术架构](#-技术架构)
- [快速开始](#-快速开始)
- [项目结构](#-项目结构)
- [功能详解](#-功能详解)
- [API 文档](#-api-文档)
- [航班监控与推送](#-航班监控与推送)
- [部署指南](#-部署指南)
- [PWA 安装指南](#-pwa-安装指南)
- [开发日志](#-开发日志)
- [许可证](#-许可证)

---

## 🌍 项目简介

**SkyTrace** 是一个面向个人用户的航班行程管理系统，灵感来源于航旅纵横、Flighty 等航旅 App。它使用 Flask + Leaflet.js 构建，将你的每一段飞行记录以优美的大圆弧线绘制在深色世界地图上，同时提供丰富的统计分析和航班状态追踪能力。

### 🎯 项目亮点

| 特性 | 说明 |
|------|------|
| 🗺️ **双地图架构** | 首页仅展示待出行航班，行程地图展示全部历史航线（支持全屏/热力图/年份筛选）|
| ✈️ **智能航班查询** | 三级 fallback：在线 API → 本地时刻表缓存 → 历史记录 |
| 🏢 **自动补全航站楼** | 内置 60+ 机场 × 航司的航站楼映射数据库 |
| 🌐 **五语言 i18n** | 中文 / English / 日本語 / 한국어 / Español |
| 📱 **PWA 支持** | 可安装到手机桌面，支持离线缓存 |
| 🔗 **联程航班** | 支持多段航班联程绑定/解绑/跨日显示 |
| 📊 **趣味统计** | 座位偏好、舱位分布、星期热力图、最远/最短航线等 |
| 🌡️ **热力图** | 机场访问频率热力图，直观展示飞行足迹密度 |
| 🔔 **航班监控** | 独立部署的监控脚本，检测延误/取消/登机口变更并推送 Bark 通知 |

### ℹ️ 当前状态说明（2026-04）

- 后端主入口仍为 `app.py`，生产可用路径是 **单用户 + JSON 文件存储**。
- 仓库已引入 `storage.py`（SQLAlchemy 多用户基础层）与前端认证门禁 UI，属于演进中的基础能力。
- 当认证接口不可用时，前端会自动降级为当前可用模式继续工作。

---

## ✨ 核心功能

### 🏠 首页
- **待出行航班地图** — 在暗色 CartoDB 底图上用蓝色弧线展示即将出发的航班
- **航班卡片轮播** — 最近一班航班详情卡（含航司 Logo、状态倒计时、值机/登机时间线）
- **拖拽展开列表** — 从底部 peek 状态拖拽展开查看所有待出行航班
- **航线高亮联动** — 点击卡片时地图上对应航线高亮闪烁

### 📋 行程列表
- **全部航班管理** — 添加 / 编辑 / 删除 / 多选批量操作
- **智能添加** — 输入航班号自动填充出发地、目的地、时间、航站楼
- **联程管理** — 多选航班一键联程绑定，支持解绑
- **状态筛选** — 即将出行 / 已完成 / 全部
- **分享卡片** — 生成航班信息图片（html2canvas）

### 🗺️ 行程地图
- **全航线可视化** — 大圆弧线 + 机场圆点 + 飞行动画
- **年份/状态筛选** — 按年份和完成状态筛选航线
- **热力图模式** — 切换显示机场访问频率热力图（基于 Leaflet.heat）
- **全屏模式** — 沉浸式全屏地图浏览
- **反子午线处理** — 跨太平洋航线完美渲染（坐标平移 + 镜像标记）

### 📅 日历视图
- **月度航班概览** — 有航班的日期高亮标记
- **日期详情** — 点击日期查看当天所有航班

### ⚙️ 设置
- **API 密钥管理** — 支持 AviationStack / AirLabs / AeroDataBox
- **主题切换** — 深色 / 浅色模式
- **语言切换** — 五种语言即时切换
- **缓存管理** — 查看本地时刻表缓存统计

### 📊 统计面板
- 总航班数 / 总里程 / 总飞行时长 / 机场数 / 国家数
- 最常飞航线 Top 5 / 最常用航司 Top 5
- 座位偏好分析（靠窗/过道/中间）
- 舱位分布、月度分布、星期分布
- 最早/最晚出发航班、最长/最短航线
- 按年份筛选统计

---

## 🏗️ 技术架构

```
┌─────────────────────────────────────────────────────────┐
│                    用户浏览器 / PWA                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │ Leaflet  │  │ arc.js   │  │html2canvas│  │Leaflet   │ │
│  │ 地图引擎  │  │ 大圆弧线  │  │ 截图分享   │  │ heat     │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │
│  ┌───────────────────┐  ┌────────────────────────────┐   │
│  │ app.js (2600+ 行)  │  │ i18n.js (1280+ 行, 5语言)  │   │
│  │ 全部前端交互逻辑     │  │ 多语言翻译系统              │   │
│  └───────────────────┘  └────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────┐    │
│  │ Service Worker (离线缓存 / 瓦片缓存 / API缓存)     │    │
│  └──────────────────────────────────────────────────┘    │
└──────────────────────────┬──────────────────────────────┘
                           │ HTTP API
┌──────────────────────────▼──────────────────────────────┐
│                 Flask 后端 (app.py)                       │
│  ┌───────────┐ ┌────────────┐ ┌───────────────────────┐  │
│  │ 航班 CRUD  │ │ 智能查询    │ │ 航站楼自动补全         │  │
│  │ 联程管理   │ │ 3级 fallback│ │ 60+ 机场映射          │  │
│  └───────────┘ └────────────┘ └───────────────────────┘  │
│  ┌───────────┐ ┌────────────┐ ┌───────────────────────┐  │
│  │ 统计分析   │ │ Logo 代理   │ │ 天气查询              │  │
│  │ 趣味数据   │ │ 缓存本地    │ │ Open-Meteo            │  │
│  └───────────┘ └────────────┘ └───────────────────────┘  │
└──────────────────────────┬──────────────────────────────┘
                           │ JSON 文件
┌──────────────────────────▼──────────────────────────────┐
│                    data/ 数据层                           │
│  flights.json  airports.json  airlines.json              │
│  flight_schedules.json  settings.json                    │
└─────────────────────────────────────────────────────────┘
```

### 技术栈

| 层 | 技术 | 说明 |
|---|------|------|
| **后端** | Python 3.8+ / Flask | RESTful API，当前默认 JSON 存储；已引入 SQLAlchemy 基础层 |
| **前端** | Vanilla JS + CSS | 无框架依赖，单页应用（SPA）|
| **地图** | Leaflet.js 1.9 | 本地化部署，CartoDB 暗色/亮色底图 |
| **弧线** | arc.js | 大圆航线计算与渲染 |
| **热力图** | Leaflet.heat | Canvas 热力图渲染 |
| **截图** | html2canvas | 航班卡片截图分享 |
| **数据源** | AviationStack / AirLabs / AeroDataBox | 三 API 多级 fallback |
| **机场库** | OurAirports | 3251 机场，5 语言翻译 |
| **PWA** | Service Worker + manifest.json | 可安装、离线缓存 |

---

## 🚀 快速开始

### 环境要求

- Python 3.8+
- pip

### 1. 克隆仓库

```bash
git clone https://github.com/YOUR_USERNAME/FootPrint.git
cd FootPrint
```

### 2. 安装依赖

```bash
pip install -r requirements.txt
```

> 当前依赖见 `requirements.txt`：`flask`、`sqlalchemy`。

### 3. 启动应用

```bash
python app.py
```

### 4. 访问应用

打开浏览器访问 **http://localhost:5000**

首次使用时：
1. 点击右下角 **+** 按钮添加航班
2. 输入航班号（如 `CZ3101`），系统会自动查询并填充信息
3. 如需启用在线查询，进入 **设置** 页配置 API 密钥

---

## 📁 项目结构

```
SkyTrace/
├── app.py                    # Flask 后端主程序 (1260 行)
│                             #   - RESTful API (航班CRUD/查询/统计/设置)
│                             #   - 三API智能查询 + 本地缓存 fallback
│                             #   - 航站楼自动补全 (60+机场映射)
│                             #   - Logo 代理缓存 / 天气查询 / 诊断页面
│
├── storage.py                # SQLAlchemy 数据层（多用户基础能力）
├── time_utils.py             # 时区推断 / 飞行时间线计算工具
│
├── flight_monitor.py         # 航班监控脚本 (独立部署)
│                             #   - 定时检查航班状态变化
│                             #   - 延误/取消/登机口变更告警
│                             #   - Bark 推送 / Webhook 通知
│                             #   - 交互式配置向导 (--setup)
│
├── import_ourairports.py     # OurAirports CSV → airports.json 导入脚本
│                             #   - 解析 airports.csv + countries.csv + regions.csv
│                             #   - 生成 5 语言 (zh/en/ja/ko/es) 机场数据
│
├── requirements.txt          # Python 依赖 (flask + sqlalchemy)
├── .gitignore
│
├── data/                     # 数据文件 (JSON)
│   ├── flights.json          # 用户航班数据
│   ├── airports.json         # 机场数据库 (3251 机场, 5语言)
│   ├── airlines.json         # 航空公司数据 (228 航司)
│   ├── flight_schedules.json # 本地航班时刻缓存
│   └── settings.json         # 用户设置 (API密钥等, .gitignore)
│
├── resources/                # 原始数据文件
│   ├── airports.csv          # OurAirports 原始数据
│   ├── countries.csv
│   ├── regions.csv
│   └── ...
│
├── static/
│   ├── css/
│   │   └── style.css         # 全局样式 (5200+ 行)
│   │                         #   - 深色/浅色主题 / 响应式布局
│   │                         #   - 移动端底部导航 / 毛玻璃效果
│   │                         #   - 航班卡片 / 地图控件 / 动画
│   ├── js/
│   │   ├── app.js            # 前端主逻辑 (2650+ 行)
│   │   │                     #   - 双地图 / 弧线渲染 / 热力图
│   │   │                     #   - 行程管理 / 联程 / 统计
│   │   │                     #   - 拖拽覆盖层 / 轮播 / 分享
│   │   ├── i18n.js           # 多语言翻译 (1280+ 行, 5语言)
│   │   └── static-mode.js    # GitHub Pages / 纯静态模式 API 适配
│   ├── lib/                  # 第三方库 (本地化, 无 CDN)
│   │   ├── leaflet.js        # Leaflet 地图引擎
│   │   ├── leaflet.css
│   │   ├── leaflet-heat.js   # 热力图插件
│   │   ├── arc.js            # 大圆弧线计算
│   │   └── html2canvas.min.js# 截图
│   ├── icons/
│   │   ├── icon-192.png      # PWA 图标
│   │   └── icon-512.png
│   ├── img/airlines/         # 航司 Logo (本地缓存)
│   ├── manifest.json         # PWA 清单
├── index.html                # Web / PWA 统一入口页
└── sw.js                     # Service Worker (离线缓存)
```

---

## 📋 功能详解

### 航班智能查询

添加航班时，输入航班号即触发三级智能查询：

```
输入 CZ3101
  ↓
Level 1: 在线 API 查询 (AeroDataBox → AirLabs → AviationStack)
  ↓ (失败或未配置)
Level 2: 本地时刻表缓存 (flight_schedules.json)
  ↓ (未缓存)
Level 3: 用户历史航班匹配
  ↓
自动填充: 出发地、目的地、时间、机型、航站楼
```

### 航站楼自动补全

内置 60+ 机场的航司 → 航站楼映射数据，覆盖中国大陆、东亚、东南亚、欧洲、北美、澳洲主要机场。当 API 或用户未提供航站楼信息时自动补全。

### 反子午线渲染

跨太平洋航线（如 NRT→LAX）的渲染是地图可视化的经典难题。SkyTrace 使用：
1. **坐标平移法** — 将 arc.js 分段的经度 ±360° 使其连续
2. **双副本渲染** — 跨 ±180° 的弧线同时在两个世界副本中绘制
3. **镜像标记** — 机场圆点在 lon±360 处创建镜像，确保跨世界副本平移时始终可见

### 联程航班

支持将多段航班绑定为联程：
- 多选模式下选择航班 → 一键联程
- 联程航班在列表中以组显示（蓝色连接线）
- 支持跨日联程（如 红眼航班 + 次日接驳）
- 支持部分解绑和整组解绑

---

## 📡 API 文档

### 航班管理

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/flights` | 获取所有航班（含增强字段：距离、状态、机场信息）|
| `POST` | `/api/flights` | 添加航班 |
| `PUT` | `/api/flights/<id>` | 更新航班 |
| `DELETE` | `/api/flights/<id>` | 删除航班 |
| `POST` | `/api/flights/connect` | 联程绑定 |
| `POST` | `/api/flights/disconnect` | 解除联程 |

### 查询与状态

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/flight/lookup?flight_no=CZ3101&date=2026-03-01` | 智能航班查询 |
| `GET` | `/api/flight/status?flight_no=CZ3101` | 实时航班状态 |

### 数据与设置

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/airports` | 完整机场数据库 |
| `GET` | `/api/airports/search?q=tokyo` | 机场搜索 |
| `GET` | `/api/airlines` | 航空公司数据 |
| `GET` | `/api/stats?year=2025` | 统计数据（支持年份筛选）|
| `GET` | `/api/weather?lat=35.5&lon=139.7` | 目的地天气 |
| `GET/POST` | `/api/settings` | 获取/保存设置 |
| `POST` | `/api/settings/test` | 测试 API 连接 |
| `GET` | `/api/version` | 当前版本号 |
| `GET` | `/api/cache/stats` | 本地缓存统计 |

### 其他

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/debug` | 内联诊断页面（测试所有资源加载和API连接）|
| `GET` | `/api/logo-proxy?url=...` | 航司 Logo 代理缓存 |

---

## 🔔 航班监控与推送

`flight_monitor.py` 是一个独立的航班监控脚本，可部署在服务器或本地定时运行。

### 功能
- 自动检查未来 48 小时内的航班状态
- 检测：延误、取消、备降、登机口/航站楼变更
- 推送通道：**Bark** (iOS) / **Webhook** (Slack/Discord/企业微信)
- 状态持久化，避免重复告警

### 使用

```bash
# 首次配置 (交互式)
python flight_monitor.py --setup

# 手动运行一次
python flight_monitor.py

# 发送测试推送
python flight_monitor.py --test
```

### 定时执行 (Linux Cron)

```bash
crontab -e
# 每 15 分钟检查一次
*/15 * * * * /usr/bin/python3 /path/to/flight_monitor.py >> /var/log/skytrace-monitor.log 2>&1
```

### 推送效果

| 事件 | 推送标题 | 推送内容 |
|------|---------|---------|
| 延误 | ⏰ 航班延误 CZ3101 | 2026-03-01 CAN-PEK 延误约 45 分钟 |
| 取消 | ⚠️ 航班取消 MU5101 | 2026-03-01 PVG-PEK 航班已取消！请及时改签 |
| 登机口变更 | 🚪 登机口变更 CA1501 | 2026-03-01 PEK-SHA 登机口: A12 → B08 |
| 航站楼变更 | 🏢 航站楼变更 HU7001 | 2026-03-01 PEK-CAN 出发航站楼: T1 → T2 |

---

## 🌐 部署指南

### 方案 A: 本地运行 (开发/个人使用)

```bash
python app.py
# 访问 http://localhost:5000
```

### 方案 B: 云服务器部署 (推荐)

**推荐平台**: Oracle Cloud 永久免费层 / DigitalOcean (学生 $200 额度)

```bash
# 1. SSH 连接服务器
ssh user@your-server

# 2. 安装 Python + 克隆仓库
sudo apt update && sudo apt install python3 python3-pip git -y
git clone https://github.com/YOUR_USERNAME/FootPrint.git
cd FootPrint
pip3 install -r requirements.txt

# 3. 使用 Gunicorn 生产部署
pip3 install gunicorn
gunicorn -w 2 -b 0.0.0.0:5000 app:app --daemon

# 4. (可选) 使用 Nginx 反向代理 + HTTPS
sudo apt install nginx certbot python3-certbot-nginx -y
```

**Nginx 配置示例** (`/etc/nginx/sites-enabled/skytrace`):

```nginx
server {
    server_name your-domain.com;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```bash
# 申请 HTTPS 证书
sudo certbot --nginx -d your-domain.com
```

### 方案 C: Systemd 守护进程

创建 `/etc/systemd/system/skytrace.service`:

```ini
[Unit]
Description=SkyTrace Flight Manager
After=network.target

[Service]
User=www-data
WorkingDirectory=/opt/FootPrint
ExecStart=/usr/bin/python3 /opt/FootPrint/app.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now skytrace
sudo systemctl status skytrace
```

---

## 📱 PWA 安装指南

SkyTrace 支持作为 PWA (Progressive Web App) 安装到手机桌面。

### iOS (Safari)
1. 用 **Safari** 打开 SkyTrace 网址
2. 点击底部 **分享按钮** (方框+箭头图标)
3. 选择 **「添加到主屏幕」**
4. 确认名称，点击 **「添加」**

### Android (Chrome)
1. 用 **Chrome** 打开 SkyTrace 网址
2. 点击地址栏右侧 **安装图标** (或菜单 → 「安装应用」)
3. 确认安装

### 桌面端 (Chrome/Edge)
1. 打开 SkyTrace 网址
2. 地址栏右侧出现 **安装图标**
3. 点击安装

> ⚠️ PWA 要求 HTTPS。本地开发时使用 `localhost` 可豁免。

### Service Worker 缓存策略

| 资源类型 | 策略 | 说明 |
|---------|------|------|
| 静态资源 (JS/CSS) | Stale-while-revalidate | 先返回缓存，后台更新 |
| API 响应 | Network-first | 优先网络，失败用缓存 |
| 地图瓦片 | Cache-first | 优先缓存，大幅提升地图加载速度 |
| HTML 页面 | Network-first | 确保获取最新版本 |

---

## 📝 开发日志

### 2026-04（近期）
- 🧱 新增 `storage.py`：SQLAlchemy 模型、用户/设置/航班存储基础能力。
- 🔐 前端加入认证门禁 UI（初始化管理员 / 登录 / 管理用户），并保留后端不可用时的降级路径。
- 🕒 新增 `time_utils.py`：机场时区推断与 UTC 时间线计算工具。
- 🧪 增加多用户基础与回归测试，持续推进从纯 JSON 向多用户架构演进。

### 2026-02（稳定功能）
- 🌡️ 行程地图热力图模式与可视化修复。
- 🔵 反子午线航线/机场标记渲染优化。
- 🔗 联程航班连接/断开与跨日展示优化。
- 🌐 多语言与首页/地图交互体验修复。

---

## 📄 许可证

[MIT License](LICENSE)

---

<div align="center">

**✈️ SkyTrace** — *Trace every flight, map your sky.*

</div>
