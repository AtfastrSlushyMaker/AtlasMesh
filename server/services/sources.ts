import type { EntityType, SourceInfo } from '../../shared/entity';

export interface SourceDef {
  id: string;
  type: EntityType;
  label: string;
  provider: string;
  url: string;
  /** Expected refresh period; used to flag a feed as stale. */
  refreshMs: number;
  /** Env vars that must be set for the source to run. */
  requires?: string[];
  note?: string;
}

interface State {
  def: SourceDef;
  count: number;
  lastUpdate: number | null;
  lastError: string | null;
  disabled: boolean;
}

class SourceRegistry {
  private states = new Map<string, State>();

  register(def: SourceDef) {
    const missing = (def.requires ?? []).filter((k) => !process.env[k]);
    this.states.set(def.id, {
      def,
      count: 0,
      lastUpdate: null,
      lastError: null,
      disabled: missing.length > 0,
    });
    return missing;
  }

  reportData(id: string, count: number) {
    const s = this.states.get(id);
    if (!s) return;
    s.count = count;
    s.lastUpdate = Date.now();
    s.lastError = null;
  }

  reportError(id: string, message: string) {
    const s = this.states.get(id);
    if (s) s.lastError = message;
  }

  list(): SourceInfo[] {
    const now = Date.now();
    return Array.from(this.states.values()).map((s) => {
      let status: SourceInfo['status'] = 'pending';
      if (s.disabled) status = 'disabled';
      else if (s.lastUpdate == null) status = s.lastError ? 'error' : 'pending';
      else if (now - s.lastUpdate > Math.max(s.def.refreshMs * 3, 5 * 60 * 1000)) status = 'stale';
      else status = 'live';
      return {
        id: s.def.id,
        type: s.def.type,
        label: s.def.label,
        provider: s.def.provider,
        url: s.def.url,
        status,
        count: s.count,
        lastUpdate: s.lastUpdate,
        lastError: s.lastError,
        note: s.disabled
          ? `Set ${(s.def.requires ?? []).join(', ')} to enable`
          : s.def.note,
      };
    });
  }
}

export const sources = new SourceRegistry();
