# AtlasMesh

AtlasMesh is a real-time geospatial visualization platform designed to aggregate, normalize, and display a wide variety of live and historical data sources on a 3D globe. The project is currently in active development.

## Features (Planned & In Progress)

- Real-time aircraft, ship, satellite, and weather data visualization
- Modular data source architecture (aircraft, AIS, cables, earthquakes, launches, lightning, volcanoes, weather, wildfires, and more)
- Interactive 3D globe using CesiumJS
- WebSocket-based live updates
- Extensible UI for entity inspection and filtering
- TypeScript/React frontend, Node.js backend

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

Some data sources (e.g., OpenSky) may require API credentials. Set these in your environment as needed:

```
OPENSKY_USERNAME=your_username
OPENSKY_PASSWORD=your_password
```

## Contributing

Contributions are welcome! Please open issues or pull requests for bugs, features, or suggestions.

## License

TBD (to be determined)

---

_This project is under active development. Features, APIs, and structure may change frequently._
