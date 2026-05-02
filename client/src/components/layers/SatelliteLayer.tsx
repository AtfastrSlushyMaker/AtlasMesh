import { useEntityLayer, LayerProps } from './useEntityLayer';
import { useEffect, useRef, memo } from 'react';
import * as satellite from 'satellite.js';
import { Icons } from '../../utils/icons';

export const SatelliteLayer = memo(function SatelliteLayer({ viewer, visible }: LayerProps) {
  const Cesium = (viewer as any).__cesium;
  const satRecords = useRef(new Map<string, any>());
  const dataSourceRef = useRef<any>(null);

  useEntityLayer({
    viewer, visible, type: 'satellite',
    onAdd: (e, v) => {
      if (!Cesium) return null;
      dataSourceRef.current = v;

      if (e.metadata?.tle1 && e.metadata?.tle2) {
        try {
          const satrec = satellite.twoline2satrec(e.metadata.tle1, e.metadata.tle2);
          satRecords.current.set(e.id, satrec);
        } catch (err) {
          console.warn(`[SatelliteLayer] Invalid TLE for ${e.id}`);
        }
      }

      return v.entities.add({
        id: e.id,
        position: Cesium.Cartesian3.fromDegrees(0, 0, 700000),
        billboard: {
          image: Icons.satellite,
          scale: 0.6,
          color: Cesium.Color.fromCssColorString('#a78bfa'),
        },
      });
    },
    onUpdate: () => {} // Position is driven by clock tick
  });

  // Propagate satellite positions on every clock tick
  useEffect(() => {
    if (!Cesium || !viewer || !visible) return;

    const onTick = () => {
      const time = new Date();
      satRecords.current.forEach((satrec, id) => {
        // Find entity in the satellite data source, not viewer.entities
        let ent = null;
        if (dataSourceRef.current) {
          ent = dataSourceRef.current.entities.getById(id);
        }
        // Fallback: search all data sources
        if (!ent && viewer.dataSources) {
          for (let i = 0; i < viewer.dataSources.length; i++) {
            const ds = viewer.dataSources.get(i);
            const found = ds.entities.getById(id);
            if (found) { ent = found; break; }
          }
        }
        if (!ent) return;

        try {
          const positionAndVelocity = satellite.propagate(satrec, time);
          if (!positionAndVelocity.position) return;

          const positionGd = satellite.eciToGeodetic(
            positionAndVelocity.position as satellite.EciVec3<number>,
            satellite.gstime(time)
          );

          if (positionGd && positionGd.longitude != null && positionGd.latitude != null && positionGd.height != null) {
            const lon = satellite.degreesLong(positionGd.longitude);
            const lat = satellite.degreesLat(positionGd.latitude);
            const alt = positionGd.height * 1000; // km to m

            if (Number.isFinite(lon) && Number.isFinite(lat) && Number.isFinite(alt)) {
              ent.position = Cesium.Cartesian3.fromDegrees(lon, lat, alt);
            }
          }
        } catch (e) {
          // ignore propagation errors for stale TLEs
        }
      });
    };

    viewer.clock.onTick.addEventListener(onTick);
    return () => {
      viewer.clock.onTick.removeEventListener(onTick);
    };
  }, [viewer, visible, Cesium]);

  return null;
});
