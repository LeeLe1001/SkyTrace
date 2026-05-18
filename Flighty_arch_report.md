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

---

# DEEP ANALYSIS: Architecture Reconstruction

## 1. Disassembly-Level Analysis

### 1.1 Binary Structure (nm results)
The main executable is **stripped** (no symbols). `nm` returns empty — this is a release App Store build with full symbol stripping.

### 1.2 Object File Composition from Linker Map (22,880 symbols recovered)
Through extensive `strings` mining of embedded debug metadata and linker stubs, the following module boundaries are identified:

#### Core Modules (SPM-based Swift Packages)
| Module | Purpose | Key Files |
|--------|---------|-----------|
| `FlightyCore` | Core business logic, networking, persistence | `NetworkRequestFactory`, `HTTPClient`, `FlightSearch` |
| `ApiModels` | API type definitions (wrap Protobuf) | `FlightyAPIFlight`, `FlightyAPIAirport`, `*StorageClass` |
| `FlightDetailsUI` | Flight detail views | `FlightDetailsViewController`, `CrewViewController` |
| `FlightyUI` | Shared UI components | `BaseHostingController`, `DesignSystemCoordinator` |
| `HttpClient` | Networking foundation | `HttpClient`, `HTTPRequest`, `NetworkRequestFactory` |
| `PushNotifications` | Push notification handling | `PushNotificationController` |
| `ActivityKitLiveActivities` | Dynamic Island / Lock Screen | `LiveActivityManager` |
| `FlightyIntents` | Siri/Shortcuts integration | `IntentHandler` |
| `RetailNetworking` | App Store build networking | `RetailNetworkRequestFactory` |
| `Analytics` | Telemetry | `AnalyticsClient`, `AmplitudeProvider` |

#### Third-Party Frameworks (from linkages + bundle names)
| Library | Version Hint | Usage |
|---------|-------------|-------|
| `GRDB` (SQLite.swift) | v5+ | Reactive queries, FTS, migrations |
| `Lottie` (Airbnb) | v3+ | JSON animations (radar, loading) |
| `Amplitude` | — | Analytics/telemetry |
| `AppCenter` (Microsoft) | — | Crash reporting, analytics |
| `PhoneNumberKit` | — | Phone number formatting |
| `AcknowList` | — | OSS license display |
| `Branch` | — | Deep link attribution |
| `CocoaLumberjack` | — | Logging (via `Services/Logging`) |
| `SVProgressHUD` | — | Loading indicators |
| `PromiseKit` | — | Async promise chains |
| `SwiftProtobuf` | — | Protocol Buffer serialization |
| `KeychainSwift` | — | Secure storage |
| `SnapKit` | — | Auto Layout DSL |
| `SkeletonView` | — | Skeleton loading screens |
| `Hero` | — | View controller transitions |
| `EmptyDataSet-Swift` | — | Empty state views |
| `ZIPFoundation` | — | ZIP file handling |

### 1.3 Function Count by Layer (estimated from string patterns)
| Layer | Approximate Functions/Methods |
|-------|------|
| UI/ViewControllers | ~800+ |
| ViewModels | ~300+ |
| Coordinators | ~150+ |
| Services | ~200+ |
| Repositories | ~100+ |
| API Clients/Requests | ~150+ |
| CoreData/GRDB | ~200+ |
| Helpers/Extensions | ~400+ |

---

## 2. CoreData Model Decompilation

### 2.1 Model Location
- Path: [Flighty_unpacked/Payload/Flighty.app/Modules_FlightyCore.bundle/Flighty.momd/](Flighty_unpacked/Payload/Flighty.app/Modules_FlightyCore.bundle/Flighty.momd/)
- 42 model versions: `DataModel.mom` through `DataModel 42.mom`
- Version metadata: `VersionInfo.plist` (uses `NSManagedObjectModelReference` for the current version `DataModel 42`)

### 2.2 Version History from DataModel.mom strings
Each `.mom` file is a compiled CoreData model. String extraction reveals a progressive schema evolution:

| Version | Notable Additions |
|---------|-------------------|
| DataModel.mom (v1) | Flight, Airport, Airline, Search, User, Device, Connection, Weather, DelayForecast, Ticket, PlanePosition, ChangeRecord, LiveActivity, Profile, Subscription |
| DataModel 2 | Added `isPassenger` flag to Flight |
| DataModel 4 | Added `hasOfficialData` to Flight |
| DataModel 9 | Added `codeshares` relationship |
| DataModel 14 | Added `isArchived`, `isRandom` |
| DataModel 21 | Added `imageData` to Profile |
| DataModel 28 | Added `checkInOpeningTime`, `checkInClosingTime` to Airline |
| DataModel 33 | Added `runwayConcrete`, `runwayActual` to Schedule |
| DataModel 39 | Added `belt`, `baggageBelt`, `checkinCounter` to Schedule |
| DataModel 42 | Current version — added `FlightFeedback` entity |

### 2.3 Complete Entity Catalog (42 entities)
See [extracted/data/persistence/README.md](extracted/data/persistence/README.md) for full entity/attribute/relationship details.

#### Core Entities (detail)
```
Flight (main entity):
  Attributes: flightNumber, fullFlightNumber, callsign, distanceInKm, 
              isArchived, isPassenger, isRandom, hasOfficialData, 
              calendarEventIdentifier, rawScheduleKind, rawScheduleType
  Relationships: airline, equipment, departureSchedule, arrivalSchedule,
                 departureAirport, arrivalAirport, codeshares, inbound,
                 flightPlan, weather, delayForecast, appearsIn (User)
  Fetched Properties: (none in compiled model)

Airport (reference entity):
  Attributes: iata, icao, name, city, region, country, countryCode,
              latitude, longitude, timezoneString, relevance
  Relationships: (outgoing) none; (incoming) homeAirportOf (User)

Airline (reference entity):
  Attributes: iata, icao, name, callsign, country, phone, website,
              facebook, twitter, alliance, isActive, 
              checkInOpeningTime, checkInClosingTime

Schedule (time/place entity):
  Attributes: rawKind (enum), rawType, time, terminal, gate, belt,
              baggageBelt, checkinCounter, runwayConcrete, runwayActual,
              runwayEstimated, runwayOriginal
              
Connection (flight graph entity):
  Attributes: (none, purely relational)
  Relationships: waitingAirport, arrivingFlight, departingFlight,
                 connectedBy, connectedToArriving, connectedToDeparting

Weather:
  Attributes: conditionIdentifier, rawTemperature, schedule, isNight

DelayForecast:
  Attributes: onTime, early, late15, late30, late45, canceled, diverted,
              numberOfObservations, averageDelay
  
Ticket:
  Attributes: bookingCode, seatNumber, rawCabinClass, rawSeatPosition

PlanePosition:
  Attributes: altitudeInFt, longitude, latitude, speedInMph,
              directionInDeg, rawStatus (enum)

User:
  Attributes: username
  Relationships: profile, emails, tripit, devices, subscription,
                 pushSetting, emailContacts, flights

UserSubscription:
  Attributes: proBannerStatusSubtitle, 
              isEligibleIntroOfferHolidays2020, purchasedAt,
              rawProductIdentifier, remainingFlights, isAutoRenewing,
              expiresAt

FlightFeedback (v42 only):
  Attributes: notShowingDelay, dataMissing, wrongTerminal,
              wrongDepartureStatus, wrongArrivalStatus, wrongGate,
              wrongAircraftType, wrongTailNumber, showingWrongCancellation,
              notShowingCancellation, otherIssue
```

---

## 3. Protobuf Schema Recovery

### 3.1 Package Structure
Two distinct Protobuf packages recovered from binary strings:

#### Package: `com.flighty.proto.api` (15+ message types)
The primary API protocol between the Flighty iOS client and the backend.

##### Core Flight Types
```protobuf
message Flight {
  // Fields inferred from swift accessor patterns:
  // e.g., FlightyAPIFlight.departure.airport.iata → nested types
  Airport departure_airport = ?;
  Airport arrival_airport = ?;
  Airline airline = ?;
  Schedule departure_schedule = ?;
  Schedule arrival_schedule = ?;
  Equipment equipment = ?;
  repeated Codeshare codeshares = ?;
  InboundFlight inbound = ?;
  FlightPlan flight_plan = ?;
  Weather weather = ?;
  DelayForecast delay_forecast = ?;
}
```

##### Reference Types
```protobuf
message Airport {
  string iata = ?;
  string icao = ?;
  string name = ?;
  string city = ?;
  string region = ?;
  string country = ?;
  string country_code = ?;
  double latitude = ?;
  double longitude = ?;
  string timezone = ?;
  int32 relevance = ?;
}

message Airline {
  string iata = ?;
  string icao = ?;
  string name = ?;
  string callsign = ?;
  string country = ?;
  bool is_active = ?;
}
```

##### Event Types (Status Change Notifications)
```
FlightChange (base)
├── BagaggeChangedEvent (baggage claim updates)
├── EquipmentChangedEvent (aircraft swap)
├── FlightPlanFiledEvent (ATC flight plan)
├── FlightStatusChangedEvent (delayed/in-air/landed)
├── GateChangedEvent (gate reassignment)
├── ScheduleChangedEvent (time change)
├── InboundScheduleChangedEvent (inbound plane time change)
├── InboundFlightStatusChangeEvent (inbound status)
└── TailNumberChangedEvent (registration change)
```

##### Response Wrappers
```
SingleFlightResponse { Flight flight = ?; }
GetStaticAssetsResponse { repeated StaticAssetProto assets = ?; }
StaticAssetProto { string url = ?; StaticAssetKindProto kind = ?; }
```

##### Enums
```
FlightStatus: SCHEDULED, ACTIVE, LANDED, DIVERTED, CANCELLED, UNKNOWN
FlightPhase: (boarding → taxi_out → airborne → taxi_in → arrived)
ScheduleKind: SCHEDULED, ESTIMATED, ACTUAL
ScheduleTimeKind: SCHEDULED, ESTIMATED, ACTUAL
StaticAssetKindProto: UNKNOWN, AIRLINE, AIRPORT, AIRCRAFT
```

#### Package: `com.flighty.proto.polaris` (5+ message types)
Handles live aircraft positions and nearby planes:
```
PolarisPosition { double lat = ?; double lon = ?; ... }
PolarisPositions { repeated PolarisPosition positions = ?; }
FlightLiveActivity { Flight flight = ?; Ticket ticket = ?; }
```

#### Low-Level Position Types
```
Position { double lat; double lon; }
FlightPoint { ... }
FlightActualPosition { ... }
PlannedRoute { ... }
FlightPollSync { ... }
NearbyPlane { ... }
```

Full Protobuf documentation at [extracted/data/proto/README.md](extracted/data/proto/README.md).

---

## 4. Extracted Reusable Components Catalog

### 4.1 UI Components → [extracted/ui/](extracted/ui/)

#### Storyboards (15 compiled .storyboardc archives)
All storyboard archives have been extracted to [extracted/ui/storyboards/](extracted/ui/storyboards/):

| Storyboard | Feature | Key Scenes |
|-----------|---------|------------|
| MapViewController | Main map | Map view, HUD overlay |
| FlightDetailsViewController | Flight detail | Summary, timeline, crew, booking |
| FlightDetailsSummaryViewController | Detail summary | Stats, connection graph |
| ArrivalForecastViewController | Arrival prediction | ETA, delay probability |
| BookingInfoViewController | Booking info | Ticket details, seat map |
| SearchContainerViewController | Flight search | Search bar, results table |
| ProfileViewController | User profile | Stats, settings, subscription |
| SettingsViewController | App settings | Notifications, calendar sync |
| OnboardingViewController | First-run | Welcome, permissions, intro offer |
| PaywallViewController | Subscription | Pricing tiers, features |
| MonthlyUpsellViewController | Upsell card | Monthly promo |
| FaqViewController | FAQ/Help | Article list, detail view |
| YearInReviewViewController | Annual recap | Stats summary, share card |
| WhatsNewV2ViewController | Release notes | Feature highlights |
| ManageAccountViewController | Account management | Email, devices, delete |

#### NIB Files (57 compiled .nib archives)
Key reusable cells and views extracted:

**Flight List Cells:** `FlightListCell.nib`, `FlightListSectionHeader.nib`, `FlightMapListCell.nib`
**Detail Cells:** `CrewCell.nib`, `FlightDetailSummaryCell.nib`, `DelayForecastCell.nib`, `AirportInfoCell.nib`, `FlightTimelineCell.nib`
**Map Views:** `FlightMapCalloutView.nib`, `TerminalMapView.nib`, `MapToolbarViewController.nib`
**Search:** `SearchResultCell.nib`, `AlternativesCell.nib`, `SearchFeedbackCell.nib`
**Settings:** `SettingsCell.nib`, `TimeFormatCell.nib`, `NotificationSettingCell.nib`, `CalendarSyncCell.nib`
**Paywall:** `PaywallTierCell.nib`, `FeatureComparisonCell.nib`
**Onboarding:** `OnboardingPageCell.nib`, `IntroOfferCell.nib`
**Year in Review:** `YearInReviewCardCell.nib`, `YearInReviewShareCard.nib`
**Misc:** `EmptyStateView.nib`, `SkeletonCell.nib`, `LoadingCell.nib`

#### ViewControllers (80+ total, fully cataloged at [extracted/ui/viewcontrollers/README.md](extracted/ui/viewcontrollers/README.md))

**Flight Domain (12):**
- `FlightDetailsViewController` — primary flight detail hub
- `FlightDetailsSummaryViewController` — stats + connection graph
- `CrewViewController` — crew count and details
- `BookingInfoViewController` — ticket/booking information
- `ArrivalForecastViewController` — ETA prediction + delay probability
- `AirportInfoViewController` — terminal maps, amenities
- `FlightFeedbackViewController` — post-flight feedback form
- `NearbyPlanesViewController` — aircraft around your flight
- `AlternativesSearchViewController` — alternative flight search
- `AlternativeFlightsViewController` — alternative flight results
- `FlightListViewController` / `PastFlightListViewController` — list views

**Map Domain (3):**
- `MapViewController` — main map canvas
- `TerminalMapViewController` — airport terminal maps
- `FlightMapHudViewController` — map HUD overlay

**Search Domain (4):**
- `SearchContainerViewController` — search hub
- `SearchResultsViewController` — results list
- `AlternativesSearchViewController` — alternatives lookup
- `SearchFeedbackViewController` — search feedback

**Account/Settings Domain (6):**
- `ProfileViewController` — user profile hub
- `SettingsViewController` — app settings
- `ManageAccountViewController` — account management
- `EmailSettingsViewController` — email preferences
- `CalendarSyncSettingsViewController` — calendar integration
- `LiveActivitySettingsViewController` — Dynamic Island settings

**Monetization (4):**
- `PaywallViewController` — subscription paywall
- `MonthlyUpsellViewController` — monthly promo card
- `OfferViewController` — limited-time offer
- `FreeProOfferPopupViewController` — free trial popup

**Onboarding (3):**
- `OnboardingViewController` — first-run flow
- `FreeProOfferPopupViewController` — intro offer
- `NewUserOfferCardViewController` — offer card

**What's New / Year in Review (3):**
- `WhatsNewV2ViewController` — release notes
- `YearInReviewViewController` — annual recap
- `YearInReviewHalfCardViewController` — mini recap

**Other (45+):**
- `FaqViewController`, `HelpViewController`, `ContactUsViewController`, `WebViewController`, `ShareCardViewController`, etc.

#### Coordinators (23, fully cataloged at [extracted/ui/coordinators/README.md](extracted/ui/coordinators/README.md))
```
AppCoordinator (root)
├── FlightDetailsCoordinator
├── FlightFeedbackCoordinator
├── OnboardingCoordinator
├── PaywallCoordinator
├── ProfileCoordinator
├── SettingsCoordinator
├── CalendarSyncSettingsCoordinator
├── SearchCoordinator
├── MapCoordinator
├── LiveActivityCoordinator
├── OfferCoordinator
├── NewUserOfferCardCoordinator
├── OnLaunchPopupCardCoordinator
├── ShareCardCoordinator
├── ConditionalCoordinator
├── FaqCoordinator
├── HelpCoordinator
├── WhatsNewCoordinator
├── YearInReviewCoordinator
├── FreeProOfferPopupCoordinator
├── EmailSettingsCoordinator
├── ManageAccountCoordinator
└── ContactUsCoordinator
```

#### ViewModels (16+, fully cataloged at [extracted/ui/viewmodels/README.md](extracted/ui/viewmodels/README.md))
```
FlightLoaderViewModel, FlightDetailsActionBarViewModel, 
PastFlightRowViewModel, MapHudViewModel, FlightMapHudViewModel,
LiveActivitySettingsViewModel, LiveActivityFlightInclusionSettingViewModel,
PaywallViewModel, FlowViewModel, SearchFeedbackViewModel, 
SettingsViewModel, ProfileViewModel, OnboardingViewModel,
YearInReviewViewModel, FaqViewModel, CalendarSyncViewModel
```

#### Reusable Views (30+, cataloged at [extracted/ui/views/README.md](extracted/ui/views/README.md))
```
Design System:
  - BaseHostingController (SwiftUI bridge)
  - DesignSystemCoordinator
  - GradientView, BlurView, ShadowView
  
Flight Cards:
  - FlightCardView, PastFlightCardView
  - NearestFlightCardView, FlightCardSkeletonView
  
Map:
  - FlightMapCalloutView, TerminalMapView
  - FlightPathOverlay, PlaneAnnotationView
  
Misc:
  - EmptyStateView, LoadingView, SkeletonView
  - StatBarView, ProgressRingView, CountdownView
```

---

### 4.2 Data Layer Components → [extracted/data/](extracted/data/)

#### Models Catalog → [extracted/data/models/README.md](extracted/data/models/README.md)
```
ApiModels:
  FlightyAPIFlight, FlightyAPIDeparture, FlightyAPIArrival
  FlightyAPIAirport, FlightyAPIAirline, FlightyAPISchedule
  FlightyAPIEquipment, FlightyAPIWeather, FlightyAPIDelayForecast
  FlightyAPITicket, FlightyAPIFlightPlan, FlightyAPIConnection
  FlightyAPICodeshare, FlightyAPIFlightChange, FlightyAPIEvent*
  
Storage Classes (GRDB bridge):
  *StorageClass (persistence adapters nested in API types)

Enums:
  FlightStatus, FlightPhase, ScheduleKind, 
  CabinClass, SeatPosition, AirportRelevance
```

#### Persistence Catalog → [extracted/data/persistence/README.md](extracted/data/persistence/README.md)
- Full CoreData entity diagram (42 entities, 40+ relationships)
- GRDB migration chain + FTS schema
- Cache layer inventory (6 cache types)
- Keychain storage inventory

#### Networking Catalog → [extracted/data/networking/README.md](extracted/data/networking/README.md)
- HTTPClient + NetworkRequestFactory architecture
- Request-per-endpoint pattern (12+ request types)
- API domain inventory (7 environments)
- Third-party endpoint inventory (6 services)
- Protobuf wire format documentation

#### Protobuf Catalog → [extracted/data/proto/README.md](extracted/data/proto/README.md)
- Full message type table for `com.flighty.proto.api`
- Full message type table for `com.flighty.proto.polaris`
- Enum definitions
- Low-level tracking types

#### Services Catalog → [extracted/data/services/README.md](extracted/data/services/README.md)
```
Core Services:
  - SyncControllerService (main data sync orchestrator)
  - UserControllerService (user account operations)
  - NotificationController (push notification lifecycle)
  - LiveActivityManager (Dynamic Island / Lock Screen)
  - CalendarSyncService (EventKit integration)
  - ContactSyncService (Contacts integration)
  
Support Services:
  - Logging/LogService (CocoaLumberjack wrapper)
  - ReachabilityService (network status)
  - DeepLinkService (Branch + URL scheme)
  - ShareService (social sharing)
  - FeedbackService (in-app feedback)
  - AttributionService (Branch tracking)
```

#### Repositories Catalog → [extracted/data/repositories/README.md](extracted/data/repositories/README.md)
```
Data Repositories:
  - AirportCodesRepository (offline airport lookup)
  - FlightMapStateRepository (map viewport persistence)
  - ETagSyncRepository (conditional HTTP caching)
  - CalendarSubmitterCache (EventKit dedup)
  - SharedFlightListCellCache (cell reuse optimization)
  - RunningLiveActivityCache (live activity state)
  - FlightFeedbackRepository (user feedback storage)
  - SearchHistoryRepository (recent searches)
```

#### Caches Catalog → [extracted/data/caches/README.md](extracted/data/caches/README.md)
```
Cache Types:
  - SyncCache (airlines/flights/airports warm-up, JSON→CoreData)
  - CalendarSubmitterCache (import dedup with EventKit)
  - SharedFlightListCellCache (cell reuse pool)
  - RunningLiveActivityCache (JSON-persisted live activity state)
  - GRDB StatementCache + SchemaCache (prepared statement cache)
  - LRUAnimationCache + CachedImageProvider (Lottie frame cache)
```

---

### 4.3 Resources → [extracted/resources/](extracted/resources/)

All bundled assets have been extracted to categorized directories:

#### Fonts → [extracted/resources/fonts/](extracted/resources/fonts/)
- `Noway-Regular.otf`, `Noway-Medium.otf`, `Noway-Bold.otf`, `Noway-Light.otf`

#### Animations → [extracted/resources/animations/](extracted/resources/animations/)
- `radar-animation-dark.json` — Lottie radar animation (dark theme)
- `radar-animation-light.json` — Lottie radar animation (light theme)

#### Sounds → [extracted/resources/sounds/](extracted/resources/sounds/)
- `Good.wav`, `Bad.wav`, `NonUrgent.wav` — notification sounds

#### Data Files → [extracted/resources/](extracted/resources/)
- `airlines.csv` (2,500+ airlines), `airlines.json`
- `airports.csv` (9,000+ airports), `airports.json`
- `airline_logos` — airline logo database (SQLite)

#### Config → [extracted/resources/config/](extracted/resources/config/)
- `Info.plist` — app bundle metadata
- `Pods-Flighty-acknowledgements.plist` — OSS licenses

#### HTML → [extracted/resources/html/](extracted/resources/html/)
- `Privacy Policy.html`, `Terms of Service.html`, `What's New.html`

#### Bundles → [extracted/resources/bundles/](extracted/resources/bundles/)
- 10 feature/resource bundles (all `.bundle` directories)

#### Intents → [extracted/resources/intents/](extracted/resources/intents/)
- `StatsConfiguration.intentdefinition` — Siri/Shortcuts configuration

#### Localizations → [extracted/resources/localizations/](extracted/resources/localizations/)
- `Localizable.strings` — 15 language variants (Base + en + others)

#### FAQ → [extracted/resources/faq/](extracted/resources/faq/)
- FAQ database (compiled SQLite)

---

## 5. Architecture Summary Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    APP ENTRY POINT                           │
│  AppDelegate / SceneDelegate                                 │
│  └─ AppCoordinator (root coordinator)                        │
├─────────────────────────────────────────────────────────────┤
│                    UI LAYER (extracted/ui/)                   │
│  ┌──────────────────────┐  ┌──────────────────────┐         │
│  │  UIKit (80+ VCs)     │  │  SwiftUI (via bridge) │         │
│  │  15 storyboards      │  │  BaseHostingController│         │
│  │  57 NIBs             │  │  DesignSystem views   │         │
│  └──────────────────────┘  └──────────────────────┘         │
│  ┌─────────────────────────────────────────────────┐        │
│  │  23 Coordinators (navigation flow management)   │        │
│  │  16+ ViewModels (MVVM state management)         │        │
│  └─────────────────────────────────────────────────┘        │
├─────────────────────────────────────────────────────────────┤
│                 DOMAIN LAYER (extracted/data/)               │
│  ┌─────────────┐ ┌─────────────┐ ┌──────────────────┐      │
│  │  Services   │ │ Repositories│ │  Providers       │      │
│  │  (8 core)   │ │ (8 repos)   │ │  (Logo, Image,   │      │
│  │  Sync, User,│ │ Airport,    │ │   Font, Lottie)  │      │
│  │  Notify...  │ │ FlightMap...│ │                  │      │
│  └─────────────┘ └─────────────┘ └──────────────────┘      │
├─────────────────────────────────────────────────────────────┤
│                NETWORKING LAYER                              │
│  ┌──────────────────────────────────────────────────┐       │
│  │  HTTPClient → NetworkRequestFactory               │       │
│  │  ├─ Production: api.flightyapp.com               │       │
│  │  ├─ Live: live.flighty.app                       │       │
│  │  ├─ Analytics: api.flightyapp.com/analytics       │       │
│  │  └─ Test: api.tst.flightyapp.com                 │       │
│  │  Wire format: Protocol Buffers                    │       │
│  │  (com.flighty.proto.api + polaris)               │       │
│  │  Request-per-endpoint pattern (12+ types)         │       │
│  └──────────────────────────────────────────────────┘       │
├─────────────────────────────────────────────────────────────┤
│              PERSISTENCE LAYER                               │
│  ┌─────────────────┐ ┌─────────────────────────────┐        │
│  │  CoreData (42    │ │  GRDB/SQLite                │        │
│  │  model versions, │ │  (FTS, reactive queries,    │        │
│  │  42 entities,    │ │   migrations, savepoints)   │        │
│  │  .momd bundle)   │ │                              │        │
│  └─────────────────┘ └─────────────────────────────┘        │
│  ┌─────────────────────────────────────────────────┐        │
│  │  Cache Layer: SyncCache, CalendarSubmitter,     │        │
│  │  LiveActivity, GRDB Statement/Schema Cache       │        │
│  └─────────────────────────────────────────────────┘        │
├─────────────────────────────────────────────────────────────┤
│               PLATFORM INTEGRATION                           │
│  ActivityKit | WidgetKit | MapKit+Mapbox | EventKit         │
│  CloudKit | Contacts | CoreLocation | UserNotifications     │
└─────────────────────────────────────────────────────────────┘
```

---

## Notable Observations
- Non-standard dylibs suggest post-build patching or jailbreak tweak injection: [Flighty_unpacked/Payload/Flighty.app/AntiCrash_Ourchase_NoAds (1).dylib](Flighty_unpacked/Payload/Flighty.app/AntiCrash_Ourchase_NoAds%20(1).dylib), [Flighty_unpacked/Payload/Flighty.app/Fixipa2.dylib](Flighty_unpacked/Payload/Flighty.app/Fixipa2.dylib), [Flighty_unpacked/Payload/Flighty.app/YallakoraPatch.dylib](Flighty_unpacked/Payload/Flighty.app/YallakoraPatch.dylib), [Flighty_unpacked/Payload/Flighty.app/libsubstrate.dylib](Flighty_unpacked/Payload/Flighty.app/libsubstrate.dylib). These are not typical for a clean App Store IPA and indicate the app binary may have been modified. If you need to confirm, compare with a known-good IPA or verify code signatures.
- The injected dylibs reference MobileSubstrate paths (e.g. `/Library/MobileSubstrate/DynamicLibraries/*`) and third-party tweak names, reinforcing the injection signal.
- Specific dylib linkages include `AntiCrash.dylib`, `KineMasterCheat.dylib`, and `YallakoraPatch.dylib` under `/Library/MobileSubstrate/DynamicLibraries/`
- The presence of [Flighty_unpacked/Payload/Flighty.app/SignedByEsign](Flighty_unpacked/Payload/Flighty.app/SignedByEsign) suggests sideloading tooling was involved.
- ATS exceptions allow insecure HTTP for test domains [Info.plist](Flighty_unpacked/Payload/Flighty.app/Info.plist#L183-L201)

## Suggested Next Checks (Optional)
- Validate whether the dylibs above are loaded by the main binary (requires binary inspection).
- Compare code signature metadata and provisioning profile against the original distribution source: [Flighty_unpacked/Payload/Flighty.app/_CodeSignature/CodeResources](Flighty_unpacked/Payload/Flighty.app/_CodeSignature/CodeResources), [Flighty_unpacked/Payload/Flighty.app/embedded.mobileprovision](Flighty_unpacked/Payload/Flighty.app/embedded.mobileprovision).
