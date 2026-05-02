# Graph Report - .  (2026-05-02)

## Corpus Check
- Corpus is ~13,837 words - fits in a single context window. You may not need a graph.

## Summary
- 268 nodes · 211 edges · 87 communities detected
- Extraction: 84% EXTRACTED · 16% INFERRED · 0% AMBIGUOUS · INFERRED: 34 edges (avg confidence: 0.77)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Core Application Architecture|Core Application Architecture]]
- [[_COMMUNITY_Geospatial Entity Layers|Geospatial Entity Layers]]
- [[_COMMUNITY_Layer Management & State|Layer Management & State]]
- [[_COMMUNITY_Weather & Wildfire Sources|Weather & Wildfire Sources]]
- [[_COMMUNITY_Transport Tracking Sources|Transport Tracking Sources]]
- [[_COMMUNITY_EONET Event Mapping|EONET Event Mapping]]
- [[_COMMUNITY_Space Data Sources|Space Data Sources]]
- [[_COMMUNITY_Seismic & Volcanic Sources|Seismic & Volcanic Sources]]
- [[_COMMUNITY_Entity Store Service|Entity Store Service]]
- [[_COMMUNITY_Cesium Rendering Engine|Cesium Rendering Engine]]
- [[_COMMUNITY_Satellite Data Adapter|Satellite Data Adapter]]
- [[_COMMUNITY_AIS Data Adapter|AIS Data Adapter]]
- [[_COMMUNITY_Cable Data Adapter|Cable Data Adapter]]
- [[_COMMUNITY_Events Data Adapter|Events Data Adapter]]
- [[_COMMUNITY_Volcano Data Adapter|Volcano Data Adapter]]
- [[_COMMUNITY_Cable Source Adapter|Cable Source Adapter]]
- [[_COMMUNITY_Wildfire Data Adapter|Wildfire Data Adapter]]
- [[_COMMUNITY_Weather Data Adapter|Weather Data Adapter]]
- [[_COMMUNITY_Aircraft Data Adapter|Aircraft Data Adapter]]
- [[_COMMUNITY_Earthquake Data Adapter|Earthquake Data Adapter]]
- [[_COMMUNITY_Lightning Data Adapter|Lightning Data Adapter]]
- [[_COMMUNITY_Launch Data Adapter|Launch Data Adapter]]
- [[_COMMUNITY_Fireball Data Adapter|Fireball Data Adapter]]
- [[_COMMUNITY_Server Index Handler|Server Index Handler]]
- [[_COMMUNITY_App UI Controls|App UI Controls]]
- [[_COMMUNITY_WebSocket Hook|WebSocket Hook]]
- [[_COMMUNITY_Ship AIS Delegation|Ship AIS Delegation]]
- [[_COMMUNITY_Procedural Lightning|Procedural Lightning]]
- [[_COMMUNITY_Fireball API|Fireball API]]
- [[_COMMUNITY_React App Root|React App Root]]
- [[_COMMUNITY_Entity Info Panel|Entity Info Panel]]
- [[_COMMUNITY_Icon Utilities|Icon Utilities]]
- [[_COMMUNITY_Volcano Layer UI|Volcano Layer UI]]
- [[_COMMUNITY_Wildfire Layer UI|Wildfire Layer UI]]
- [[_COMMUNITY_Event Layer UI|Event Layer UI]]
- [[_COMMUNITY_Aircraft Layer UI|Aircraft Layer UI]]
- [[_COMMUNITY_Earthquake Layer UI|Earthquake Layer UI]]
- [[_COMMUNITY_Weather Layer UI|Weather Layer UI]]
- [[_COMMUNITY_Launch Layer UI|Launch Layer UI]]
- [[_COMMUNITY_Layer Manager UI|Layer Manager UI]]
- [[_COMMUNITY_Lightning Layer UI|Lightning Layer UI]]
- [[_COMMUNITY_Cable Layer UI|Cable Layer UI]]
- [[_COMMUNITY_Satellite Layer UI|Satellite Layer UI]]
- [[_COMMUNITY_useEntityLayer Hook|useEntityLayer Hook]]
- [[_COMMUNITY_Ship Layer UI|Ship Layer UI]]
- [[_COMMUNITY_Ship Source|Ship Source]]
- [[_COMMUNITY_Shared Entity Types|Shared Entity Types]]
- [[_COMMUNITY_Shared Entity JS|Shared Entity JS]]
- [[_COMMUNITY_Vite Config|Vite Config]]
- [[_COMMUNITY_Main Entry|Main Entry]]
- [[_COMMUNITY_Events JS Source|Events JS Source]]
- [[_COMMUNITY_Events TS Source|Events TS Source]]
- [[_COMMUNITY_Volcanoes TS Source|Volcanoes TS Source]]
- [[_COMMUNITY_Volcanoes JS Source|Volcanoes JS Source]]
- [[_COMMUNITY_Satellites JS Source|Satellites JS Source]]
- [[_COMMUNITY_Satellites TS Source|Satellites TS Source]]
- [[_COMMUNITY_Cables TS Source|Cables TS Source]]
- [[_COMMUNITY_Cables JS Source|Cables JS Source]]
- [[_COMMUNITY_Wildfires TS Source|Wildfires TS Source]]
- [[_COMMUNITY_Wildfires JS Source|Wildfires JS Source]]
- [[_COMMUNITY_Weather JS Source|Weather JS Source]]
- [[_COMMUNITY_Weather TS Source|Weather TS Source]]
- [[_COMMUNITY_AIS JS Source|AIS JS Source]]
- [[_COMMUNITY_Aircraft TS Source|Aircraft TS Source]]
- [[_COMMUNITY_Aircraft JS Source|Aircraft JS Source]]
- [[_COMMUNITY_Earthquakes TS Source|Earthquakes TS Source]]
- [[_COMMUNITY_Earthquakes JS Source|Earthquakes JS Source]]
- [[_COMMUNITY_Lightning TS Source|Lightning TS Source]]
- [[_COMMUNITY_Lightning JS Source|Lightning JS Source]]
- [[_COMMUNITY_Launches TS Source|Launches TS Source]]
- [[_COMMUNITY_Launches JS Source|Launches JS Source]]
- [[_COMMUNITY_Fireballs TS Source|Fireballs TS Source]]
- [[_COMMUNITY_Events Poll Options|Events Poll Options]]
- [[_COMMUNITY_Volcano Poll Options|Volcano Poll Options]]
- [[_COMMUNITY_Satellite Poll Options|Satellite Poll Options]]
- [[_COMMUNITY_Cable Poll Options|Cable Poll Options]]
- [[_COMMUNITY_Wildfire Poll Options|Wildfire Poll Options]]
- [[_COMMUNITY_Weather Poll Options|Weather Poll Options]]
- [[_COMMUNITY_AIS Options|AIS Options]]
- [[_COMMUNITY_Aircraft Poll Options|Aircraft Poll Options]]
- [[_COMMUNITY_Earthquake Poll Options|Earthquake Poll Options]]
- [[_COMMUNITY_Lightning Poll Options|Lightning Poll Options]]
- [[_COMMUNITY_Launch Poll Options|Launch Poll Options]]
- [[_COMMUNITY_Fireball Poll Options|Fireball Poll Options]]
- [[_COMMUNITY_Fireball API Response|Fireball API Response]]
- [[_COMMUNITY_Wildfire Poll Options|Wildfire Poll Options]]
- [[_COMMUNITY_Project README|Project README]]

## God Nodes (most connected - your core abstractions)
1. `CesiumApp` - 11 edges
2. `Common Entity Position Schema` - 11 edges
3. `useEntityLayer` - 9 edges
4. `startEventsSource` - 8 edges
5. `startEventsSource` - 7 edges
6. `EntityStore` - 7 edges
7. `Entity` - 7 edges
8. `EntityStore` - 6 edges
9. `LightningLayer` - 6 edges
10. `SatelliteLayer` - 5 edges

## Surprising Connections (you probably didn't know these)
- `All Entities Visible Rationale` --rationale_for--> `CesiumApp`  [INFERRED]
  README.md → client/src/cesium/CesiumApp.tsx
- `Modular Sources Rationale` --rationale_for--> `startWildfiresSource`  [INFERRED]
  README.md → server/sources/wildfires.ts
- `Modular Sources Rationale` --rationale_for--> `createSourceHandler`  [INFERRED]
  README.md → server/src/index.ts
- `Occlusion Culling Rationale` --rationale_for--> `Occlusion Culling`  [INFERRED]
  README.md → client/src/cesium/CesiumApp.tsx
- `EntityInfoPanel` --references--> `Entity`  [INFERRED]
  client/src/ui/EntityInfoPanel.tsx → shared/entity.ts

## Hyperedges (group relationships)
- **Polling Source Pattern** — events_ts_startEventsSource, volcanoes_ts_startVolcanoSource, satellites_ts_startSatellitesSource, cables_ts_startSubmarineCableSource, wildfires_ts_startWildfiresSource, weather_ts_startWeatherSource, aircraft_ts_startAircraftSource, earthquakes_ts_startEarthquakesSource, launches_ts_startLaunchesSource, fireballs_ts_startFireballsSource [INFERRED 0.80]
- **Transport Tracking Sources** — aircraft_ts_startAircraftSource, ais_ts_startAISSource, ships_ts [INFERRED 0.75]
- **NASA Earth Science Sources** — events_ts_startEventsSource, wildfires_ts_startWildfiresSource, fireballs_ts_startFireballsSource [INFERRED 0.82]
- **Entity Visual Identity System** — EntityInfoPanel_TYPE_COLORS, EntityInfoPanel_TYPE_LABELS, icons_Icons, AppUI_AppUI [INFERRED 0.85]
- **Server Update Pipeline** — index_createSourceHandler, store_EntityStore, index_broadcastDiff [INFERRED 0.85]
- **WebSocket Sync Architecture** — useWebSocket_useWebSocket, index_broadcastDiff, CesiumApp_CesiumApp [INFERRED 0.75]
- **Entity Layer Pattern** — volcano_layer_volcano_layer, wildfire_layer_wildfire_layer, event_layer_event_layer, aircraft_layer_aircraft_layer, earthquake_layer_earthquake_layer, weather_layer_weather_layer, launch_layer_launch_layer, lightning_layer_lightning_layer, cable_layer_cable_layer, satellite_layer_satellite_layer, ship_layer_ship_layer, use_entity_layer_use_entity_layer [INFERRED 0.85]
- **Geometric Visualization Layers** — earthquake_layer_earthquake_layer, weather_layer_weather_layer, cable_layer_cable_layer [INFERRED 0.80]
- **Imperative State Management Extensions** — lightning_layer_lightning_layer, satellite_layer_satellite_layer, use_entity_layer_use_entity_layer [INFERRED 0.75]

## Communities

### Community 0 - "Core Application Architecture"
Cohesion: 0.12
Nodes (26): AppUI, App, CesiumApp, Occlusion Culling, EntityInfoPanel, TYPE_COLORS, TYPE_LABELS, All Entities Visible Rationale (+18 more)

### Community 1 - "Geospatial Entity Layers"
Cohesion: 0.1
Nodes (22): AircraftLayer, Aircraft Callsign Metadata, CableLayer, Cable Path Metadata, Cable Polyline Path, Common Entity Position Schema, EarthquakeLayer, Earthquake Magnitude Metadata (+14 more)

### Community 2 - "Layer Management & State"
Cohesion: 0.11
Nodes (20): LayerManager, Lightning Active Strikes Ref, Lightning Fade Interval, Lightning Fade Rationale, LightningLayer, Satellite Clock-Driven Update Rationale, Satellite Orbit Propagation, Satellite Records Ref (+12 more)

### Community 3 - "Weather & Wildfire Sources"
Cohesion: 0.17
Nodes (13): HOTSPOTS, Procedural lightning based on known thunderstorm hotspots, startLightningSource, NASA FIRMS VIIRS API, Open-Meteo API, WEATHER_GRID, startWeatherSource, WEATHER_GRID (+5 more)

### Community 4 - "Transport Tracking Sources"
Cohesion: 0.15
Nodes (13): fetchWithRetry, Increased polling interval to avoid 429, startAircraftSource, fetchWithRetry, Increased polling interval to avoid 429, startAircraftSource, startAISSource, toNumber (+5 more)

### Community 5 - "EONET Event Mapping"
Cohesion: 0.31
Nodes (10): NASA EONET API, Map EONET categories to specific layer types to avoid cluttering Events, startEventsSource, Map EONET categories to specific layer types to avoid cluttering Events, startEventsSource, Earthquake Layer Type, Event Layer Type, Volcano Layer Type (+2 more)

### Community 6 - "Space Data Sources"
Cohesion: 0.22
Nodes (9): Celestrak TLE API, startLaunchesSource, startLaunchesSource, startSatellitesSource, FALLBACK_TLES, emitFallbackSatellites, Fallback TLE set for when Celestrak API fails, startSatellitesSource (+1 more)

### Community 7 - "Seismic & Volcanic Sources"
Cohesion: 0.25
Nodes (8): startEarthquakesSource, startEarthquakesSource, USGS Earthquake Feed API, USGS Volcano Hazards API, No mock data fallback rationale, startVolcanoSource, No mock data fallback rationale, startVolcanoSource

### Community 8 - "Entity Store Service"
Cohesion: 0.29
Nodes (1): EntityStore

### Community 9 - "Cesium Rendering Engine"
Cohesion: 0.4
Nodes (2): applyCulling(), isEntityVisibleFromCamera()

### Community 10 - "Satellite Data Adapter"
Cohesion: 0.5
Nodes (1): startSatellitesSource()

### Community 11 - "AIS Data Adapter"
Cohesion: 0.67
Nodes (2): startAISSource(), toNumber()

### Community 12 - "Cable Data Adapter"
Cohesion: 0.5
Nodes (4): startSubmarineCableSource, startSubmarineCableSource, Static infrastructure data fetched daily, TeleGeography Submarine Cable API

### Community 13 - "Events Data Adapter"
Cohesion: 0.67
Nodes (1): startEventsSource()

### Community 14 - "Volcano Data Adapter"
Cohesion: 0.67
Nodes (1): startVolcanoSource()

### Community 15 - "Cable Source Adapter"
Cohesion: 0.67
Nodes (1): startSubmarineCableSource()

### Community 16 - "Wildfire Data Adapter"
Cohesion: 0.67
Nodes (1): startWildfiresSource()

### Community 17 - "Weather Data Adapter"
Cohesion: 0.67
Nodes (1): startWeatherSource()

### Community 18 - "Aircraft Data Adapter"
Cohesion: 0.67
Nodes (1): startAircraftSource()

### Community 19 - "Earthquake Data Adapter"
Cohesion: 0.67
Nodes (1): startEarthquakesSource()

### Community 20 - "Lightning Data Adapter"
Cohesion: 0.67
Nodes (1): startLightningSource()

### Community 21 - "Launch Data Adapter"
Cohesion: 0.67
Nodes (1): startLaunchesSource()

### Community 22 - "Fireball Data Adapter"
Cohesion: 0.67
Nodes (0): 

### Community 23 - "Server Index Handler"
Cohesion: 0.67
Nodes (0): 

### Community 24 - "App UI Controls"
Cohesion: 0.67
Nodes (0): 

### Community 25 - "WebSocket Hook"
Cohesion: 0.67
Nodes (0): 

### Community 26 - "Ship AIS Delegation"
Cohesion: 0.67
Nodes (3): AIS Source (TS), Ships Source (TS), Ships source delegated to AIS adapter

### Community 27 - "Procedural Lightning"
Cohesion: 0.67
Nodes (3): HOTSPOTS, Procedural lightning based on known thunderstorm hotspots, startLightningSource

### Community 28 - "Fireball API"
Cohesion: 0.67
Nodes (3): startFireballsSource, toSignedCoordinate, NASA JPL CNEOS Fireball API

### Community 29 - "React App Root"
Cohesion: 1.0
Nodes (0): 

### Community 30 - "Entity Info Panel"
Cohesion: 1.0
Nodes (0): 

### Community 31 - "Icon Utilities"
Cohesion: 1.0
Nodes (0): 

### Community 32 - "Volcano Layer UI"
Cohesion: 1.0
Nodes (0): 

### Community 33 - "Wildfire Layer UI"
Cohesion: 1.0
Nodes (0): 

### Community 34 - "Event Layer UI"
Cohesion: 1.0
Nodes (0): 

### Community 35 - "Aircraft Layer UI"
Cohesion: 1.0
Nodes (0): 

### Community 36 - "Earthquake Layer UI"
Cohesion: 1.0
Nodes (0): 

### Community 37 - "Weather Layer UI"
Cohesion: 1.0
Nodes (0): 

### Community 38 - "Launch Layer UI"
Cohesion: 1.0
Nodes (0): 

### Community 39 - "Layer Manager UI"
Cohesion: 1.0
Nodes (0): 

### Community 40 - "Lightning Layer UI"
Cohesion: 1.0
Nodes (0): 

### Community 41 - "Cable Layer UI"
Cohesion: 1.0
Nodes (0): 

### Community 42 - "Satellite Layer UI"
Cohesion: 1.0
Nodes (0): 

### Community 43 - "useEntityLayer Hook"
Cohesion: 1.0
Nodes (0): 

### Community 44 - "Ship Layer UI"
Cohesion: 1.0
Nodes (0): 

### Community 45 - "Ship Source"
Cohesion: 1.0
Nodes (0): 

### Community 46 - "Shared Entity Types"
Cohesion: 1.0
Nodes (0): 

### Community 47 - "Shared Entity JS"
Cohesion: 1.0
Nodes (0): 

### Community 48 - "Vite Config"
Cohesion: 1.0
Nodes (0): 

### Community 49 - "Main Entry"
Cohesion: 1.0
Nodes (0): 

### Community 50 - "Events JS Source"
Cohesion: 1.0
Nodes (1): Events Source (JS)

### Community 51 - "Events TS Source"
Cohesion: 1.0
Nodes (1): Events Source (TS)

### Community 52 - "Volcanoes TS Source"
Cohesion: 1.0
Nodes (1): Volcanoes Source (TS)

### Community 53 - "Volcanoes JS Source"
Cohesion: 1.0
Nodes (1): Volcanoes Source (JS)

### Community 54 - "Satellites JS Source"
Cohesion: 1.0
Nodes (1): Satellites Source (JS)

### Community 55 - "Satellites TS Source"
Cohesion: 1.0
Nodes (1): Satellites Source (TS)

### Community 56 - "Cables TS Source"
Cohesion: 1.0
Nodes (1): Submarine Cables Source (TS)

### Community 57 - "Cables JS Source"
Cohesion: 1.0
Nodes (1): Submarine Cables Source (JS)

### Community 58 - "Wildfires TS Source"
Cohesion: 1.0
Nodes (1): Wildfires Source (TS)

### Community 59 - "Wildfires JS Source"
Cohesion: 1.0
Nodes (1): Wildfires Source (JS)

### Community 60 - "Weather JS Source"
Cohesion: 1.0
Nodes (1): Weather Source (JS)

### Community 61 - "Weather TS Source"
Cohesion: 1.0
Nodes (1): Weather Source (TS)

### Community 62 - "AIS JS Source"
Cohesion: 1.0
Nodes (1): AIS Source (JS)

### Community 63 - "Aircraft TS Source"
Cohesion: 1.0
Nodes (1): Aircraft Source (TS)

### Community 64 - "Aircraft JS Source"
Cohesion: 1.0
Nodes (1): Aircraft Source (JS)

### Community 65 - "Earthquakes TS Source"
Cohesion: 1.0
Nodes (1): Earthquakes Source (TS)

### Community 66 - "Earthquakes JS Source"
Cohesion: 1.0
Nodes (1): Earthquakes Source (JS)

### Community 67 - "Lightning TS Source"
Cohesion: 1.0
Nodes (1): Lightning Source (TS)

### Community 68 - "Lightning JS Source"
Cohesion: 1.0
Nodes (1): Lightning Source (JS)

### Community 69 - "Launches TS Source"
Cohesion: 1.0
Nodes (1): Launches Source (TS)

### Community 70 - "Launches JS Source"
Cohesion: 1.0
Nodes (1): Launches Source (JS)

### Community 71 - "Fireballs TS Source"
Cohesion: 1.0
Nodes (1): Fireballs Source (TS)

### Community 72 - "Events Poll Options"
Cohesion: 1.0
Nodes (1): EventsPollOptions

### Community 73 - "Volcano Poll Options"
Cohesion: 1.0
Nodes (1): VolcanoPollOptions

### Community 74 - "Satellite Poll Options"
Cohesion: 1.0
Nodes (1): SatellitePollOptions

### Community 75 - "Cable Poll Options"
Cohesion: 1.0
Nodes (1): SubmarineCablePollOptions

### Community 76 - "Wildfire Poll Options"
Cohesion: 1.0
Nodes (1): WildfiresPollOptions

### Community 77 - "Weather Poll Options"
Cohesion: 1.0
Nodes (1): WeatherPollOptions

### Community 78 - "AIS Options"
Cohesion: 1.0
Nodes (1): AISOptions

### Community 79 - "Aircraft Poll Options"
Cohesion: 1.0
Nodes (1): AircraftPollOptions

### Community 80 - "Earthquake Poll Options"
Cohesion: 1.0
Nodes (1): EarthquakesPollOptions

### Community 81 - "Lightning Poll Options"
Cohesion: 1.0
Nodes (1): LightningPollOptions

### Community 82 - "Launch Poll Options"
Cohesion: 1.0
Nodes (1): LaunchesPollOptions

### Community 83 - "Fireball Poll Options"
Cohesion: 1.0
Nodes (1): FireballsPollOptions

### Community 84 - "Fireball API Response"
Cohesion: 1.0
Nodes (1): FireballApiResponse

### Community 85 - "Wildfire Poll Options"
Cohesion: 1.0
Nodes (1): WildfiresPollOptions

### Community 86 - "Project README"
Cohesion: 1.0
Nodes (1): AtlasMesh

## Knowledge Gaps
- **93 isolated node(s):** `Events Source (JS)`, `Events Source (TS)`, `Volcanoes Source (TS)`, `Volcanoes Source (JS)`, `Satellites Source (JS)` (+88 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `React App Root`** (2 nodes): `App()`, `App.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Entity Info Panel`** (2 nodes): `EntityInfoPanel.tsx`, `formatValue()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Icon Utilities`** (2 nodes): `icons.ts`, `createIcon()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Volcano Layer UI`** (2 nodes): `VolcanoLayer.tsx`, `VolcanoLayer()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Wildfire Layer UI`** (2 nodes): `WildfireLayer.tsx`, `WildfireLayer()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Event Layer UI`** (2 nodes): `EventLayer.tsx`, `EventLayer()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Aircraft Layer UI`** (2 nodes): `AircraftLayer()`, `AircraftLayer.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Earthquake Layer UI`** (2 nodes): `EarthquakeLayer.tsx`, `EarthquakeLayer()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Weather Layer UI`** (2 nodes): `WeatherLayer.tsx`, `WeatherLayer()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Launch Layer UI`** (2 nodes): `LaunchLayer.tsx`, `LaunchLayer()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Layer Manager UI`** (2 nodes): `LayerManager.tsx`, `LayerManager()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Lightning Layer UI`** (2 nodes): `LightningLayer.tsx`, `LightningLayer()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cable Layer UI`** (2 nodes): `CableLayer()`, `CableLayer.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Satellite Layer UI`** (2 nodes): `SatelliteLayer.tsx`, `SatelliteLayer()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `useEntityLayer Hook`** (2 nodes): `useEntityLayer.ts`, `useEntityLayer()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Ship Layer UI`** (2 nodes): `ShipLayer.tsx`, `ShipLayer()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Ship Source`** (1 nodes): `ships.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Shared Entity Types`** (1 nodes): `entity.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Shared Entity JS`** (1 nodes): `entity.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Vite Config`** (1 nodes): `vite.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Main Entry`** (1 nodes): `main.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Events JS Source`** (1 nodes): `Events Source (JS)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Events TS Source`** (1 nodes): `Events Source (TS)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Volcanoes TS Source`** (1 nodes): `Volcanoes Source (TS)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Volcanoes JS Source`** (1 nodes): `Volcanoes Source (JS)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Satellites JS Source`** (1 nodes): `Satellites Source (JS)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Satellites TS Source`** (1 nodes): `Satellites Source (TS)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cables TS Source`** (1 nodes): `Submarine Cables Source (TS)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cables JS Source`** (1 nodes): `Submarine Cables Source (JS)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Wildfires TS Source`** (1 nodes): `Wildfires Source (TS)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Wildfires JS Source`** (1 nodes): `Wildfires Source (JS)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Weather JS Source`** (1 nodes): `Weather Source (JS)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Weather TS Source`** (1 nodes): `Weather Source (TS)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `AIS JS Source`** (1 nodes): `AIS Source (JS)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Aircraft TS Source`** (1 nodes): `Aircraft Source (TS)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Aircraft JS Source`** (1 nodes): `Aircraft Source (JS)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Earthquakes TS Source`** (1 nodes): `Earthquakes Source (TS)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Earthquakes JS Source`** (1 nodes): `Earthquakes Source (JS)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Lightning TS Source`** (1 nodes): `Lightning Source (TS)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Lightning JS Source`** (1 nodes): `Lightning Source (JS)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Launches TS Source`** (1 nodes): `Launches Source (TS)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Launches JS Source`** (1 nodes): `Launches Source (JS)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Fireballs TS Source`** (1 nodes): `Fireballs Source (TS)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Events Poll Options`** (1 nodes): `EventsPollOptions`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Volcano Poll Options`** (1 nodes): `VolcanoPollOptions`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Satellite Poll Options`** (1 nodes): `SatellitePollOptions`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cable Poll Options`** (1 nodes): `SubmarineCablePollOptions`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Wildfire Poll Options`** (1 nodes): `WildfiresPollOptions`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Weather Poll Options`** (1 nodes): `WeatherPollOptions`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `AIS Options`** (1 nodes): `AISOptions`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Aircraft Poll Options`** (1 nodes): `AircraftPollOptions`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Earthquake Poll Options`** (1 nodes): `EarthquakesPollOptions`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Lightning Poll Options`** (1 nodes): `LightningPollOptions`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Launch Poll Options`** (1 nodes): `LaunchesPollOptions`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Fireball Poll Options`** (1 nodes): `FireballsPollOptions`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Fireball API Response`** (1 nodes): `FireballApiResponse`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Wildfire Poll Options`** (1 nodes): `WildfiresPollOptions`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Project README`** (1 nodes): `AtlasMesh`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Common Entity Position Schema` connect `Geospatial Entity Layers` to `Layer Management & State`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **Why does `SatelliteLayer` connect `Layer Management & State` to `Geospatial Entity Layers`?**
  _High betweenness centrality (0.007) - this node is a cross-community bridge._
- **Are the 6 inferred relationships involving `CesiumApp` (e.g. with `EntityStore` and `subscribeToEntityUpdates`) actually correct?**
  _`CesiumApp` has 6 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `useEntityLayer` (e.g. with `LightningLayer` and `SatelliteLayer`) actually correct?**
  _`useEntityLayer` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Events Source (JS)`, `Events Source (TS)`, `Volcanoes Source (TS)` to the rest of the system?**
  _93 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Core Application Architecture` be split into smaller, more focused modules?**
  _Cohesion score 0.12 - nodes in this community are weakly interconnected._
- **Should `Geospatial Entity Layers` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._