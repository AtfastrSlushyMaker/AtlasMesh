import { useSyncExternalStore } from 'react';
import * as Cesium from 'cesium';
import { mdiMagnify, mdiPlus, mdiMinus, mdiCrosshairsGps, mdiEarth } from '@mdi/js';
import { Icon } from './Icon';
import { useLive } from '../lib/live';
import { setApp, getViewer } from '../state';
import { entityIndex, indexVersion, subscribeIndex } from '../globe/index';
import { fmtInt } from '../lib/format';
import { flyTo } from '../globe/engine';
import { toast } from './toast';

const CONN_TEXT = {
  connecting: ['Connecting', 'var(--paper-3)'],
  live: ['Live', 'var(--ok)'],
  reconnecting: ['Reconnecting', 'var(--warn)'],
  offline: ['Offline', 'var(--bad)'],
} as const;

export function TopBar() {
  const { conn } = useLive();
  useSyncExternalStore(subscribeIndex, indexVersion);
  const [label, color] = CONN_TEXT[conn];
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  return (
    <div className="topbar">
      <button className="search-trigger" onClick={() => setApp({ paletteOpen: true })} aria-label="Search places, entities and commands">
        <Icon path={mdiMagnify} />
        <span style={{ flex: 1 }}>Search aircraft, cities, cameras…</span>
        <span className="kbd">{isMac ? '⌘' : 'Ctrl'} K</span>
      </button>
      <div className="status-pill" title={`Connection: ${label}`}>
        <span className="dot" style={{ background: color }} />
        <span className="status-label">{label}</span>
        <span className="status-count">{fmtInt(entityIndex.size)}</span>
        <span className="status-label muted">on globe</span>
      </div>
    </div>
  );
}

export function MapControls() {
  const zoom = (factor: number) => {
    const v = getViewer();
    if (!v) return;
    const h = v.camera.positionCartographic.height;
    if (factor < 1) v.camera.zoomIn(h * (1 - factor));
    else v.camera.zoomOut(h * (factor - 1));
    v.scene.requestRender();
  };
  const home = () => {
    const v = getViewer();
    if (!v) return;
    const c = v.camera.positionCartographic;
    v.camera.flyTo({ destination: Cesium.Cartesian3.fromRadians(c.longitude, Cesium.Math.toRadians(20), 22_000_000), duration: 1.4 });
  };
  const locate = () => {
    if (!navigator.geolocation) return toast('This browser cannot share its location.', 'error');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const v = getViewer();
        if (v) flyTo(v, p.coords.latitude, p.coords.longitude, 60_000);
      },
      (err) => toast(err.code === err.PERMISSION_DENIED ? 'Location permission was denied.' : 'Your location could not be determined.', 'error'),
      { timeout: 8000 }
    );
  };
  return (
    <div className="map-controls panel" role="group" aria-label="Map controls">
      <button className="icon-btn" onClick={() => zoom(0.55)} aria-label="Zoom in" title="Zoom in (+)"><Icon path={mdiPlus} /></button>
      <button className="icon-btn" onClick={() => zoom(1.8)} aria-label="Zoom out" title="Zoom out (−)"><Icon path={mdiMinus} /></button>
      <hr className="divider" />
      <button className="icon-btn" onClick={home} aria-label="Show whole Earth" title="Whole Earth (H)"><Icon path={mdiEarth} /></button>
      <button className="icon-btn" onClick={locate} aria-label="Go to my location" title="My location"><Icon path={mdiCrosshairsGps} /></button>
    </div>
  );
}
