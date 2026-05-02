import { useEntityLayer, LayerProps } from './useEntityLayer';
import { memo } from 'react';
import { Icons } from '../../utils/icons';

export const WindFarmLayer = memo(function WindFarmLayer({ viewer, visible }: LayerProps) {
  const Cesium = (viewer as any).__cesium;

  useEntityLayer({
    viewer, visible, type: 'windfarm',
    cluster: { pixelRange: 20, minimumClusterSize: 8, clusterIcon: Icons.windfarm },
    onAdd: (e, v) => {
      if (!Cesium) return null;
      const scale = Math.max(0.3, Math.min(0.85, Math.log10((e.metadata?.capacityMw || 1) + 5) * 0.25));
      return v.entities.add({
        id: e.id,
        position: Cesium.Cartesian3.fromDegrees(e.position.lon, e.position.lat, 0),
        billboard: {
          image: Icons.windfarm,
          scale,
          color: Cesium.Color.fromCssColorString('#34d399'),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 3000000),
        },
        label: {
          text: `${e.metadata?.name || 'Wind Farm'}${e.metadata?.capacityMw ? ` (${e.metadata.capacityMw}MW)` : ''}`,
          font: '9px sans-serif',
          fillColor: Cesium.Color.fromCssColorString('#34d399'),
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
