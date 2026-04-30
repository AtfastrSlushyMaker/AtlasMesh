"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.store = void 0;
class EntityStore {
    constructor() {
        this.map = new Map();
    }
    processForType(type, incoming) {
        const incomingMap = new Map(incoming.map((e) => [e.id, e]));
        const added = [];
        const updated = [];
        for (const [id, ent] of incomingMap) {
            const existing = this.map.get(id);
            if (!existing) {
                this.map.set(id, ent);
                added.push(ent);
            }
            else {
                // Simple change detection: newer timestamp or position/metadata change
                if (ent.timestamp > existing.timestamp ||
                    JSON.stringify(ent.position) !== JSON.stringify(existing.position) ||
                    JSON.stringify(ent.metadata) !== JSON.stringify(existing.metadata)) {
                    this.map.set(id, ent);
                    updated.push(ent);
                }
            }
        }
        const removed = [];
        const now = Date.now();
        for (const [id, existing] of this.map.entries()) {
            if (existing.type === type) {
                // If it's in incomingMap, we already handled it above
                // If it's NOT in incomingMap, we check if it's too old
                if (!incomingMap.has(id)) {
                    // Age out entities older than 1 hour (except static ones like volcanoes/cables)
                    const isStatic = ['volcano', 'cable'].includes(type);
                    if (!isStatic && (now - existing.timestamp > 60 * 60 * 1000)) {
                        this.map.delete(id);
                        removed.push(id);
                    }
                }
            }
        }
        return { added, updated, removed };
    }
    getAll() {
        return Array.from(this.map.values());
    }
    getById(id) {
        return this.map.get(id);
    }
}
exports.store = new EntityStore();
exports.default = exports.store;
