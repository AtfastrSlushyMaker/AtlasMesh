import { useEntityLayer, LayerProps } from './useEntityLayer';
import { Icons } from '../../utils/icons';

export function WildfireLayer({ viewer, visible }: LayerProps) {
  const Cesium = (viewer as any).__cesium;

  useEntityLayer({
    viewer, visible, type: 'wildfire',
    onAdd: (e, v) => {
      if (!Cesium) return null;
      const intensity = e.metadata?.frp ? Math.min(e.metadata.frp / 100, 1) : 0.5; // Fire Radiative Power
      return v.entities.add({
        id: e.id,
        position: Cesium.Cartesian3.fromDegrees(e.position.lon, e.position.lat, 0),
        billboard: {
          image: Icons.wildfire,
          scale: 0.5 + (intensity * 0.5),
          color: Cesium.Color.fromCssColorString('#dc2626'),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 3000000),
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
