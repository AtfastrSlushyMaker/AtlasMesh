import { useSyncExternalStore } from 'react';
import type * as Cesium from 'cesium';
import { defaultVisibility } from './lib/layers';
import { storage } from './lib/api';
import type { Basemap, Overlay } from './globe/engine';

/**
 * App-wide UI state. A tiny external store keeps re-renders scoped to the
 * components that read a given slice.
 */
export type Mode = 'globe' | 'intel';
export type Theme = 'day' | 'night' | 'system';
export type Units = 'metric' | 'imperial' | 'nautical';
export type Quality = 'saver' | 'balanced' | 'sharp';
export type SettingsSection = 'general' | 'globe' | 'keys' | 'intel' | 'about';

export interface Prefs {
  theme: Theme;
  units: Units;
  clock: 'utc' | 'local';
  quality: Quality;
  motion: 'system' | 'reduce';
  welcomeDone: boolean;
  intelDefaults: { maxDepth: number; maxRequestsPerJob: number; maxNodes: number; minConfidence: number };
}

export const DEFAULT_PREFS: Prefs = {
  theme: 'day',
  units: 'metric',
  clock: 'utc',
  quality: 'balanced',
  motion: 'system',
  welcomeDone: false,
  intelDefaults: { maxDepth: 2, maxRequestsPerJob: 60, maxNodes: 400, minConfidence: 0.6 },
};
export type Drawer = 'layers' | 'activity' | 'feeds' | null;

export interface AppState {
  mode: Mode;
  drawer: Drawer;
  visibility: Record<string, boolean>;
  basemap: Basemap;
  overlays: Record<Overlay, boolean>;
  lighting: boolean;
  selectedId: string | null;
  paletteOpen: boolean;
  helpOpen: boolean;
  /** Seed handed from the globe to the Intel workspace. */
  intelSeed: { value: string; type?: string } | null;
  prefs: Prefs;
  settings: SettingsSection | null;
  /** What the server allows: 'showcase' is the public demo with Intel and keys off. */
  server: { mode: 'full' | 'showcase'; repoUrl: string; image: string } | null;
  runLocalOpen: boolean;
}

const saved = storage.get<Partial<AppState>>('prefs', {});

let state: AppState = {
  mode: 'globe',
  // First visit shows the welcome card instead of an open drawer.
  drawer: typeof window !== 'undefined' && window.innerWidth >= 900 && saved.prefs?.welcomeDone ? 'layers' : null,
  visibility: { ...defaultVisibility(), ...(saved.visibility || {}) },
  basemap: saved.basemap || 'satellite',
  overlays: { labels: true, radar: false, clouds: false, nightlights: false, ...(saved.overlays || {}) },
  lighting: saved.lighting ?? true,
  selectedId: null,
  paletteOpen: false,
  helpOpen: false,
  intelSeed: null,
  prefs: { ...DEFAULT_PREFS, ...(saved.prefs || {}), intelDefaults: { ...DEFAULT_PREFS.intelDefaults, ...(saved.prefs?.intelDefaults || {}) } },
  settings: null,
  server: null,
  runLocalOpen: false,
};

const listeners = new Set<() => void>();

export function setApp(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) {
  const p = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...p };
  if ('visibility' in p || 'basemap' in p || 'overlays' in p || 'lighting' in p || 'prefs' in p) {
    storage.set('prefs', { visibility: state.visibility, basemap: state.basemap, overlays: state.overlays, lighting: state.lighting, prefs: state.prefs });
  }
  listeners.forEach((l) => l());
}

export const getApp = () => state;

export function useApp<T>(select: (s: AppState) => T): T {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => select(state)
  );
}

// The Cesium viewer is a singleton owned by <Globe>; other UI reaches it here.
let viewer: Cesium.Viewer | null = null;
export const setViewer = (v: Cesium.Viewer | null) => {
  viewer = v;
};
export const getViewer = () => viewer;

export function setPrefs(patch: Partial<Prefs>) {
  setApp((s) => ({ prefs: { ...s.prefs, ...patch } }));
}
