import { useEntityLayer, LayerProps } from './useEntityLayer';
import { useEffect, useRef } from 'react';
import * as satellite from 'satellite.js';
import { Icons } from '../../utils/icons';

export function SatelliteLayer({ viewer, visible }: LayerProps) {
  const Cesium = (viewer as any).__cesium;
  const satRecords = useRef(new Map<string, any>());

  useEntityLayer({
    viewer, visible, type: 'satellite',
    onAdd: (e, v) => {
      if (!Cesium) return null;
      if (e.metadata?.tle1 && e.metadata?.tle2) {
        const satrec = satellite.twoline2satrec(e.metadata.tle1, e.metadata.tle2);
        satRecords.current.set(e.id, satrec);
      }

      return v.entities.add({
        id: e.id,
        position: Cesium.Cartesian3.fromDegrees(0, 0, 0), // Will be updated via callback
        billboard: {
          image: Icons.satellite,
          scale: 0.6,
          color: Cesium.Color.fromCssColorString('#a78bfa'),
        },
      });
    },
    onUpdate: () => {} // Satellites are driven by clock, not just updates
  });

  // Setup periodic evaluation of satellite positions
  useEffect(() => {
    if (!Cesium || !viewer || !visible) return;

    const onTick = () => {
      const time = new Date();
      satRecords.current.forEach((satrec, id) => {
        const ent = viewer.entities.getById(id);
        if (!ent) return;

        try {
          const positionAndVelocity = satellite.propagate(satrec, time);
          const positionGd = satellite.eciToGeodetic(positionAndVelocity.position as satellite.EciVec3<number>, satellite.gstime(time));
          
          if (positionGd && positionGd.longitude !== undefined && positionGd.latitude !== undefined && positionGd.height !== undefined) {
            const lon = satellite.degreesLong(positionGd.longitude);
            const lat = satellite.degreesLat(positionGd.latitude);
            const alt = positionGd.height * 1000; // km to m
            
            if (!isNaN(lon) && !isNaN(lat) && !isNaN(alt)) {
                ent.position = Cesium.Cartesian3.fromDegrees(lon, lat, alt);
            }
          }
        } catch (e) {
          // ignore propagation errors
        }
      });
    };

    viewer.clock.onTick.addEventListener(onTick);
    return () => {
      viewer.clock.onTick.removeEventListener(onTick);
    };
  }, [viewer, visible]);

  return null;
}
