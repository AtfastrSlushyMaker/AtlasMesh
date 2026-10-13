import type { Entity, EntityType } from '../../shared/entity';

export interface DiffResult {
  added: Entity[];
  updated: Entity[];
  removed: string[];
}

/**
 * How a source delivers data.
 * - snapshot: every call is the complete current set; anything missing is gone
 *   (after `graceMs`, to ride out entities that blink out of one poll).
 * - stream: calls are partial batches; entities expire `ttlMs` after last seen.
 */
export type Retention =
  | { mode: 'snapshot'; graceMs?: number }
  | { mode: 'stream'; ttlMs: number };

const DEFAULT_RETENTION: Retention = { mode: 'snapshot' };

// These timestamps describe an observation/event, rather than the time a
// static dataset was downloaded. Stationary reports still need to reach the UI.
const OBSERVATION_TYPES = new Set<EntityType>([
  'aircraft', 'ship', 'iss', 'weather', 'buoy', 'earthquake', 'disaster',
  'event', 'wildfire', 'fireball', 'launch',
]);

function shallowMetaEqual(a: Record<string, any> = {}, b: Record<string, any> = {}) {
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    const av = a[k];
    const bv = b[k];
    if (av === bv) continue;
    // Arrays/objects (e.g. cable paths) are compared by serialised value.
    if (typeof av === 'object' && typeof bv === 'object' && av && bv) {
      if (JSON.stringify(av) !== JSON.stringify(bv)) return false;
      continue;
    }
    return false;
  }
  return true;
}

class EntityStore {
  private byType = new Map<EntityType, Map<string, Entity>>();
  private lastSeen = new Map<string, number>();
  private retention = new Map<EntityType, Retention>();

  setRetention(type: EntityType, r: Retention) {
    this.retention.set(type, r);
  }

  private bucket(type: EntityType) {
    let b = this.byType.get(type);
    if (!b) {
      b = new Map();
      this.byType.set(type, b);
    }
    return b;
  }

  processForType(type: EntityType, incoming: Entity[]): DiffResult {
    const bucket = this.bucket(type);
    const now = Date.now();
    const added: Entity[] = [];
    const updated: Entity[] = [];
    const seen = new Set<string>();

    for (const ent of incoming) {
      if (!ent || ent.type !== type) continue;
      if (!Number.isFinite(ent.position?.lat) || !Number.isFinite(ent.position?.lon)) continue;
      if (Math.abs(ent.position.lat) > 90 || Math.abs(ent.position.lon) > 180) continue;
      seen.add(ent.id);
      this.lastSeen.set(ent.id, now);

      const existing = bucket.get(ent.id);
      if (!existing) {
        bucket.set(ent.id, ent);
        added.push(ent);
        continue;
      }
      const changed =
        ent.position.lat !== existing.position.lat ||
        ent.position.lon !== existing.position.lon ||
        ent.position.alt !== existing.position.alt ||
        ent.heading !== existing.heading ||
        ent.velocity !== existing.velocity ||
        (OBSERVATION_TYPES.has(type) && ent.timestamp !== existing.timestamp) ||
        !shallowMetaEqual(ent.metadata, existing.metadata);
      // Keep snapshots fresh without rebroadcasting an unchanged static dataset.
      bucket.set(ent.id, ent);
      if (changed) {
        updated.push(ent);
      }
    }

    const removed: string[] = [];
    const r = this.retention.get(type) ?? DEFAULT_RETENTION;
    if (r.mode === 'snapshot') {
      const grace = r.graceMs ?? 0;
      for (const id of bucket.keys()) {
        if (seen.has(id)) continue;
        if (now - (this.lastSeen.get(id) ?? 0) >= grace) {
          bucket.delete(id);
          this.lastSeen.delete(id);
          removed.push(id);
        }
      }
    }
    return { added, updated, removed };
  }

  /** Expire stream entities that have not been seen within their TTL. */
  sweep(): DiffResult {
    const removed: string[] = [];
    const now = Date.now();
    for (const [type, bucket] of this.byType) {
      const r = this.retention.get(type);
      if (!r || r.mode !== 'stream') continue;
      for (const id of bucket.keys()) {
        if (now - (this.lastSeen.get(id) ?? 0) > r.ttlMs) {
          bucket.delete(id);
          this.lastSeen.delete(id);
          removed.push(id);
        }
      }
    }
    return { added: [], updated: [], removed };
  }

  getAll(): Entity[] {
    const out: Entity[] = [];
    for (const b of this.byType.values()) for (const e of b.values()) out.push(e);
    return out;
  }

  getByType(type: EntityType): Entity[] {
    return Array.from(this.byType.get(type)?.values() ?? []);
  }

  count(type?: EntityType): number {
    if (type) return this.byType.get(type)?.size ?? 0;
    let n = 0;
    for (const b of this.byType.values()) n += b.size;
    return n;
  }

  getById(id: string): Entity | undefined {
    const type = id.split(':')[0] as EntityType;
    return this.byType.get(type)?.get(id);
  }

  /** Entities within `radiusKm` of a point, nearest first. */
  near(lat: number, lon: number, radiusKm: number, types?: EntityType[], limit = 50) {
    const out: Array<{ entity: Entity; distanceKm: number }> = [];
    const buckets = types ? types.map((t) => this.byType.get(t)).filter(Boolean) : Array.from(this.byType.values());
    for (const b of buckets as Map<string, Entity>[]) {
      for (const e of b.values()) {
        const d = haversineKm(lat, lon, e.position.lat, e.position.lon);
        if (d <= radiusKm) out.push({ entity: e, distanceKm: d });
      }
    }
    return out.sort((a, b) => a.distanceKm - b.distanceKm).slice(0, limit);
  }
}

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(Math.max(0, Math.min(1, a))));
}

export const store = new EntityStore();
export default store;
