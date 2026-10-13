import type * as Cesium from 'cesium';
import type { Entity } from '../../../shared/entity';
import type { Diff } from '../lib/live';
import type { LayerSpec } from './useLayer';

/** Drop graphics and their auxiliary state together, including snapshot resets. */
export function clearLayerEntities(ds: Cesium.CustomDataSource, entities: Map<string, Cesium.Entity>, spec: LayerSpec, index: Map<string, Entity>) {
  for (const id of entities.keys()) {
    spec.onRemove?.(id, ds);
    index.delete(id);
  }
  entities.clear();
  ds.entities.removeAll();
}

/** Apply a feed batch without leaving stale search results or orbital caches. */
export function applyLayerDiff(diff: Diff, ds: Cesium.CustomDataSource, entities: Map<string, Cesium.Entity>, spec: LayerSpec, index: Map<string, Entity>) {
  let touched = false;
  ds.entities.suspendEvents();
  try {
    if (diff.snapshot?.includes(spec.type)) {
      clearLayerEntities(ds, entities, spec, index);
      touched = true;
    }
    const upsert = (entity: Entity) => {
      if (entity.type !== spec.type) return;
      touched = true;
      const existing = entities.get(entity.id);
      try {
        if (existing && spec.update) {
          spec.update(existing, entity, ds);
          index.set(entity.id, entity);
        } else {
          if (existing) {
            spec.onRemove?.(entity.id, ds);
            ds.entities.remove(existing);
            entities.delete(entity.id);
            index.delete(entity.id);
          }
          const graphic = spec.create(entity, ds);
          if (graphic) {
            entities.set(entity.id, graphic);
            index.set(entity.id, entity);
          }
        }
      } catch (error) {
        console.warn(`[layer:${spec.type}] failed for ${entity.id}`, error);
      }
    };
    diff.added?.forEach(upsert);
    diff.updated?.forEach(upsert);
    for (const id of diff.removed || []) {
      const graphic = entities.get(id);
      if (!graphic) continue;
      touched = true;
      spec.onRemove?.(id, ds);
      ds.entities.remove(graphic);
      entities.delete(id);
      index.delete(id);
    }
  } finally {
    ds.entities.resumeEvents();
  }
  return touched;
}
