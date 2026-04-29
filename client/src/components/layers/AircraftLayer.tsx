import { useEntityLayer, LayerProps } from './useEntityLayer';
import { Icons } from '../../utils/icons';

export function AircraftLayer({ viewer, visible }: LayerProps) {
  const Cesium = (viewer as any).__cesium;

  useEntityLayer({
    viewer, visible, type: 'aircraft',
    onAdd: (e, v) => {
      if (!Cesium) return null;
      return v.entities.add({
        id: e.id,
        position: Cesium.Cartesian3.fromDegrees(e.position.lon, e.position.lat, (e.position.alt || 0)),
        billboard: {
          image: Icons.aircraft,
          scale: 0.8,
          color: Cesium.Color.fromCssColorString('#38bdf8'),
        },
        label: {
          text: e.metadata?.callsign || '',
          font: '10px monospace',
          fillColor: Cesium.Color.fromCssColorString('#38bdf8').withAlpha(0.8),
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
        ent.position = Cesium.Cartesian3.fromDegrees(e.position.lon, e.position.lat, (e.position.alt || 0));
      }
    }
  });

  return null;
}
