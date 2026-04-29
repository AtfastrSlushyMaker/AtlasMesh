import { useEntityLayer, LayerProps } from './useEntityLayer';
import { Icons } from '../../utils/icons';

export function VolcanoLayer({ viewer, visible }: LayerProps) {
  const Cesium = (viewer as any).__cesium;

  useEntityLayer({
    viewer, visible, type: 'volcano',
    onAdd: (e, v) => {
      if (!Cesium) return null;
      return v.entities.add({
        id: e.id,
        position: Cesium.Cartesian3.fromDegrees(e.position.lon, e.position.lat, e.position.alt || 0),
        billboard: {
          image: Icons.volcano,
          scale: 0.7,
          color: Cesium.Color.fromCssColorString('#ff6b35'),
        },
        label: {
          text: e.metadata?.name || '',
          font: '10px sans-serif',
          fillColor: Cesium.Color.fromCssColorString('#ff6b35'),
          style: Cesium.LabelStyle.FILL,
          pixelOffset: new Cesium.Cartesian2(0, -16),
          scale: 0.9,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 3000000),
        }
      });
    },
    onUpdate: () => {} // Volcanoes are static
  });

  return null;
}
