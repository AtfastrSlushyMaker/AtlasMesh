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
}

const saved = storage.get<Partial<AppState>>('prefs', {});

let state: AppState = {
  mode: 'globe',
  drawer: typeof window !== 'undefined' && window.innerWidth >= 900 ? 'layers' : null,
  visibility: { ...defaultVisibility(), ...(saved.visibility || {}) },
  basemap: saved.basemap || 'satellite',
  overlays: { labels: true, radar: false, clouds: false, nightlights: false, ...(saved.overlays || {}) },
  lighting: saved.lighting ?? true,
  selectedId: null,
  paletteOpen: false,
  helpOpen: false,
  intelSeed: null,
};

const listeners = new Set<() => void>();

export function setApp(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) {
  const p = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...p };
  if ('visibility' in p || 'basemap' in p || 'overlays' in p || 'lighting' in p) {
    storage.set('prefs', { visibility: state.visibility, basemap: state.basemap, overlays: state.overlays, lighting: state.lighting });
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
