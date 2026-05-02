import { useEntityLayer, LayerProps } from './useEntityLayer';
import { memo } from 'react';
import { Icons } from '../../utils/icons';

export const MeteoriteLayer = memo(function MeteoriteLayer({ viewer, visible }: LayerProps) {
  const Cesium = (viewer as any).__cesium;

  useEntityLayer({
    viewer, visible, type: 'meteorite',
    cluster: { pixelRange: 18, minimumClusterSize: 10, clusterIcon: Icons.meteorite },
    onAdd: (e, v) => {
      if (!Cesium) return null;
      const massG = e.metadata?.massGrams;
      const scale = massG ? Math.max(0.25, Math.min(1.0, Math.log10(massG + 1) * 0.12)) : 0.4;
      return v.entities.add({
        id: e.id,
        position: Cesium.Cartesian3.fromDegrees(e.position.lon, e.position.lat, 0),
        billboard: {
          image: Icons.meteorite,
          scale,
          color: Cesium.Color.fromCssColorString('#fb923c'),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 3000000),
        },
        label: {
          text: e.metadata?.name || 'Meteorite',
          font: '8px sans-serif',
          fillColor: Cesium.Color.fromCssColorString('#fb923c'),
          style: Cesium.LabelStyle.FILL,
          pixelOffset: new Cesium.Cartesian2(0, -14),
          scale: 0.7,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 3000000),
        },
      });
    },
    onUpdate: () => {},
  });

  return null;
});
