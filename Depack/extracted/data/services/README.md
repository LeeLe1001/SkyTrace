# Flighty Data Layer - Services Catalog
# Business logic and orchestration services
# ============================================================================

## Core Services
- SyncControllerService
  - (main sync orchestration: push/pull flight data)
- UserControllerService
  - (user state management/authentication)
- Service (base protocol/class)

## Background Sync
- Background fetch via BGTaskScheduler (identifier: com.flightyapp.flighty.refresh)
- SyncCache (warm-up cache for airlines/flights/airports)

## Logging
- Services/Logging (dedicated logging service)
  - Source: flighty-ios/Flighty/Services/Logging.swift

## Calendar Integration
- CalendarSubmitterCache
- calendar_import_last_request_hash_
- calendar_import_last_request_lastsubmission_

## Live Activity Lifecycle
- init(container:userController:httpClient:dataGenerator:trackActivityTokens:startLiveActivity:endLiveActivity:refreshLiveActivity:reconciliateExistingLiveActivities:cacheRunningActivities:liveActivitySettingsRepository:killedLiveActivityRepository:estimateOfflineFlight:generateAirlineLogo:cleanupAirlineLogo:proAccessProvider:)
  - (massive initializer indicating service orchestrator pattern)

## Maps
- Mapbox style management
- AirlineLogoPathProvider (logo asset resolution)

## Notifications
- UserNotifications framework integration
- Push notification handling
- NotificationController

## Design Pattern Notes
- Services are likely injected via dependency injection (large init signatures)
- Controller suffix on SyncControllerService suggests MVC-influenced naming
