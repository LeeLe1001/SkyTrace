# ✈️ SkyTrace - 个人航旅管理系统

> 记录你的每一次飞行，绘制属于自己的天空轨迹

![Python](https://img.shields.io/badge/Python-3.8+-blue.svg)
![Flask](https://img.shields.io/badge/Backend-Flask-green.svg)
![Leaflet](https://img.shields.io/badge/Map-Leaflet-orange.svg)

## 📖 项目简介

**SkyTrace** 是一个个人航班行程管理系统，灵感来源于航旅纵横。它可以帮助你：

- 📝 添加和管理航班行程
- 🗺️ 在世界地图上用优雅的弧线展示飞行轨迹
- 📊 统计飞行里程、航班数量等数据
- ⏰ 查看值机/登机等关键时间节点
- 📱 响应式设计，支持移动端访问

## 🚀 快速开始

### 1. 安装依赖

```bash
pip install -r requirements.txt
```

### 2. 运行应用

```bash
python app.py
```

### 3. 访问应用

打开浏览器访问 `http://localhost:5000`

## 📁 项目结构

```
SkyTrace/
├── app.py                   # Flask 后端主程序
├── import_ourairports.py    # OurAirports CSV → airports.json 导入脚本
├── requirements.txt         # 依赖列表
├── data/
│   ├── flights.json         # 航班数据
│   ├── airports.json        # 机场数据库 (3251 机场, 5语言)
│   ├── airlines.json        # 航空公司数据
│   ├── flight_schedules.json# 本地航班时刻缓存
│   └── settings.json        # API密钥等设置
├── resources/               # 原始数据文件 (OurAirports CSV 等)
│   ├── airports.csv
│   ├── countries.csv
│   ├── regions.csv
│   └── ...
├── static/
│   ├── css/
│   │   └── style.css        # 样式文件
│   └── js/
│       ├── app.js           # 前端主逻辑
│       └── i18n.js          # 多语言系统 (zh/en/ja/ko/es)
└── templates/
    └── index.html           # 主页面
```

## ✨ 功能特性

- **行程管理**：添加、编辑、删除航班记录
- **弧线轨迹**：地图上用大圆航线展示飞行路径
- **数据统计**：总里程、航班数、飞行时长统计
- **时间提醒**：值机开放时间、登机时间等关键节点
- **历史记录**：按时间查看所有历史航班

## 📄 许可证

MIT License
