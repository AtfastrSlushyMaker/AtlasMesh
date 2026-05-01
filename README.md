# AtlasMesh

AtlasMesh is a real-time geospatial visualization platform designed to aggregate, normalize, and display a wide variety of live and historical data sources on a 3D globe. The project is currently in active development.

## Features

- Real-time visualization of aircraft, ships, satellites, weather, earthquakes, volcanoes, wildfires, lightning, launches, submarine cables, and global events
- All entities are shown at once (no grouping/aggregation)
- Occlusion culling: only entities visible from the current camera view are rendered for performance
- Modular data source architecture (easy to add new sources)
- Interactive 3D globe using CesiumJS
- WebSocket-based live updates
- Extensible UI with clear, descriptive labels for all layers and entities
- TypeScript/React frontend, Node.js backend

### Supported & Planned Free Data Sources

- OpenSky Network (aircraft)
- AISStream (ships)
- Celestrak (satellites)
- EONET (global events)
- NASA JPL CNEOS Fireball API (meteor fireballs)
- USGS (earthquakes)
- NOAA (weather, storms)
- NASA FIRMS (wildfires)
- OpenStreetMap (submarine cables)
- LightningMaps.org (lightning)
- Launch Library 2 (space launches)
- MarineTraffic/AIS (ships, if public endpoints available)
- VolcanoDiscovery (volcanoes)
- ...and more (see [awesome-public-datasets](https://github.com/awesomedata/awesome-public-datasets))

## Project Structure

```
AtlasMesh/
├── client/      # Frontend (React, CesiumJS, Vite)
├── server/      # Backend (Node.js, TypeScript)
├── shared/      # Shared types and utilities
└── README.md    # Project documentation
```

## Getting Started

### Prerequisites

- Node.js (v18+ recommended)
- npm or yarn

### Install Dependencies

```
cd client
npm install
cd ../server
npm install
```

### Development

#### Start the Backend

```
cd server
npm run dev
```

#### Start the Frontend

```
cd client
npm run dev
```

The frontend will be available at [http://localhost:5173](http://localhost:5173) (default Vite port).

### Environment Variables

Some data sources (e.g., OpenSky and AISStream) require API credentials. Set these in your environment as needed:

```
OPENSKY_USERNAME=your_username
OPENSKY_PASSWORD=your_password
AISSTREAM_TOKEN=your_aisstream_token
```

## Contributing

Contributions are welcome! Please open issues or pull requests for bugs, features, or suggestions.

## License

TBD (to be determined)

---

_This project is under active development. Features, APIs, and structure may change frequently._

## Recent Improvements

- UI refactored to show all entities at once (no grouping)
- Occlusion culling for better performance (entities on far side of globe are hidden)
- Labels and legends improved for clarity
- Additional free/public data sources integrated (including NASA fireball events)
- README updated with new features and sources
