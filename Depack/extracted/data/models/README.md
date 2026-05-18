# Flighty Data Layer - Models Catalog (Swift Types)
# Non-persistent domain models used in the app
# ============================================================================

## API Response Models (Swift wrappers around Protobuf)
- FlightyAPIFlight
- FlightyAPIDeparture
- FlightyAPIArrival
- FlightyAPIAirport
- FlightyAPIAirline
- FlightyAPICodeshare
- FlightyAPIEquipment
- FlightyAPIDelayStats
- FlightyAPIInboundFlight
- FlightyAPISchedule
- FlightyAPILocation
- FlightyAPIWeather
- FlightyAPIFlightChange
- FlightyAPIBagaggeChangedEvent
- FlightyAPIEquipmentChangedEvent
- FlightyAPIFlightPlanFiledEvent
- FlightyAPIFlightStatusChangedEvent
- FlightyAPIGateChangedEvent
- FlightyAPIScheduleChangedEvent
- FlightyAPIInboundScheduleChangedEvent
- FlightyAPIInboundFlightStatusChangeEvent
- FlightyAPITailNumberChangedEvent

## API Enums
- FlightyAPIFlightStatus
- FlightyAPIFlightPhase
- FlightyAPIScheduleKind
- FlightyAPIScheduleTimeKind
- FlightyAPIStaticAssetKindProto

## API Response Wrappers
- FlightyAPISingleFlightResponse
- FlightyAPIGetStaticAssetsResponse
- FlightyAPIStaticAssetProto

## Internal Models (from strings/symbols)
- ClientChanges / ClientChangesWrapper (sync changes)
- CalendarEvent (calendar integration)
- FlightPoint, FlightActualPosition, PlannedRoute, NearbyPlane (Polaris)

## Module Structure
- ApiModels (separate Swift module for API model types)
  - Includes StorageClass nested types for GRDB persistence
