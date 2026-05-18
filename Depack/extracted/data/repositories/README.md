# Flighty Data Layer - Repositories Catalog
# Data access and persistence abstractions
# ============================================================================

## Flight Data
- AirportCodesRepository
  - Variants: AnyAirlineCodesRepository, AnyAirportCodesRepository
  - (likely provides airline/airport lookup tables)
- FlightMapStateRepository
  - (persists map state across sessions)

## Live Activities
- LiveActivityDataRepository
- LiveActivitySettingsRepository
- PersistedLiveActivityRepository
- PersistedLiveActivityCacheRepository
- KilledLiveActivityRepository

## Sync
- ETagSyncRepository
  - (ETag-based cache validation for API sync)

## Sharing
- LiveSharedWithYouRepository
  - Delegate: LiveSharedWithYouRepositoryDelegate
- SharedWithYouRepository

## Subscriptions / In-App Purchases
- FreeCompPromotionDeciderRepository

## Misc
- ComplicationsPreferencesRepository
- StoredStaticAssetsRepository
- ActivityAutorizationRepository

## Pattern Notes
- Repository pattern used throughout for data access
- Repository names suggest separation of concerns:
  - Data repositories (raw data)
  - Cache repositories (ephemeral)
  - Settings repositories (user prefs)
  - Promotion/feature flag repositories (business logic)
