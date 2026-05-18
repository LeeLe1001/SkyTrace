# Flighty Data Layer - Networking Catalog
# HTTP client, request objects, API router
# ============================================================================

## HTTP Client
- HttpClient
  - Module: flighty-ios/Modules/Sources/HttpClient/HttpClient.swift
  - HeadersConfiguration (HttpClient.HeadersConfiguration)
  - Errors: HttpClientErrors
  - Methods: sendAsyncRequest(request:), log(request:response:)

## Request Factory
- NetworkRequestFactory
  - Module: flighty-ios/Modules/Sources/FlightyCore/Networking/NetworkRequestFactory.swift
  - Methods: init(environment:httpClient:)
  - Flight search: byNumber(_:on:via:in:requestBuilder:), byRoute(_:on:via:in:requestBuilder:)

## Request Objects (Request-per-Endpoint)
- HTTPRequest (base)
  - request(method:path:queryItems:body:then:)
  - requestDateFormatter
- SearchRequest
  - (flight search by number/route)
- SubscribeToFlightRequest
  - (subscribe to a flight for tracking)
- SubscribeToRandomFlightRequest
  - (subscribe to random flight)
- RegisterDeviceRequest
  - (device token registration for push)
- UploadReceiptRequest
  - (IAP receipt validation)
- FlightSyncPollingRequest
  - (poll for flight sync updates)
- YearInReviewSeenRequest
  - (mark year in review as seen)
- AttributionRequest
  - (attribution data submission)
- StatelessHTTPRequest
- MockableUserRequest / UserRequest

## API Client
- AnalyticsClient
  - Sends to: https://api.flightyapp.com/analytics
  - Tracking: Network Request Finished events
- LiveActivityApiClient
  - Handles: StartLiveActivityRequest
- RetailNetworkRequestFactory
  - (App Store / retail build variant)

## Environment / API Domains
### Production
- REST API: https://api.flightyapp.com
- Analytics: https://api.flightyapp.com/analytics
- Reachability: https://api.flightyapp.com/reachability_detection
- Live Updates: https://live.flighty.app/

### Beta
- https://api-beta.flightyapp.com

### Test
- http://api.tst.flightyapp.com (HTTP enabled via ATS exception)
- http://api.tst.flightyapp.com/analytics

### Third-Party
- Mapbox: mapbox://styles/flightyapp/*
- AppCenter: https://in.appcenter.ms
- Amplitude: https://api2.amplitude.com/ | https://api.eu.amplitude.com/
- AppStore: https://apps.apple.com/app/apple-store/id1358823008

## Networking Stack Layers (Inferred)
1. Request objects (type-safe request definitions)
2. HTTPClient (generic HTTP layer)
3. NetworkRequestFactory (combines environment + httpClient)
4. API-specific clients (AnalyticsClient, LiveActivityApiClient)
5. Higher-level services consuming the network layer

## Protobuf
- Wire format: Protocol Buffers
- Type URLs: type.googleapis.com (standard Any type prefix)
- Runtime reflection: Google Protobuf descriptor types present
