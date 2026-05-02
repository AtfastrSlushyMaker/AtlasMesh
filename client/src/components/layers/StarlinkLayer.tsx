import { useEntityLayer, LayerProps } from './useEntityLayer';
import { useEffect, useRef, memo } from 'react';
import * as satellite from 'satellite.js';
import { Icons } from '../../utils/icons';

export const StarlinkLayer = memo(function StarlinkLayer({ viewer, visible }: LayerProps) {
  const Cesium = (viewer as any).__cesium;
  const satRecords = useRef(new Map<string, any>());
  const dataSourceRef = useRef<any>(null);

  useEntityLayer({
    viewer, visible, type: 'starlink',
    onAdd: (e, v) => {
      if (!Cesium) return null;
      dataSourceRef.current = v;

      if (e.metadata?.tle1 && e.metadata?.tle2) {
        try {
          const satrec = satellite.twoline2satrec(e.metadata.tle1, e.metadata.tle2);
          satRecords.current.set(e.id, satrec);
        } catch {
          // skip invalid TLE
        }
      }

      return v.entities.add({
        id: e.id,
        position: Cesium.Cartesian3.fromDegrees(0, 0, 550000),
        billboard: {
          image: Icons.starlink,
          scale: 0.35,
          color: Cesium.Color.fromCssColorString('#c084fc'),
        },
      });
    },
    onUpdate: () => {},
  });

  useEffect(() => {
    if (!Cesium || !viewer || !visible) return;

    const onTick = () => {
      const time = new Date();
      satRecords.current.forEach((satrec, id) => {
        let ent = null;
        if (dataSourceRef.current) {
          ent = dataSourceRef.current.entities.getById(id);
        }
        if (!ent && viewer.dataSources) {
          for (let i = 0; i < viewer.dataSources.length; i++) {
            const ds = viewer.dataSources.get(i);
            const found = ds.entities.getById(id);
            if (found) { ent = found; break; }
          }
        }
        if (!ent) return;

        try {
          const pv = satellite.propagate(satrec, time);
          if (!pv.position) return;

          const gd = satellite.eciToGeodetic(
            pv.position as satellite.EciVec3<number>,
            satellite.gstime(time)
          );

          if (gd && gd.longitude != null && gd.latitude != null && gd.height != null) {
            const lon = satellite.degreesLong(gd.longitude);
            const lat = satellite.degreesLat(gd.latitude);
            const alt = gd.height * 1000;

            if (Number.isFinite(lon) && Number.isFinite(lat) && Number.isFinite(alt)) {
              ent.position = Cesium.Cartesian3.fromDegrees(lon, lat, alt);
            }
          }
        } catch {
          // ignore stale TLEs
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
