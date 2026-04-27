# SkyTrace Handover

## Current State

- Workspace: `D:\Files\Coding\FootPrint`
- Active branch: `codex/multi-user-foundation`
- **Last updated: 2026-04-27**
- All 16 regression tests pass.
- **Status: Deployed to Azure** (App Service + PostgreSQL + Key Vault + GitHub Actions CI/CD)

---

## Architecture Overview

```
Browser/PWA  -->  Azure App Service (Flask + gunicorn)
                      |-- PostgreSQL Flexible Server (production database)
                      |-- Key Vault (encrypted secrets)
                      |-- Application Insights (monitoring)
                      |-- Storage Account (optional backups)

GitHub  -->  GitHub Actions  -->  Auto-deploy to Azure on push
```

### Infrastructure (Azure)

| Resource | Name | Purpose |
|----------|------|---------|
| Web App | skytrace | Flask app, Python 3.12, Linux |
| PostgreSQL | skytrace-server | Multi-user database, VNet integration |
| Key Vault | kv-skytrace-prod-wlll | Encrypted secrets (4 keys) |
| App Insights | ai-skytrace-prod | Performance & error monitoring |
| Storage Account | (created) | Future backup / static assets |

### Environment Variables (via Key Vault)

| Secret | Purpose |
|--------|---------|
| SKYTRACE-SECRET-KEY | Flask session signing |
| SKYTRACE-ENCRYPTION-KEY | Database field encryption (Fernet) |
| SKYTRACE-DATABASE-URL | PostgreSQL connection string |
| SKYTRACE-SECURE-COOKIES | Force HTTPS cookies (set to 1) |

---

## What Is Working (Complete Feature Map)

### Phase 1: Accounts + User-Isolated Flights

- [x] Admin bootstrap flow (`POST /api/setup`)
- [x] Login/logout with Flask sessions (`POST /api/auth/login`, `POST /api/auth/logout`)
- [x] Auth state polling (`GET /api/auth/state`)
- [x] Admin can create users via settings panel (`POST /api/admin/users`)
- [x] Admin can delete users and all their data (`DELETE /api/admin/users/<id>`)
- [x] Admin can reset any user's password (`PUT /api/admin/users/<id>/password`)
- [x] Users can change their own password (`PUT /api/auth/password`)
- [x] Flights are fully isolated by `user_id`
- [x] Legacy JSON data auto-imported into first admin account
- [x] In-memory rate limiting on login (10 attempts / 5 min / IP)

Key files:
- [app.py](D:/Files/Coding/FootPrint/app.py)
- [storage.py](D:/Files/Coding/FootPrint/storage.py)
- [tests/test_multi_user_foundation.py](D:/Files/Coding/FootPrint/tests/test_multi_user_foundation.py)

### Phase 2: Per-User Settings + Encrypted API Keys

- [x] User settings stored per-user in `user_settings` table
- [x] API keys encrypted at rest with Fernet (via `security_utils.py`)
- [x] `/api/settings` returns masked values to frontend
- [x] Timezone-aware flight duration calculation (real airport timezones vs naive UTC)
- [x] Flight status countdown (checkin/boarding/in-flight) with timezone correctness

Key files:
- [storage.py](D:/Files/Coding/FootPrint/storage.py)
- [security_utils.py](D:/Files/Coding/FootPrint/security_utils.py)
- [time_utils.py](D:/Files/Coding/FootPrint/time_utils.py)
- [tests/test_phase_two_regressions.py](D:/Files/Coding/FootPrint/tests/test_phase_two_regressions.py)

### Phase 3: Automatic Cloud Save + GitHub Backup

- [x] All flight CRUD writes directly to PostgreSQL in multi-user mode
- [x] Login auto-loads each user's own flights and settings
- [x] GitHub shifted from "sync database" to "per-user backup target"
- [x] Server-side backup endpoints: test / push / pull (`POST /api/backup/github/*`)
- [x] Backup credentials (token + repo) stored encrypted server-side
- [x] Frontend shows "backup" copy in multi-user mode, "sync" in legacy mode
- [x] Per-user backup files: `data/user-backups/<username>.json`
- [x] Legacy/static mode compatibility preserved

Key files:
- [app.py](D:/Files/Coding/FootPrint/app.py)
- [storage.py](D:/Files/Coding/FootPrint/storage.py)
- [static/js/app.js](D:/Files/Coding/FootPrint/static/js/app.js)
- [tests/test_phase_two_regressions.py](D:/Files/Coding/FootPrint/tests/test_phase_two_regressions.py)

---

## Complete API Reference

### Authentication

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /api/auth/state | - | Get current auth state |
| POST | /api/setup | - | Bootstrap first admin (one-time) |
| POST | /api/auth/login | - | Login (rate-limited) |
| POST | /api/auth/logout | login | Logout |
| PUT | /api/auth/password | login | Change own password |

### Admin

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /api/admin/users | admin | List all users |
| POST | /api/admin/users | admin | Create new user |
| DELETE | /api/admin/users/<id> | admin | Delete user + all data |
| PUT | /api/admin/users/<id>/password | admin | Reset user password |

### Flights

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /api/flights | login | List own flights |
| POST | /api/flights | login | Add flight |
| PUT | /api/flights/<id> | login | Update flight |
| DELETE | /api/flights/<id> | login | Delete flight |
| POST | /api/flights/connect | login | Connect flights as multi-leg |
| POST | /api/flights/disconnect | login | Disconnect multi-leg flights |

### Flight Lookup & Status

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /api/flight/lookup | login | Smart lookup (API -> cache -> history) |
| GET | /api/flight/status | login | Live flight status (requires API key) |

### Settings

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /api/settings | login | Get settings (keys masked) |
| POST | /api/settings | login | Save settings |
| POST | /api/settings/test | login | Test API key connection |

### Statistics & Data

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /api/stats | login | Flight statistics (year filter) |
| GET | /api/airports | - | Airport database (timezone-aware) |
| GET | /api/airports/search | - | Search airports |
| GET | /api/airlines | - | Airline database |
| GET | /api/cache/stats | login | Schedule cache statistics |

### GitHub Backup

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | /api/backup/github/test | login | Test backup connection |
| POST | /api/backup/github/push | login | Push backup to GitHub |
| POST | /api/backup/github/pull | login | Pull & restore from GitHub |

### System

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | /api/health | - | Health check (DB, version, mode) |
| GET | /api/version | - | App version number |
| GET | /api/weather | - | Destination weather (Open-Meteo) |
| GET | /api/logo-proxy | - | Airline logo proxy & cache |

---

## Database Schema

### users
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | Auto-increment |
| username | VARCHAR(64) | Unique, indexed |
| password_hash | VARCHAR(255) | Werkzeug hash |
| display_name | VARCHAR(120) | Defaults to username |
| is_admin | BOOLEAN | Admin flag |
| created_at | DATETIME | UTC |
| updated_at | DATETIME | UTC, auto-updated |

### flights
| Column | Type | Notes |
|--------|------|-------|
| id | VARCHAR(36) PK | UUID |
| user_id | INTEGER FK | Indexed |
| flight_no | VARCHAR(32) | |
| airline | VARCHAR(255) | |
| departure | VARCHAR(16) | IATA code |
| arrival | VARCHAR(16) | IATA code |
| date | VARCHAR(16) | YYYY-MM-DD |
| dep_time | VARCHAR(16) | HH:MM |
| arr_time | VARCHAR(16) | HH:MM |
| dep_terminal | VARCHAR(32) | |
| arr_terminal | VARCHAR(32) | |
| dep_gate | VARCHAR(32) | |
| arr_gate | VARCHAR(32) | |
| aircraft | VARCHAR(120) | |
| seat | VARCHAR(32) | |
| cabin_class | VARCHAR(32) | economy/business/first |
| notes | TEXT | |
| stopover | VARCHAR(16) | IATA code |
| arr_day_offset | INTEGER | 0/1/2/-1 |
| status | VARCHAR(32) | scheduled/completed |
| connected_group | VARCHAR(64) | Multi-leg group ID |
| created_at | DATETIME | UTC |
| updated_at | DATETIME | UTC, auto-updated |

### user_settings
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | Auto-increment |
| user_id | INTEGER FK | Unique, indexed |
| aviationstack_key | TEXT | Encrypted at rest |
| airlabs_key | TEXT | Encrypted at rest |
| aerodata_key | TEXT | Encrypted at rest |
| github_backup_token | TEXT | Encrypted at rest |
| github_backup_repo | STRING | Plain text |
| preferred_api | VARCHAR(32) | auto/aviationstack/airlabs/aerodata |
| auto_cache | BOOLEAN | |

---

## Security Summary

| Feature | Implementation |
|---------|---------------|
| Password hashing | Werkzeug `generate_password_hash` (pbkdf2:sha256) |
| API key encryption | Fernet (symmetric, via `cryptography`) |
| Backup token encryption | Fernet (same key) |
| Session cookies | HttpOnly + SameSite=Lax + Secure (env-controlled) |
| Login rate limiting | In-memory: 10 attempts / 5 min / IP |
| Secrets management | Azure Key Vault with RBAC |
| Managed identity | Web App -> Key Vault (Key Vault Secrets User) |
| Database access | VNet integration, TLS enforced |
| HTTPS | Enforced via Azure App Service |

---

## Deployment

### How to deploy

1. Push to `codex/multi-user-foundation` branch
2. GitHub Actions auto-deploys to Azure App Service
3. Health check: `GET /api/health`

### Local development

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python app.py
# Opens at http://localhost:5000
```

### Environment setup

Copy `.env.example` to configure:
- `SKYTRACE_DATABASE_URL` (PostgreSQL for prod, empty for SQLite dev)
- `SKYTRACE_SECRET_KEY` (Flask sessions)
- `SKYTRACE_ENCRYPTION_KEY` (Fernet key for DB field encryption)
- `SKYTRACE_SECURE_COOKIES` (1 for HTTPS, 0 for local dev)

---

## Test Suite

3 test files, 16 tests, all passing:

- `tests/test_cleanup_regressions.py` (5 tests) - Data integrity, version consistency, i18n
- `tests/test_multi_user_foundation.py` (4 tests) - Auth flows, user isolation, flight connect
- `tests/test_phase_two_regressions.py` (7 tests) - API encryption, backup push/pull, timezone duration

Run: `python -m unittest discover -s tests -p "test_*.py" -v`

---

## Key Files Map

| File | Lines | Purpose |
|------|-------|---------|
| app.py | ~1950 | Flask backend: routes, auth, API queries, backup |
| storage.py | ~530 | SQLAlchemy models, CRUD, encryption helpers |
| security_utils.py | ~80 | Fernet encryption/decryption |
| time_utils.py | ~180 | Airport timezone inference, UTC calculations |
| static/js/app.js | ~3700 | Frontend: maps, flights, auth, settings, charts |
| static/js/i18n.js | ~1600 | 5-language translations (zh/en/ja/ko/es) |
| static/css/style.css | ~5200 | Dark/light themes, responsive layout |
| index.html | ~750 | Single-page app entry point |
| requirements.txt | 6 deps | flask, sqlalchemy, cryptography, timezonefinder, psycopg2-binary, gunicorn, tzdata |

---

## Recent Changes (2026-04-27)

### Admin User Management
- Added `DELETE /api/admin/users/<id>` - delete user
- Added `PUT /api/admin/users/<id>/password` - admin reset password
- Added `PUT /api/auth/password` - change own password
- Frontend: delete + reset buttons in admin panel, password change in settings

### Flight Connect/Disconnect Fix
- Added `@login_required` to connect/disconnect routes
- Multi-user mode now uses `connect_user_flights()` / `disconnect_user_flights()` (database)
- Previously only worked with JSON files

### Cloud Deployment
- Deployed to Azure App Service (Linux, Python 3.12)
- PostgreSQL Flexible Server with VNet integration
- Key Vault with 4 secrets, RBAC + Managed Identity
- Application Insights monitoring
- GitHub Actions CI/CD auto-deploy
- `.env.example` created
- `/api/health` endpoint
- `PORT` env var support
- `SESSION_COOKIE_SECURE` flag
- Login rate limiting

### Fixes
- `tzdata` added to requirements.txt for Windows zoneinfo support
- `psycopg2-binary` and `gunicorn` added for Azure deployment
- Version numbers synced (v48 -> v49)
- Health check `select` import fixed
- Service Worker upgraded to v49-r2 (network-first strategy)

### Test Results
```
Ran 16 tests in ~3.5s -- OK
```
