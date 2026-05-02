import { useEntityLayer, LayerProps } from './useEntityLayer';

const CABLE_HEIGHT = 100;
const CORE_WIDTH = 2.5;
const GLOW_WIDTH = 8;
const GLOW_ALPHA = 0.12;

function pathToHeightsArray(path: any[], height: number): number[] {
  const arr: number[] = [];
  path.forEach((p: any) => {
    if (typeof p.lon === 'number' && typeof p.lat === 'number') {
      arr.push(p.lon, p.lat, height);
    }
  });
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
      const coreColor = baseColor.withAlpha(0.85);
      const glowColor = baseColor.withAlpha(GLOW_ALPHA);

      const glowId = e.id + ':glow';
      v.entities.add({
        id: glowId,
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArrayHeights(heightsArray),
          width: GLOW_WIDTH,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.6,
            color: glowColor,
          }),
          clampToGround: false,
        },
        show: true,
      });

      return v.entities.add({
        id: e.id,
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArrayHeights(heightsArray),
          width: CORE_WIDTH,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.35,
            color: coreColor,
          }),
          clampToGround: false,
        },
        position: Cesium.Cartesian3.fromDegrees(e.position.lon, e.position.lat, CABLE_HEIGHT),
        label: {
          text: e.metadata?.name || '',
          font: '11px "Inter", sans-serif',
          fillColor: new Cesium.Color(1, 1, 1, 0.75),
          style: Cesium.LabelStyle.FILL,
          pixelOffset: new Cesium.Cartesian2(6, -4),
          scale: 0.9,
          showBackground: true,
          backgroundColor: new Cesium.Color(0, 0, 0, 0.5),
          backgroundPadding: new Cesium.Cartesian2(6, 4),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 6000000),
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

      const glowEnt = ds.entities.getById(e.id + ':glow');
      if (glowEnt?.polyline) {
        glowEnt.polyline.positions = Cesium.Cartesian3.fromDegreesArrayHeights(heightsArray);
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
