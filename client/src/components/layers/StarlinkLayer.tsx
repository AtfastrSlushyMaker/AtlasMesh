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
      const alt = gd.height * 1000;

      if (Number.isFinite(lon) && Number.isFinite(lat) && Number.isFinite(alt)) {
        return { lon, lat, alt };
      }
    }
  } catch {}
  return null;
}

export const StarlinkLayer = memo(function StarlinkLayer({ viewer, visible }: LayerProps) {
  const Cesium = (viewer as any).__cesium;
  const satRecords = useRef(new Map<string, any>());
  const dataSourceRef = useRef<any>(null);

  useEntityLayer({
    viewer, visible, type: 'starlink',
    cluster: { pixelRange: 12, minimumClusterSize: 15, clusterIcon: Icons.starlink },
    onAdd: (e, v) => {
      if (!Cesium) return null;
      dataSourceRef.current = v;

      let initialPos = Cesium.Cartesian3.fromDegrees(0, 0, 550000);

      if (e.metadata?.tle1 && e.metadata?.tle2) {
        try {
          const satrec = satellite.twoline2satrec(e.metadata.tle1, e.metadata.tle2);
          satRecords.current.set(e.id, satrec);

          const pos = propagateSatrec(satrec, new Date());
          if (pos) {
            initialPos = Cesium.Cartesian3.fromDegrees(pos.lon, pos.lat, pos.alt);
          }
        } catch {}
      }

      return v.entities.add({
        id: e.id,
        position: initialPos,
        billboard: {
          image: Icons.starlink,
          scale: 0.35,
          color: Cesium.Color.fromCssColorString('#c084fc'),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 8000000),
        },
      });
    },
    onUpdate: () => {},
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
