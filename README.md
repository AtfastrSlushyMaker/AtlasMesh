# AtlasMesh

AtlasMesh is a real-time geospatial visualization platform designed to aggregate, normalize, and display a wide variety of live and historical data sources on a 3D globe. Built with React, TypeScript, CesiumJS, and Node.js.

## Features

- **Real-time visualization** of aircraft, ships, satellites, weather, earthquakes, volcanoes, wildfires, lightning, launches, submarine cables, fireballs, and global events
- **All entities shown at once** — no grouping or aggregation
- **Occlusion culling** — only entities visible from the current camera view are rendered for performance
- **Modular data source architecture** — easy to add new sources
- **Interactive 3D globe** powered by CesiumJS with dark CartoDB basemap
- **WebSocket-based live updates** with connection health monitoring
- **Fuzzy search** across all entities with ⌘K shortcut
- **Entity info panels** with tabbed views (Overview, Metadata, Raw JSON)
- **Keyboard shortcuts** — press `?` for the full list
- **Glassmorphism UI** with OLED-optimized dark theme
- **Responsive design** — works on desktop and mobile
- **Toast notifications** for user feedback
- **Error boundaries** and loading states for resilience

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite |
| 3D Engine | CesiumJS |
| Styling | Tailwind CSS v4, CSS Design System |
| Icons | @mdi/js, Lucide React |
| Backend | Node.js, Express, TypeScript |
| Realtime | WebSocket (ws) with ping/pong health checks |
| Shared | TypeScript entity types |

## Project Structure

```
AtlasMesh/
├── client/          # Frontend (React, CesiumJS, Vite)
│   ├── src/
│   │   ├── components/     # React components
│   │   │   ├── layers/     # Cesium layer components (memoized)
│   │   │   └── ErrorBoundary.tsx
│   │   ├── hooks/          # Custom hooks (WebSocket, fuzzy search, keyboard)
│   │   ├── ui/             # UI components (AppUI, EntityInfoPanel, Toast, KeyboardHelpModal)
│   │   ├── cesium/         # Cesium app wrapper
│   │   ├── styles/         # Design system CSS
│   │   └── main.tsx
│   └── vite.config.ts
├── server/          # Backend (Node.js, Express)
│   ├── src/
│   │   └── index.ts        # Server with graceful shutdown, metrics, health
│   ├── services/
│   │   └── store.ts        # Entity store with fast diffing
│   └── sources/            # Data source adapters
├── shared/          # Shared types and utilities
│   └── entity.ts
└── README.md
```

## Getting Started

### Prerequisites

- Node.js (v18+ recommended)
- npm or yarn

### Install Dependencies

```bash
cd client && npm install
cd ../server && npm install
```

### Development

#### Start the Backend

```bash
cd server
npm run dev
```

#### Start the Frontend

```bash
cd client
npm run dev
```

The frontend will be available at [http://localhost:5173](http://localhost:5173).

### Environment Variables

Some data sources require API credentials:

```bash
OPENSKY_USERNAME=your_username
OPENSKY_PASSWORD=your_password
AISSTREAM_TOKEN=your_aisstream_token
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check with entity count, uptime, memory |
| `GET /metrics` | Detailed metrics (connections, messages, CPU, memory) |
| `GET /api/entities` | List all entities |
| `GET /api/entities/:id` | Get entity by ID |
| `GET /api/entities/type/:type` | Filter entities by type |
| `WS /` | WebSocket for live entity diffs |

## Keyboard Shortcuts

Press `?` anytime to see the full list. Common ones:

| Shortcut | Action |
|----------|--------|
| `?` | Show/hide keyboard shortcuts |
| `⌘K` | Focus search |
| `R` | Reset camera view |
| `=` / `-` | Zoom in / out |
| `Esc` | Close entity panel |
| `Ctrl+1` | Toggle Aircraft layer |
| `Ctrl+2` | Toggle Ships layer |
| `Ctrl+3` | Toggle Satellites layer |

## Supported Data Sources

| Source | Type | Endpoint |
|--------|------|----------|
| OpenSky Network | Aircraft | REST API |
| AISStream | Ships | WebSocket |
| Celestrak | Satellites | TLE data |
| Space Devs | Launches | REST API |
| NASA EONET | Global Events | REST API |
| USGS | Earthquakes, Volcanoes | REST API |
| Open-Meteo | Weather | REST API |
| NASA FIRMS | Wildfires | REST API |
| TeleGeography | Submarine Cables | REST API |
| NASA JPL CNEOS | Fireballs | REST API |
| Procedural | Lightning | Generated |

## UI/UX Improvements (v2.0)

- **Design System** — CSS variables, glassmorphism, consistent spacing, z-index scale
- **Fuzzy Search** — Levenshtein distance + multi-field scoring
- **Tabbed Entity Panel** — Overview, Metadata, Raw JSON with copy-to-clipboard
- **Toast Notifications** — Success/error/info feedback
- **Keyboard Shortcuts** — Full shortcut system with help modal
- **Error Boundary** — Graceful crash recovery with reload option
- **Loading Screen** — Animated globe spinner with shimmer progress
- **Mobile Responsive** — Adaptive sidebar, touch-friendly controls
- **Layer Categories** — Transport, Space, Natural Hazards, Weather, Infrastructure
- **Connection Status** — Live indicator with pulse animation
- **Copy to Clipboard** — ID and JSON copy on entity panel

## Backend Improvements (v2.0)

- **Graceful Shutdown** — SIGTERM/SIGINT handling with 10s timeout
- **WebSocket Health** — Ping/pong every 30s, stale connection termination
- **Metrics Endpoint** — Uptime, memory, CPU, message counts
- **Request Logging** — HTTP method, URL, status, duration
- **CORS Support** — Cross-origin headers
- **Fast Diffing** — O(n) change detection instead of JSON.stringify
- **Fireball Type** — Proper `fireball` entity type instead of generic `event`
- **Error Resilience** — Per-source error isolation, continues on failure

## Performance

- **Occlusion culling** — Entities on far side of globe hidden (150ms throttle)
- **React.memo** — All layer components memoized
- **Imperative updates** — WebSocket diffs bypass React batching
- **Error throttling** — Max 3 log entries per failing entity
- **Search limit** — 15,000 indexed entities
- **Diff-based updates** — Only changed entities re-rendered

## Contributing

Contributions are welcome! Please open issues or pull requests for bugs, features, or suggestions.

## License

TBD (to be determined)

---

_This project is under active development. Features, APIs, and structure may change frequently._
