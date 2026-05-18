# SkyTrace v2.0 — Flighty 化改造分析与方案

> 基于对 `skytrace-handover-2026-05-17.zip` 完整源码分析  
> 以及 `Flighty v2.9.2 (build 4267)` IPA 逆向工程提取的架构模式  
> 日期: 2026-05-17

---

## 📁 目录结构

```
SkyTrace_v2.0/
├── README.md                                       ← 本文件
└── analysis/
    ├── 01_SkyTrace_Current_Architecture.md         ← SkyTrace 当前架构深度分析
    ├── 02_Flighty_vs_SkyTrace_Comparison.md        ← Flighty vs SkyTrace 全面对比
    ├── 03_Flighytization_Roadmap.md                ← Flighty 化改造路线图 (含伪代码)
    ├── 04_Asset_Mapping_Flighy_to_SkyTrace.md      ← 资产复用对照表
    ├── 05_UI_Animation_Reuse_Guide.md              ← UI 与动画全盘复用详细指南
    └── 06_Direct_Implementation_Plan.md            ← 🆕 直接实施计划 (可执行代码)
```

## 📊 相关资源路径

| 资源 | 路径 |
|------|------|
| **SkyTrace 源码 (解压后)** | `/Users/leele/Documents/Flighty_Depack/skytrace-handover-2026-05-17/` |
| **Flighy IPA (解压后)** | `/Users/leele/Documents/Flighty_Depack/Flighty_unpacked/` |
| **Flighy 架构报告 (完整)** | `/Users/leele/Documents/Flighty_Depack/Flighty_arch_report.md` |
| **Flighy 可提取资源目录** | `/Users/leele/Documents/Flighty_Depack/extracted/` |

## 🎯 核心结论

### SkyTrace 当前架构
- **后端**: Flask 单体巨石 (~3000行 app.py)，路由/业务/数据访问混在一起
- **前端**: Vanilla JS 单文件 (~3500行 app.js)，40+ 全局变量，手动 DOM 操作
- **数据**: 3 个 SQLAlchemy 表，字段扁平存储，无关联建模
- **网络**: 字符串 URL 拼接调用外部 API
- **优势**: 5 语言 i18n, 60+ 航站楼映射, PWA, Azure 生产部署, 16 个回归测试

### Flighty 可借鉴的核心模式
1. **分层架构**: Coordinator(导航) → ViewModel(状态) → Service(业务) → Repository(数据) → API Client(网络)
2. **类型安全**: Request 对象模式 (每个 API 端点一个类型)
3. **丰富数据模型**: 42 个 CoreData Entity，关联建模而非字符串
4. **多层缓存**: SyncCache、CalendarSubmitterCache、LRUAnimationCache 等 8 种缓存
5. **Protobuf 序列化**: 虽然 Web 用 JSON，但 Schema 设计思想可复用

### 改造路线
```
Sprint 1: 后端分层 (routes/ → services/ → repositories/)
Sprint 2: 前端模块化 (Store + Component 模式)
Sprint 3: 数据模型增强 (6+ 关联表)
Sprint 4: 体验提升 (响应式更新、路由、实时推送)
```

### 关键原则
- ✅ **API 契约不变** — 所有现有端点保持兼容
- ✅ **渐进式改造** — 每个 Sprint 独立可上线
- ✅ **测试先行** — 16 个已有测试必须持续通过
- ✅ **保留优势** — i18n/航站楼映射/PWA 不动
- ✅ **借鉴不复制** — 学习模式，不复制移动端实现

---

## 🚀 快速开始

```bash
# 查看当前 SkyTrace 架构分析
open analysis/01_SkyTrace_Current_Architecture.md

# 查看 Flighty 对比分析
open analysis/02_Flighty_vs_SkyTrace_Comparison.md

# 查看改造路线图
open analysis/03_Flighytization_Roadmap.md

# 查看资产复用对照
open analysis/04_Asset_Mapping_Flighy_to_SkyTrace.md
```
