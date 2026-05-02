import { memo, useRef, useEffect } from 'react';
import { useEntityLayer, LayerProps } from './useEntityLayer';
import { Icons } from '../../utils/icons';

interface MotionState {
  lat: number;
  lon: number;
  alt: number;
  velocity: number;
  heading: number;
  timestamp: number;
}

export const AircraftLayer = memo(function AircraftLayer({ viewer, visible }: LayerProps) {
  const Cesium = (viewer as any).__cesium;
  const motionRef = useRef(new Map<string, MotionState>());

  useEntityLayer({
    viewer, visible, type: 'aircraft',
    cluster: { pixelRange: 12, minimumClusterSize: 8, clusterIcon: Icons.aircraft },
    onAdd: (e, v) => {
      if (!Cesium) return null;
      const heading = e.heading ?? 0;
      const lat = e.position.lat ?? 0;
      const lon = e.position.lon ?? 0;
      const alt = e.position.alt ?? 0;
      const velocity = e.velocity ?? 0;

      motionRef.current.set(e.id, { lat, lon, alt, velocity, heading, timestamp: Date.now() });

      return v.entities.add({
        id: e.id,
        position: Cesium.Cartesian3.fromDegrees(lon, lat, alt),
        billboard: {
          image: Icons.aircraft,
          scale: 0.6,
          rotation: Cesium.Math.toRadians(-heading),
          alignedAxis: Cesium.Cartesian3.UNIT_Z,
          color: Cesium.Color.fromCssColorString('#38bdf8'),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 15000000),
        },
      });
    },
    onUpdate: (ent, e) => {
      if (!Cesium) return;
      const lat = e.position.lat ?? 0;
      const lon = e.position.lon ?? 0;
      const alt = e.position.alt ?? 0;
      const velocity = e.velocity ?? 0;
      const heading = e.heading ?? 0;

      motionRef.current.set(e.id, { lat, lon, alt, velocity, heading, timestamp: Date.now() });
      ent.position = Cesium.Cartesian3.fromDegrees(lon, lat, alt);
      if (ent.billboard && typeof e.heading === 'number') {
        ent.billboard.rotation = Cesium.Math.toRadians(-heading);
      }
    }
  });

  useEffect(() => {
    if (!Cesium || !viewer || !visible) return;

    let lastFrame = 0;
    const remove = viewer.clock.onTick.addEventListener(() => {
      const now = Date.now();
      if (now - lastFrame < 250) return;
      lastFrame = now;

      motionRef.current.forEach((state, id) => {
        if (state.velocity <= 0) return;
        const elapsed = (now - state.timestamp) / 1000;
        if (elapsed < 0.1 || elapsed > 30) return;

        const dist = state.velocity * elapsed;
        const degLat = dist / 111320;
        const degLon = dist / (111320 * Math.cos(state.lat * Math.PI / 180));
        const hdgRad = (state.heading * Math.PI) / 180;
        const lat = state.lat + degLat * Math.cos(hdgRad);
        const lon = state.lon + degLon * Math.sin(hdgRad);

        const viewerRef = viewer;
        const ent = viewerRef.dataSources
          ? (() => {
              for (let i = 0; i < viewerRef.dataSources.length; i++) {
                const found = viewerRef.dataSources.get(i).entities.getById(id);
                if (found) return found;
              }
              return null;
            })()
          : null;
        if (ent) {
          ent.position = Cesium.Cartesian3.fromDegrees(lon, lat, state.alt);
        }
      });
    });

    return () => remove();
  }, [viewer, visible, Cesium]);

  return null;
});
