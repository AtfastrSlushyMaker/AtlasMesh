import 'dotenv/config';
import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import { startAircraftSource } from '../sources/aircraft';
import { store } from '../services/store';
import { startAISSource } from '../sources/ais';
import { startSatellitesSource } from '../sources/satellites';
import { startLaunchesSource } from '../sources/launches';
import { startEventsSource } from '../sources/events';
import { startEarthquakesSource } from '../sources/earthquakes';
import { startWeatherSource } from '../sources/weather';
import { startLightningSource } from '../sources/lightning';
import { startWildfiresSource } from '../sources/wildfires';
import { startSubmarineCableSource } from '../sources/cables';
import { startVolcanoSource } from '../sources/volcanoes';

import axios from 'axios';
import https from 'https';

// Force IPv4 for all Axios requests to prevent IPv6 timeouts (ENETUNREACH)
axios.defaults.httpAgent = new http.Agent({ family: 4 });
axios.defaults.httpsAgent = new https.Agent({ family: 4 });

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Send full state snapshot to newly connected clients
wss.on('connection', (ws) => {
  console.log('WS client connected');
  
  // Send hello
  ws.send(JSON.stringify({ type: 'hello', message: 'AtlasMesh WebSocket' }));
  
  // Send current full state as initial snapshot
  const allEntities = store.getAll();
  if (allEntities.length > 0) {
    const snapshot = JSON.stringify({
      type: 'update',
      added: allEntities,
      updated: [],
      removed: []
    });
    ws.send(snapshot);
    console.log(`Sent initial snapshot: ${allEntities.length} entities`);
  }
});

function broadcastDiff(diff: { added: any[]; updated: any[]; removed: any[] }) {
  const payload = JSON.stringify({
    type: 'update',
    added: diff.added,
    updated: diff.updated,
    removed: diff.removed
  });
  
  wss.clients.forEach((client) => {
    if ((client as any).readyState === (client as any).OPEN) {
      (client as any).send(payload);
    }
  });
}

// Helper to create a source handler
function createSourceHandler(type: string) {
  return (entities: any[]) => {
    const diff = store.processForType(type as any, entities);
    if (diff.added.length || diff.updated.length || diff.removed.length) {
      broadcastDiff(diff);
    }
  };
}

// =====================
// START ALL DATA SOURCES
// =====================

// Aircraft (OpenSky)
startAircraftSource(createSourceHandler('aircraft'));

// Ships (AISStream)
startAISSource(createSourceHandler('ship'));

// All other sources
const sources = [
  { start: startSatellitesSource, type: 'satellite' },
  { start: startLaunchesSource, type: 'launch' },
  { start: startEventsSource, type: 'event' },
  { start: startEarthquakesSource, type: 'earthquake' },
  { start: startWeatherSource, type: 'weather' },
  { start: startWildfiresSource, type: 'wildfire' },
  { start: startVolcanoSource, type: 'volcano' },
  { start: startSubmarineCableSource, type: 'cable' },
];

sources.forEach(({ start, type }) => {
  try {
    start(createSourceHandler(type));
    console.log(`[Server] Started source: ${type}`);
  } catch (err: any) {
    console.warn(`[Server] Source '${type}' failed to start:`, err?.message || err);
  }
});

app.get('/health', (_req, res) => res.json({ 
  status: 'ok',
  entities: store.getAll().length,
  uptime: process.uptime()
}));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n🌍 AtlasMesh Server listening on http://localhost:${PORT}\n`);
});
