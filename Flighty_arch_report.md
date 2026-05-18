# Flighty IPA Architecture Report

## Scope
This is the comprehensive deep-dive architecture report for Flighty v2.9.2 (build 4267). Analysis combines bundle inspection, metadata parsing, binary static analysis (otool/strings/nm), CoreData model decompilation, Protobuf schema recovery, and full component extraction across UI, data, networking, and persistence layers. All extracted reusable component catalogs are available under [extracted/](extracted/).

## How to Use This Report
- Each section maps a specific architectural concern (UI, data, networking, persistence)
- File references use absolute paths within the workspace
- The [extracted/](extracted/) directory contains categorized catalogs of all recoverable components:
  - [extracted/ui/](extracted/ui/) — UI layer (ViewControllers, Coordinators, ViewModels, Views, Storyboards)
  - [extracted/data/](extracted/data/) — Data layer (Models, Repositories, Services, Networking, Persistence, Protobuf, Caches)
  - [extracted/resources/](extracted/resources/) — Bundled assets and data files

## Bundle Overview
- App bundle root: [Flighty_unpacked/Payload/Flighty.app](Flighty_unpacked/Payload/Flighty.app)
- Main executable: [Flighty_unpacked/Payload/Flighty.app/Flighty](Flighty_unpacked/Payload/Flighty.app/Flighty)
- Core metadata: [Flighty_unpacked/Payload/Flighty.app/Info.plist](Flighty_unpacked/Payload/Flighty.app/Info.plist)

## App Identity and Platform Targets
- Bundle id: `com.flightyapp.flighty` [Info.plist](Flighty_unpacked/Payload/Flighty.app/Info.plist#L108-L110)
- Version: `2.9.2` build `4267` [Info.plist](Flighty_unpacked/Payload/Flighty.app/Info.plist#L116-L134)
- Minimum OS: `10.0` [Info.plist](Flighty_unpacked/Payload/Flighty.app/Info.plist#L179-L180)
- Device/CPU: `arm64` only [Info.plist](Flighty_unpacked/Payload/Flighty.app/Info.plist#L237-L240)
- Live Activities enabled [Info.plist](Flighty_unpacked/Payload/Flighty.app/Info.plist#L215-L216)
- Background modes: `fetch`, `remote-notification` [Info.plist](Flighty_unpacked/Payload/Flighty.app/Info.plist#L224-L228)
- Custom URL scheme: `flighty://` [Info.plist](Flighty_unpacked/Payload/Flighty.app/Info.plist#L122-L131)

## UI Technology and Resources
- UIKit-style compiled views: many `.storyboardc` and `.nib` files, e.g. [Flighty_unpacked/Payload/Flighty.app/ArrivalForecastViewController.storyboardc](Flighty_unpacked/Payload/Flighty.app/ArrivalForecastViewController.storyboardc) and [Flighty_unpacked/Payload/Flighty.app/FlightListCell.nib](Flighty_unpacked/Payload/Flighty.app/FlightListCell.nib)
- Launch screens via storyboards in [Flighty_unpacked/Payload/Flighty.app/Base.lproj](Flighty_unpacked/Payload/Flighty.app/Base.lproj)
- App assets compiled into [Flighty_unpacked/Payload/Flighty.app/Assets.car](Flighty_unpacked/Payload/Flighty.app/Assets.car)
- Custom fonts declared in plist (Noway family) [Info.plist](Flighty_unpacked/Payload/Flighty.app/Info.plist#L217-L223)
- UI resource scale: 15 storyboards and 57 nibs indicate a UIKit-heavy view layer

## Resource Bundles and Feature Modules
- Bundle directories present in the app: [Flighty_unpacked/Payload/Flighty.app/AcknowList_AcknowList.bundle](Flighty_unpacked/Payload/Flighty.app/AcknowList_AcknowList.bundle), [Flighty_unpacked/Payload/Flighty.app/Amplitude_Amplitude.bundle](Flighty_unpacked/Payload/Flighty.app/Amplitude_Amplitude.bundle), [Flighty_unpacked/Payload/Flighty.app/Modules_FlightDetailsUI.bundle](Flighty_unpacked/Payload/Flighty.app/Modules_FlightDetailsUI.bundle), [Flighty_unpacked/Payload/Flighty.app/Modules_FlightyCore.bundle](Flighty_unpacked/Payload/Flighty.app/Modules_FlightyCore.bundle), [Flighty_unpacked/Payload/Flighty.app/Modules_FreeCompPromotion.bundle](Flighty_unpacked/Payload/Flighty.app/Modules_FreeCompPromotion.bundle), [Flighty_unpacked/Payload/Flighty.app/Modules_Onboarding.bundle](Flighty_unpacked/Payload/Flighty.app/Modules_Onboarding.bundle), [Flighty_unpacked/Payload/Flighty.app/Modules_Paywall.bundle](Flighty_unpacked/Payload/Flighty.app/Modules_Paywall.bundle), [Flighty_unpacked/Payload/Flighty.app/Modules_WhatsNewUI.bundle](Flighty_unpacked/Payload/Flighty.app/Modules_WhatsNewUI.bundle), [Flighty_unpacked/Payload/Flighty.app/Modules_YearInReview.bundle](Flighty_unpacked/Payload/Flighty.app/Modules_YearInReview.bundle), [Flighty_unpacked/Payload/Flighty.app/PhoneNumberKit_PhoneNumberKit.bundle](Flighty_unpacked/Payload/Flighty.app/PhoneNumberKit_PhoneNumberKit.bundle)

## Third-Party Libraries (Evidence)
- AcknowList, Amplitude, and PhoneNumberKit bundles are present (see bundle list above)
- Lottie appears in strings (`CachedImageProvider`, `LRUAnimationCache`), indicating JSON-based animations
- GRDB appears in strings, indicating SQLite via the GRDB Swift library
- AppCenter and Amplitude telemetry are present in strings, plus Branch for deep links

## Modular Resources and Third-Party Components
- Feature/resource bundles suggest modular UI/features: [Flighty_unpacked/Payload/Flighty.app/Modules_FlightyCore.bundle](Flighty_unpacked/Payload/Flighty.app/Modules_FlightyCore.bundle), [Flighty_unpacked/Payload/Flighty.app/Modules_Paywall.bundle](Flighty_unpacked/Payload/Flighty.app/Modules_Paywall.bundle), [Flighty_unpacked/Payload/Flighty.app/Modules_YearInReview.bundle](Flighty_unpacked/Payload/Flighty.app/Modules_YearInReview.bundle)
- CocoaPods usage inferred from [Flighty_unpacked/Payload/Flighty.app/Pods-Flighty-acknowledgements.plist](Flighty_unpacked/Payload/Flighty.app/Pods-Flighty-acknowledgements.plist)
- Mapbox integration via token [Info.plist](Flighty_unpacked/Payload/Flighty.app/Info.plist#L175-L178)

## Binary Dependencies (Main Executable)
- Core UI frameworks present: `UIKit`, `SwiftUI`, `WebKit`, `WidgetKit`, `ActivityKit`, `SafariServices`
- System and data frameworks present: `Foundation`, `CoreData`, `CoreLocation`, `CoreTelephony`, `CloudKit`, `Contacts`, `EventKit`, `Photos`, `MessageUI`, `Security`, `CryptoKit`, `SystemConfiguration`, `BackgroundTasks`, `UserNotifications`
- Swift runtime linkage suggests Swift app with concurrency: `libswiftCore`, `libswiftFoundation`, `libswiftNetwork`, `libswift_Concurrency` (embedded at [Flighty_unpacked/Payload/Flighty.app/Frameworks/libswift_Concurrency.dylib](Flighty_unpacked/Payload/Flighty.app/Frameworks/libswift_Concurrency.dylib))

## UI vs Core Responsibilities

### UI Technology Stack
- **Primary**: UIKit with Interface Builder (15 `.storyboardc`, 57 `.nib` files)
- **Supplementary**: SwiftUI (framework linked, `BaseHostingController` for embedding)
- **Animations**: Lottie (JSON-based, `radar-animation-dark.json`, `radar-animation-light.json`)
- **Maps**: MapKit (system) + Mapbox (custom styles)
- **Fonts**: Noway family (Regular, Medium, Bold, Light) — custom OTF files

### Architecture Pattern: Coordinator + MVVM
Flighty uses a hybrid Coordinator/MVVM architecture:

**Coordinators (navigation flow):** 23 coordinators handle all navigation flows
- Root: `AppCoordinator`
- Feature: `FlightDetailsCoordinator`, `OnboardingCoordinator`, `PaywallCoordinator`, `ProfileCoordinator`, `SettingsCoordinator`, `CalendarSyncSettingsCoordinator`
- Modal/Overlay: `OfferCoordinator`, `NewUserOfferCardCoordinator`, `OnLaunchPopupCardCoordinator`, `ShareCardCoordinator`, `ConditionalCoordinator`
- Secondary: `FaqCoordinator`, `HelpCoordinator`, `WhatsNewCoordinator`, `FlightFeedbackCoordinator`, `YearInReviewCoordinator`, `FreeProOfferPopupCoordinator`
- Base: `Coordinator` (protocol), `DesignSystem.Coordinator`

**ViewModels (MVVM state):** 16+ ViewModels paired with ViewControllers
- Flight: `FlightLoaderViewModel`, `FlightDetailsActionBarViewModel`, `PastFlightRowViewModel`
- Map: `MapHudViewModel`, `FlightMapHudViewModel`
- Live Activities: `LiveActivitySettingsViewModel`, `LiveActivityFlightInclusionSettingViewModel`
- Others: `PaywallViewModel`, `FlowViewModel`, `SearchFeedbackViewModel`, etc.

### Feature Surface by Module
| Module | Bundle | Key VCs |
|--------|--------|---------|
| Flight Details | Modules_FlightDetailsUI | FlightDetailsViewController, CrewViewController, BookingInfoViewController |
| Core | Modules_FlightyCore | (CoreData model, no UI resources) |
| Onboarding | Modules_Onboarding | OnboardingViewController |
| Paywall | Modules_Paywall | PaywallViewController, MonthlyUpsellViewController |
| What's New | Modules_WhatsNewUI | WhatsNewV2ViewController |
| Year in Review | Modules_YearInReview | YearInReviewViewController, YearInReviewHalfCardViewController |
| Free Promo | Modules_FreeCompPromotion | FreeProOfferPopupViewController |

### Reusable UI Components
Full catalogs available in [extracted/ui/](extracted/ui/):
- [ViewControllers](extracted/ui/viewcontrollers/README.md) — 80+ ViewControllers mapped by feature
- [Coordinators](extracted/ui/coordinators/README.md) — 23 Coordinators
- [ViewModels](extracted/ui/viewmodels/README.md) — 16+ ViewModels
- [Storyboards/NIBs](extracted/ui/storyboards/README.md) — 15 storyboards + 57 nibs with reusable cells/views
- [Views](extracted/ui/views/README.md) — Custom views, providers, presentation controllers, design system base classes

## Architecture Patterns

### Overall Architecture: Layered + Feature-Modular

```
┌─── UI Layer ───────────────────────────────────────┐
│  ViewControllers (UIKit)  │  SwiftUI Views          │
│  ──────────────────────── │  ─────────────────────  │
│  Coordinators (navigation)│  BaseHostingController  │
│  ViewModels (MVVM state)  │                         │
├─── Domain/Service Layer ───────────────────────────┤
│  Services: SyncControllerService, UserController    │
│  Repositories: AirportCodesRepo, FlightMapRepo...   │
│  Providers: AirlineLogoProvider, CachedImage...     │
├─── Data Access Layer ──────────────────────────────┤
│  ApiModels (Swift types wrapping Protobuf)          │
│  HTTPClient → NetworkRequestFactory → API Clients   │
│  Protobuf serialization (com.flighty.proto.*)       │
├─── Persistence Layer ──────────────────────────────┤
│  CoreData (42 model versions, .momd)                │
│  GRDB/SQLite (reactive queries, FTS, migrations)    │
│  Caches: SyncCache, CalendarSubmitterCache, etc.    │
│  Keychain (AppCenter secure storage)                │
├─── Platform Layer ──────────────────────────────────┤
│  ActivityKit (Live Activities), WidgetKit           │
│  MapKit + Mapbox, EventKit, CloudKit, Contacts       │
│  UserNotifications, BackgroundTasks                 │
└────────────────────────────────────────────────────┘
```

### Key Architectural Decisions
1. **Dual persistence**: CoreData for domain objects + GRDB/SQLite for high-performance queries/caching
2. **Protobuf wire format**: Reduces payload size vs JSON for flight data; enables cross-platform schema consistency
3. **Coordinator pattern**: Decouples navigation from ViewControllers, enabling modular feature bundles
4. **Request-per-endpoint**: Each API endpoint has a typed Request object, enabling compile-time safety
5. **StorageClass wrappers**: GRDB persistence adapters nested within API model types (bridge pattern)
6. **Feature modules as resource bundles**: Each feature has its own `.bundle` with UI resources and compiled assets

### Repository/Service/Provider Distinctions
- **Repository**: Data access abstraction (AirportCodesRepository, FlightMapStateRepository, ETagSyncRepository)
- **Service**: Business logic orchestration (SyncControllerService, UserControllerService)
- **Provider**: Factory/utility for UI resources (AirlineLogoProvider, CachedImageProvider, FontFeatureProvider)
- **Controller**: Lifecycle/flow management (NotificationController, SyncControllerService)

## Feature Surface (From View Controller Names)
- Flight details and maps: `FlightDetailsViewController`, `FlightDetailsSummaryViewController`, `FlightMapHudViewModel`, `MapViewController`
- Search and discovery: `SearchContainerViewController`, `SearchResultsViewController`, `AlternativesSearchViewController`
- User/account: `ProfileViewController`, `ManageAccountViewController`, `SettingsViewController`
- Monetization: `PaywallViewController`, `MonthlyUpsellViewController`, `OfferViewController`
- Onboarding and help: `OnboardingViewController`, `HelpViewController`, `FaqViewController`
- Live Activities and widgets: `LiveActivitySettingsViewController`, `HomeScreenWidgetsSettingsViewController`, `LockScreenWidgetsSettingsViewController`

## API and Networking Implementation

### Networking Layer Architecture
The networking stack follows a layered pattern (bottom-up):

1. **HTTPClient** (`Modules/Sources/HttpClient/HttpClient.swift`) — generic HTTP layer with header configuration, async request sending, and request/response logging
2. **NetworkRequestFactory** (`Modules/Sources/FlightyCore/Networking/NetworkRequestFactory.swift`) — combines environment + HTTPClient, provides flight search methods: `byNumber(), byRoute()`
3. **Request Objects** — type-safe request-per-endpoint pattern:
   - `HTTPRequest` (base with `request(method:path:queryItems:body:then:)`)
   - `SearchRequest`, `SubscribeToFlightRequest`, `SubscribeToRandomFlightRequest`
   - `RegisterDeviceRequest`, `UploadReceiptRequest`, `FlightSyncPollingRequest`
   - `YearInReviewSeenRequest`, `AttributionRequest`, `StatelessHTTPRequest`
   - `MockableUserRequest` / `UserRequest`
4. **API Clients** — dedicated clients per domain:
   - `AnalyticsClient` → analytics endpoints
   - `LiveActivityApiClient` → `StartLiveActivityRequest`
   - `RetailNetworkRequestFactory` (App Store build variant)

### API Domains
| Environment | Base URL |
|-------------|----------|
| Production | `https://api.flightyapp.com` |
| Production Analytics | `https://api.flightyapp.com/analytics` |
| Production Reachability | `https://api.flightyapp.com/reachability_detection` |
| Live Updates | `https://live.flighty.app/` |
| Live Updates (Internal) | `https://live-int.flighty.app/` |
| Beta | `https://api-beta.flightyapp.com` |
| Test | `http://api.tst.flightyapp.com` (HTTP, ATS-exempted) |
| Test Analytics | `http://api.tst.flightyapp.com/analytics` |

### Third-Party API Endpoints
- Mapbox: `mapbox://styles/flightyapp/cjsc39vya1ffg1go7ge8dq82v` (primary), `mapbox://styles/flightyapp/ck02xj4r32nae1cqkx9e5jhi1` (secondary)
- AppCenter: `https://in.appcenter.ms`, `https://mobile.events.data.microsoft.com`
- Amplitude: `https://api2.amplitude.com/`, `https://api.eu.amplitude.com/`, `https://regionconfig.amplitude.com/`, `https://regionconfig.eu.amplitude.com/`
- Flight tracking: FlightAware (`https://flightaware.com/live/flight/`), FlightStats, FlightView
- Flight WiFi: `http://flightywifi.com`
- Google Flights: `https://www.google.com/travel/flights?q=`

### Wire Protocol: Protocol Buffers
The API uses Protocol Buffers for data serialization:

**Package: com.flighty.proto.api** (Production API)
- `Flight`, `Airport`, `Airline`, `Schedule`, `Location`, `Equipment`, `Weather`, `DelayForecast`
- `Codeshare`, `InboundFlight`, `FlightPlan`
- Events: `FlightChange`, `BagaggeChangedEvent`, `EquipmentChangedEvent`, `FlightPlanFiledEvent`, `FlightStatusChangedEvent`, `GateChangedEvent`, `ScheduleChangedEvent`, `InboundScheduleChangedEvent`, `InboundFlightStatusChangeEvent`, `TailNumberChangedEvent`
- Wrappers: `SingleFlightResponse`, `GetStaticAssetsResponse`, `StaticAssetProto`
- Enums: `FlightStatus`, `FlightPhase`, `ScheduleKind`, `ScheduleTimeKind`, `StaticAssetKindProto`

**Package: com.flighty.proto.polaris** (Polaris — Live/Nearby Planes)
- `PolarisPosition`, `PolarisPositions`, `FlightLiveActivity`, `Ticket`
- Reuses core types: `Flight`, `Airport`, `Airline`, etc.

**Low-level tracking types:** `Position`, `FlightPoint`, `FlightActualPosition`, `PlannedRoute`, `FlightPollSync`, `NearbyPlane`

**Runtime reflection:** Google Protobuf descriptor types are included (`google.protobuf.*`)

Full Protobuf schema recovery available at [extracted/data/proto/README.md](extracted/data/proto/README.md).

### Swift API Model Layer (ApiModels module)
API protobuf messages are wrapped in Swift types under the `ApiModels` module:
- `FlightyAPIFlight`, `FlightyAPIDeparture`, `FlightyAPIArrival`, `FlightyAPIAirport`, `FlightyAPIAirline`, etc.
- Storage classes (`*StorageClass`) bridge to GRDB for persistence
- All model types and enums cataloged at [extracted/data/models/README.md](extracted/data/models/README.md)

## Recovered Module and Source Hints (Strings Evidence)
- Strings include module paths suggesting a Swift Packages layout with modules like `FlightyCore`, `ApiModels`, and `HttpClient`
- Networking sources referenced in strings include `FlightSearch`, `NetworkRequestFactory`, and `Requests/HTTPRequest`, indicating a layered networking stack
- Logging implementation is referenced as `Services/Logging` in strings, indicating a dedicated logging service

## Networking and API Surface (Strings Evidence)
- Primary API domains observed: `https://api.flightyapp.com`, `https://api.flightyapp.com/analytics`, `https://api.flightyapp.com/reachability_detection`
- Additional environments: `https://api-beta.flightyapp.com`, `http://api.tst.flightyapp.com`, `http://api.tst.flightyapp.com/analytics`
- Live update endpoints: `https://live.flighty.app/`, `https://live-int.flighty.app/`
- Mapbox style URLs: `mapbox://styles/flightyapp/cjsc39vya1ffg1go7ge8dq82v`, `mapbox://styles/flightyapp/ck02xj4r32nae1cqkx9e5jhi1`
- Other network touchpoints: `http://flightywifi.com`, `track@my.flightyapp.com`

## Analytics, Attribution, and Sharing (Strings Evidence)
- AppCenter telemetry present: `appcenter.ios`, `com.microsoft.appcenter`, `https://in.appcenter.ms`, `https://mobile.events.data.microsoft.com`
- Amplitude telemetry present: `amplitude-ios`, `https://api2.amplitude.com/`, `https://api.eu.amplitude.com/`, `https://regionconfig.amplitude.com/`
- Branch deep link attribution appears in symbols: `branch`
- Sharing/social hooks appear for Facebook and Instagram (also matches URL scheme list)

## Payments and Monetization
- StoreKit framework linked and paywall resources present in [Flighty_unpacked/Payload/Flighty.app/Modules_Paywall.bundle](Flighty_unpacked/Payload/Flighty.app/Modules_Paywall.bundle)
- Subscription management URLs appear in strings: `https://apps.apple.com/account/subscriptions`

## Background Processing, Widgets, and Live Activities
- Background fetch and push enabled [Info.plist](Flighty_unpacked/Payload/Flighty.app/Info.plist#L224-L228)
- Live Activities enabled [Info.plist](Flighty_unpacked/Payload/Flighty.app/Info.plist#L215-L216) with ActivityKit linkage
- WidgetKit and Intents frameworks linked; StatsConfiguration intent definition present at [Flighty_unpacked/Payload/Flighty.app/StatsConfiguration.intentdefinition](Flighty_unpacked/Payload/Flighty.app/StatsConfiguration.intentdefinition)

## Localization Footprint
- Only Base and English resources are present: [Flighty_unpacked/Payload/Flighty.app/Base.lproj](Flighty_unpacked/Payload/Flighty.app/Base.lproj) and [Flighty_unpacked/Payload/Flighty.app/en.lproj](Flighty_unpacked/Payload/Flighty.app/en.lproj)

## Data and Content Assets
- Flight data tables: [Flighty_unpacked/Payload/Flighty.app/airlines.csv](Flighty_unpacked/Payload/Flighty.app/airlines.csv), [Flighty_unpacked/Payload/Flighty.app/airlines.json](Flighty_unpacked/Payload/Flighty.app/airlines.json), [Flighty_unpacked/Payload/Flighty.app/airports.csv](Flighty_unpacked/Payload/Flighty.app/airports.csv), [Flighty_unpacked/Payload/Flighty.app/airports.json](Flighty_unpacked/Payload/Flighty.app/airports.json)
- JSON animation assets: [Flighty_unpacked/Payload/Flighty.app/radar-animation-dark.json](Flighty_unpacked/Payload/Flighty.app/radar-animation-dark.json), [Flighty_unpacked/Payload/Flighty.app/radar-animation-light.json](Flighty_unpacked/Payload/Flighty.app/radar-animation-light.json)
- User-facing HTML docs: [Flighty_unpacked/Payload/Flighty.app/Privacy Policy.html](Flighty_unpacked/Payload/Flighty.app/Privacy%20Policy.html), [Flighty_unpacked/Payload/Flighty.app/Terms of Service.html](Flighty_unpacked/Payload/Flighty.app/Terms%20of%20Service.html)

## Persistence and Local Data

### CoreData Stack
- Model location: [Flighty_unpacked/Payload/Flighty.app/Modules_FlightyCore.bundle/Flighty.momd/](Flighty_unpacked/Payload/Flighty.app/Modules_FlightyCore.bundle/Flighty.momd/)
- Model versions: 42 migration versions (DataModel.mom through DataModel 42.mom)
- Value transformers: CLLocationValueTransformer for coordinate storage

#### CoreData Entities (42 total, recovered from compiled model)
| Entity | Key Attributes | Relationships |
|--------|---------------|---------------|
| Flight | flightNumber, fullFlightNumber, callsign, distanceInKm, isArchived, isPassenger, isRandom, hasOfficialData, calendarEventIdentifier | airline, equipment, departureSchedule, arrivalSchedule, departureAirport, arrivalAirport, codeshares, inbound, flightPlan, weather, delayForecast, appearsIn, user |
| Airport | iata, icao, name, city, region, country, countryCode, latitude, longitude, timezoneString, relevance | homeAirportOf (User) |
| Airline | iata, icao, name, callsign, country, phone, website, facebook, twitter, alliance, isActive, checkInOpeningTime, checkInClosingTime | — |
| Schedule | rawKind, rawType, time, terminal, gate, belt, baggageBelt, checkinCounter, runwayConcrete, runwayActual, runwayEstimated, runwayOriginal | — |
| Search | from, to, flightNumber, isLoading, hadResults, updatedAt | flights, appearsAsFromIn, appearsAsToIn |
| User | username | profile, emails, tripit, devices, subscription, pushSetting, emailContacts |
| Profile | hoursInAir, numberOfFlights, distanceFlown, homeAirport, imageData (NSData) | — |
| Device | appVersion, pushToken, remoteId, lastUpdated, rawEnvironment, created, rawLocale | — |
| Connection | (flight segment connections) | waitingAirport, arrivingFlight, departingFlight, connectedBy, connectedToArriving, connectedToDeparting |
| Weather | conditionIdentifier, rawTemperature, schedule, isNight | — |
| DelayForecast | onTime, early, late15, late30, late45, canceled, diverted, numberOfObservations, averageDelay | — |
| Ticket | bookingCode, seatNumber, rawCabinClass, rawSeatPosition | — |
| ChangeRecord | (flight status change records) | — |
| PlanePosition | altitudeInFt, longitude, latitude, speedInMph, directionInDeg, rawStatus | — |
| UserSubscription | proBannerStatusSubtitle, isEligibleIntroOfferHolidays2020, purchasedAt, rawProductIdentifier, remainingFlights, isAutoRenewing, expiresAt | — |
| FlightFeedback | notShowingDelay, dataMissing, wrongTerminal, wrongDepartureStatus, wrongArrivalStatus, wrongGate, wrongAircraftType, wrongTailNumber, showingWrongCancellation, notShowingCancellation, otherIssue | — |

Full entity/attribute/relationship catalog available at [extracted/data/persistence/README.md](extracted/data/persistence/README.md).

### GRDB (SQLite) Stack
- Library: GRDB.swift (from SourcePackages)
- Features detected: DatabaseQueue, DatabasePool, DatabaseSnapshot, FetchRequest, QueryInterfaceRequest, ValueObservation (reactive DB), FTS3/FTS4 full-text search, TableAlteration (migrations), Savepoints (`SAVEPOINT grdb`)
- Custom SQL patterns: `INSERT INTO grdb_migrations`, `SELECT * FROM documents WHERE content MATCH` (FTS), table CRUD operations

### Cache Layer
- SyncCache (airlines/flights/airports warm-up)
- CalendarSubmitterCache (import dedup)
- SharedFlightListCellCache (UI cell reuse)
- RunningLiveActivityCache (JSON-persisted live activity state)
- GRDB StatementCache + SchemaCache + DatabaseSchemaCache (DB performance)
- LRUAnimationCache + CachedImageProvider (Lottie animation cache)

## Signing and Distribution Artifacts
- Code signing metadata: [Flighty_unpacked/Payload/Flighty.app/_CodeSignature/CodeResources](Flighty_unpacked/Payload/Flighty.app/_CodeSignature/CodeResources)
- Provisioning profile: [Flighty_unpacked/Payload/Flighty.app/embedded.mobileprovision](Flighty_unpacked/Payload/Flighty.app/embedded.mobileprovision)

## Notable Observations
- Non-standard dylibs suggest post-build patching or jailbreak tweak injection: [Flighty_unpacked/Payload/Flighty.app/AntiCrash_Ourchase_NoAds (1).dylib](Flighty_unpacked/Payload/Flighty.app/AntiCrash_Ourchase_NoAds%20(1).dylib), [Flighty_unpacked/Payload/Flighty.app/Fixipa2.dylib](Flighty_unpacked/Payload/Flighty.app/Fixipa2.dylib), [Flighty_unpacked/Payload/Flighty.app/YallakoraPatch.dylib](Flighty_unpacked/Payload/Flighty.app/YallakoraPatch.dylib), [Flighty_unpacked/Payload/Flighty.app/libsubstrate.dylib](Flighty_unpacked/Payload/Flighty.app/libsubstrate.dylib). These are not typical for a clean App Store IPA and indicate the app binary may have been modified. If you need to confirm, compare with a known-good IPA or verify code signatures.
- The injected dylibs reference MobileSubstrate paths (e.g. `/Library/MobileSubstrate/DynamicLibraries/*`) and third-party tweak names, reinforcing the injection signal.
- Specific dylib linkages include `AntiCrash.dylib`, `KineMasterCheat.dylib`, and `YallakoraPatch.dylib` under `/Library/MobileSubstrate/DynamicLibraries/`
- The presence of [Flighty_unpacked/Payload/Flighty.app/SignedByEsign](Flighty_unpacked/Payload/Flighty.app/SignedByEsign) suggests sideloading tooling was involved.
- ATS exceptions allow insecure HTTP for test domains [Info.plist](Flighty_unpacked/Payload/Flighty.app/Info.plist#L183-L201)

## Suggested Next Checks (Optional)
- Validate whether the dylibs above are loaded by the main binary (requires binary inspection).
- Compare code signature metadata and provisioning profile against the original distribution source: [Flighty_unpacked/Payload/Flighty.app/_CodeSignature/CodeResources](Flighty_unpacked/Payload/Flighty.app/_CodeSignature/CodeResources), [Flighty_unpacked/Payload/Flighty.app/embedded.mobileprovision](Flighty_unpacked/Payload/Flighty.app/embedded.mobileprovision).
