import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import { LayerManager } from '../components/layers/LayerManager';
import { AppUI } from '../ui/AppUI';
import { EntityInfoPanel } from '../ui/EntityInfoPanel';
import * as Cesium from 'cesium';

export default function CesiumApp() {
  const viewerRef = useRef<any>(null);
  const [viewerReady, setViewerReady] = useState(false);
  const { connected, lastMessage } = useWebSocket(viewerReady ? 'ws://localhost:3000' : null);
  const [visibility, setVisibility] = useState<Record<string, boolean>>({});
  const [stats, setStats] = useState<Record<string, number>>({});
  const [selectedEntity, setSelectedEntity] = useState<any>(null);

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
      viewer.scene.screenSpaceCameraController.enableRotate = true;
      viewer.scene.screenSpaceCameraController.enableTilt = true;
      viewer.scene.screenSpaceCameraController.enableLook = true;
      viewer.scene.screenSpaceCameraController.zoomEventTypes = [
        Cesium.CameraEventType.WHEEL,
        Cesium.CameraEventType.PINCH,
      ];
      viewer.scene.screenSpaceCameraController.tiltEventTypes = [
        Cesium.CameraEventType.MIDDLE_DRAG,
        Cesium.CameraEventType.PINCH,
        {
          eventType: Cesium.CameraEventType.RIGHT_DRAG,
        },
      ];
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
          const parts = id.split(':');
          const type = parts[0] || 'unknown';

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
        const parts = ent.id?.split(':');
        if (parts && parts.length > 1) {
          const type = parts[0];
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
        for (let i = 0; i < dataSources.length; i++) {
          const ds = dataSources.get(i);
          const entities = ds.entities.values;
          entities.forEach((ent: any) => {
            const parts = ent.id?.split(':');
            if (parts && parts.length > 1) {
              counts[parts[0]] = (counts[parts[0]] || 0) + 1;
            }
          });
        }
      }
      setStats(counts);
    }, 2000);
    return () => clearInterval(interval);
  }, [viewerReady]);

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
