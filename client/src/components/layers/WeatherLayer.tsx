import { useEntityLayer, LayerProps } from './useEntityLayer';
import { Icons } from '../../utils/icons';

export function WeatherLayer({ viewer, visible }: LayerProps) {
  const Cesium = (viewer as any).__cesium;

  useEntityLayer({
    viewer, visible, type: 'weather',
    onAdd: (e, v) => {
      if (!Cesium) return null;
      return v.entities.add({
        id: e.id,
        position: Cesium.Cartesian3.fromDegrees(e.position.lon, e.position.lat, 10000), // high altitude
        billboard: {
          image: Icons.weather,
          scale: 0.7,
          color: Cesium.Color.fromCssColorString('#3b82f6'),
        },
        ellipse: {
          semiMinorAxis: 400000.0,
          semiMajorAxis: 400000.0,
          material: Cesium.Color.fromCssColorString('#3b82f6').withAlpha(0.1),
          height: 10000
        },
        label: {
          text: `${e.metadata?.temperature ?? '?'}°C`,
          font: '12px sans-serif',
          fillColor: Cesium.Color.WHITE,
          style: Cesium.LabelStyle.FILL,
          pixelOffset: new Cesium.Cartesian2(0, -18),
        }
      });
    },
    onUpdate: (ent, e) => {
      if (Cesium) {
        if (ent.label) {
            ent.label.text = `${e.metadata?.temperature ?? '?'}°C`;
        }
      }
    }
  });

  return null;
}
