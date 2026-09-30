import { useCallback, useEffect, useState } from 'react';
import { Globe, currentPosition } from './globe/Globe';
import { Rail } from './shell/Rail';
import { TopBar, MapControls } from './shell/TopBar';
import { ActivityDrawer, FeedsDrawer, LayersDrawer } from './shell/Drawers';
import { Inspector } from './shell/Inspector';
import { HelpDialog, Palette } from './shell/Palette';
import { Toasts } from './shell/toast';
import { Logo } from './shell/Logo';
import { getApp, getViewer, setApp, useApp } from './state';
import { flyTo } from './globe/engine';
import { entityIndex } from './globe/index';
import { useLive } from './lib/live';
import './shell/shell.css';

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
      if (e.key === 'Escape') {
        const s = getApp();
        if (s.paletteOpen) setApp({ paletteOpen: false });
        else if (s.helpOpen) setApp({ helpOpen: false });
        else if (s.mode === 'globe' && s.selectedId) setApp({ selectedId: null });
        else if (s.mode === 'globe' && s.drawer) setApp({ drawer: null });
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
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
          setApp((s) => ({ mode: 'globe', drawer: s.drawer === 'layers' ? null : 'layers' }));
          break;
        case 'a':
          setApp((s) => ({ mode: 'globe', drawer: s.drawer === 'activity' ? null : 'activity' }));
          break;
        case 'i':
          setApp({ mode: 'intel' });
          break;
        case 'g':
          setApp({ mode: 'globe' });
          break;
        case '+':
        case '=':
          if (v && getApp().mode === 'globe') v.camera.zoomIn(v.camera.positionCartographic.height * 0.4);
          break;
        case '-':
          if (v && getApp().mode === 'globe') v.camera.zoomOut(v.camera.positionCartographic.height * 0.7);
          break;
        case 'h':
          if (v && getApp().mode === 'globe') flyTo(v, 20, v.camera.positionCartographic.longitude * (180 / Math.PI), 22_000_000);
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

function Boot() {
  const { conn } = useLive();
  const [done, setDone] = useState(false);
  useEffect(() => {
    // Hide once connected (or after a few seconds so a dead server doesn't block the UI).
    if (conn === 'live') {
      const t = setTimeout(() => setDone(true), 400);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setDone(true), 4000);
    return () => clearTimeout(t);
  }, [conn]);
  return (
    <div className="boot" data-done={done} aria-hidden={done}>
      <div style={{ display: 'grid', justifyItems: 'center', gap: 14 }}>
        <Logo size={64} />
        <div className="panel-title">AtlasMesh</div>
        <div className="muted" style={{ fontSize: 14 }}>{conn === 'live' ? 'Loading layers' : 'Connecting to live feeds'}</div>
      </div>
    </div>
  );
}

export default function App() {
  const mode = useApp((s) => s.mode);
  const drawer = useApp((s) => s.drawer);
  useShortcuts();

  useEffect(() => {
    document.body.dataset.drawer = drawer && mode === 'globe' ? 'open' : '';
  }, [drawer, mode]);

  const pick = useCallback((id: string) => {
    const e = entityIndex.get(id);
    const v = getViewer();
    setApp({ mode: 'globe', selectedId: id, ...(window.innerWidth < 900 ? { drawer: null } : {}) });
    const p = currentPosition(id) || (e && { lat: e.position.lat, lon: e.position.lon, alt: e.position.alt ?? 0 });
    if (v && p) flyTo(v, p.lat, p.lon, Math.max((p.alt || 0) * 2.5, e?.type === 'camera' ? 30_000 : 600_000));
  }, []);

  return (
    <div className="app">
      <Globe />
      {mode === 'globe' && (
        <>
          <div className="neatline" aria-hidden />
          <TopBar />
          <MapControls />
          {drawer === 'layers' && <LayersDrawer />}
          {drawer === 'activity' && <ActivityDrawer onPick={pick} />}
          {drawer === 'feeds' && <FeedsDrawer />}
          <Inspector onPick={pick} />
        </>
      )}
      <Rail />
      <Palette onPick={pick} />
      <HelpDialog />
      <Toasts />
      <Boot />
    </div>
  );
}
