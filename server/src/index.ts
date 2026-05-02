import 'dotenv/config';
import express from 'express';
import path from 'path';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { startAircraftSource } from '../sources/aircraft';
import { store } from '../services/store';
import { startAISSource } from '../sources/ais';
import { startSatellitesSource } from '../sources/satellites';
import { startLaunchesSource } from '../sources/launches';
import { startEventsSource } from '../sources/events';
import { startEarthquakesSource } from '../sources/earthquakes';
import { startWeatherSource } from '../sources/weather';
import { startWildfiresSource } from '../sources/wildfires';
import { startSubmarineCableSource } from '../sources/cables';
import { startVolcanoSource } from '../sources/volcanoes';
import { startFireballsSource } from '../sources/fireballs';
import { startPowerPlantSource } from '../sources/powerplants';
import { startMeteoriteSource } from '../sources/meteorites';
import { startWindFarmSource } from '../sources/windfarms';
import { startIXPSource } from '../sources/ixp';
import { startStarlinkSource } from '../sources/starlink';
import { startISSSource } from '../sources/iss';
import { startAirportSource } from '../sources/airports';

import axios from 'axios';
import https from 'https';

// Force IPv4 for all Axios requests to prevent IPv6 timeouts (ENETUNREACH)
axios.defaults.httpAgent = new http.Agent({ family: 4 });
axios.defaults.httpsAgent = new https.Agent({ family: 4 });

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// ===== Metrics & State =====
let totalConnections = 0;
let activeConnections = 0;
const connectionStartTimes = new Map<WebSocket, number>();
let messagesSent = 0;
let messagesReceived = 0;
let startTime = Date.now();

// ===== Request Logging Middleware =====
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[HTTP] ${req.method} ${req.url} ${res.statusCode} - ${duration}ms`);
  });
  next();
});

app.use(express.json());

// ===== CORS Headers =====
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// ===== Production: serve client build =====
const clientDist = path.resolve(__dirname, '..', '..', '..', '..', 'client', 'dist');
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
  console.log(`[Server] Serving client from ${clientDist}`);
}

// ===== Health Check =====
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: '2.0.0',
    entities: store.getAll().length,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    connections: { total: totalConnections, active: activeConnections },
    timestamp: new Date().toISOString(),
  });
});

// ===== Metrics Endpoint =====
app.get('/metrics', (_req, res) => {
  const uptime = (Date.now() - startTime) / 1000;
  res.json({
    uptime,
    entities: store.getAll().length,
    connections: { total: totalConnections, active: activeConnections },
    messages: { sent: messagesSent, received: messagesReceived },
    memory: process.memoryUsage(),
    cpu: process.cpuUsage(),
    pid: process.pid,
    nodeVersion: process.version,
    platform: process.platform,
  });
});

// ===== Entities API =====
app.get('/api/entities', (_req, res) => {
  const entities = store.getAll();
  res.json({ count: entities.length, entities });
});

app.get('/api/entities/:id', (req, res) => {
  const entity = store.getById(req.params.id);
  if (!entity) {
    res.status(404).json({ error: 'Entity not found' });
    return;
  }
  res.json(entity);
});

app.get('/api/entities/type/:type', (req, res) => {
  const entities = store.getAll().filter(e => e.type === req.params.type);
  res.json({ count: entities.length, entities });
});

// ===== WebSocket Connection Handling =====
const PING_INTERVAL = 30000; // 30s
const PONG_TIMEOUT = 10000; // 10s

function heartbeat(this: WebSocket & { isAlive?: boolean }) {
  this.isAlive = true;
}

wss.on('connection', (ws: WebSocket & { isAlive?: boolean }) => {
  totalConnections++;
  activeConnections++;
  connectionStartTimes.set(ws, Date.now());
  ws.isAlive = true;
  ws.on('pong', heartbeat);

  console.log(`[WS] Client connected (active: ${activeConnections}, total: ${totalConnections})`);
  messagesSent++;
  ws.send(JSON.stringify({ type: 'hello', message: 'AtlasMesh WebSocket v2.0', timestamp: Date.now() }));

  // Send initial snapshot
  const allEntities = store.getAll();
  if (allEntities.length > 0) {
    const snapshot = JSON.stringify({
      type: 'update',
      added: allEntities,
      updated: [],
      removed: []
    });
    ws.send(snapshot);
    messagesSent++;
    console.log(`[WS] Sent initial snapshot: ${allEntities.length} entities`);
  }

  ws.on('message', (data) => {
    messagesReceived++;
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        messagesSent++;
      }
    } catch {
      // Ignore invalid messages
    }
  });

  ws.on('close', () => {
    activeConnections--;
    connectionStartTimes.delete(ws);
    console.log(`[WS] Client disconnected (active: ${activeConnections})`);
  });

  ws.on('error', (err) => {
    console.warn('[WS] Client error:', err.message);
  });
});

// Ping/Pong health check interval
const pingInterval = setInterval(() => {
  wss.clients.forEach((ws: WebSocket & { isAlive?: boolean }) => {
    if (!ws.isAlive) {
      console.log('[WS] Terminating stale connection');
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, PING_INTERVAL);

// ===== Broadcast Function =====
function broadcastDiff(diff: { added: any[]; updated: any[]; removed: any[] }) {
  if (diff.added.length === 0 && diff.updated.length === 0 && diff.removed.length === 0) return;

  const payload = JSON.stringify({
    type: 'update',
    added: diff.added,
    updated: diff.updated,
    removed: diff.removed,
    timestamp: Date.now(),
  });

  let sentCount = 0;
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
      sentCount++;
    }
  });
  messagesSent += sentCount;
}

// ===== Source Handler Factory =====
function createSourceHandler(type: string) {
  return (entities: any[]) => {
    try {
      const diff = store.processForType(type as any, entities);
      if (diff.added.length || diff.updated.length || diff.removed.length) {
        broadcastDiff(diff);
      }
    } catch (err: any) {
      console.warn(`[Store] Error processing ${type}:`, err?.message);
    }
  };
}

// ===== Start All Data Sources =====
const SOURCES = [
  { start: startAircraftSource, type: 'aircraft', label: 'Aircraft (OpenSky)' },
  { start: startAISSource, type: 'ship', label: 'Ships (AISStream)' },
  { start: startSatellitesSource, type: 'satellite', label: 'Satellites (Celestrak)' },
  { start: startLaunchesSource, type: 'launch', label: 'Launches (Space Devs)' },
  { start: startEventsSource, type: 'event', label: 'Events (EONET)' },
  { start: startEarthquakesSource, type: 'earthquake', label: 'Earthquakes (USGS)' },
  { start: startWeatherSource, type: 'weather', label: 'Weather (Open-Meteo)' },
  { start: startWildfiresSource, type: 'wildfire', label: 'Wildfires (NASA FIRMS)' },
  { start: startVolcanoSource, type: 'volcano', label: 'Volcanoes (USGS)' },
  { start: startSubmarineCableSource, type: 'cable', label: 'Cables (TeleGeography)' },
  { start: startFireballsSource, type: 'fireball', label: 'Fireballs (NASA JPL)' },
  { start: startPowerPlantSource, type: 'powerplant', label: 'Power Plants (WRI)' },
  { start: startMeteoriteSource, type: 'meteorite', label: 'Meteorites (NASA)' },
  { start: startWindFarmSource, type: 'windfarm', label: 'Wind Farms (Open)' },
  { start: startIXPSource, type: 'ixp', label: 'Internet Exchanges (PeeringDB)' },
  { start: startStarlinkSource, type: 'starlink', label: 'Starlink (Celestrak)' },
  { start: startISSSource, type: 'iss', label: 'ISS (wheretheiss.at)' },
  { start: startAirportSource, type: 'airport', label: 'Airports (OpenFlights)' },
];

console.log('\n🌍 AtlasMesh Server v2.0\n');

for (const source of SOURCES) {
  try {
    source.start(createSourceHandler(source.type));
    console.log(`  ✓ ${source.label}`);
  } catch (err: any) {
    console.warn(`  ✗ ${source.label} failed:`, err?.message || err);
  }
}

// ===== Graceful Shutdown =====
function shutdown(signal: string) {
  console.log(`\n[Server] Received ${signal}. Shutting down gracefully...`);

  clearInterval(pingInterval);

  // Close all WebSocket connections
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.close(1001, 'Server shutting down');
    }
  });

  // Stop accepting new connections
  wss.close(() => {
    console.log('[WS] All connections closed');
  });

  server.close(() => {
    console.log('[HTTP] Server closed');
    process.exit(0);
  });

  // Force exit after 10s
  setTimeout(() => {
    console.error('[Server] Forced exit after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  console.error('[Fatal] Uncaught exception:', err);
  shutdown('uncaughtException');
});
process.on('unhandledRejection', (reason) => {
  console.error('[Fatal] Unhandled rejection:', reason);
});

// ===== Start Server =====
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🚀 Server listening on http://localhost:${PORT}`);
  console.log(`   Health:  http://localhost:${PORT}/health`);
  console.log(`   Metrics: http://localhost:${PORT}/metrics`);
  console.log(`   WS:      ws://localhost:${PORT}\n`);
});
