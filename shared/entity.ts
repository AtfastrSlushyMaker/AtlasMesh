export type EntityType =
  | 'aircraft'
  | 'ship'
  | 'satellite'
  | 'debris'
  | 'launch'
  | 'event'
  | 'earthquake'
  | 'weather'
  | 'wildfire'
  | 'cable'
  | 'volcano'
  | 'fireball'
  | 'powerplant'
  | 'meteorite'
  | 'windfarm'
  | 'ixp'
  | 'starlink'
  | 'iss'
  | 'airport'
  | 'camera'
  | 'disaster'
  | 'buoy';

export interface Entity {
  id: string;
  type: EntityType;
  position: {
    lat: number;
    lon: number;
    alt?: number;
  };
  velocity?: number; // metres per second
  heading?: number; // degrees clockwise from north
  timestamp: number;
  metadata: Record<string, any>;
}

export type SourceStatus = 'pending' | 'live' | 'stale' | 'error' | 'disabled';

export interface SourceInfo {
  id: string;
  type: EntityType;
  label: string;
  provider: string;
  url: string;
  status: SourceStatus;
  count: number;
  lastUpdate: number | null;
  lastError: string | null;
  note?: string;
}

/** Messages the client sends over the WebSocket. */
export type ClientMessage =
  | { type: 'ping' }
  | { type: 'subscribe'; layers: EntityType[] };

/** Messages the server sends over the WebSocket. */
export type ServerMessage =
  | { type: 'hello'; version: string; timestamp: number }
  | { type: 'pong'; timestamp: number }
  | { type: 'update'; added: Entity[]; updated: Entity[]; removed: string[]; snapshot?: EntityType[]; timestamp: number }
  | { type: 'sources'; sources: SourceInfo[] };
