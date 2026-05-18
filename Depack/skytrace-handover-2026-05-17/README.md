# SkyTrace - Personal Flight Manager

> *Record every takeoff. Trace your sky.*
>
> Record every flight, draw your sky footprint on a beautiful dark world map.

![Python](https://img.shields.io/badge/Python-3.12-3776ab?logo=python&logoColor=white)
![Flask](https://img.shields.io/badge/Flask-3.0-000000?logo=flask)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14-4169e1?logo=postgresql&logoColor=white)
![Azure](https://img.shields.io/badge/Azure-Deployed-0078d4?logo=microsoft-azure&logoColor=white)
![Leaflet](https://img.shields.io/badge/Leaflet-1.9-199900?logo=leaflet)
![PWA](https://img.shields.io/badge/PWA-Installable-5a0fc8?logo=pwa)
![i18n](https://img.shields.io/badge/i18n-5_Languages-f59e0b)

---

## Quick Links

- **Live site**: https://skytrace-bsg9brdffgfee8cu.japaneast-01.azurewebsites.net/
- **Health check**: https://skytrace-bsg9brdffgfee8cu.japaneast-01.azurewebsites.net/api/health

---

## Project Overview

**SkyTrace** is a multi-user flight log management system. It visualizes your flight history as great-circle arcs on a Leaflet.js map, provides rich statistics, and supports real-time flight status lookups via third-party APIs.

### Highlights

| Feature | Description |
|---------|-------------|
| Multi-user accounts | Login, admin panel, per-user flight isolation |
| Encrypted API keys | AviationStack / AirLabs / AeroDataBox keys encrypted at rest |
| GitHub backup | Per-user optional backup to GitHub (encrypted credentials) |
| Smart flight lookup | 3-level fallback: API -> schedule cache -> history |
| Terminal auto-complete | 60+ airports x airline terminal database built-in |
| 5-language i18n | zh-CN / en / ja / ko / es |
| PWA support | Install to mobile home screen, service worker caching |
| Multi-leg flights | Connect flights into journey groups |
| Statistics dashboard | Distance, hours, seat preference, cabin distribution, weekly heatmap |
| Heatmap | Airport visit frequency heatmap |
| Annual report export | Generate share card images (html2canvas) |
| Azure deployed | App Service + PostgreSQL + Key Vault + CI/CD |

---

## Architecture

```
Browser / PWA
    |
    v
Flask (app.py) on Azure App Service (gunicorn, Python 3.12)
    |-- PostgreSQL Flexible Server (multi-user data)
    |-- Key Vault (encrypted secrets)
    |-- Application Insights (logs & metrics)
    |
    v
GitHub Actions (auto-deploy on push)

Data:    flights, users, settings -> PostgreSQL
Static:  airports.json, airlines.json -> local files (CDN-ready)
Backup:  user-backups/<username>.json -> GitHub (optional)
```

### Tech Stack

| Layer | Technology |
|-------|------------|
| Backend | Python 3.12, Flask, gunicorn |
| Database | PostgreSQL 14 (prod) / SQLite (dev) |
| ORM | SQLAlchemy 2.0 |
| Encryption | Fernet (cryptography library) |
| Frontend | Vanilla JS + CSS, no framework |
| Maps | Leaflet.js 1.9 + arc.js + Leaflet.heat |
| Screenshots | html2canvas |
| APIs | AviationStack, AirLabs, AeroDataBox, Open-Meteo |
| Deployment | Azure App Service + GitHub Actions CI/CD |
| Secrets | Azure Key Vault with RBAC + Managed Identity |

---

## Quick Start (Local)

```bash
git clone https://github.com/LeeLe1001/SkyTrace.git
cd SkyTrace
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Open http://localhost:5000 - on first run, create an admin account. Your local `data/flights.json` will be auto-imported.

---

## Project Structure

```
SkyTrace/
  app.py                      Flask backend (routes, auth, API queries)
  storage.py                  SQLAlchemy models + CRUD operations
  security_utils.py           Fernet encryption/decryption
  time_utils.py               Airport timezone inference + duration calculation
  flight_monitor.py           Optional flight status monitor (Bark notifications)

  requirements.txt            Python dependencies
  .env.example                Environment variable template

  data/
    airports.json             3,251 airports (5-language)
    airlines.json              228 airlines
    flights.json               Legacy JSON fallback (auto-imported on setup)
    flight_schedules.json      Local schedule cache
    airport_timezones.json     Airport timezone map

  static/
    css/style.css              Global styles (dark/light themes)
    js/app.js                  Frontend application logic
    js/i18n.js                 5-language translation system
    js/time-utils.js           Frontend timezone utilities
    js/static-mode.js          GitHub Pages fallback mode
    lib/                       Third-party: Leaflet, arc.js, heat, html2canvas
    img/airlines/              Cached airline logos

  tests/
    test_multi_user_foundation.py   Auth + user isolation tests
    test_phase_two_regressions.py   API key encryption + backup tests
    test_cleanup_regressions.py     Data integrity + version tests

  index.html                  Single-page app entry
  sw.js                       Service Worker (PWA)
```

---

## User Flow

1. **Open site** -> Create admin account (one-time setup)
2. **Login** -> Your historical flights are auto-loaded from database
3. **Home** -> Map shows upcoming flights as blue arcs, overlay shows nearest trip
4. **Flights** -> List view with add/edit/delete, multi-select for batch connect/delete
5. **Map** -> Full-screen world map with year/status filters, heatmap toggle
6. **Stats** -> Annual statistics, seat preference, cabin distribution, monthly calendar
7. **Settings** -> API keys (encrypted), GitHub backup, language, theme, user management

---

## API Keys Setup

SkyTrace supports 3 flight data APIs:

| API | Free Tier | Signup Link |
|-----|-----------|-------------|
| AviationStack | 500 req/month | aviationstack.com |
| AirLabs | 1,000 req/month | airlabs.co |
| AeroDataBox | Limited (RapidAPI) | rapidapi.com |

Enter keys in Settings -> they are encrypted and stored per-user on the server.

---

## Current Status (2026-04)

- **Deployed** to Azure App Service with PostgreSQL
- **Multi-user** accounts with admin panel fully working
- **All 16 regression tests** passing
- **GitHub backup** with encrypted credentials works per-user
- **Legacy JSON mode** still supported for development / static hosting

For detailed technical documentation, see [HANDOVER.md](HANDOVER.md).
