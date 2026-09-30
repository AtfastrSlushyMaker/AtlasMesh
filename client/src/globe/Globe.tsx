import { useEffect, useRef, useState } from 'react';
import * as Cesium from 'cesium';
import { createViewer, setBasemap, setOverlay, Overlay } from './engine';
import { LAYER_COMPONENTS } from './layers';
import { LAYERS, LAYER_BY_ID } from '../lib/layers';
import { entityIndex, displayName } from './index';
import { setSubscribedLayers, startLive } from '../lib/live';
import { setApp, setViewer, useApp, getApp } from '../state';
import { fmtAltitude, fmtDMS } from '../lib/format';

/** Resolve the data id behind a picked Cesium object (tracks/trails map back to their parent). */
function pickedId(picked: any): string | null {
  const ent = picked?.id;
  if (!ent) return null;
  if (ent instanceof Cesium.Entity) {
    const id = String(ent.id);
    const base = id.replace(/:(trail|track|seg\d+)$/, '');
    return entityIndex.has(base) ? base : null;
  }
  // Clustered billboards: picked.id is an array of entities
  if (Array.isArray(ent) && ent[0] instanceof Cesium.Entity) return null;
  return null;
}

export function currentPosition(id: string): { lat: number; lon: number; alt: number } | null {
  const viewer = (window as any).__atlasViewer as Cesium.Viewer | undefined;
  if (!viewer) return null;
  for (let i = 0; i < viewer.dataSources.length; i++) {
    const ent = viewer.dataSources.get(i).entities.getById(id);
    const p = ent?.position?.getValue(viewer.clock.currentTime);
    if (p) {
      const c = Cesium.Cartographic.fromCartesian(p);
      return { lat: Cesium.Math.toDegrees(c.latitude), lon: Cesium.Math.toDegrees(c.longitude), alt: c.height };
    }
  }
  const e = entityIndex.get(id);
  return e ? { lat: e.position.lat, lon: e.position.lon, alt: e.position.alt ?? 0 } : null;
}

export function Globe() {
  const container = useRef<HTMLDivElement>(null);
  const [viewer, setLocalViewer] = useState<Cesium.Viewer | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const visibility = useApp((s) => s.visibility);
  const basemap = useApp((s) => s.basemap);
  const overlays = useApp((s) => s.overlays);
  const lighting = useApp((s) => s.lighting);
  const selectedId = useApp((s) => s.selectedId);
  const mode = useApp((s) => s.mode);
  const [hover, setHover] = useState<{ x: number; y: number; text: string; sub: string } | null>(null);
  const [cursor, setCursor] = useState<{ lat: number; lon: number } | null>(null);
  const [cameraAlt, setCameraAlt] = useState(0);

  // Create viewer once
  useEffect(() => {
    if (!container.current) return;
    let v: Cesium.Viewer;
    try {
      v = createViewer(container.current);
    } catch (err: any) {
      setFailed(err?.message || 'WebGL is not available');
      return;
    }
    (window as any).__atlasViewer = v;
    setViewer(v);
    setLocalViewer(v);
    startLive();

    const handler = new Cesium.ScreenSpaceEventHandler(v.scene.canvas);
    handler.setInputAction((click: any) => {
      const picked = v.scene.pick(click.position);
      if (Array.isArray(picked?.id)) {
        // Cluster: zoom in on it
        const p = v.scene.pickPosition(click.position) || v.camera.pickEllipsoid(click.position);
        if (p) {
          const c = Cesium.Cartographic.fromCartesian(p);
          v.camera.flyTo({ destination: Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, Math.max(v.camera.positionCartographic.height / 3, 20000)), duration: 0.9 });
        }
        return;
      }
      setApp({ selectedId: pickedId(picked) });
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    let lastPick = 0;
    handler.setInputAction((move: any) => {
      const now = performance.now();
      const p = v.camera.pickEllipsoid(move.endPosition);
      if (p) {
        const c = Cesium.Cartographic.fromCartesian(p);
        setCursor({ lat: Cesium.Math.toDegrees(c.latitude), lon: Cesium.Math.toDegrees(c.longitude) });
      } else setCursor(null);
      if (now - lastPick < 90) return;
      lastPick = now;
      const picked = v.scene.pick(move.endPosition);
      if (Array.isArray(picked?.id)) {
        setHover({ x: move.endPosition.x, y: move.endPosition.y, text: `${picked.id.length} items`, sub: 'Click to zoom in' });
        v.scene.canvas.style.cursor = 'pointer';
        return;
      }
      const id = pickedId(picked);
      const e = id ? entityIndex.get(id) : null;
      v.scene.canvas.style.cursor = e ? 'pointer' : '';
      setHover(e ? { x: move.endPosition.x, y: move.endPosition.y, text: displayName(e), sub: LAYER_BY_ID[e.type]?.noun || e.type } : null);
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);

    const onCam = () => setCameraAlt(v.camera.positionCartographic.height);
    v.camera.changed.addEventListener(onCam);
    v.camera.percentageChanged = 0.05;
    onCam();

    return () => {
      handler.destroy();
      setViewer(null);
      (window as any).__atlasViewer = undefined;
      if (!v.isDestroyed()) v.destroy();
    };
  }, []);

  // Subscribe server feed to visible layers
  useEffect(() => {
    setSubscribedLayers(LAYERS.filter((l) => visibility[l.id]).map((l) => l.id));
  }, [visibility]);

  const appliedBasemap = useRef<string | null>(null);
  useEffect(() => {
    if (!viewer || appliedBasemap.current === basemap) return;
    const first = appliedBasemap.current === null;
    appliedBasemap.current = basemap;
    setBasemap(viewer, basemap);
    // Label colours follow the basemap; the overlay effect handles the first load.
    if (!first && getApp().overlays.labels) setOverlay(viewer, 'labels', true, basemap);
  }, [viewer, basemap]);

  const appliedOverlays = useRef<Record<string, boolean>>({});
  useEffect(() => {
    if (!viewer) return;
    for (const [id, on] of Object.entries(overlays)) {
      if (!!appliedOverlays.current[id] === on) continue;
      appliedOverlays.current[id] = on;
      setOverlay(viewer, id as Overlay, on, basemap).catch(() => {
        appliedOverlays.current[id] = false;
      });
    }
  }, [viewer, overlays, basemap]);

  useEffect(() => {
    if (!viewer) return;
    viewer.scene.globe.enableLighting = lighting;
    viewer.scene.requestRender();
  }, [viewer, lighting]);

  // Selection ring follows the selected entity
  useEffect(() => {
    if (!viewer || !selectedId) return;
    let target: Cesium.Entity | undefined;
    for (let i = 0; i < viewer.dataSources.length && !target; i++) target = viewer.dataSources.get(i).entities.getById(selectedId);
    if (!target?.position) return;
    const ring = viewer.entities.add({
      position: target.position as any,
      point: { pixelSize: 26, color: Cesium.Color.TRANSPARENT, outlineColor: Cesium.Color.fromCssColorString('#d9468f'), outlineWidth: 2.5, disableDepthTestDistance: 0 },
    });
    viewer.scene.requestRender();
    return () => {
      if (!viewer.isDestroyed()) viewer.entities.remove(ring);
      viewer.scene.requestRender();
    };
  }, [viewer, selectedId]);

  // Pause rendering while the Intel workspace covers the globe.
  useEffect(() => {
    if (!viewer) return;
    viewer.useDefaultRenderLoop = mode === 'globe';
  }, [viewer, mode]);

  if (failed) {
    return (
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 24 }}>
        <div className="panel" style={{ maxWidth: 440, padding: 24 }}>
          <h2 className="panel-title">The 3D globe can't start</h2>
          <p className="muted">This browser didn't provide WebGL ({failed}). Enable hardware acceleration or try another browser. The Intel workspace still works.</p>
          <button className="btn btn-primary" onClick={() => setApp({ mode: 'intel' })}>Open Intel workspace</button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div ref={container} style={{ position: 'absolute', inset: 0 }} aria-label="3D globe" role="application" />
      {viewer && LAYERS.map((l) => {
        const Comp = LAYER_COMPONENTS[l.id];
        return Comp ? <Comp key={l.id} viewer={viewer} visible={!!visibility[l.id]} /> : null;
      })}
      {hover && (
        <div
          className="panel"
          style={{
            position: 'absolute',
            left: hover.x + 14,
            top: hover.y + 14,
            padding: '6px 10px',
            pointerEvents: 'none',
            zIndex: 15,
            maxWidth: 280,
            boxShadow: 'none',
          }}
        >
          <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{hover.text}</div>
          <div className="muted" style={{ fontSize: 12 }}>{hover.sub}</div>
        </div>
      )}
      <Readout cursor={cursor} altitude={cameraAlt} />
    </>
  );
}

/** Chart-style neatline readout: cursor position and eye altitude. */
function Readout({ cursor, altitude }: { cursor: { lat: number; lon: number } | null; altitude: number }) {
  return (
    <div className="readout" aria-live="off">
      <span>{cursor ? fmtDMS(cursor.lat, cursor.lon) : 'Move over the globe'}</span>
      <span className="readout-sep" />
      <span title="Camera altitude">Eye {fmtAltitude(altitude)}</span>
    </div>
  );
}
