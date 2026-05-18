# Flighty Data Layer - API Models Catalog (Protobuf-based)
# Recovered from binary strings (com.flighty.proto.*), binary symbols (FlightyAPI*)
# ============================================================================

## Proto Package: com.flighty.proto.api (Production API)

### Core Flight Model
- Flight
  - number (string)
  - departureSchedule / arrivalSchedule (Schedule)
  - departureAirport / arrivalAirport (Airport)
  - departureAirportActual / arrivalAirportActual (Airport)
  - departureAirportScheduled / arrivalAirportScheduled (Airport)
  - airline / operatingAirline (Airline)
  - equipment (Equipment)
  - codeshares (repeated Codeshare)
  - inbound (InboundFlight)
  - flightPlan (FlightPlan)
  - weather (Weather)
  - delayForecast (DelayForecast)
  - appearsIn (repeated Search)
  - isArchived / isRandom / isPassenger (bool)
  - distanceInKm (double)
  - fullFlightNumber / callsign (string)
  - calendarEventIdentifier (string)
  - continuationFlightIdentifier / divertedFlightIdentifier (string)
  - rawImportSource (string)
  - hasOfficialData (bool)
  - user (relationship)

### Airport
- iata / icao (string)
- name / city / region / country / countryCode (string)
- latitude / longitude (double)
- timezoneString (string)
- relevance (int?)

### Airline
- iata / icao (string)
- name (string)
- callsign (string)
- country (string)
- phone / website / facebook / twitter (string)
- alliance (string)
- isActive (bool)
- checkInOpeningTime / checkInClosingTime (time)
- relevance (int?)

### Schedule
- rawKind (enum: ScheduleKind)
- rawType (enum: ScheduleTimeKind)
- time (timestamp)
- terminal / gate / belt (string)
- baggageBelt (string)
- checkinCounter (string)
- runwayConcrete / runwayActual / runwayEstimated / runwayOriginal (string)

### Location
- latitude / longitude (double)
- altitudeInFt (double)
- speedInMph (double)
- directionInDeg (double)
- rawStatus (string)

### Equipment
- modelName (string)
- tailNumber (string)

### Weather
- conditionIdentifier (string)
- rawTemperature (double?)
- schedule (timestamp)
- parentRemoteId (string)
- isNight (bool)

### DelayForecast
- onTime / early (int)
- late15 / late30 / late45 (int)
- canceled / diverted (int)
- numberOfObservations (int)
- averageDelay (double)

### Codeshare
- rawType? (string)
- number? (string)

### InboundFlight
- (references Flight fields)

### FlightPlan
- (references partial flight plan data)

### Events (flight status change events)
- FlightChange
- BagaggeChangedEvent
- EquipmentChangedEvent
- FlightPlanFiledEvent
- FlightStatusChangedEvent
- GateChangedEvent
- ScheduleChangedEvent
- InboundScheduleChangedEvent
- InboundFlightStatusChangeEvent
- TailNumberChangedEvent

### Response Wrappers
- SingleFlightResponse
  - flight (Flight)
- GetStaticAssetsResponse
  - assets (repeated StaticAssetProto)

### Static Assets
- StaticAssetProto
  - kind (StaticAssetKindProto enum)
  - (asset data fields)

### Misc
- FlightStatus (enum)
- FlightPhase (enum)
- ScheduleKind (enum)
- ScheduleTimeKind (enum)
- StartLiveActivityRequest

## Proto Package: com.flighty.proto.polaris (Polaris - Live/Nearby Planes)

### Polaris-specific
- PolarisPosition
- PolarisPositions (repeated PolarisPosition)
- PlanePosition
- FlightLiveActivity
- Ticket

## Additional Proto Types (low-level GPS/flight tracking)
- Position
- FlightPoint
- FlightActualPosition
- PlannedRoute
- FlightPollSync
- NearbyPlane

## Google Protobuf Descriptor Types (reflection support)
- google.protobuf.FileDescriptorProto
- google.protobuf.DescriptorProto
- google.protobuf.FieldDescriptorProto
- google.protobuf.EnumDescriptorProto
- google.protobuf.EnumValueDescriptorProto
- google.protobuf.OneofDescriptorProto
- google.protobuf.ServiceDescriptorProto
- google.protobuf.MethodDescriptorProto

## Note on Storage Types
- FlightyAPIFlight.StorageClass (GRDB persistence wrapper)
- FlightyAPIArrival.StorageClass
- FlightyAPIDeparture.StorageClass
- FlightyAPIInboundFlight.StorageClass
