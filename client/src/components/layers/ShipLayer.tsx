import { useEntityLayer, LayerProps } from './useEntityLayer';
import { Icons } from '../../utils/icons';

export function ShipLayer({ viewer, visible }: LayerProps) {
  const Cesium = (viewer as any).__cesium;

  useEntityLayer({
    viewer, visible, type: 'ship',
    onAdd: (e, v) => {
      if (!Cesium) return null;
      return v.entities.add({
        id: e.id,
        position: Cesium.Cartesian3.fromDegrees(e.position.lon, e.position.lat, 0),
        billboard: {
          image: Icons.ship,
          scale: 0.7,
          color: Cesium.Color.fromCssColorString('#facc15'),
        },
        label: {
          text: e.metadata?.shipName || e.metadata?.mmsi || '',
          font: '10px monospace',
          fillColor: Cesium.Color.fromCssColorString('#facc15').withAlpha(0.8),
          style: Cesium.LabelStyle.FILL,
          pixelOffset: new Cesium.Cartesian2(16, 0),
          scale: 0.8,
          showBackground: false,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 2000000),
        }
      });
    },
    onUpdate: (ent, e) => {
      if (Cesium) {
        ent.position = Cesium.Cartesian3.fromDegrees(e.position.lon, e.position.lat, 0);
      }
    }
  });

  return null;
}
