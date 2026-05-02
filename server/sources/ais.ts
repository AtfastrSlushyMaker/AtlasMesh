import WebSocket from 'ws';
import type { Entity } from '../../shared/entity';

export type AISOptions = {
  url?: string;
  reconnectMs?: number;
  batchMs?: number;
};

function toNumber(v: any): number | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v === 'number') return v;
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
    ws = new WebSocket(url);

    ws.on('open', () => {
      console.log('AIS WS connected to', url);
      const subscriptionMsg = {
        APIKey: token,
        BoundingBoxes: [[[-90, -180], [90, 180]]],
        FiltersShipMMSI: [],
        FilterMessageTypes: ["PositionReport"]
      };
      ws!.send(JSON.stringify(subscriptionMsg));
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.Message?.PositionReport && msg.MetaData) {
          const pos = msg.Message.PositionReport;
          const meta = msg.MetaData;
          const lat = toNumber(pos.Latitude);
          const lon = toNumber(pos.Longitude);
          if (lat === undefined || lon === undefined) return;

          const mmsi = meta.MMSI?.toString() || 'unknown';
          const entity: Entity = {
            id: `ship:ais:${mmsi}`,
            type: 'ship',
            position: { lat, lon, alt: 0 },
            velocity: toNumber(pos.Sog),
            heading: toNumber(pos.TrueHeading ?? pos.Cog),
            timestamp: Date.now(),
            metadata: {
              mmsi,
              shipName: meta.ShipName?.trim() || '',
              country: meta.country || '',
              sog: pos.Sog,
              cog: pos.Cog,
            }
          };
          buffer.set(entity.id, entity);
          scheduleFlush();
        }
      } catch {
        // ignore parse errors
      }
    });

    ws.on('close', () => {
      flush(); // flush remaining on disconnect
      if (!stopped) setTimeout(connect, reconnectMs);
    });

    ws.on('error', (err) => {
      console.warn('AIS WS error:', (err as any)?.message || err);
      try { ws?.close(); } catch (e) {}
    });
  }

  connect();

  return () => {
    stopped = true;
    if (flushTimer) clearTimeout(flushTimer);
    flush();
    try { ws?.close(); } catch (e) {}
  };
}
