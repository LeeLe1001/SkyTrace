# SkyTrace Handover

## Current State

- Workspace: `D:\Files\Coding\FootPrint`
- Active branch: `codex/multi-user-foundation`
- **Last updated: 2026-04-27 — Cloud-readiness pass**
- All 16 regression tests pass.

## What Is Already Working

### Phase 1: Accounts + User-Isolated Flights

- Admin bootstrap flow is in place.
- Login/logout is in place.
- Admin can create users.
- Flights are isolated by `user_id`.
- Legacy JSON data is imported into the first admin account during setup.

Key files:
- [app.py](D:/Files/Coding/FootPrint/app.py)
- [storage.py](D:/Files/Coding/FootPrint/storage.py)
- [tests/test_multi_user_foundation.py](D:/Files/Coding/FootPrint/tests/test_multi_user_foundation.py)

### Phase 2: Per-User Settings + Encrypted API Keys

- User settings are stored in the database.
- API keys are encrypted at rest via [security_utils.py](D:/Files/Coding/FootPrint/security_utils.py).
- `/api/settings` returns masked values to the frontend.
- Manual cross-timezone duration now uses airport timezone data instead of naive local-time subtraction.

Key files:
- [storage.py](D:/Files/Coding/FootPrint/storage.py)
- [security_utils.py](D:/Files/Coding/FootPrint/security_utils.py)
- [time_utils.py](D:/Files/Coding/FootPrint/time_utils.py)
- [tests/test_phase_two_regressions.py](D:/Files/Coding/FootPrint/tests/test_phase_two_regressions.py)

### Phase 3: Automatic Cloud Save + Optional GitHub Backup

- Regular flight CRUD is already automatic in multi-user mode because writes go straight to the server database.
- Login already auto-loads each user’s own flights and settings.
- GitHub is now being shifted from “frontend sync database” to “optional per-user backup target”.

What changed in this pass:
- Added per-user encrypted backup credentials in [storage.py](D:/Files/Coding/FootPrint/storage.py):
  - `github_backup_token`
  - `github_backup_repo`
- Added lightweight schema migration for existing `user_settings` tables.
- Added backend backup endpoints in [app.py](D:/Files/Coding/FootPrint/app.py):
  - `POST /api/backup/github/test`
  - `POST /api/backup/github/push`
  - `POST /api/backup/github/pull`
- Added backup payload helpers in [app.py](D:/Files/Coding/FootPrint/app.py):
  - `_build_backup_payload()`
  - `_resolve_backup_credentials()`
  - `_github_api_request()`
  - `_get_current_backup_path()`
- Added server-side flight replacement helper in [storage.py](D:/Files/Coding/FootPrint/storage.py):
  - `replace_user_flights(user_id, payloads)`
- Updated [static/js/app.js](D:/Files/Coding/FootPrint/static/js/app.js):
  - multi-user mode no longer hides the GitHub section
  - settings modal loads masked backup token + repo from `/api/settings`
  - saving settings in multi-user mode persists backup token/repo through `/api/settings`
  - `testGithubSync()`, `syncToGithub()`, `syncFromGithub()` now call backend backup endpoints in multi-user mode
  - legacy/static mode still keeps the old localStorage + browser PAT fallback for compatibility

## Backup Behavior After This Pass

### Multi-User Mode

- Users can configure a GitHub backup repo and token per account.
- Tokens are stored encrypted on the server, not in the browser as the source of truth.
- Push writes a per-user backup file:
  - `data/user-backups/<username>.json`
- Pull replaces only that user’s flights and restores safe settings:
  - `preferred_api`
  - `auto_cache`

### Legacy / Static Compatibility

- Old browser-side GitHub sync logic still exists for non-multi-user environments.
- This preserves backward compatibility for static GitHub Pages style usage.

## Regression Coverage Added

File:
- [tests/test_phase_two_regressions.py](D:/Files/Coding/FootPrint/tests/test_phase_two_regressions.py)

Added coverage for:
- real airport timezone duration for manual `WEH -> ICN 11:00 -> 13:15`
- API key encryption + masking
- GitHub backup token encryption + masking
- multi-user server-side GitHub backup push
- multi-user server-side GitHub backup pull with flight replacement and safe settings restore

## Validation Run

Passed in this workspace:
- `python -m py_compile app.py storage.py security_utils.py time_utils.py`
- `python -m unittest tests.test_cleanup_regressions tests.test_multi_user_foundation tests.test_phase_two_regressions`

Note:
- I also attempted JS syntax validation through the available Node runtime path, but this environment still returns access denied for Node execution, so browser-script syntax was validated by targeted inspection plus backend regression tests instead.

## Remaining Work / Next Recommended Phase

The multi-user foundation is now in a much safer state, but it is not yet the final production SaaS shape.

Recommended next steps:

1. Move backup UI copy from “data sync” to explicit “GitHub backup”.
- In multi-user mode, data is already auto-saved to the server.
- GitHub should be framed as backup / restore, not the main sync transport.

2. Remove or heavily de-emphasize the legacy client-side PAT path when you no longer need static-mode support.
- Right now it is intentionally preserved for backward compatibility.

3. Add conflict metadata to backups.
- Example: last exported timestamp, backup source version, maybe a checksum.

4. Decide deployment target for the real multi-user build.
- GitHub Pages alone is no longer enough.
- You now need a Python server process plus the SQLite database file or a future PostgreSQL instance.

5. Future PostgreSQL migration remains straightforward if you keep using the SQLAlchemy/Alembic-style path.
- The current code is already much closer to that than the old JSON-only structure.

## Important Local Dirty Files

These were already dirty in the local workspace and were intentionally not cleaned up or reverted:

- [README.md](D:/Files/Coding/FootPrint/README.md)
- [static/css/style.css](D:/Files/Coding/FootPrint/static/css/style.css)
- [data/flight_schedules.json](D:/Files/Coding/FootPrint/data/flight_schedules.json)
- [sw.js](D:/Files/Coding/FootPrint/sw.js)

## Files Touched In This Multi-User Backup Pass

- [app.py](D:/Files/Coding/FootPrint/app.py)
- [storage.py](D:/Files/Coding/FootPrint/storage.py)
- [static/js/app.js](D:/Files/Coding/FootPrint/static/js/app.js)
- [tests/test_phase_two_regressions.py](D:/Files/Coding/FootPrint/tests/test_phase_two_regressions.py)
- [HANDOVER.md](D:/Files/Coding/FootPrint/HANDOVER.md)

---

## 2026-04-27: Cloud-Readiness Pass

### Fixes
- **Timezone regression**: `tzdata` added to requirements.txt (Python 3.12+ on Windows needs it for `zoneinfo`). All 3 failing tests now pass.
- **Version consistency**: `index.html` script/style references synced from v48 → v49 to match `APP_VERSION`.

### Security Hardening
- Added `SESSION_COOKIE_SECURE` flag (controlled by `SKYTRACE_SECURE_COOKIES` env var, defaults to on).
- Added in-memory rate limiting on `POST /api/auth/login` (10 attempts per IP per 5 minutes).
- Encrypted at rest: API keys, GitHub backup tokens (already done in previous pass via `security_utils.py`).

### Deployment Readiness
- Added `/api/health` endpoint (returns DB status, version, mode).
- `PORT` env var respected at startup for cloud platforms.
- Created `.env.example` with all configuration keys documented.
- `SKYTRACE_DATABASE_URL` supports PostgreSQL for production scale-out.

### Files Changed In This Pass
- `app.py` — security config, rate limiting, health endpoint, PORT support
- `index.html` — version number sync
- `requirements.txt` — added `tzdata`
- `.env.example` — new file
- `HANDOVER.md` — this section

### Test Results
```
Ran 16 tests in 3.174s — OK
```
