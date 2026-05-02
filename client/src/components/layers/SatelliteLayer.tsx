import { useEntityLayer, LayerProps } from './useEntityLayer';
import { useEffect, useRef, memo } from 'react';
import * as satellite from 'satellite.js';
import { Icons } from '../../utils/icons';

function propagateSatrec(satrec: any, time: Date): { lon: number; lat: number; alt: number } | null {
  try {
    const pv = satellite.propagate(satrec, time);
    if (!pv.position) return null;

    const gd = satellite.eciToGeodetic(
      pv.position as satellite.EciVec3<number>,
      satellite.gstime(time)
    );

    if (gd && gd.longitude != null && gd.latitude != null && gd.height != null) {
      const lon = satellite.degreesLong(gd.longitude);
      const lat = satellite.degreesLat(gd.latitude);
      const alt = gd.height * 1000; // km to m

      if (Number.isFinite(lon) && Number.isFinite(lat) && Number.isFinite(alt)) {
        return { lon, lat, alt };
      }
    }
  } catch {}
  return null;
}

export const SatelliteLayer = memo(function SatelliteLayer({ viewer, visible }: LayerProps) {
  const Cesium = (viewer as any).__cesium;
  const satRecords = useRef(new Map<string, any>());
  const dataSourceRef = useRef<any>(null);

  useEntityLayer({
    viewer, visible, type: 'satellite',
    cluster: { pixelRange: 15, minimumClusterSize: 10, clusterIcon: Icons.satellite },
    onAdd: (e, v) => {
      if (!Cesium) return null;
      dataSourceRef.current = v;

      let initialPos = Cesium.Cartesian3.fromDegrees(0, 0, 200000);

      if (e.metadata?.tle1 && e.metadata?.tle2) {
        try {
          const satrec = satellite.twoline2satrec(e.metadata.tle1, e.metadata.tle2);
          satRecords.current.set(e.id, satrec);

          const pos = propagateSatrec(satrec, new Date());
          if (pos) {
            initialPos = Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, pos.alt);
          }
        } catch (err) {
          console.warn(`[SatelliteLayer] Invalid TLE for ${e.id}`);
        }
      }

      return v.entities.add({
        id: e.id,
        position: initialPos,
        billboard: {
          image: Icons.satellite,
          scale: 0.6,
          color: Cesium.Color.fromCssColorString('#a78bfa'),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 8000000),
        },
      });
    },
    onUpdate: () => {} // Position is driven by clock tick
  });

  useEffect(() => {
    if (!Cesium || !viewer || !visible) return;

    let stopped = false;
    const dataSource = dataSourceRef.current;
    const ids = Array.from(satRecords.current.keys());
    const BATCH_SIZE = 300;
    let offset = 0;

    function processBatch() {
      if (stopped) return;
      const time = new Date();
      const end = Math.min(offset + BATCH_SIZE, ids.length);

      for (let i = offset; i < end; i++) {
        const id = ids[i];
        const satrec = satRecords.current.get(id);
        if (!satrec) continue;
        const ent = dataSource?.entities.getById(id);
        if (!ent) continue;

        const pos = propagateSatrec(satrec, time);
        if (pos) {
          ent.position = Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, pos.alt);
        }
      }

      offset = end;
      if (offset >= ids.length) {
        offset = 0;
        setTimeout(processBatch, 16);
      } else {
        requestAnimationFrame(processBatch);
      }
    }

    processBatch();

    return () => {
      stopped = true;
    };
  }, [viewer, visible, Cesium]);

  return null;
});
