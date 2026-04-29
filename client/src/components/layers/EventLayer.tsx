import { useEntityLayer, LayerProps } from './useEntityLayer';
import { Icons } from '../../utils/icons';

export function EventLayer({ viewer, visible }: LayerProps) {
  const Cesium = (viewer as any).__cesium;

  useEntityLayer({
    viewer,
    visible,
    type: 'event',
    onAdd: (e, v) => {
      if (!Cesium) return null;
      return v.entities.add({
        id: e.id,
        position: Cesium.Cartesian3.fromDegrees(e.position.lon, e.position.lat, 0),
        billboard: {
          image: Icons.event,
          scale: 0.7,
          color: Cesium.Color.fromCssColorString('#f97316'),
        },
        label: {
          text: e.metadata?.title ?? '',
          font: '10px sans-serif',
          fillColor: Cesium.Color.fromCssColorString('#f97316'),
          style: Cesium.LabelStyle.FILL,
          pixelOffset: new Cesium.Cartesian2(0, -16),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 3000000),
        }
      });
    },
    onUpdate: (ent, e) => {
      if (Cesium) {
        ent.position = Cesium.Cartesian3.fromDegrees(e.position.lon, e.position.lat, 0);
        if (ent.label) ent.label.text = e.metadata?.title ?? '';
      }
    }
  });

  return null;
}
