import { useEntityLayer, LayerProps } from './useEntityLayer';
import { Icons } from '../../utils/icons';

export function EarthquakeLayer({ viewer, visible }: LayerProps) {
  const Cesium = (viewer as any).__cesium;

  useEntityLayer({
    viewer, visible, type: 'earthquake',
    onAdd: (e, v) => {
      if (!Cesium) return null;
      const mag = e.metadata?.mag || 1;
      const radius = Math.pow(10, mag) * 10; // Simple scaling for visual effect
      
      return v.entities.add({
        id: e.id,
        position: Cesium.Cartesian3.fromDegrees(e.position.lon, e.position.lat, e.position.alt || 0),
        billboard: {
          image: Icons.earthquake,
          scale: 0.6,
          color: Cesium.Color.fromCssColorString('#ef4444'),
        },
        ellipse: {
          semiMinorAxis: radius,
          semiMajorAxis: radius,
          material: Cesium.Color.fromCssColorString('#ef4444').withAlpha(0.2),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString('#ef4444'),
          height: e.position.alt || 0
        },
        label: {
          text: `Mag ${mag}`,
          font: '10px sans-serif',
          fillColor: Cesium.Color.fromCssColorString('#ef4444'),
          style: Cesium.LabelStyle.FILL,
          pixelOffset: new Cesium.Cartesian2(0, -16),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 3000000),
        }
      });
    },
    onUpdate: (ent, e) => {
      if (Cesium) {
        ent.position = Cesium.Cartesian3.fromDegrees(e.position.lon, e.position.lat, e.position.alt || 0);
      }
    }
  });

  return null;
}
