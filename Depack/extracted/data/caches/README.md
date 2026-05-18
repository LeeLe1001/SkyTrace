# Flighty Data Layer - Caches Catalog
# Cache abstractions and strategies
# ============================================================================

## Sync Caches
- SyncCache
  - warm up cache (pre-population)
  - Filling Airlines Cache for Sync
  - Filling Flights Cache for Sync
  - Filling Airports Cache for Sync

## Calendar Caches
- CalendarSubmitterCache
  - calendar_import_last_request_hash_
  - calendar_import_last_request_lastsubmission_

## UI Caches
- SharedFlightListCellCache
  - cellCacheSection
  - cellCache / headerCache / decorationCache
- CachedImageProvider (Lottie)
  - imageCache
- LRUAnimationCache (Lottie)
  - cacheSize / cacheMap

## Live Activity Caches
- PersistedLiveActivityCacheRepository
  - RunningLiveActivityCache (JSON file)
  - cacheRunningActivities

## Database Caches (GRDB)
- SchemaCache
- StatementCache (internal + public)
- DatabaseSchemaCache
- journalModeCache

## Date/Time Caches
- startOfMonthCache / endOfMonthCache
- routesCache
- SQLiteDateParser

## Product/IAP Cache
- Returning product cache
- _cachedConfiguration

## Cache Pattern Notes
- LRU strategy used for animations (LRUAnimationCache)
- Pre-warming pattern for sync data (filling caches)
- Mutable caches with access queue (cacheAccessQueue)
- Generated ticket changes via cache (generateTicketChanges(forObjectWithID:cache:))
