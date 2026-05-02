import { useRef, useEffect } from 'react';
import { useEntityLayer, LayerProps } from './useEntityLayer';
import { Icons } from '../../utils/icons';

interface MotionState {
  lat: number;
  lon: number;
  velocity: number;
  heading: number;
  timestamp: number;
}

const KNOTS_TO_MS = 0.514444;

export function ShipLayer({ viewer, visible }: LayerProps) {
  const Cesium = (viewer as any).__cesium;
  const motionRef = useRef(new Map<string, MotionState>());

  useEntityLayer({
    viewer, visible, type: 'ship',
    onAdd: (e, v) => {
      if (!Cesium) return null;
      const lat = e.position.lat ?? 0;
      const lon = e.position.lon ?? 0;
      const heading = e.heading ?? 0;
      const velocity = (e.velocity ?? 0) * KNOTS_TO_MS;

      motionRef.current.set(e.id, { lat, lon, velocity, heading, timestamp: Date.now() });

      return v.entities.add({
        id: e.id,
        position: Cesium.Cartesian3.fromDegrees(lon, lat, 0),
        billboard: {
          image: Icons.ship,
          scale: 0.55,
          rotation: Cesium.Math.toRadians(-heading),
          alignedAxis: Cesium.Cartesian3.UNIT_Z,
          color: Cesium.Color.fromCssColorString('#facc15'),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 15000000),
        },
      });
    },
    onUpdate: (ent, e) => {
      if (!Cesium) return;
      const lat = e.position.lat ?? 0;
      const lon = e.position.lon ?? 0;
      const heading = e.heading ?? 0;
      const velocity = (e.velocity ?? 0) * KNOTS_TO_MS;

      motionRef.current.set(e.id, { lat, lon, velocity, heading, timestamp: Date.now() });
      ent.position = Cesium.Cartesian3.fromDegrees(lon, lat, 0);
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
        if (elapsed < 0.1 || elapsed > 60) return;

        const dist = state.velocity * elapsed;
        const degLat = dist / 111320;
        const degLon = dist / (111320 * Math.cos(state.lat * Math.PI / 180));
        const hdgRad = (state.heading * Math.PI) / 180;
        const lat = state.lat + degLat * Math.cos(hdgRad);
        const lon = state.lon + degLon * Math.sin(hdgRad);

        const ent = viewer.entities?.getById(id)
          ?? (() => {
              for (let i = 0; i < viewer.dataSources.length; i++) {
                const found = viewer.dataSources.get(i).entities.getById(id);
                if (found) return found;
              }
              return null;
            })();
        if (ent) {
          ent.position = Cesium.Cartesian3.fromDegrees(lon, lat, 0);
        }
      });
    });

    return () => remove();
  }, [viewer, visible, Cesium]);

  return null;
}
