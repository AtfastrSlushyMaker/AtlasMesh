import type { Entity, EntityType } from '../../shared/entity';

export interface DiffResult {
  added: Entity[];
  updated: Entity[];
  removed: string[];
}

class EntityStore {
  private map = new Map<string, Entity>();

  processForType(type: EntityType, incoming: Entity[]): DiffResult {
    const incomingMap = new Map(incoming.map((e) => [e.id, e]));
    const added: Entity[] = [];
    const updated: Entity[] = [];

    for (const [id, ent] of incomingMap) {
      const existing = this.map.get(id);
      if (!existing) {
        this.map.set(id, ent);
        added.push(ent);
      } else {
        // Fast change detection: newer timestamp or position/metadata change
        const posChanged =
          ent.position.lat !== existing.position.lat ||
          ent.position.lon !== existing.position.lon ||
          ent.position.alt !== existing.position.alt;
        const metaChanged = Object.keys(ent.metadata || {}).some(
          (k) => ent.metadata[k] !== existing.metadata[k]
        ) || Object.keys(existing.metadata || {}).some(
          (k) => !(k in (ent.metadata || {}))
        );

        if (ent.timestamp > existing.timestamp || posChanged || metaChanged) {
          this.map.set(id, ent);
          updated.push(ent);
        }
      }
    }

    const removed: string[] = [];
    const now = Date.now();
    for (const [id, existing] of this.map.entries()) {
      if (existing.type === type) {
        // If it's in incomingMap, we already handled it above
        // If it's NOT in incomingMap, we check if it's too old
        if (!incomingMap.has(id)) {
          // Age out entities older than 1 hour (except static ones like volcanoes/cables)
          const isStatic = ['volcano', 'cable', 'powerplant', 'meteorite', 'windfarm', 'ixp'].includes(type);
          if (!isStatic && (now - existing.timestamp > 60 * 60 * 1000)) {
            this.map.delete(id);
            removed.push(id);
          }
        }
      }
    }

    return { added, updated, removed };
  }

  getAll(): Entity[] {
    return Array.from(this.map.values());
  }

  getById(id: string): Entity | undefined {
    return this.map.get(id);
  }
}

export const store = new EntityStore();
export default store;
