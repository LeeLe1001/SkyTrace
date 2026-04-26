# SkyTrace Handover

## Current State

- Workspace: `D:\Files\Coding\FootPrint`
- Active branch: `codex/multi-user-foundation`
- Previous pushed branch head before this batch: `38e5fda`
- This handover reflects the current fix set for:
  - stats-page heatmap crash
  - `0.0 Flight Hours (h)` symptom when stats loading aborts
  - restoring the wrapped dual-world map behavior for antimeridian routes

## User-Reported Issues In This Batch

1. Clicking `Stat` could throw:
   - `Uncaught IndexSizeError: Failed to execute 'getImageData' on 'CanvasRenderingContext2D': The source width is 0. @ leaflet-heat.js`
2. Stats page then showed `0.0 Flight Hours (h)`.
3. Map tiles still had blank areas.
4. The previous map change was wrong for this product:
   - the app intentionally uses wrapped worlds / mirrored geometry to avoid antimeridian jumps
   - forcing `noWrap: true` + `[-180, 180]` bounds broke that design

## What Changed In This Fix Set

### 1. Restored wrapped-map strategy

File: [static/js/app.js](D:/Files/Coding/FootPrint/static/js/app.js)

- Reverted both home map and flights map away from single-world mode.
- Current map config now uses:
  - `worldCopyJump: true`
  - wider `maxBounds: [[-85, -540], [85, 540]]`
  - removed tile-layer `noWrap: true`
- This restores the intended “stitched worlds” experience for Pacific / antimeridian routes while still constraining runaway panning better than the original infinite bounds.

### 2. Heatmap render guard for hidden / zero-size containers

File: [static/js/app.js](D:/Files/Coding/FootPrint/static/js/app.js)

- Added helpers:
  - `_isRenderableMapContainer(...)`
  - `_clearFmapHeatRefreshTimer()`
  - `_clearFmapHeatLayer()`
  - `_scheduleFmapHeatRefresh(...)`
  - `_refreshFlightsMapLayout(...)`
- `leaflet-heat` is no longer added when the map container is hidden or still `0x0`.
- When leaving `行程 -> 地图`, the heat layer is explicitly removed.
- When re-entering the map, toggling fullscreen, or opening/closing the filter bar, the map now:
  - invalidates size
  - optionally refits bounds
  - re-schedules heatmap rendering after layout settles

This is the main fix for the `getImageData(...): source width is 0` crash.

### 3. Stats loading now validates the API response

File: [static/js/app.js](D:/Files/Coding/FootPrint/static/js/app.js)

- `loadStats()` now validates that `/api/stats` returned an OK response and numeric `total_hours` / `total_flights`.
- This prevents silent fallback to zeros when the request is actually an auth error or a broken payload.

Note:
- The backend stats math itself was already correct.
- The more likely real symptom chain was: map heat layer crashed during subtab switch -> stats load flow became unstable -> page stayed at default zero values.

### 4. Cache-busting version bump

Files:
- [app.py](D:/Files/Coding/FootPrint/app.py)
- [index.html](D:/Files/Coding/FootPrint/index.html)
- [static/js/app.js](D:/Files/Coding/FootPrint/static/js/app.js)
- [static/js/static-mode.js](D:/Files/Coding/FootPrint/static/js/static-mode.js)
- [sw.js](D:/Files/Coding/FootPrint/sw.js)

- Version bumped from `47` to `48`.
- This is important because the affected code sits in JS + service-worker-cached assets.

### 5. Regression coverage

File: [tests/test_phase_two_regressions.py](D:/Files/Coding/FootPrint/tests/test_phase_two_regressions.py)

Added end-to-end stats coverage:
- bootstrap admin
- add manual `WEH -> ICN 11:00 -> 13:15`
- assert `/api/stats` returns:
  - `total_flights == 1`
  - `total_hours == 1.2`
  - `avg_hours == 1.2`

This complements the existing lower-level timezone duration regression test.

## Files Changed In This Batch

- [static/js/app.js](D:/Files/Coding/FootPrint/static/js/app.js)
- [tests/test_phase_two_regressions.py](D:/Files/Coding/FootPrint/tests/test_phase_two_regressions.py)
- [app.py](D:/Files/Coding/FootPrint/app.py)
- [index.html](D:/Files/Coding/FootPrint/index.html)
- [static/js/static-mode.js](D:/Files/Coding/FootPrint/static/js/static-mode.js)
- [sw.js](D:/Files/Coding/FootPrint/sw.js)
- [HANDOVER.md](D:/Files/Coding/FootPrint/HANDOVER.md)

## Validation Run

Run after these edits:

- `python -m py_compile app.py storage.py time_utils.py security_utils.py`
- `python -m unittest tests.test_cleanup_regressions tests.test_multi_user_foundation tests.test_phase_two_regressions`
- `git diff --check`

## Still Important To Verify Manually

These need actual browser / iPhone verification:

1. `行程 -> 统计`
   - no more `leaflet-heat` canvas crash
   - `Flight Hours (h)` is no longer stuck at `0.0`
2. Home map
   - no blank tiles
   - no forced “western hemisphere only” behavior
3. `行程 -> 地图`
   - wrapped-world behavior is back for antimeridian routes
   - blank tiles are gone
   - fullscreen / filter toggle do not break heatmap or tile rendering

## Known Local Dirty Files That Were Not Touched

These were already modified in the user workspace and must not be reverted casually:

- [README.md](D:/Files/Coding/FootPrint/README.md)
- [static/css/style.css](D:/Files/Coding/FootPrint/static/css/style.css)
- [data/flight_schedules.json](D:/Files/Coding/FootPrint/data/flight_schedules.json)

## If More Map Problems Remain

Next likely places to inspect, in order:

1. Hidden-container timing around Leaflet initialization and `invalidateSize()`
2. Whether some route bounds should be normalized separately for viewport-fit while still keeping mirrored geometry for display
3. Service worker cache interactions for tile-related JS/CSS asset updates in [sw.js](D:/Files/Coding/FootPrint/sw.js)
