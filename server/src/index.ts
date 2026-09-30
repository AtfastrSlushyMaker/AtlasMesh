import './env';
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
import { analystAvailable } from '../osint/analyst';
import { settingsSummary, updateSettings } from '../services/config';
import { testSetting } from '../services/settingsTest';
import { accessKey, canEditSettings, isShowcase, REPO_URL, IMAGE } from '../lib/access';

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
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-atlas-key');
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

// Tells the client which mode it's in and how to run a full copy.
app.get('/api/config', (_req, res) => {
  res.json({ mode: isShowcase() ? 'showcase' : 'full', repoUrl: REPO_URL, image: IMAGE, version: VERSION });
});

// Handlers are attached further down, next to the source lifecycle they control.
const settingsRouter = express.Router();
app.use('/api/settings', settingsRouter);

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
    noteFn: () => (isAircraftAuthenticated() ? undefined : 'Anonymous access refreshes about every 15 minutes. Add OpenSky credentials in Settings for 1-minute updates.') } as any,
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

const running = new Map<string, () => void>();

function startSource(s: SourceEntry) {
  const missing = sources.refresh(s.id);
  if (missing.length) {
    console.log(`  - ${s.label}: disabled (set ${missing.join(', ')})`);
    return;
  }
  try {
    const stop = s.start((entities) => {
      // Ignore late callbacks from a stopped instance.
      if (running.get(s.id) !== stop) return;
      try {
        const diff = store.processForType(s.type, entities);
        sources.reportData(s.id, store.count(s.type));
        broadcastDiff(s.type, diff);
      } catch (err: any) {
        sources.reportError(s.id, err?.message || String(err));
        console.warn(`[Store] Error processing ${s.type}:`, err?.message);
      }
    }) as (() => void) | undefined;
    running.set(s.id, stop || (() => {}));
    console.log(`  + ${s.label} (${s.provider})`);
  } catch (err: any) {
    sources.reportError(s.id, err?.message || String(err));
    console.warn(`  ! ${s.label} failed to start:`, err?.message || err);
  }
}

/** Stop and start a source so it picks up new settings. */
function restartSource(id: string) {
  const s = SOURCES.find((x) => x.id === id);
  if (!s) return;
  try {
    running.get(id)?.();
  } catch {
    // already stopped
  }
  running.delete(id);
  startSource(s);
}

for (const s of SOURCES) {
  sources.register(s);
  if (s.retention) store.setRetention(s.type, s.retention);
  startSource(s);
}

// ===== Settings =====
settingsRouter.get('/', (req, res) => {
  const editable = canEditSettings(req);
  res.json({
    canEdit: editable,
    reason: editable ? null : isShowcase() ? 'This is the public demo, so keys can’t be added here. Run AtlasMesh yourself to use your own keys.' : accessKey() ? 'Enter the workspace access key to change settings.' : 'Settings can only be changed from the computer running the server, or after an access key is set there.',
    settings: settingsSummary(),
    services: { llm: analystAvailable(), aircraftAuthenticated: isAircraftAuthenticated(), ships: !!process.env.AISSTREAM_TOKEN },
  });
});

settingsRouter.put('/', (req, res) => {
  if (!canEditSettings(req)) return res.status(403).json({ error: 'You can\'t change settings from here. Use the computer running the server, or enter the access key.' });
  const values = req.body?.values;
  if (!values || typeof values !== 'object') return res.status(400).json({ error: 'Nothing to save' });
  try {
    const { changed, restart } = updateSettings(values);
    restart.forEach(restartSource);
    res.json({ changed, restarted: restart, settings: settingsSummary() });
  } catch (err: any) {
    res.status(500).json({ error: `Settings could not be saved: ${err?.message}` });
  }
});

settingsRouter.post('/test', async (req, res) => {
  if (!canEditSettings(req)) return res.status(403).json({ error: 'Not allowed from here' });
  const key = String(req.body?.key || '');
  const value = typeof req.body?.value === 'string' && req.body.value.trim() ? req.body.value.trim() : process.env[key];
  if (!value) return res.json({ ok: false, message: 'Enter a value first.' });
  try {
    res.json(await testSetting(key, value, req.body?.pair));
  } catch (err: any) {
    const status = err?.response?.status;
    res.json({ ok: false, message: status === 401 || status === 403 ? 'The service rejected this key.' : status ? `The service answered HTTP ${status}.` : err?.message || 'Test failed' });
  }
});

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
