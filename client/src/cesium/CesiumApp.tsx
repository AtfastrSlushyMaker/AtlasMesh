import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import { LayerManager } from '../components/layers/LayerManager';
import { AppUI } from '../ui/AppUI';
import { EntityInfoPanel } from '../ui/EntityInfoPanel';
import * as Cesium from 'cesium';

export default function CesiumApp() {
  const viewerRef = useRef<any>(null);
  const cullLastRunAtRef = useRef(0);
  const [viewerReady, setViewerReady] = useState(false);
  const { connected, lastMessage } = useWebSocket(viewerReady ? 'ws://localhost:3000' : null);
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

  useEffect(() => {
    try {
      // Disable default Cesium Ion token warning
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
        creditContainer: document.createElement('div'), // Hide credits bar
        requestRenderMode: false,
        // Use dark CartoDB tiles
        baseLayer: new Cesium.ImageryLayer(
          new Cesium.UrlTemplateImageryProvider({
            url: 'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
            credit: 'CartoDB',
          })
        ),
      });

      // Keep render loop alive even if a render-time asset decode fails.
      viewer.scene.rethrowRenderErrors = false;
      const onRenderError = (_scene: any, err: any) => {
        console.error('Cesium render error (recovered):', {
          name: err?.name,
          message: err?.message,
          stack: err?.stack,
          cesiumBaseUrl: (window as any).CESIUM_BASE_URL,
        });
        if (String(err?.message || '').includes('source image could not be decoded')) {
          console.warn('[Cesium] Decode failure usually means an icon/worker/asset URL returned invalid content. Check /cesium/* network responses.');
        }
        viewer.useDefaultRenderLoop = true;
      };
      viewer.scene.renderError.addEventListener(onRenderError);

      if (import.meta.env.DEV) {
        const baseUrl = (window as any).CESIUM_BASE_URL || '/cesium/';
        const probe = async (relativePath: string) => {
          try {
            const url = `${baseUrl}${relativePath}`;
            const res = await fetch(url, { method: 'GET' });
            const contentType = res.headers.get('content-type') || 'unknown';
            const sample = await res.text();
            const preview = sample.slice(0, 64).replace(/\s+/g, ' ');
            console.info('[Cesium] Asset probe', { url, status: res.status, contentType, preview });
          } catch (probeErr) {
            console.warn('[Cesium] Asset probe failed', { relativePath, probeErr });
          }
        };

        void probe('Workers/createTaskProcessorWorker.js');
        void probe('Assets/approximateTerrainHeights.json');
      }

      // Globe appearance
      viewer.scene.globe.enableLighting = true;
      viewer.scene.globe.nightFadeOutDistance = 10000000.0;
      viewer.scene.globe.nightFadeInDistance = 50000000.0;
      viewer.scene.globe.showGroundAtmosphere = true;
      viewer.scene.backgroundColor = Cesium.Color.BLACK;

      // Dark atmosphere
      viewer.scene.skyAtmosphere.hueShift = -0.08;
      viewer.scene.skyAtmosphere.saturationShift = -0.3;
      viewer.scene.skyAtmosphere.brightnessShift = -0.2;

      // Smooth camera controls
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

      // Click handler for entity selection
      const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
      handler.setInputAction((click: any) => {
        const pickedObject = viewer.scene.pick(click.position);
        if (Cesium.defined(pickedObject) && pickedObject.id) {
          const entity = pickedObject.id;
          // Build info object from entity
          const id = entity.id || '';
          const type = (entity as any)._entityType || id.split(':')[0] || 'unknown';

          // Get position
          let posInfo = {};
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

      // Store Cesium reference
      (viewer as any).__cesium = Cesium;
      (viewer as any).__handler = handler;
      (viewer as any).__renderErrorHandler = onRenderError;
      viewerRef.current = viewer;
      setViewerReady(true);
    } catch (e) {
      console.error('Cesium failed to load', e);
    }

    return () => {
      if (viewerRef.current) {
        try {
          if ((viewerRef.current as any).__handler) {
            (viewerRef.current as any).__handler.destroy();
          }
          if ((viewerRef.current as any).__renderErrorHandler) {
            viewerRef.current.scene.renderError.removeEventListener((viewerRef.current as any).__renderErrorHandler);
          }
          viewerRef.current.destroy();
        } catch (e) { }
        viewerRef.current = null;
      }
    };
  }, []);

  // Recount entity stats
  useEffect(() => {
    if (!viewerReady) return;
    const recount = () => {
      const counts: Record<string, number> = {};
      const entities = viewerRef.current.entities.values;
      entities.forEach((ent: any) => {
        const type = ent._entityType || ent.id?.split(':')?.[0];
        if (type) {
          counts[type] = (counts[type] || 0) + 1;
        }
      });
      setStats(counts);
    };
    recount();
  }, [lastMessage, viewerReady]);

  // Periodic recount
  useEffect(() => {
    if (!viewerReady) return;
    const interval = setInterval(() => {
      const counts: Record<string, number> = {};
      const dataSources = viewerRef.current?.dataSources;
      if (dataSources) {
        const nextSearchItems: Array<{
          id: string;
          name: string;
          type: string;
          lat: number;
          lon: number;
          alt?: number;
        }> = [];

        for (let i = 0; i < dataSources.length; i++) {
          const ds = dataSources.get(i);
          const entities = ds.entities.values;
          entities.forEach((ent: any) => {
            const type = ent._entityType || ent.id?.split(':')?.[0];
            if (type) {
              counts[type] = (counts[type] || 0) + 1;
            }

            if (nextSearchItems.length < 12000) {
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

        setSearchItems(nextSearchItems);
      }
      setStats(counts);
    }, 2500);
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
        if (found) {
          entity = found;
          break;
        }
      }
    }

    const baseRange = item.type === 'satellite' ? 900000 : item.type === 'cable' ? 3500000 : 1200000;
    const targetPosition = Cesium.Cartesian3.fromDegrees(item.lon, item.lat, item.alt || 0);

    viewer.camera.flyTo({
      destination: targetPosition,
      orientation: {
        heading: viewer.camera.heading,
        pitch: Cesium.Math.toRadians(-50),
        roll: 0,
      },
      duration: 1.35,
      complete: () => {
        viewer.camera.moveBackward(baseRange);
      },
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
    viewer.camera.zoomIn(Math.max(30000, h * 0.32));
  }, []);

  const onZoomOut = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    const h = viewer.camera.positionCartographic.height;
    viewer.camera.zoomOut(Math.max(30000, h * 0.32));
  }, []);

  const onResetView = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    viewer.camera.flyHome(1.2);
  }, []);

  // Hide entities on the far side of the globe to reduce render load.
  useEffect(() => {
    if (!viewerReady || !viewerRef.current) return;

    const viewer = viewerRef.current;
    const CesiumRef = (viewer as any).__cesium;
    if (!CesiumRef) return;

    const isEntityVisibleFromCamera = (entity: any): boolean => {
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

        const occluder = new CesiumRef.EllipsoidalOccluder(
          viewer.scene.globe.ellipsoid,
          viewer.camera.positionWC
        );

        return occluder.isPointVisible(samplePoint);
      } catch {
        return true;
      }
    };

    const applyCulling = () => {
      const now = Date.now();
      if (now - cullLastRunAtRef.current < 120) return;
      cullLastRunAtRef.current = now;

      for (let i = 0; i < viewer.dataSources.length; i++) {
        const ds = viewer.dataSources.get(i);
        const entities = ds.entities.values;
        for (let j = 0; j < entities.length; j++) {
          const entity = entities[j];
          entity.show = isEntityVisibleFromCamera(entity);
        }
      }

      const looseEntities = viewer.entities.values;
      for (let i = 0; i < looseEntities.length; i++) {
        const entity = looseEntities[i];
        const type = entity.id?.split(':')?.[0];
        const layerEnabled = type ? (visibility[type] ?? true) : true;
        entity.show = layerEnabled && isEntityVisibleFromCamera(entity);
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
    <div style={{ height: '100vh', width: '100vw', position: 'relative', backgroundColor: '#000', fontFamily: "'Inter', sans-serif" }}>
      <div id="cesiumContainer" style={{ position: 'absolute', inset: 0 }} />

      {viewerReady && (
        <>
          <LayerManager 
            viewer={viewerRef.current} 
            visibility={visibility} 
          />
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
          />
          {selectedEntity && (
            <EntityInfoPanel
              entity={selectedEntity}
              onClose={() => setSelectedEntity(null)}
            />
          )}
        </>
      )}
    </div>
  );
}
