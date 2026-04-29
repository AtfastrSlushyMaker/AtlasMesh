import { useEffect, useRef } from 'react';
import type { LayerProps } from './LayerManager';

/**
 * Renders submarine fiber optic cables as polylines on the globe.
 * Each cable entity carries a `metadata.path` array of {lon, lat} coords.
 */
export function CableLayer({ viewer, diff, visible }: LayerProps) {
  const Cesium = (viewer as any).__cesium;
  const cablesRef = useRef(new Map<string, any>());

  // Handle visibility
  useEffect(() => {
    cablesRef.current.forEach((ent) => {
      if (ent && ent.show !== undefined) {
        ent.show = visible;
      }
    });
  }, [visible]);

  // Handle diffs
  useEffect(() => {
    if (!diff || !viewer || !Cesium || !visible) return;

    diff.added?.forEach((e: any) => {
      if (e.type !== 'cable') return;
      if (cablesRef.current.has(e.id)) return;

      const path = e.metadata?.path;
      if (!path || !Array.isArray(path) || path.length < 2) return;

      // Build flat [lon, lat, lon, lat, ...] array for Cesium
      const degreesArray: number[] = [];
      path.forEach((p: any) => {
        if (typeof p.lon === 'number' && typeof p.lat === 'number') {
          degreesArray.push(p.lon, p.lat);
        }
      });

      if (degreesArray.length < 4) return;

      try {
        const ent = viewer.entities.add({
          id: e.id,
          polyline: {
            positions: Cesium.Cartesian3.fromDegreesArray(degreesArray),
            width: 1.5,
            material: new Cesium.PolylineGlowMaterialProperty({
              glowPower: 0.3,
              color: Cesium.Color.fromCssColorString(e.metadata.color || '#00ffaa').withAlpha(0.6),
            }),
            clampToGround: true,
          },
          // Add a label at the midpoint
          position: Cesium.Cartesian3.fromDegrees(e.position.lon, e.position.lat),
          label: {
            text: e.metadata?.name || '',
            font: '10px monospace',
            fillColor: Cesium.Color.fromCssColorString('#00ffaa').withAlpha(0.7),
            style: Cesium.LabelStyle.FILL,
            pixelOffset: new Cesium.Cartesian2(0, -8),
            scale: 0.7,
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 5000000),
          }
        });
        cablesRef.current.set(e.id, ent);
      } catch (err) {
        // Skip cables that fail to render
      }
    });

    diff.removed?.forEach((id: string) => {
      const ent = cablesRef.current.get(id);
      if (ent) {
        viewer.entities.remove(ent);
        cablesRef.current.delete(id);
      }
    });
  }, [diff, viewer, visible]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (viewer && !viewer.isDestroyed()) {
        cablesRef.current.forEach((ent) => {
          try { viewer.entities.remove(ent); } catch (e) { }
        });
      }
      cablesRef.current.clear();
    };
  }, [viewer]);

  return null;
}
