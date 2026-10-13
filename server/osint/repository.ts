import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { Investigation, InvestigationSummary } from '../../shared/osint';

/**
 * Graph + evidence storage. Investigations live in memory and are persisted
 * as one JSON document each. The interface is small on purpose so it can be
 * swapped for a graph database later without touching the engine.
 */
export interface InvestigationRepository {
  list(): InvestigationSummary[];
  get(id: string): Investigation | undefined;
  save(inv: Investigation): void;
  delete(id: string): boolean;
  flush(): void;
}

const DATA_DIR = path.resolve(process.env.OSINT_DATA_DIR || path.join(process.cwd(), 'data', 'osint'));

export const newId = (prefix: string) => `${prefix}_${crypto.randomBytes(6).toString('hex')}`;

class FileRepository implements InvestigationRepository {
  private cache = new Map<string, Investigation>();
  private timers = new Map<string, NodeJS.Timeout>();

  constructor() {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      for (const f of fs.readdirSync(DATA_DIR)) {
        if (!f.endsWith('.json')) continue;
        try {
          const inv = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8')) as Investigation;
          // A job cannot survive a restart.
          for (const j of inv.jobs || []) if (j.status === 'running' || j.status === 'queued') j.status = 'cancelled';
          this.cache.set(inv.id, inv);
        } catch (err: any) {
          console.warn(`[osint] could not load ${f}:`, err?.message);
        }
      }
    } catch (err: any) {
      console.warn('[osint] data dir unavailable, investigations will not persist:', err?.message);
    }
  }

  list(): InvestigationSummary[] {
    return [...this.cache.values()]
      .map((i) => ({
        id: i.id,
        title: i.title,
        objective: i.objective,
        createdAt: i.createdAt,
        updatedAt: i.updatedAt,
        nodeCount: Object.keys(i.nodes).length,
        edgeCount: Object.keys(i.edges).length,
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  get(id: string) {
    return this.cache.get(id);
  }

  private write(inv: Investigation) {
    try {
      const file = path.join(DATA_DIR, `${inv.id}.json`);
      fs.writeFileSync(`${file}.tmp`, JSON.stringify(inv));
      fs.renameSync(`${file}.tmp`, file);
    } catch (err: any) {
      console.warn('[osint] save failed:', err?.message);
    }
  }

  save(inv: Investigation) {
    inv.updatedAt = Date.now();
    this.cache.set(inv.id, inv);
    // Debounce disk writes; discovery jobs update the graph many times a second.
    clearTimeout(this.timers.get(inv.id));
    this.timers.set(
      inv.id,
      setTimeout(() => {
        this.timers.delete(inv.id);
        this.write(inv);
      }, 500)
    );
  }

  delete(id: string) {
    clearTimeout(this.timers.get(id));
    this.timers.delete(id);
    const had = this.cache.delete(id);
    if (!had) return false;
    try {
      fs.unlinkSync(path.join(DATA_DIR, `${id}.json`));
    } catch {
      // already gone
    }
    return had;
  }

  /** Commit debounced saves before a deployment/restart stops the process. */
  flush() {
    for (const [id, timer] of this.timers) {
      clearTimeout(timer);
      const inv = this.cache.get(id);
      if (inv) this.write(inv);
    }
    this.timers.clear();
  }
}

export const repo: InvestigationRepository = new FileRepository();
