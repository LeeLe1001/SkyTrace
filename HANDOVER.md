# SkyTrace Handover

## Current Branch

- Active branch: `codex/multi-user-foundation`
- Latest pushed commit before this handover: `98286a6`
- Working tree currently contains newer uncommitted changes after that commit

## What Was Completed

### Phase 2 backend/security

- Added server-side encryption for per-user API keys.
- New helper: [security_utils.py](D:/Files/Coding/FootPrint/security_utils.py)
- Encrypted fields are stored with prefix `enc:v1:`.
- Browser-facing `/api/settings` still returns masked values only.

### Timezone-aware flight duration

- Added real airport-timezone-based flight timeline utilities.
- New helper: [time_utils.py](D:/Files/Coding/FootPrint/time_utils.py)
- Generated airport timezone dataset: [data/airport_timezones.json](D:/Files/Coding/FootPrint/data/airport_timezones.json)
- Backend stats and flight status logic now use real timezones instead of longitude approximation.
- Frontend/static mode also gained shared timezone helpers:
  - [static/js/time-utils.js](D:/Files/Coding/FootPrint/static/js/time-utils.js)
  - [static/js/static-mode.js](D:/Files/Coding/FootPrint/static/js/static-mode.js)

### Admin UX / i18n fixes

- Managed-user success/error messages now auto-clear.
- Language switch now refreshes dynamic account/storage-mode labels.
- Relevant file: [static/js/app.js](D:/Files/Coding/FootPrint/static/js/app.js)

### Regression coverage

- Added phase-two regression tests:
  - [tests/test_phase_two_regressions.py](D:/Files/Coding/FootPrint/tests/test_phase_two_regressions.py)
- Updated cleanup regression test setup to work under multi-user bootstrap mode:
  - [tests/test_cleanup_regressions.py](D:/Files/Coding/FootPrint/tests/test_cleanup_regressions.py)

## Verified Commands

- `python -m py_compile app.py storage.py time_utils.py security_utils.py`
- `python -m unittest tests.test_cleanup_regressions tests.test_multi_user_foundation tests.test_phase_two_regressions`
- `git diff --check`

All of the above passed when run after commit `98286a6`.

## Remaining / In Progress

### Map tile blank / repeated-world issue

User reported that map tiles still show blank blocks and repeated worlds.

Most likely root cause:

- Map instances were configured with:
  - `worldCopyJump: true`
  - `maxBounds: [[-85, -Infinity], [85, Infinity]]`
- This can allow horizontally wrapped worlds and weird tile fetch behavior.
- Previous fit-bounds fixes reduced over-zooming but did not eliminate repeated-world rendering.

Newest uncommitted follow-up change:

- Switched both maps to single-world tile behavior in [static/js/app.js](D:/Files/Coding/FootPrint/static/js/app.js):
  - `worldCopyJump: false`
  - `maxBounds: [[-85, -180], [85, 180]]`
  - tile layer `noWrap: true`

This change has not yet been committed or user-verified.

### Files currently modified but intentionally not committed earlier

These were already dirty in the user workspace and should be handled carefully:

- [README.md](D:/Files/Coding/FootPrint/README.md)
- [static/css/style.css](D:/Files/Coding/FootPrint/static/css/style.css)
- [data/flight_schedules.json](D:/Files/Coding/FootPrint/data/flight_schedules.json)

Do not revert them unless explicitly requested.

## Recommended Next Steps

1. Test current uncommitted map change locally.
2. If repeated worlds / blank tiles are fixed, commit only the targeted files.
3. If not fixed, next likely places to inspect:
   - Leaflet container sizing and hidden-tab initialization timing
   - Service worker tile cache behavior in [sw.js](D:/Files/Coding/FootPrint/sw.js)
   - Whether mirrored antimeridian markers/arcs should be disabled entirely under `noWrap: true`

## Files Most Relevant For Continuation

- [static/js/app.js](D:/Files/Coding/FootPrint/static/js/app.js)
- [static/js/static-mode.js](D:/Files/Coding/FootPrint/static/js/static-mode.js)
- [time_utils.py](D:/Files/Coding/FootPrint/time_utils.py)
- [security_utils.py](D:/Files/Coding/FootPrint/security_utils.py)
- [storage.py](D:/Files/Coding/FootPrint/storage.py)
- [app.py](D:/Files/Coding/FootPrint/app.py)
