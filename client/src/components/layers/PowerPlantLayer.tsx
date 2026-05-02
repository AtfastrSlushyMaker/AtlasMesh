import { useEntityLayer, LayerProps } from './useEntityLayer';
import { memo } from 'react';
import { Icons } from '../../utils/icons';

export const PowerPlantLayer = memo(function PowerPlantLayer({ viewer, visible }: LayerProps) {
  const Cesium = (viewer as any).__cesium;

  useEntityLayer({
    viewer, visible, type: 'powerplant',
    cluster: { pixelRange: 20, minimumClusterSize: 8, clusterIcon: Icons.powerplant },
    onAdd: (e, v) => {
      if (!Cesium) return null;
      const fuel = e.metadata?.primaryFuel || '';
      const scale = Math.max(0.3, Math.min(1.0, Math.log10((e.metadata?.capacityMw || 1) + 10) * 0.3));
      return v.entities.add({
        id: e.id,
        position: Cesium.Cartesian3.fromDegrees(e.position.lon, e.position.lat, 0),
        billboard: {
          image: Icons.powerplant,
          scale,
          color: Cesium.Color.fromCssColorString('#fbbf24'),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 3000000),
        },
        label: {
          text: `${e.metadata?.name || 'Plant'}${fuel ? ` (${fuel})` : ''}`,
          font: '9px sans-serif',
          fillColor: Cesium.Color.fromCssColorString('#fbbf24'),
          style: Cesium.LabelStyle.FILL,
          pixelOffset: new Cesium.Cartesian2(0, -14),
          scale: 0.75,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 5000000),
        },
      });
    },
    onUpdate: () => {},
  });

  return null;
});
