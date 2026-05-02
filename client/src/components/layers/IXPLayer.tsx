import { useEntityLayer, LayerProps } from './useEntityLayer';
import { memo } from 'react';
import { Icons } from '../../utils/icons';

export const IXPLayer = memo(function IXPLayer({ viewer, visible }: LayerProps) {
  const Cesium = (viewer as any).__cesium;

  useEntityLayer({
    viewer, visible, type: 'ixp',
    onAdd: (e, v) => {
      if (!Cesium) return null;
      const netCount = e.metadata?.netCount || 0;
      const scale = Math.max(0.35, Math.min(0.9, Math.log10(netCount + 2) * 0.3));
      return v.entities.add({
        id: e.id,
        position: Cesium.Cartesian3.fromDegrees(e.position.lon, e.position.lat, 0),
        billboard: {
          image: Icons.ixp,
          scale,
          color: Cesium.Color.fromCssColorString('#818cf8'),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 3000000),
        },
        label: {
          text: `${e.metadata?.name || 'IXP'}${e.metadata?.city ? ` · ${e.metadata.city}` : ''}`,
          font: '8px sans-serif',
          fillColor: Cesium.Color.fromCssColorString('#818cf8'),
          style: Cesium.LabelStyle.FILL,
          pixelOffset: new Cesium.Cartesian2(0, -14),
          scale: 0.7,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 2000000),
        },
      });
    },
    onUpdate: () => {},
  });

  return null;
});
