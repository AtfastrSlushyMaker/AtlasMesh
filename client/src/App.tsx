import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { mdiWifiOff } from '@mdi/js';
import { Globe, currentPosition } from './globe/Globe';
import { Rail } from './shell/Rail';
import { EarthStrip, MapControls } from './shell/TopBar';
import { ActivityDrawer, FeedsDrawer, LayersDrawer } from './shell/Drawers';
import { Inspector } from './shell/Inspector';
import { HelpDialog, Palette } from './shell/Palette';
import { Settings } from './shell/Settings';
import { Welcome } from './shell/Welcome';
import { ConfirmHost } from './shell/confirm';
import { RunLocallyDialog } from './shell/RunLocally';
import { api } from './lib/api';
import { Toasts } from './shell/toast';
import { Icon } from './shell/Icon';
import { Logo } from './shell/Logo';
import { getApp, getViewer, setApp, useApp } from './state';
import { flyTo } from './globe/engine';
import { entityIndex, subscribeIndex } from './globe/index';
import { useLive } from './lib/live';
import { applyUrlState, syncUrlSoon } from './lib/url';
import './shell/shell.css';

// Cytoscape and the workspace load only when Intel is opened.
const IntelWorkspace = lazy(() => import('./intel/Workspace'));

const initialUrl = applyUrlState();

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setApp((s) => ({ paletteOpen: !s.paletteOpen }));
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        setApp({ settings: 'general' });
        return;
      }
      const s = getApp();
      if (e.key === 'Escape') {
        if (s.paletteOpen) setApp({ paletteOpen: false });
        else if (s.helpOpen) setApp({ helpOpen: false });
        else if (s.settings) return; // Settings handles its own Escape
        else if (s.mode === 'globe' && s.selectedId) setApp({ selectedId: null });
        else if (s.mode === 'globe' && s.drawer) setApp({ drawer: null });
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey || s.settings) return;
      const v = getViewer();
      switch (e.key) {
        case '/':
          e.preventDefault();
          setApp({ paletteOpen: true });
          break;
        case '?':
          setApp({ helpOpen: true });
          break;
        case 'l':
          setApp((st) => ({ mode: 'globe', drawer: st.drawer === 'layers' ? null : 'layers' }));
          break;
        case 'a':
          setApp((st) => ({ mode: 'globe', drawer: st.drawer === 'activity' ? null : 'activity' }));
          break;
        case 'f':
          setApp((st) => ({ mode: 'globe', drawer: st.drawer === 'feeds' ? null : 'feeds' }));
          break;
        case 'i':
          setApp({ mode: 'intel' });
          break;
        case 'g':
          setApp({ mode: 'globe' });
          break;
        case '+':
        case '=':
          if (v && s.mode === 'globe') v.camera.zoomIn(v.camera.positionCartographic.height * 0.4);
          break;
        case '-':
          if (v && s.mode === 'globe') v.camera.zoomOut(v.camera.positionCartographic.height * 0.7);
          break;
        case 'h':
          if (v && s.mode === 'globe') flyTo(v, 20, v.camera.positionCartographic.longitude * (180 / Math.PI), 22_000_000);
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/** Apply theme, motion and theme-color from preferences. */
function useTheme() {
  const theme = useApp((s) => s.prefs.theme);
  const motion = useApp((s) => s.prefs.motion);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const resolved = theme === 'system' ? (mq.matches ? 'night' : 'day') : theme;
      document.documentElement.dataset.theme = resolved;
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'night' ? '#121d24' : '#eef1f2');
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
  useEffect(() => {
    document.documentElement.dataset.motion = motion === 'reduce' ? 'reduce' : '';
  }, [motion]);
}

/** Keep the URL hash in step with the view so it can be shared or reloaded. */
function useUrlSync() {
  const mode = useApp((s) => s.mode);
  const sel = useApp((s) => s.selectedId);
  useEffect(() => {
    syncUrlSoon();
  }, [mode, sel]);
  useEffect(() => {
    const t = setInterval(() => {
      const v = getViewer();
      if (!v || v.isDestroyed()) return;
      clearInterval(t);
      if (initialUrl.cam) flyTo(v, initialUrl.cam.lat, initialUrl.cam.lon, initialUrl.cam.h);
      v.camera.moveEnd.addEventListener(syncUrlSoon);
    }, 200);
    return () => clearInterval(t);
  }, []);
}

/** Persistent banner when live data is interrupted (system status, not a toast). */
function ConnectionBanner() {
  const { conn } = useLive();
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (conn === 'live' || conn === 'connecting') return setShow(false);
    // Short blips don't deserve a banner.
    const t = setTimeout(() => setShow(true), 4000);
    return () => clearTimeout(t);
  }, [conn]);
  if (!show) return null;
  return (
    <div className="banner" role="status">
      <Icon path={mdiWifiOff} color="var(--warn)" />
      <span>
        {conn === 'offline' ? 'Live data stopped: the server can’t be reached.' : 'Live data paused while reconnecting…'} The globe keeps the last positions it received.
      </span>
      <button className="btn btn-sm" onClick={() => location.reload()}>Reload</button>
    </div>
  );
}

function Boot() {
  const { conn } = useLive();
  const [done, setDone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDone(true), conn === 'live' ? 400 : 4000);
    return () => clearTimeout(t);
  }, [conn]);
  return (
    <div className="boot" data-done={done} aria-hidden={done}>
      <div style={{ display: 'grid', justifyItems: 'center', gap: 12 }}>
        <Logo size={64} />
        <div className="panel-title" style={{ fontSize: 28 }} translate="no">AtlasMesh</div>
        <div className="muted" style={{ fontSize: 14 }}>{conn === 'live' ? 'Loading layers…' : 'Connecting to live feeds…'}</div>
      </div>
    </div>
  );
}

export default function App() {
  const mode = useApp((s) => s.mode);
  const drawer = useApp((s) => s.drawer);
  const stageRef = useRef<HTMLElement>(null);
  useShortcuts();
  useTheme();
  useUrlSync();

  useEffect(() => {
    api<{ mode: 'full' | 'showcase'; repoUrl: string; image: string }>('/api/config')
      .then((server) => setApp({ server }))
      .catch(() => setApp({ server: { mode: 'full', repoUrl: '', image: '' } }));
  }, []);

  useEffect(() => {
    document.body.dataset.drawer = drawer && mode === 'globe' ? 'open' : '';
  }, [drawer, mode]);

  // A shared link names an entity; fly to it once its layer has loaded.
  useEffect(() => {
    const id = initialUrl.sel;
    if (!id) return;
    if (entityIndex.has(id)) return void (!initialUrl.cam && pickRef.current(id));
    const unsub = subscribeIndex(() => {
      if (!entityIndex.has(id)) return;
      unsub();
      if (!initialUrl.cam) pickRef.current(id);
    });
    const t = setTimeout(unsub, 60000);
    return () => {
      unsub();
      clearTimeout(t);
    };
  }, []);

  const pick = useCallback((id: string) => {
    const e = entityIndex.get(id);
    const v = getViewer();
    setApp({ mode: 'globe', selectedId: id, ...(window.innerWidth < 900 ? { drawer: null } : {}) });
    const p = currentPosition(id) || (e && { lat: e.position.lat, lon: e.position.lon, alt: e.position.alt ?? 0 });
    if (v && p) flyTo(v, p.lat, p.lon, Math.max((p.alt || 0) * 2.5, e?.type === 'camera' ? 30_000 : 600_000));
  }, []);
  const pickRef = useRef(pick);
  pickRef.current = pick;

  // Links pasted into the same tab only change the hash; apply them too.
  useEffect(() => {
    const onHash = () => {
      const p = applyUrlState();
      const v = getViewer();
      if (p.cam && v) flyTo(v, p.cam.lat, p.cam.lon, p.cam.h);
      else if (p.sel && entityIndex.has(p.sel)) pickRef.current(p.sel);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  return (
    <div className="app">
      <a className="skip-link" href="#main" onClick={(e) => { e.preventDefault(); stageRef.current?.focus(); }}>Skip to the globe</a>
      <EarthStrip />
      <main className="stage" id="main" ref={stageRef} tabIndex={-1} aria-label="Globe">
        <Globe />
        {mode === 'globe' && (
          <>
            <MapControls />
            <Welcome onPick={pick} />
          </>
        )}
      </main>
      {mode === 'globe' && (
        <>
          {drawer === 'layers' && <LayersDrawer />}
          {drawer === 'activity' && <ActivityDrawer onPick={pick} />}
          {drawer === 'feeds' && <FeedsDrawer />}
          <Inspector onPick={pick} />
          <ConnectionBanner />
        </>
      )}
      {mode === 'intel' && (
        <Suspense fallback={<div className="boot"><div className="spinner" /></div>}>
          <IntelWorkspace />
        </Suspense>
      )}
      <Rail />
      <Palette onPick={pick} />
      <HelpDialog />
      <Settings />
      <RunLocallyDialog />
      <ConfirmHost />
      <Toasts />
      <Boot />
    </div>
  );
}
