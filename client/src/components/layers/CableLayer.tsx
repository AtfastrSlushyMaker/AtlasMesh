import { useEntityLayer, LayerProps } from './useEntityLayer';

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

      const degreesArray: number[] = [];
      path.forEach((p: any) => {
        if (typeof p.lon === 'number' && typeof p.lat === 'number') {
          degreesArray.push(p.lon, p.lat);
        }
      });
      if (degreesArray.length < 4) return null;

      return v.entities.add({
        id: e.id,
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArray(degreesArray),
          width: 1.5,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.3,
            color: Cesium.Color.fromCssColorString(e.metadata?.color || '#00ffaa').withAlpha(0.6),
          }),
          clampToGround: true,
        },
        position: Cesium.Cartesian3.fromDegrees(e.position.lon, e.position.lat),
        label: {
          text: e.metadata?.name || '',
          font: '10px monospace',
          fillColor: Cesium.Color.fromCssColorString('#00ffaa').withAlpha(0.7),
          style: Cesium.LabelStyle.FILL,
          pixelOffset: new Cesium.Cartesian2(0, -8),
          scale: 0.7,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 5000000),
        },
      });
    },
    onUpdate: (ent, e) => {
      if (!Cesium) return;

      const path = e.metadata?.path;
      if (Array.isArray(path)) {
        const degreesArray: number[] = [];
        path.forEach((p: any) => {
          if (typeof p.lon === 'number' && typeof p.lat === 'number') {
            degreesArray.push(p.lon, p.lat);
          }
        });
        if (degreesArray.length >= 4 && ent.polyline) {
          ent.polyline.positions = Cesium.Cartesian3.fromDegreesArray(degreesArray);
        }
      }

      if (ent.position) {
        ent.position = Cesium.Cartesian3.fromDegrees(e.position.lon, e.position.lat);
      }
      if (ent.label) {
        ent.label.text = e.metadata?.name || '';
      }
    },
  });

  return null;
}
