import { memo } from 'react';
import { useEntityLayer, LayerProps } from './useEntityLayer';
import { Icons } from '../../utils/icons';

export const AirportLayer = memo(function AirportLayer({ viewer, visible }: LayerProps) {
  const Cesium = (viewer as any).__cesium;

  useEntityLayer({
    viewer, visible, type: 'airport',
    cluster: { pixelRange: 15, minimumClusterSize: 3, clusterIcon: Icons.aircraft },
    onAdd: (e, v) => {
      if (!Cesium) return null;
      return v.entities.add({
        id: e.id,
        position: Cesium.Cartesian3.fromDegrees(e.position.lon, e.position.lat, 0),
        billboard: {
          image: Icons.aircraft,
          scale: 0.4,
          color: Cesium.Color.fromCssColorString('#94a3b8').withAlpha(0.8),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 3000000),
        },
        label: {
          text: e.metadata?.iata || e.metadata?.name || '',
          font: '8px "Inter", sans-serif',
          fillColor: Cesium.Color.fromCssColorString('#94a3b8').withAlpha(0.9),
          style: Cesium.LabelStyle.FILL,
          pixelOffset: new Cesium.Cartesian2(0, 10),
          scale: 0.65,
          showBackground: true,
          backgroundColor: new Cesium.Color(0, 0, 0, 0.4),
          backgroundPadding: new Cesium.Cartesian2(4, 2),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 800000),
        },
      });
    },
    onUpdate: () => {},
  });

  return null;
});
