import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import * as Cesium from 'cesium';
import { mdiMagnify, mdiPlus, mdiMinus, mdiCrosshairsGps, mdiEarth, mdiCogOutline, mdiShareVariantOutline } from '@mdi/js';
import { Icon } from './Icon';
import { Logo } from './Logo';
import { useLive } from '../lib/live';
import { setApp, getViewer, useApp, setPrefs } from '../state';
import { entityIndex, indexVersion, subscribeIndex, countsByType } from '../globe/index';
import { fmtClock, fmtInt, fmtCompact } from '../lib/format';
import { flyTo } from '../globe/engine';
import { LAYER_BY_ID } from '../lib/layers';
import { toast } from './toast';
import { shareUrl } from '../lib/url';

const CONN_TEXT = {
  connecting: ['Connecting…', 'var(--text-3)'],
  live: ['Live', 'var(--ok)'],
  reconnecting: ['Reconnecting…', 'var(--warn)'],
  offline: ['Offline', 'var(--bad)'],
} as const;

function Clock() {
  const clock = useApp((s) => s.prefs.clock);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const c = fmtClock(now);
  return (
    <button
      className="strip-clock"
      onClick={() => setPrefs({ clock: clock === 'utc' ? 'local' : 'utc' })}
      title={`Switch to ${clock === 'utc' ? 'local time' : 'UTC'}`}
      aria-label={`${c.time} ${c.zone}. Switch to ${clock === 'utc' ? 'local time' : 'UTC'}`}
    >
      <span className="num" translate="no">{c.time}</span>
      <small>{c.zone} · {c.date}</small>
    </button>
  );
}

/** Live counts that double as layer toggles. */
function Counters() {
  const version = useSyncExternalStore(subscribeIndex, indexVersion);
  const visibility = useApp((s) => s.visibility);
  const counts = countsByType();
  const quakes = useMemo(() => {
    let strong = 0;
    for (const e of entityIndex.values()) if (e.type === 'earthquake' && Number(e.metadata?.mag) >= 4.5) strong++;
    return strong;
  }, [version]);
  const alerts = useMemo(() => {
    let n = 0;
    for (const e of entityIndex.values()) if (e.type === 'disaster' && e.metadata?.alertLevel !== 'Green') n++;
    return n;
  }, [version]);

  const items: Array<{ id: keyof typeof LAYER_BY_ID; label: string; value: number; sub?: string }> = [
    { id: 'aircraft', label: 'Aircraft', value: counts.aircraft || 0 },
    { id: 'earthquake', label: 'Quakes 24 h', value: counts.earthquake || 0, sub: quakes ? `${quakes} ≥ M4.5` : undefined },
    { id: 'disaster', label: 'Alerts', value: alerts, sub: 'orange + red' },
    { id: 'wildfire', label: 'Fire hotspots', value: counts.wildfire || 0 },
    { id: 'satellite', label: 'Satellites', value: counts.satellite || 0 },
    { id: 'camera', label: 'Cameras', value: counts.camera || 0 },
  ];
  return (
    <div className="counters" role="group" aria-label="Live counts. Select to show or hide a layer.">
      {items.map((it) => {
        const l = LAYER_BY_ID[it.id];
        const on = !!visibility[it.id];
        return (
          <button
            key={it.id}
            className="counter"
            aria-pressed={on}
            style={{ ['--c' as any]: l.color }}
            title={`${on ? 'Hide' : 'Show'} ${l.label.toLowerCase()}${it.sub ? ` · ${it.sub}` : ''}`}
            onClick={() => setApp((s) => ({ visibility: { ...s.visibility, [it.id]: !s.visibility[it.id] } }))}
          >
            <span className="num">{on ? (it.value >= 10000 ? fmtCompact(it.value) : fmtInt(it.value)) : 'off'}</span>
            <span className="label">
              <Icon path={l.icon} size={13} color={l.color} />
              {it.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function EarthStrip() {
  const { conn } = useLive();
  const mode = useApp((s) => s.mode);
  const showcase = useApp((s) => s.server?.mode === 'showcase');
  const [label, color] = CONN_TEXT[conn];
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  return (
    <header className="strip">
      <div className="strip-brand">
        <span className="brand-tile"><Logo size={30} /></span>
      </div>
      <div className="strip-wordmark" translate="no">AtlasMesh</div>
      <Clock />
      {mode === 'globe' ? <Counters /> : <div className="counters" style={{ alignItems: 'center', padding: '0 16px', fontWeight: 700 }}>Intel workspace</div>}
      <div className="strip-spacer" />
      {showcase && (
        <button className="btn btn-primary btn-sm demo-badge" style={{ alignSelf: 'center', marginLeft: 12 }} onClick={() => setApp({ runLocalOpen: true })}>
          Public demo · Run your own
        </button>
      )}
      <button className="strip-search" onClick={() => setApp({ paletteOpen: true })} aria-label="Search places, entities and commands">
        <Icon path={mdiMagnify} />
        <span className="search-text" style={{ flex: 1 }}>Search the globe…</span>
        <span className="kbd">{isMac ? '⌘' : 'Ctrl'}&nbsp;K</span>
      </button>
      <div className="strip-status" role="status" aria-live="polite">
        <span className="dot" style={{ background: color }} />
        <span className="status-label">{label}</span>
      </div>
      <div className="strip-actions">
        {mode === 'globe' && (
          <button
            className="icon-btn"
            aria-label="Copy a link to this view"
            title="Copy a link to this view"
            onClick={() => navigator.clipboard?.writeText(shareUrl()).then(() => toast('Link to this view copied', 'success'))}
          >
            <Icon path={mdiShareVariantOutline} />
          </button>
        )}
        <button className="icon-btn" aria-label="Settings" title="Settings" onClick={() => setApp({ settings: 'general' })}>
          <Icon path={mdiCogOutline} />
        </button>
      </div>
    </header>
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
    if (!navigator.geolocation) return toast('This browser can’t share its location.', 'error');
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const v = getViewer();
        if (v) flyTo(v, p.coords.latitude, p.coords.longitude, 60_000);
      },
      (err) => toast(err.code === err.PERMISSION_DENIED ? 'Location permission was denied. Allow it in the browser’s site settings to use this.' : 'Your location couldn’t be determined. Try again outdoors or on Wi-Fi.', 'error'),
      { timeout: 8000 }
    );
  };
  return (
    <div className="map-controls" role="group" aria-label="Map controls">
      <button className="icon-btn" onClick={() => zoom(0.55)} aria-label="Zoom in" title="Zoom in (+)"><Icon path={mdiPlus} /></button>
      <button className="icon-btn" onClick={() => zoom(1.8)} aria-label="Zoom out" title="Zoom out (−)"><Icon path={mdiMinus} /></button>
      <hr className="divider" />
      <button className="icon-btn" onClick={home} aria-label="Show whole Earth" title="Whole Earth (H)"><Icon path={mdiEarth} /></button>
      <button className="icon-btn" onClick={locate} aria-label="Go to my location" title="My location"><Icon path={mdiCrosshairsGps} /></button>
    </div>
  );
}
