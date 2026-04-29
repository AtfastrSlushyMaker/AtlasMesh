import { useEntityLayer, LayerProps } from './useEntityLayer';
import { Icons } from '../../utils/icons';

export function LaunchLayer({ viewer, visible }: LayerProps) {
  const Cesium = (viewer as any).__cesium;

  useEntityLayer({
    viewer, visible, type: 'launch',
    onAdd: (e, v) => {
      if (!Cesium) return null;
      return v.entities.add({
        id: e.id,
        position: Cesium.Cartesian3.fromDegrees(e.position.lon, e.position.lat, 0),
        billboard: {
          image: Icons.launch,
          scale: 0.8,
          color: Cesium.Color.fromCssColorString('#10b981'),
        },
        label: {
          text: e.metadata?.name || 'Launch',
          font: '10px sans-serif',
          fillColor: Cesium.Color.WHITE,
          style: Cesium.LabelStyle.FILL,
          pixelOffset: new Cesium.Cartesian2(0, -20),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 5000000),
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
