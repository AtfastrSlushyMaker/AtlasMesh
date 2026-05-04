import { useEntityLayer, LayerProps } from './useEntityLayer';

const CABLE_HEIGHT = 500;

const CORE_WIDTH = 2.0;
const ORBIT_WIDTH = 5.0;
const ORBIT_ALPHA = 0.10;

const NEAR_DIST = 500;
const FAR_DIST = 35000000;
const ORBIT_NEAR_DIST = 3000000;

function pathToHeightsArray(path: any[], height: number): number[] {
  const arr: number[] = [];
  for (const p of path) {
    if (typeof p.lon === 'number' && typeof p.lat === 'number') {
      arr.push(p.lon, p.lat, height);
    }
  }
  return arr;
}

export function CableLayer({ viewer, visible }: LayerProps) {
  const Cesium = (viewer as any).__cesium;

  useEntityLayer({
    viewer,
    visible,
    type: 'cable',
    onAdd: (e, v) => {
      if (!Cesium) return null;

      const path = e.metadata?.path;
      if (!Array.isArray(path) || path.length < 2) return null;

      const heightsArray = pathToHeightsArray(path, CABLE_HEIGHT);
      if (heightsArray.length < 6) return null;

      const color = e.metadata?.color || '#00ffaa';
      const baseColor = Cesium.Color.fromCssColorString(color);

      v.entities.add({
        id: e.id + ':orbit',
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArrayHeights(heightsArray),
          width: ORBIT_WIDTH,
          material: new Cesium.ColorMaterialProperty(baseColor.withAlpha(ORBIT_ALPHA)),
          clampToGround: false,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(ORBIT_NEAR_DIST, FAR_DIST),
        },
        show: true,
      });

      return v.entities.add({
        id: e.id,
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArrayHeights(heightsArray),
          width: CORE_WIDTH,
          material: new Cesium.ColorMaterialProperty(baseColor.withAlpha(0.85)),
          clampToGround: false,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(NEAR_DIST, FAR_DIST),
        },
        position: Cesium.Cartesian3.fromDegrees(e.position.lon, e.position.lat, CABLE_HEIGHT),
        label: {
          text: e.metadata?.name || '',
          font: '11px "Outfit", sans-serif',
          fillColor: Cesium.Color.WHITE.withAlpha(0.75),
          style: Cesium.LabelStyle.FILL,
          pixelOffset: new Cesium.Cartesian2(6, -4),
          scale: 0.9,
          showBackground: true,
          backgroundColor: new Cesium.Color(0.02, 0.03, 0.07, 0.60),
          backgroundPadding: new Cesium.Cartesian2(6, 4),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(NEAR_DIST, 8000000),
        },
      });
    },
    onUpdate: (ent, e, ds) => {
      if (!Cesium) return;

      const path = e.metadata?.path;
      if (!Array.isArray(path) || path.length < 2) return;

      const heightsArray = pathToHeightsArray(path, CABLE_HEIGHT);
      if (heightsArray.length < 6) return;

      if (ent.polyline) {
        ent.polyline.positions = Cesium.Cartesian3.fromDegreesArrayHeights(heightsArray);
      }

      const orbitEnt = ds.entities.getById(e.id + ':orbit');
      if (orbitEnt?.polyline) {
        orbitEnt.polyline.positions = Cesium.Cartesian3.fromDegreesArrayHeights(heightsArray);
      }

      if (ent.position) {
        ent.position = Cesium.Cartesian3.fromDegrees(e.position.lon, e.position.lat, CABLE_HEIGHT);
      }
      if (ent.label) {
        ent.label.text = e.metadata?.name || '';
      }
    },
  });

  return null;
}
