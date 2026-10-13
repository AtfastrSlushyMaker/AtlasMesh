import WebSocket from 'ws';
import type { Entity } from '../../shared/entity';

export type AISOptions = {
  url?: string;
  reconnectMs?: number;
  batchMs?: number;
};

function toNumber(v: any): number | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function startAISSource(onEntities: (entities: Entity[]) => void, opts?: AISOptions) {
  const url = opts?.url ?? process.env.AISSTREAM_URL ?? 'wss://stream.aisstream.io/v0/stream';
  const token = process.env.AISSTREAM_TOKEN;
  let ws: WebSocket | null = null;
  let stopped = false;
  const reconnectMs = opts?.reconnectMs ?? 10000;
  const batchMs = opts?.batchMs ?? 2000; // Batch window

  if (!token) {
    console.warn('AIS: No AISSTREAM_TOKEN set — skipping AIS source');
    return () => {};
  }

  // Buffer incoming entities and flush as batches
  const buffer = new Map<string, Entity>();
  let flushTimer: NodeJS.Timeout | null = null;
  let reconnectTimer: NodeJS.Timeout | null = null;

  function flush() {
    if (buffer.size === 0) return;
    const batch = Array.from(buffer.values());
    buffer.clear();
    onEntities(batch);
  }

  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      flush();
      flushTimer = null;
    }, batchMs);
  }

  function connect() {
    if (stopped) return;
    const socket = new WebSocket(url, { handshakeTimeout: 10000, maxPayload: 64 * 1024 });
    ws = socket;

    socket.on('open', () => {
      if (stopped) return socket.terminate();
      console.log('AIS WS connected to', url);
      const subscriptionMsg = {
        APIKey: token,
        BoundingBoxes: [[[-90, -180], [90, 180]]],
        FiltersShipMMSI: [],
        FilterMessageTypes: ["PositionReport"]
      };
      socket.send(JSON.stringify(subscriptionMsg));
    });

    socket.on('message', (data) => {
      if (stopped) return;
      try {
        const msg = JSON.parse(data.toString());
        if (msg.Message?.PositionReport && msg.MetaData) {
          const pos = msg.Message.PositionReport;
          const meta = msg.MetaData;
          const lat = toNumber(pos.Latitude);
          const lon = toNumber(pos.Longitude);
          if (lat === undefined || lon === undefined || Math.abs(lat) > 90 || Math.abs(lon) > 180) return;

          const mmsi = meta.MMSI?.toString();
          if (!mmsi) return;
          const speed = toNumber(pos.Sog);
          const trueHeading = toNumber(pos.TrueHeading);
          const course = toNumber(pos.Cog);
          const entity: Entity = {
            id: `ship:ais:${mmsi}`,
            type: 'ship',
            position: { lat, lon, alt: 0 },
            velocity: speed !== undefined && speed >= 0 && speed < 102.3 ? speed * 0.514444 : undefined, // knots → m/s; 102.3 is unavailable
            // TrueHeading 511 means "not available"
            heading: trueHeading !== undefined && trueHeading >= 0 && trueHeading < 360 ? trueHeading :
              course !== undefined && course >= 0 && course < 360 ? course : undefined,
            timestamp: Date.now(),
            metadata: {
              name: meta.ShipName?.trim() || `MMSI ${mmsi}`,
              mmsi,
              shipName: meta.ShipName?.trim() || '',
              country: meta.country || '',
              sog: pos.Sog,
              cog: pos.Cog,
              navStatus: pos.NavigationalStatus,
              sourceUrl: `https://www.marinetraffic.com/en/ais/details/ships/mmsi:${mmsi}`,
            }
          };
          buffer.set(entity.id, entity);
          scheduleFlush();
        }
      } catch {
        // ignore parse errors
      }
    });

    socket.on('close', () => {
      if (stopped) return;
      flush(); // flush remaining on disconnect
      console.warn('[AIS] Connection closed; reconnecting');
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, reconnectMs);
    });

    socket.on('error', (err) => {
      if (stopped) return;
      console.warn('[AIS] Error:', (err as any)?.message || err);
      socket.terminate();
    });
  }

  connect();

  return () => {
    stopped = true;
    if (flushTimer) clearTimeout(flushTimer);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    buffer.clear();
    ws?.terminate();
  };
}
