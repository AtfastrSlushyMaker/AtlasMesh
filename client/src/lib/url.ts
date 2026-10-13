import * as Cesium from 'cesium';
import { getApp, getViewer, setApp } from '../state';
import { storage } from './api';

/**
 * Shareable view state in the URL hash:
 *   #/globe?cam=lat,lon,height&sel=<entity id>
 *   #/intel?inv=<investigation id>
 * The hash keeps it independent of server routing.
 */

interface Parsed {
  mode: 'globe' | 'intel';
  cam?: { lat: number; lon: number; h: number };
  sel?: string;
  inv?: string;
}

export function parseUrl(): Parsed {
  const [path, query = ''] = location.hash.replace(/^#/, '').split('?');
  const q = new URLSearchParams(query);
  const out: Parsed = { mode: path.startsWith('/intel') ? 'intel' : 'globe' };
  const cam = q.get('cam')?.split(',').map(Number);
  if (cam && cam.length === 3 && cam.every(Number.isFinite) && Math.abs(cam[0]) <= 90 && Math.abs(cam[1]) <= 180 && cam[2] >= 150 && cam[2] <= 60_000_000) {
    out.cam = { lat: cam[0], lon: cam[1], h: cam[2] };
  }
  const sel = q.get('sel');
  if (sel && sel.length < 200) out.sel = sel;
  const inv = q.get('inv');
  if (inv && /^inv_[0-9a-f]+$/.test(inv)) out.inv = inv;
  return out;
}

function cameraParam() {
  const v = getViewer();
  if (!v || v.isDestroyed()) return null;
  const c = v.camera.positionCartographic;
  return `${Cesium.Math.toDegrees(c.latitude).toFixed(3)},${Cesium.Math.toDegrees(c.longitude).toFixed(3)},${Math.round(c.height)}`;
}

export function buildHash() {
  const s = getApp();
  const q = new URLSearchParams();
  if (s.mode === 'intel') {
    const inv = storage.get<string | null>('intel:last', null);
    if (inv) q.set('inv', inv);
    return `#/intel${q.toString() ? `?${q}` : ''}`;
  }
  const cam = cameraParam();
  if (cam) q.set('cam', cam);
  if (s.selectedId) q.set('sel', s.selectedId);
  return `#/globe?${q.toString().replace(/%2C/g, ',').replace(/%3A/g, ':')}`;
}

export const shareUrl = () => `${location.origin}${location.pathname}${buildHash()}`;

let timer: number | null = null;
export function syncUrlSoon() {
  if (timer) clearTimeout(timer);
  timer = window.setTimeout(() => {
    const next = buildHash();
    if (next !== location.hash) history.replaceState(null, '', next);
  }, 400);
}

/** Apply the URL once at startup; camera is applied when the viewer exists. */
export function applyUrlState() {
  const p = parseUrl();
  if (p.inv) storage.set('intel:last', p.inv);
  setApp({ mode: p.mode, selectedId: p.sel ?? null });
  return p;
}
