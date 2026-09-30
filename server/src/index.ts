import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import type { Entity, EntityType } from '../../shared/entity';
import { store, Retention } from '../services/store';
import { sources, SourceDef } from '../services/sources';
import { startAircraftSource, isAircraftAuthenticated } from '../sources/aircraft';
import { startAISSource } from '../sources/ais';
import { startSatellitesSource, startStarlinkSource } from '../sources/tle';
import { startLaunchesSource } from '../sources/launches';
import { startEventsSource } from '../sources/events';
import { startEarthquakesSource } from '../sources/earthquakes';
import { startWeatherSource } from '../sources/weather';
import { startWildfiresSource } from '../sources/wildfires';
import { startSubmarineCableSource } from '../sources/cables';
import { startVolcanoSource } from '../sources/volcanoes';
import { startFireballsSource } from '../sources/fireballs';
import { startPowerPlantSource, startWindFarmSource } from '../sources/powerplants';
import { startMeteoriteSource } from '../sources/meteorites';
import { startIXPSource } from '../sources/ixp';
import { startISSSource } from '../sources/iss';
import { startAirportSource } from '../sources/airports';
import { startCameraSource } from '../sources/cameras';
import { startDisasterSource } from '../sources/disasters';
import { startBuoySource } from '../sources/buoys';
import { osintRouter } from '../osint/routes';

const VERSION = '2.1.0';
const MIN = 60 * 1000;
const HOUR = 60 * MIN;

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
const server = http.createServer(app);
const wss = new WebSocketServer({ server, maxPayload: 64 * 1024 });

// ===== Metrics =====
let totalConnections = 0;
let messagesSent = 0;
let messagesReceived = 0;

// ===== Middleware =====
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    if (req.path.startsWith('/api') || req.path === '/health') {
      console.log(`[HTTP] ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`);
    }
  });
  next();
});

app.use(express.json({ limit: '256kb' }));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // The client is served from the same origin in production. In development
  // Vite proxies /api, so CORS is only needed for ad-hoc tooling.
  const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const origin = req.headers.origin;
  if (origin && (allowed.includes(origin) || process.env.NODE_ENV !== 'production')) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ===== Health & metrics =====
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: VERSION,
    entities: store.count(),
    uptime: process.uptime(),
    connections: { total: totalConnections, active: wss.clients.size },
    timestamp: new Date().toISOString(),
  });
});

app.get('/metrics', (_req, res) => {
  res.json({
    uptime: process.uptime(),
    entities: store.count(),
    connections: { total: totalConnections, active: wss.clients.size },
    messages: { sent: messagesSent, received: messagesReceived },
    memory: process.memoryUsage(),
    nodeVersion: process.version,
  });
});

// ===== Entity API =====
app.get('/api/sources', (_req, res) => res.json({ sources: sources.list() }));

app.get('/api/entities', (req, res) => {
  const type = req.query.type as EntityType | undefined;
  const limit = Math.min(Number(req.query.limit) || 1000, 20000);
  const list = type ? store.getByType(type) : store.getAll();
  res.json({ count: list.length, entities: list.slice(0, limit) });
});

app.get('/api/entities/type/:type', (req, res) => {
  const list = store.getByType(req.params.type as EntityType);
  res.json({ count: list.length, entities: list });
});

app.get('/api/entities/:id', (req, res) => {
  const entity = store.getById(req.params.id);
  if (!entity) return res.status(404).json({ error: `No entity with id "${req.params.id}"` });
  res.json(entity);
});

app.get('/api/near', (req, res) => {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  const radius = Math.min(Number(req.query.radiusKm) || 50, 2000);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return res.status(400).json({ error: 'lat and lon query parameters are required numbers' });
  }
  const types = req.query.types ? String(req.query.types).split(',') as EntityType[] : undefined;
  const results = store.near(lat, lon, radius, types, 100).map(({ entity, distanceKm }) => ({
    id: entity.id,
    type: entity.type,
    name: entity.metadata?.name ?? entity.id,
    position: entity.position,
    distanceKm: +distanceKm.toFixed(2),
  }));
  res.json({ count: results.length, results });
});

app.use('/api/osint', osintRouter);

app.use('/api', (_req, res) => res.status(404).json({ error: 'Unknown API route' }));

// ===== Production: serve client build (registered after API routes) =====
const clientDist = path.resolve(__dirname, '..', '..', '..', '..', 'client', 'dist');
if (process.env.NODE_ENV === 'production' && fs.existsSync(clientDist)) {
  app.use(express.static(clientDist, { maxAge: '1h', index: false }));
  app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  console.log(`[Server] Serving client from ${clientDist}`);
}

// ===== WebSocket =====
type Client = WebSocket & { isAlive?: boolean; layers?: Set<EntityType> };

function send(ws: WebSocket, msg: unknown) {
  if (ws.readyState !== WebSocket.OPEN) return;
  ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
  messagesSent++;
}

const SNAPSHOT_CHUNK = 4000;

function sendSnapshot(ws: Client, types: EntityType[]) {
  const all: Entity[] = [];
  for (const t of types) all.push(...store.getByType(t));
  if (all.length === 0) {
    send(ws, { type: 'update', added: [], updated: [], removed: [], snapshot: types, timestamp: Date.now() });
    return;
  }
  for (let i = 0; i < all.length; i += SNAPSHOT_CHUNK) {
    send(ws, {
      type: 'update',
      added: all.slice(i, i + SNAPSHOT_CHUNK),
      updated: [],
      removed: [],
      snapshot: i === 0 ? types : undefined,
      timestamp: Date.now(),
    });
  }
}

wss.on('connection', (ws: Client) => {
  totalConnections++;
  ws.isAlive = true;
  ws.layers = new Set();
  ws.on('pong', () => { ws.isAlive = true; });

  send(ws, { type: 'hello', version: VERSION, timestamp: Date.now() });
  send(ws, { type: 'sources', sources: sources.list() });

  ws.on('message', (data) => {
    messagesReceived++;
    let msg: any;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (msg?.type === 'ping') {
      send(ws, { type: 'pong', timestamp: Date.now() });
    } else if (msg?.type === 'subscribe' && Array.isArray(msg.layers)) {
      const next = new Set<EntityType>(msg.layers.filter((l: unknown) => typeof l === 'string').slice(0, 64));
      const fresh = [...next].filter((t) => !ws.layers!.has(t));
      ws.layers = next;
      if (fresh.length) sendSnapshot(ws, fresh);
    }
  });

  ws.on('error', (err) => console.warn('[WS] Client error:', err.message));
});

const pingInterval = setInterval(() => {
  wss.clients.forEach((c: Client) => {
    if (!c.isAlive) return c.terminate();
    c.isAlive = false;
    c.ping();
  });
}, 30000);

function broadcastDiff(type: EntityType | null, diff: { added: Entity[]; updated: Entity[]; removed: string[] }) {
  if (!diff.added.length && !diff.updated.length && !diff.removed.length) return;
  const payload = JSON.stringify({ type: 'update', ...diff, timestamp: Date.now() });
  wss.clients.forEach((c: Client) => {
    if (type && !c.layers?.has(type)) return;
    send(c, payload);
  });
}

// Periodically push source health so the UI can show feed status.
const sourcesInterval = setInterval(() => {
  const payload = JSON.stringify({ type: 'sources', sources: sources.list() });
  wss.clients.forEach((c) => send(c, payload));
}, 15000);

const sweepInterval = setInterval(() => {
  const diff = store.sweep();
  if (diff.removed.length) broadcastDiff(null, diff);
}, MIN);

// ===== Data sources =====
interface SourceEntry extends SourceDef {
  start: (onEntities: (e: Entity[]) => void) => unknown;
  retention?: Retention;
}

const SOURCES: SourceEntry[] = [
  { id: 'aircraft', type: 'aircraft', label: 'Aircraft', provider: 'OpenSky Network', url: 'https://opensky-network.org', refreshMs: isAircraftAuthenticated() ? MIN : 15 * MIN, start: startAircraftSource, retention: { mode: 'snapshot', graceMs: 20 * MIN },
    note: isAircraftAuthenticated() ? undefined : 'Anonymous access refreshes about every 15 minutes. Add OpenSky API credentials for 1-minute updates.' },
  { id: 'ship', type: 'ship', label: 'Ships', provider: 'AISStream', url: 'https://aisstream.io', refreshMs: MIN, requires: ['AISSTREAM_TOKEN'], start: startAISSource, retention: { mode: 'stream', ttlMs: 30 * MIN } },
  { id: 'satellite', type: 'satellite', label: 'Satellites', provider: 'Celestrak', url: 'https://celestrak.org', refreshMs: 3 * HOUR, start: startSatellitesSource },
  { id: 'starlink', type: 'starlink', label: 'Starlink', provider: 'Celestrak', url: 'https://celestrak.org', refreshMs: 3 * HOUR, start: startStarlinkSource },
  { id: 'iss', type: 'iss', label: 'ISS', provider: 'wheretheiss.at', url: 'https://wheretheiss.at', refreshMs: 5000, start: startISSSource },
  { id: 'launch', type: 'launch', label: 'Launches', provider: 'The Space Devs', url: 'https://thespacedevs.com', refreshMs: 20 * MIN, start: startLaunchesSource },
  { id: 'earthquake', type: 'earthquake', label: 'Earthquakes', provider: 'USGS', url: 'https://earthquake.usgs.gov', refreshMs: MIN, start: startEarthquakesSource },
  { id: 'disaster', type: 'disaster', label: 'Disaster alerts', provider: 'GDACS', url: 'https://www.gdacs.org', refreshMs: 10 * MIN, start: startDisasterSource },
  { id: 'event', type: 'event', label: 'Natural events', provider: 'NASA EONET', url: 'https://eonet.gsfc.nasa.gov', refreshMs: 5 * MIN, start: startEventsSource },
  { id: 'wildfire', type: 'wildfire', label: 'Wildfires', provider: 'NASA FIRMS', url: 'https://firms.modaps.eosdis.nasa.gov', refreshMs: HOUR, start: startWildfiresSource },
  { id: 'volcano', type: 'volcano', label: 'Volcanoes', provider: 'USGS / Smithsonian GVP', url: 'https://volcanoes.usgs.gov', refreshMs: 6 * HOUR, start: startVolcanoSource },
  { id: 'weather', type: 'weather', label: 'City weather', provider: 'Open-Meteo', url: 'https://open-meteo.com', refreshMs: 20 * MIN, start: startWeatherSource },
  { id: 'buoy', type: 'buoy', label: 'Ocean buoys', provider: 'NOAA NDBC', url: 'https://www.ndbc.noaa.gov', refreshMs: 30 * MIN, start: startBuoySource },
  { id: 'fireball', type: 'fireball', label: 'Fireballs', provider: 'NASA JPL CNEOS', url: 'https://cneos.jpl.nasa.gov/fireballs/', refreshMs: HOUR, start: startFireballsSource },
  { id: 'camera', type: 'camera', label: 'Public cameras', provider: 'TfL · Caltrans · Fintraffic', url: 'https://api.tfl.gov.uk', refreshMs: 30 * MIN, start: startCameraSource },
  { id: 'cable', type: 'cable', label: 'Subsea cables', provider: 'TeleGeography', url: 'https://www.submarinecablemap.com', refreshMs: 24 * HOUR, start: startSubmarineCableSource },
  { id: 'ixp', type: 'ixp', label: 'Internet exchanges', provider: 'PeeringDB', url: 'https://www.peeringdb.com', refreshMs: 24 * HOUR, start: startIXPSource },
  { id: 'airport', type: 'airport', label: 'Airports', provider: 'OpenFlights', url: 'https://openflights.org', refreshMs: 24 * HOUR, start: startAirportSource },
  { id: 'powerplant', type: 'powerplant', label: 'Power plants', provider: 'WRI GPPD', url: 'https://datasets.wri.org/dataset/globalpowerplantdatabase', refreshMs: 24 * HOUR, start: startPowerPlantSource },
  { id: 'windfarm', type: 'windfarm', label: 'Wind farms', provider: 'WRI GPPD', url: 'https://datasets.wri.org/dataset/globalpowerplantdatabase', refreshMs: 24 * HOUR, start: startWindFarmSource },
  { id: 'meteorite', type: 'meteorite', label: 'Meteorite landings', provider: 'Meteoritical Society / NASA', url: 'https://www.lpi.usra.edu/meteor/', refreshMs: 24 * HOUR, start: startMeteoriteSource },
];

// Sources log failures as "[Tag] Error: …". Route those to the registry so the
// feed panel can say why a layer is empty, without threading callbacks everywhere.
const LOG_TAGS: Record<string, string> = {
  aircraft: 'aircraft', satellites: 'satellite', starlink: 'starlink', iss: 'iss', launches: 'launch',
  earthquakes: 'earthquake', disasters: 'disaster', events: 'event', wildfires: 'wildfire', volcanoes: 'volcano',
  weather: 'weather', buoys: 'buoy', fireballs: 'fireball', cameras: 'camera', 'submarine cables': 'cable', cables: 'cable',
  ixp: 'ixp', airports: 'airport', powerplants: 'powerplant', windfarms: 'windfarm', meteorites: 'meteorite',
};
const originalWarn = console.warn.bind(console);
console.warn = (...args: any[]) => {
  originalWarn(...args);
  const m = typeof args[0] === 'string' ? args[0].match(/^\[([^\]]+)\]\s*(.*)/) : null;
  const id = m && LOG_TAGS[m[1].toLowerCase()];
  if (id) sources.reportError(id, [m![2], ...args.slice(1)].join(' ').replace(/^Error:\s*/, '').slice(0, 200));
};

console.log(`\nAtlasMesh server ${VERSION}\n`);

for (const s of SOURCES) {
  const missing = sources.register(s);
  if (s.retention) store.setRetention(s.type, s.retention);
  if (missing.length) {
    console.log(`  - ${s.label}: disabled (set ${missing.join(', ')})`);
    continue;
  }
  try {
    s.start((entities) => {
      try {
        const diff = store.processForType(s.type, entities);
        sources.reportData(s.id, store.count(s.type));
        broadcastDiff(s.type, diff);
      } catch (err: any) {
        sources.reportError(s.id, err?.message || String(err));
        console.warn(`[Store] Error processing ${s.type}:`, err?.message);
      }
    });
    console.log(`  + ${s.label} (${s.provider})`);
  } catch (err: any) {
    sources.reportError(s.id, err?.message || String(err));
    console.warn(`  ! ${s.label} failed to start:`, err?.message || err);
  }
}

// ===== Graceful shutdown =====
function shutdown(signal: string) {
  console.log(`\n[Server] ${signal} received, shutting down`);
  clearInterval(pingInterval);
  clearInterval(sourcesInterval);
  clearInterval(sweepInterval);
  wss.clients.forEach((c) => c.close(1001, 'Server shutting down'));
  wss.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  // Log and keep serving: one bad upstream payload should not take the globe down.
  console.error('[Fatal] Uncaught exception:', err);
});
process.on('unhandledRejection', (reason) => console.error('[Fatal] Unhandled rejection:', reason));

const PORT = Number(process.env.PORT) || 3000;
server.listen(PORT, () => {
  console.log(`\nListening on http://localhost:${PORT}  (ws on same port)\n`);
});
