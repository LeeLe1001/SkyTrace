# Flighty Data Layer - Persistence Catalog
# CoreData + GRDB/SQLite dual-stack persistence
# ============================================================================

## CoreData Stack
- Model location: Modules_FlightyCore.bundle/Flighty.momd/
- Model versions: 42 versions (DataModel 2.mom through DataModel 42.mom)
- Persistent store coordinator (referenced in symbols)

### Entities (from compiled CoreData model v42)

#### Flight
- Attributes:
  - flightNumber / fullFlightNumber
  - callsign
  - distanceInKm
  - isArchived / isPassenger / isRandom
  - hasOfficialData
  - calendarEventIdentifier
  - continuationFlightIdentifier
  - divertedFlightIdentifier
  - rawImportSource
- Relationships:
  - user (to-one)
  - airline (to-one)
  - equipment (to-one)
  - departureSchedule / arrivalSchedule (to-one)
  - departureAirport / departureAirportActual / departureAirportScheduled (to-one)
  - arrivalAirport / arrivalAirportActual / arrivalAirportScheduled (to-one)
  - codeshares (to-many)
  - inbound (to-one)
  - flightPlan (to-one)
  - weather (to-one)
  - delayForecast (to-one)
  - appearsIn (to-many, Search)
  - flightDeparture (inverse)
  - flightArrival (inverse)
  - operatingFlights (to-many)

#### Airport
- Attributes: iata, icao, name, city, region, country, countryCode, latitude, longitude, timezoneString, relevance, rawContentType
- Relationships: homeAirportOf (to-many, User)

#### Airline
- Attributes: iata, icao, name, callsign, country, phone, website, facebook, twitter, alliance, isActive, checkInOpeningTime, checkInClosingTime, relevance

#### Schedule
- Attributes: rawKind, rawType, time, terminal, gate, belt, baggageBelt, checkinCounter, runwayConcrete, runwayActual, runwayEstimated, runwayOriginal, gateOriginal, gateActual, gateConcrete, gateEstimated

#### Search
- Attributes: from (string), to (string), flightNumber, isLoading, hadResults, updatedAt

#### User
- Attributes: username
- Relationships: profile (to-one), emails (to-many), tripit (to-one), devices (to-many), subscription (to-one), pushSetting (to-one), emailContacts (to-many)

#### Profile
- Attributes: hoursInAir, numberOfFlights, distanceFlown, homeAirport, imageData (NSData)

#### Device
- Attributes: appVersion, pushToken, remoteId, lastUpdated, rawEnvironment, created, rawLocale

#### Setting (PushSetting?)
- Attributes: rawType, enabled

#### TripIt
- Attributes: token, rawInitialType, created

#### CalendarSetting
- Attributes: rawType

#### Other Entities
- Connection
- Weather
- DelayForecast
- FlightEquipment
- Codeshare
- PartialFlight
- Ticket
- FlightSearchFeedback
- AirlineSearchFeedback
- AirportSearchFeedback
- FlightPlan
- ChangeRecord
- PlanePosition
- UserSubscription
- FlightFeedback
- ForwardingEmail
- UserEmailContact

### Value Transformers
- CLLocationValueTransformer (for latitude/longitude storage)

## GRDB (SQLite) Stack
- Library: GRDB.swift (SourcePackages/checkouts/GRDB.swift)
- Custom queries: full-text search (FTS), complex joins
- Migration table: grdb_migrations
- Key types found:
  - DatabaseQueue
  - DatabasePool
  - DatabaseSnapshot
  - Record (base class)
  - Row, RowCursor
  - Statement, StatementCursor
  - TableDefinition, TableAlteration, ColumnDefinition
  - FetchRequest, QueryInterfaceRequest
  - ValueObservation (reactive database observation)
  - SQLiteDateParser

### GRDB Pattern Usage
- FetchableRecord + Decodable for model mapping
- MutablePersistableRecord for insert/update/save
- TransactionObserver for reactive observation
- ValueObservationScheduler for observation scheduling
- Full-text search via FTS3/FTS4 table definitions

## Cache Layer
- SyncCache (sync warm-up)
- CalendarSubmitterCache
- SharedFlightListCellCache
- RunningLiveActivityCache (JSON file)
- LRUAnimationCache (Lottie)
- CachedImageProvider (Lottie)
- SchemaCache (GRDB)
- StatementCache (GRDB, internal and public)
- DatabaseSchemaCache (GRDB)

## Keychain
- Used by AppCenter for secure storage (MSACKeychainUtil)
- Service names stored with key-value pairs

## SQLite Configuration
- Custom global SQLite configuration
- Maximum database size configuration
- Journal mode management via GRDB
