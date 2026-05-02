<p align="center">
  <picture>
    <img src="https://raw.githubusercontent.com/AtfastrSlushyMaker/AtlasMesh/main/client/public/logo.svg" width="80" alt="AtlasMesh Logo" />
  </picture>
</p>

<h1 align="center">AtlasMesh</h1>

<p align="center">
  <strong>Real-time geospatial visualization of Earth's live data on a 3D globe</strong>
</p>

<p align="center">
  <a href="https://atlasmesh.onrender.com"><img src="https://img.shields.io/badge/🌐_Live-atlasmesh.onrender.com-00ffaa?style=flat-square" alt="Deployed" /></a>
  <img src="https://img.shields.io/badge/React-18-38bdf8?style=flat-square&logo=react" alt="React 18" />
  <img src="https://img.shields.io/badge/CesiumJS-1.10-22d3ee?style=flat-square" alt="CesiumJS" />
  <img src="https://img.shields.io/badge/Node.js-20-10b981?style=flat-square&logo=node.js" alt="Node.js" />
  <img src="https://img.shields.io/badge/TypeScript-5-818cf8?style=flat-square&logo=typescript" alt="TypeScript" />
</p>

---

## ✨ What is AtlasMesh?

AtlasMesh aggregates **18 real-time & historical data sources** — aircraft, ships, satellites, Starlink, ISS, earthquakes, volcanoes, wildfires, weather, launches, submarine cables, fireballs, airports, power plants, meteorites, wind farms, internet exchanges, and global events — and renders them all simultaneously on a CesiumJS 3D globe.

---

## 🗺️ Data Layers

| 🛩️ Transport | 🌍 Natural | 🛰️ Space | ⚡ Energy | 🌐 Infrastructure |
|:---|:---|:---|:---|:---|
| Aircraft | Earthquakes | Satellites | Power Plants | Subsea Cables |
| Ships | Volcanoes | Starlink | Wind Farms | Internet Exchanges |
| | Wildfires | ISS | | Airports |
| | Global Events | Launches | | |
| | Meteorites | Fireballs | | |
| | Weather | | | |

> **Real sources only.** No mock, procedural, or fake data. Every layer pulls from a live API.

---

## 🎥 Features

- **3D Globe** — CesiumJS with dark CartoDB basemap, lighting, atmosphere
- **All-at-once** — Every entity from every source rendered simultaneously
- **Real-time movement** — Aircraft & ships interpolate between position updates using velocity/heading
- **Smooth satellites** — Batched SGP4 propagation avoids main-thread blocking
- **Occlusion culling** — Entities on the far side of Earth are hidden (150ms throttle)
- **Clustering** — Custom icons per layer type when entities group together
- **Fuzzy search** — `⌘K` Levenshtein-powered search across all 15k+ entities
- **GPS geolocation** — Fly the camera to your device's location
- **Entity details** — Click any entity for full metadata, position, and raw JSON
- **WebSocket live updates** — O(n) diffing, only changed entities sent to clients
- **Keyboard shortcuts** — Full shortcut system (`?` to view)
- **Responsive** — Glassmorphism dark theme, mobile & tablet friendly

---

## 🚀 Quick Start

```bash
git clone https://github.com/AtfastrSlushyMaker/AtlasMesh.git
cd AtlasMesh
npm install
```

### Development

```bash
# Terminal 1: Backend (port 3000)
npm run start:server

# Terminal 2: Frontend (port 5173)
npm run start:client
```

### Environment

```env
OPENSKY_USERNAME=your_username    # Optional — enables live aircraft
OPENSKY_PASSWORD=your_password
AISSTREAM_TOKEN=your_token        # Optional — enables live ships
```

### Production

```bash
npm run build   # Compiles TypeScript + Vite
npm start       # Serves client + WebSocket on port 3000
```

---

## 📡 Data Sources

| Source | Type | Refresh |
|--------|------|---------|
| [OpenSky Network](https://opensky-network.org) | Aircraft positions | 15s |
| [AISStream](https://aisstream.io) | Ship positions (AIS) | Streaming |
| [Celestrak](https://celestrak.org) | Satellite & Starlink TLEs | 2–6h |
| [OpenFlights](https://openflights.org/data.php) | Airport database | 24h |
| [Space Devs](https://ll.thespacedevs.com) | Upcoming launches | 15m |
| [NASA EONET](https://eonet.gsfc.nasa.gov) | Global natural events | 5m |
| [USGS Earthquakes](https://earthquake.usgs.gov) | Seismic activity | 60s |
| [USGS Volcanoes](https://volcanoes.usgs.gov) | Active volcanoes | 6h |
| [Open-Meteo](https://open-meteo.com) | Weather stations | 30m |
| [NASA FIRMS](https://firms.modaps.eosdis.nasa.gov) | Active wildfires | 1h |
| [NASA JPL CNEOS](https://ssd-api.jpl.nasa.gov) | Fireball events | 1h |
| [TeleGeography](https://www.submarinecablemap.com) | Submarine cables | 24h |
| [WRI](https://www.wri.org) | Global power plants | 24h |
| [NASA Data](https://data.nasa.gov) | Meteorite landings | 24h |
| [Open Renewables](https://github.com/niclasj/global-renewable-power-plants) | Wind farms | 24h |
| [PeeringDB](https://www.peeringdb.com) | Internet exchanges | 24h |
| [wheretheiss.at](https://wheretheiss.at) | ISS position | 5s |

---

## 🏗️ Architecture

```
 AtlasMesh/
 ├── client/                 # React 18 + CesiumJS + Vite
 │   └── src/
 │       ├── cesium/          # Viewer init, occlusion culling
 │       ├── components/
 │       │   └── layers/      # 18 entity layer components
 │       ├── hooks/           # WebSocket, fuzzy search, keyboard
 │       ├── ui/              # AppUI, EntityInfoPanel, Logo, Toast
 │       └── styles/          # Design system (CSS custom properties)
 ├── server/                  # Express + WebSocket
 │   ├── src/index.ts         # Graceful shutdown, metrics, health
 │   ├── services/store.ts    # O(n) entity diffing
 │   └── sources/             # 18 data source adapters
 ├── shared/                  # TypeScript entity types
 └── render.yaml              # Render deploy config
```

---

## ⌨️ Shortcuts

| Key | Action |
|-----|--------|
| `?` | Help overlay |
| `⌘K` / `Ctrl+K` | Focus search |
| `R` | Reset camera |
| `=` / `-` | Zoom in / out |
| `Esc` | Close panel |
| `Ctrl+1` | Toggle Aircraft |
| `Ctrl+2` | Toggle Ships |
| `Ctrl+3` | Toggle Satellites |

---

## 🔌 API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Status, entity count, uptime, memory |
| `GET` | `/metrics` | Connections, messages, CPU |
| `GET` | `/api/entities` | All current entities |
| `GET` | `/api/entities/:id` | Single entity by ID |
| `GET` | `/api/entities/type/:type` | Filter by type |
| `WS` | `/` | Live entity diffs (add/update/remove) |

---

<p align="center">
  <sub>Built with 🌍 by <a href="https://github.com/AtfastrSlushyMaker">AtfastrSlushyMaker</a></sub>
</p>
