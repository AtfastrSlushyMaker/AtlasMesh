import React, { useEffect, useRef, useState, useCallback, Suspense } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import { LayerManager } from '../components/layers/LayerManager';
import { AppUI } from '../ui/AppUI';
import { EntityInfoPanel } from '../ui/EntityInfoPanel';
import { ToastProvider, useToast } from '../ui/Toast';
import { KeyboardHelpModal } from '../ui/KeyboardHelpModal';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { LoadingScreen } from '../components/LoadingScreen';
import { useKeyboardShortcuts, Shortcut } from '../hooks/useKeyboardShortcuts';
import * as Cesium from 'cesium';
import '../styles/design-system.css';

function CesiumAppInner() {
  const viewerRef = useRef<any>(null);
  const cullLastRunAtRef = useRef(0);
  const [viewerReady, setViewerReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const wsUrl = viewerReady
    ? (typeof window !== 'undefined' && window.location.hostname !== 'localhost'
        ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`
        : 'ws://localhost:3000')
    : null;
  const { connected, lastMessage } = useWebSocket(wsUrl);
  const [visibility, setVisibility] = useState<Record<string, boolean>>({});
  const [stats, setStats] = useState<Record<string, number>>({});
  const [selectedEntity, setSelectedEntity] = useState<any>(null);
  const [searchItems, setSearchItems] = useState<Array<{
    id: string;
    name: string;
    type: string;
    lat: number;
    lon: number;
    alt?: number;
  }>>([]);
  const toast = useToast();

  // Initialize Cesium Viewer
  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        (Cesium.Ion as any).defaultAccessToken = undefined;

        const viewer = new Cesium.Viewer('cesiumContainer', {
          timeline: false,
          animation: false,
          selectionIndicator: false,
          baseLayerPicker: false,
          geocoder: false,
          homeButton: false,
          infoBox: false,
          sceneModePicker: false,
          navigationHelpButton: false,
          navigationInstructionsInitiallyVisible: false,
          fullscreenButton: false,
          creditContainer: document.createElement('div'),
          requestRenderMode: false,
          baseLayer: new Cesium.ImageryLayer(
            new Cesium.UrlTemplateImageryProvider({
              url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
              credit: 'Esri',
            })
          ),
        });

        viewer.scene.rethrowRenderErrors = false;
        const onRenderError = (_scene: any, err: any) => {
          console.error('Cesium render error (recovered):', {
            name: err?.name,
            message: err?.message,
          });
          viewer.useDefaultRenderLoop = true;
        };
        viewer.scene.renderError.addEventListener(onRenderError);

        // Globe appearance
        viewer.scene.globe.enableLighting = true;
        viewer.scene.globe.nightFadeOutDistance = 10000000.0;
        viewer.scene.globe.nightFadeInDistance = 50000000.0;
        viewer.scene.globe.showGroundAtmosphere = true;
        viewer.scene.backgroundColor = Cesium.Color.BLACK;

        // Atmosphere
        viewer.scene.skyAtmosphere.hueShift = -0.08;
        viewer.scene.skyAtmosphere.saturationShift = -0.3;
        viewer.scene.skyAtmosphere.brightnessShift = -0.2;

        // Camera controls
        viewer.scene.screenSpaceCameraController.enableZoom = true;
        viewer.scene.screenSpaceCameraController.enableInputs = true;
        viewer.scene.screenSpaceCameraController.enableRotate = true;
        viewer.scene.screenSpaceCameraController.enableTilt = true;
        viewer.scene.screenSpaceCameraController.enableLook = true;
        viewer.scene.screenSpaceCameraController.inertiaZoom = 0.8;
        viewer.scene.screenSpaceCameraController.inertiaSpin = 0.9;
        viewer.scene.screenSpaceCameraController.inertiaTranslate = 0.9;
        viewer.scene.screenSpaceCameraController.minimumZoomDistance = 100;
        viewer.scene.screenSpaceCameraController.maximumZoomDistance = 50000000;

        // Clock
        viewer.clock.shouldAnimate = true;
        viewer.clock.clockRange = Cesium.ClockRange.UNBOUNDED;
        viewer.clock.multiplier = 1;

        // Touchpad-friendly zoom: intercept wheel and use smooth camera movement
        const canvas = viewer.scene.canvas as HTMLCanvasElement;
        let zoomTarget = 0;
        let zoomAnimId: number | null = null;

        const smoothZoom = () => {
          if (Math.abs(zoomTarget) < 1) {
            zoomTarget = 0;
            zoomAnimId = null;
            return;
          }
          const step = zoomTarget * 0.15;
          zoomTarget -= step;
          const cameraHeight = viewer.camera.positionCartographic.height;
          const moveDistance = Math.max(100, cameraHeight * 0.002) * Math.sign(step) * Math.min(Math.abs(step), 50);
          if (moveDistance > 0) {
            viewer.camera.moveBackward(moveDistance);
          } else {
            viewer.camera.moveForward(-moveDistance);
          }
          zoomAnimId = requestAnimationFrame(smoothZoom);
        };

        const onWheel = (e: WheelEvent) => {
          e.preventDefault();
          const delta = e.deltaY;
          // Normalize trackpad vs mouse wheel
          const sensitivity = e.deltaMode === WheelEvent.DOM_DELTA_PIXEL ? 0.5 : 4;
          zoomTarget += delta * sensitivity;
          // Clamp to prevent runaway zoom
          zoomTarget = Math.max(-3000, Math.min(3000, zoomTarget));
          if (!zoomAnimId) {
            zoomAnimId = requestAnimationFrame(smoothZoom);
          }
        };

        canvas.addEventListener('wheel', onWheel, { passive: false });
        (viewer as any).__wheelHandler = onWheel;

        // Click handler
        const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        handler.setInputAction((click: any) => {
          const pickedObject = viewer.scene.pick(click.position);
          if (Cesium.defined(pickedObject) && pickedObject.id) {
            const entity = pickedObject.id;
            const id = entity.id || '';
            const type = (entity as any)._entityType || id.split(':')[0] || 'unknown';

            let posInfo: Record<string, string> = {};
            if (entity.position) {
              try {
                const cartesian = typeof entity.position.getValue === 'function'
                  ? entity.position.getValue(viewer.clock.currentTime)
                  : entity.position;
                if (cartesian) {
                  const carto = Cesium.Cartographic.fromCartesian(cartesian);
                  posInfo = {
                    lat: Cesium.Math.toDegrees(carto.latitude).toFixed(4),
                    lon: Cesium.Math.toDegrees(carto.longitude).toFixed(4),
                    alt: (carto.height / 1000).toFixed(1) + ' km',
                  };
                }
              } catch (e) { }
            }

            setSelectedEntity({
              id,
              type,
              position: posInfo,
              metadata: (entity as any)._metadata || {},
              name: (entity as any)._displayName || id,
            });
          } else {
            setSelectedEntity(null);
          }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

        (viewer as any).__cesium = Cesium;
        (viewer as any).__handler = handler;
        (viewer as any).__renderErrorHandler = onRenderError;

        if (mounted) {
          viewerRef.current = viewer;
          setViewerReady(true);
          setTimeout(() => setLoading(false), 800);
        }
      } catch (e) {
        console.error('Cesium failed to load', e);
        toast.addToast('Failed to initialize 3D globe', 'error', 6000);
        setLoading(false);
      }
    }

    init();

    return () => {
      mounted = false;
      if (viewerRef.current) {
        try {
          if ((viewerRef.current as any).__handler) {
            (viewerRef.current as any).__handler.destroy();
          }
          if ((viewerRef.current as any).__renderErrorHandler) {
            viewerRef.current.scene.renderError.removeEventListener((viewerRef.current as any).__renderErrorHandler);
          }
          if ((viewerRef.current as any).__wheelHandler) {
            (viewerRef.current.scene.canvas as HTMLCanvasElement).removeEventListener('wheel', (viewerRef.current as any).__wheelHandler);
          }
          viewerRef.current.destroy();
        } catch (e) { }
        viewerRef.current = null;
      }
    };
  }, []);

  // Recount entity stats on websocket messages
  useEffect(() => {
    if (!viewerReady) return;
    const counts: Record<string, number> = {};
    const entities = viewerRef.current.entities.values;
    entities.forEach((ent: any) => {
      const type = ent._entityType || ent.id?.split(':')?.[0];
      if (type) counts[type] = (counts[type] || 0) + 1;
    });
    setStats(counts);
  }, [lastMessage, viewerReady]);

  // Periodic recount and search index update
  useEffect(() => {
    if (!viewerReady) return;
    const interval = setInterval(() => {
      const counts: Record<string, number> = {};
      const dataSources = viewerRef.current?.dataSources;
      const nextSearchItems: typeof searchItems = [];

      if (dataSources) {
        for (let i = 0; i < dataSources.length; i++) {
          const ds = dataSources.get(i);
          const entities = ds.entities.values;
          entities.forEach((ent: any) => {
            const type = ent._entityType || ent.id?.split(':')?.[0];
            if (type) counts[type] = (counts[type] || 0) + 1;

            if (nextSearchItems.length < 15000) {
              let cartesian: any = null;
              if (ent.position) {
                cartesian = typeof ent.position.getValue === 'function'
                  ? ent.position.getValue(viewerRef.current.clock.currentTime)
                  : ent.position;
              }
              if (cartesian) {
                const carto = Cesium.Cartographic.fromCartesian(cartesian);
                if (carto) {
                  nextSearchItems.push({
                    id: ent.id,
                    name: ent._displayName || ent.id,
                    type: type || 'unknown',
                    lat: Cesium.Math.toDegrees(carto.latitude),
                    lon: Cesium.Math.toDegrees(carto.longitude),
                    alt: carto.height,
                  });
                }
              }
            }
          });
        }
      }
      setSearchItems(nextSearchItems);
      setStats(counts);
    }, 3000);
    return () => clearInterval(interval);
  }, [viewerReady]);

  const onFocusEntity = useCallback((item: { id: string; name: string; type: string; lat: number; lon: number; alt?: number }) => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    let entity = viewer.entities.getById(item.id);
    if (!entity) {
      for (let i = 0; i < viewer.dataSources.length; i++) {
        const ds = viewer.dataSources.get(i);
        const found = ds.entities.getById(item.id);
        if (found) { entity = found; break; }
      }
    }

    const baseRange = item.type === 'satellite' ? 900000 : item.type === 'cable' ? 3500000 : 1200000;
    const targetPosition = Cesium.Cartesian3.fromDegrees(item.lon, item.lat, item.alt || 0);

    viewer.camera.flyTo({
      destination: targetPosition,
      orientation: { heading: viewer.camera.heading, pitch: Cesium.Math.toRadians(-50), roll: 0 },
      duration: 1.4,
      complete: () => viewer.camera.moveBackward(baseRange),
    });

    if (entity) {
      setSelectedEntity({
        id: entity.id,
        type: entity._entityType || item.type,
        position: {
          lat: item.lat.toFixed(4),
          lon: item.lon.toFixed(4),
          alt: `${((item.alt || 0) / 1000).toFixed(1)} km`,
        },
        metadata: entity._metadata || {},
        name: entity._displayName || item.name,
      });
    }
  }, []);

  const onZoomIn = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const h = viewer.camera.positionCartographic.height;
    viewer.camera.zoomIn(Math.max(30000, h * 0.3));
  }, []);

  const onZoomOut = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const h = viewer.camera.positionCartographic.height;
    viewer.camera.zoomOut(Math.max(30000, h * 0.3));
  }, []);

  const onResetView = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.camera.flyHome(1.2);
  }, []);

  const onToggleHelp = useCallback(() => {
    // Handled by KeyboardHelpModal internally via '?' key
    // This is a no-op but required for prop typing
  }, []);

  const onMyLocation = useCallback(() => {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const viewer = viewerRef.current;
        if (!viewer || viewer.isDestroyed()) return;
        const CesiumRef = (viewer as any).__cesium;
        if (!CesiumRef) return;

        viewer.camera.flyTo({
          destination: CesiumRef.Cartesian3.fromDegrees(pos.coords.longitude, pos.coords.latitude, 150000),
          duration: 1.5,
          complete: () => {
            viewer.camera.moveBackward(2000000);
          },
        });
      },
      (err) => {
        console.warn('Geolocation error:', err.message);
      },
      { timeout: 5000, enableHighAccuracy: false }
    );
  }, []);

  // Keyboard shortcuts
  const shortcuts: Shortcut[] = [
    { key: 'r', description: 'Reset camera view', action: onResetView },
    { key: '=', description: 'Zoom in', action: onZoomIn },
    { key: '-', description: 'Zoom out', action: onZoomOut },
    { key: 'Escape', description: 'Close entity panel', action: () => setSelectedEntity(null) },
    { key: '1', ctrl: true, description: 'Toggle Aircraft layer', action: () => setVisibility(p => ({ ...p, aircraft: !(p.aircraft ?? true) })) },
    { key: '2', ctrl: true, description: 'Toggle Ships layer', action: () => setVisibility(p => ({ ...p, ship: !(p.ship ?? true) })) },
    { key: '3', ctrl: true, description: 'Toggle Satellites layer', action: () => setVisibility(p => ({ ...p, satellite: !(p.satellite ?? true) })) },
    { key: 'k', ctrl: true, description: 'Focus search', action: () => {} },
  ];
  useKeyboardShortcuts(shortcuts);

  // Occlusion culling
  useEffect(() => {
    if (!viewerReady || !viewerRef.current) return;
    const viewer = viewerRef.current;
    const CesiumRef = (viewer as any).__cesium;
    if (!CesiumRef) return;

    const isEntityVisibleFromCamera = (entity: any, occluder: any): boolean => {
      try {
        let samplePoint: any = null;
        if (entity.position) {
          samplePoint = typeof entity.position.getValue === 'function'
            ? entity.position.getValue(viewer.clock.currentTime)
            : entity.position;
        }
        if (!samplePoint && entity.polyline?.positions) {
          const positions = typeof entity.polyline.positions.getValue === 'function'
            ? entity.polyline.positions.getValue(viewer.clock.currentTime)
            : entity.polyline.positions;
          if (Array.isArray(positions) && positions.length > 0) {
            samplePoint = positions[Math.floor(positions.length / 2)];
          }
        }
        if (!samplePoint) return true;
        return occluder.isPointVisible(samplePoint);
      } catch {
        return true;
      }
    };

    const applyCulling = () => {
      const now = Date.now();
      if (now - cullLastRunAtRef.current < 150) return;
      cullLastRunAtRef.current = now;

      const occluder = new CesiumRef.EllipsoidalOccluder(
        viewer.scene.globe.ellipsoid,
        viewer.camera.positionWC
      );

      for (let i = 0; i < viewer.dataSources.length; i++) {
        const ds = viewer.dataSources.get(i);
        const entities = ds.entities.values;
        for (let j = 0; j < entities.length; j++) {
          const entity = entities[j];
          entity.show = isEntityVisibleFromCamera(entity, occluder);
        }
      }

      const looseEntities = viewer.entities.values;
      for (let i = 0; i < looseEntities.length; i++) {
        const entity = looseEntities[i];
        const type = entity.id?.split(':')?.[0];
        const layerEnabled = type ? (visibility[type] ?? true) : true;
        entity.show = layerEnabled && isEntityVisibleFromCamera(entity, occluder);
      }
    };

    viewer.scene.preRender.addEventListener(applyCulling);
    return () => {
      if (!viewer.isDestroyed()) {
        viewer.scene.preRender.removeEventListener(applyCulling);
      }
    };
  }, [viewerReady, visibility]);

  return (
    <div
      style={{
        height: '100dvh',
        width: '100vw',
        position: 'relative',
        backgroundColor: 'var(--bg-base)',
        overflow: 'hidden',
      }}
    >
      {loading && <LoadingScreen message="Loading Cesium Engine..." />}

      <div id="cesiumContainer" style={{ position: 'absolute', inset: 0 }} />

      {viewerReady && (
        <>
          <LayerManager viewer={viewerRef.current} visibility={visibility} />
          <AppUI
            connected={connected}
            visibility={visibility}
            setVisibility={setVisibility}
            stats={stats}
            searchItems={searchItems}
            onFocusEntity={onFocusEntity}
            onZoomIn={onZoomIn}
            onZoomOut={onZoomOut}
            onResetView={onResetView}
            onToggleHelp={onToggleHelp}
            onMyLocation={onMyLocation}
            viewer={viewerRef.current}
          />
          {selectedEntity && (
            <EntityInfoPanel
              entity={selectedEntity}
              onClose={() => setSelectedEntity(null)}
            />
          )}
          <KeyboardHelpModal shortcuts={shortcuts} />
        </>
      )}
    </div>
  );
}

export default function CesiumApp() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <CesiumAppInner />
      </ToastProvider>
    </ErrorBoundary>
  );
}
