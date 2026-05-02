import { useEntityLayer, LayerProps } from './useEntityLayer';
import { useEffect, useRef, memo } from 'react';
import * as satellite from 'satellite.js';
import { Icons } from '../../utils/icons';

export const ISSLayer = memo(function ISSLayer({ viewer, visible }: LayerProps) {
  const Cesium = (viewer as any).__cesium;
  const issSatrec = useRef<any>(null);
  const dataSourceRef = useRef<any>(null);
  const issEntityRef = useRef<any>(null);
  const orbitPolylineRef = useRef<any>(null);

  useEntityLayer({
    viewer, visible, type: 'iss',
    onAdd: (e, v) => {
      if (!Cesium) return null;
      dataSourceRef.current = v;

      if (e.metadata?.tle1 && e.metadata?.tle2) {
        try {
          issSatrec.current = satellite.twoline2satrec(e.metadata.tle1, e.metadata.tle2);
        } catch {
          // skip
        }
      }

      const ent = v.entities.add({
        id: e.id,
        position: Cesium.Cartesian3.fromDegrees(e.position.lon, e.position.lat, e.position.alt || 420000),
        billboard: {
          image: Icons.iss,
          scale: 0.7,
          color: Cesium.Color.fromCssColorString('#22d3ee'),
        },
        label: {
          text: 'ISS',
          font: '10px sans-serif',
          fillColor: Cesium.Color.fromCssColorString('#22d3ee'),
          style: Cesium.LabelStyle.FILL,
          pixelOffset: new Cesium.Cartesian2(0, -20),
          scale: 0.85,
        },
      });

      issEntityRef.current = ent;
      return ent;
    },
    onUpdate: (cesiumEnt, updatedData) => {
      if (!Cesium) return;
      if (updatedData.metadata?.tle1 && updatedData.metadata?.tle2) {
        try {
          issSatrec.current = satellite.twoline2satrec(updatedData.metadata.tle1, updatedData.metadata.tle2);
        } catch {}
      }

      if (updatedData.position?.lat && updatedData.position?.lon) {
        cesiumEnt.position = Cesium.Cartesian3.fromDegrees(
          updatedData.position.lon,
          updatedData.position.lat,
          updatedData.position.alt || 420000
        );
      }
    },
  });

  // Real-time orbit path polyline
  useEffect(() => {
    if (!Cesium || !viewer || !visible) return;

    const onTick = () => {
      const time = new Date();
      let ent = issEntityRef.current;
      // Refresh entity reference
      if (!ent && dataSourceRef.current) {
        const found = dataSourceRef.current.entities.getById('iss:25544') ||
                      dataSourceRef.current.entities.getById('iss:25544:tle');
        if (found) { ent = found; issEntityRef.current = found; }
      }

      if (issSatrec.current && ent) {
        try {
          const pv = satellite.propagate(issSatrec.current, time);
          if (pv.position) {
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

                // Draw orbit path
                const positions: number[] = [];
                const stepMs = 120000; // 2 min steps
                const totalSteps = 45; // ~90 min orbit

                for (let i = 0; i <= totalSteps; i++) {
                  const t = new Date(time.getTime() + i * stepMs);
                  const futPv = satellite.propagate(issSatrec.current, t);
                  if (futPv.position) {
                    const futGd = satellite.eciToGeodetic(
                      futPv.position as satellite.EciVec3<number>,
                      satellite.gstime(t)
                    );
                    if (futGd?.longitude != null && futGd?.latitude != null) {
                      const fLon = satellite.degreesLong(futGd.longitude);
                      const fLat = satellite.degreesLat(futGd.latitude);
                      const fAlt = (futGd.height || 0) * 1000;
                      positions.push(fLon, fLat, fAlt);
                    }
                  }
                }

                if (positions.length >= 6) {
                  if (orbitPolylineRef.current) {
                    dataSourceRef.current?.entities?.remove(orbitPolylineRef.current);
                  }

                  const cartesians: any[] = [];
                  for (let i = 0; i < positions.length; i += 3) {
                    cartesians.push(positions[i], positions[i + 1], positions[i + 2]);
                  }

                  orbitPolylineRef.current = dataSourceRef.current?.entities?.add({
                    polyline: {
                      positions: Cesium.Cartesian3.fromDegreesArrayHeights(cartesians),
                      width: 1.5,
                      material: new Cesium.PolylineDashMaterialProperty({
                        color: Cesium.Color.fromCssColorString('#22d3ee').withAlpha(0.3),
                        dashLength: 8,
                      }),
                      clampToGround: false,
                    },
                  });
                }
              }
            }
          }
        } catch {
          // ignore
        }
      } else if (ent && ent.position) {
        // No TLE - just keep the direct position from API
      }
    };

    viewer.clock.onTick.addEventListener(onTick);
    return () => {
      viewer.clock.onTick.removeEventListener(onTick);
      if (orbitPolylineRef.current && dataSourceRef.current) {
        try {
          dataSourceRef.current.entities.remove(orbitPolylineRef.current);
        } catch {}
        orbitPolylineRef.current = null;
      }
    };
  }, [viewer, visible, Cesium]);

  return null;
});
