import type { Entity } from '../../../shared/entity';

/**
 * Client-side registry of every entity currently on the globe, keyed by id.
 * The inspector and search read from here; Cesium entities only hold graphics.
 */
export const entityIndex = new Map<string, Entity>();

let version = 0;
const listeners = new Set<() => void>();
let scheduled = false;

export function touchIndex() {
  version++;
  if (scheduled) return;
  scheduled = true;
  // Coalesce bursts of diffs into one notification per second.
  setTimeout(() => {
    scheduled = false;
    listeners.forEach((l) => l());
  }, 1000);
}

export function subscribeIndex(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export const indexVersion = () => version;

export function displayName(e: Entity): string {
  const m = e.metadata || {};
  return String(m.name || m.callsign || m.title || m.shipName || e.id);
}

export function countsByType() {
  const out: Record<string, number> = {};
  for (const e of entityIndex.values()) out[e.type] = (out[e.type] || 0) + 1;
  return out;
}
