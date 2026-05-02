# AtlasMesh

Real-time geospatial visualization platform aggregating live and historical data on a 3D globe.

**[atlasmesh.onrender.com](https://atlasmesh.onrender.com)**

## Features

- **Real-time 3D globe** with aircraft, ships, satellites, earthquakes, volcanoes, wildfires, weather, launches, submarine cables, fireballs, and more
- **17 data sources** — OpenSky, AISStream, Celestrak, USGS, NASA FIRMS/EONET/JPL, Open-Meteo, TeleGeography, PeeringDB, WRI, and others
- **Occlusion culling** for performance with thousands of entities
- **Custom cluster icons** per layer type (Starlink logo, satellite icon, etc.)
- **Real-time movement interpolation** for aircraft and ships using velocity/heading
- **Fuzzy search** across all entities with ⌘K shortcut
- **GPS geolocation** button to find your position on the globe
- **WebSocket-based live updates** with connection health monitoring
- **Dark theme** with glassmorphism UI, OLED-optimized

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite |
| 3D Engine | CesiumJS |
| Styling | Tailwind CSS v4, CSS custom properties |
| Backend | Node.js, Express, TypeScript |
| Realtime | WebSocket (ws) with ping/pong |
| Shared | TypeScript entity types (npm workspaces) |

## Getting Started

```bash
# Install all workspaces
npm install

# Start backend (port 3000)
npm run start:server

# Start frontend (port 5173)
npm run start:client
```

### Environment Variables

```bash
OPENSKY_USERNAME=your_username
OPENSKY_PASSWORD=your_password
AISSTREAM_TOKEN=your_aisstream_token
```

## Deployment

```bash
# Build both server and client
npm run build

# Start production server (serves client from dist/)
npm start
```

See `render.yaml` for Render deployment config.

## Project Structure

```
AtlasMesh/
├── client/          # React + CesiumJS + Vite
│   └── src/
│       ├── components/layers/   # Cesium entity layers
│       ├── hooks/               # WebSocket, search, keyboard
│       ├── ui/                  # AppUI, EntityInfoPanel, Logo, Toast
│       ├── cesium/              # Cesium viewer init + culling
│       └── styles/              # Design system CSS
├── server/          # Express + WebSocket
│   ├── src/index.ts             # Server entry with graceful shutdown
│   ├── services/store.ts        # Entity store with O(n) diffing
│   └── sources/                 # Data source adapters
├── shared/          # Shared TypeScript types
└── render.yaml      # Render deployment config
```

## Data Sources

| Source | Type | API |
|--------|------|-----|
| OpenSky Network | Aircraft | REST |
| AISStream | Ships | WebSocket |
| Celestrak | Satellites, Starlink | TLE |
| Space Devs | Launches | REST |
| NASA EONET | Global Events | REST |
| USGS | Earthquakes, Volcanoes | REST |
| Open-Meteo | Weather | REST |
| NASA FIRMS | Wildfires | REST |
| TeleGeography | Submarine Cables | REST |
| NASA JPL CNEOS | Fireballs | REST |
| WRI | Power Plants | REST |
| NASA | Meteorites | REST |
| Open Renewables | Wind Farms | REST |
| PeeringDB | Internet Exchanges | REST |
| wheretheiss.at | ISS | REST |

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `?` | Show/hide shortcuts |
| `⌘K` | Focus search |
| `R` | Reset camera |
| `=` / `-` | Zoom in / out |
| `Esc` | Close entity panel |
| `Ctrl+1` | Toggle Aircraft |
| `Ctrl+2` | Toggle Ships |
| `Ctrl+3` | Toggle Satellites |

## API

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check |
| `GET /metrics` | Uptime, memory, connections |
| `GET /api/entities` | All entities |
| `WS /` | Live entity diffs |
