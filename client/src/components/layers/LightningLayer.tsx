import { useEntityLayer, LayerProps } from './useEntityLayer';
import { useEffect, useRef } from 'react';
import { Icons } from '../../utils/icons';

export function LightningLayer({ viewer, visible }: LayerProps) {
  const Cesium = (viewer as any).__cesium;
  const activeStrikes = useRef(new Map<string, number>());

  useEntityLayer({
    viewer,  visible, type: 'lightning',
    onAdd: (e, v) => {
      if (!Cesium) return null;
      activeStrikes.current.set(e.id, Date.now());
      
      return v.entities.add({
        id: e.id,
        position: Cesium.Cartesian3.fromDegrees(e.position.lon, e.position.lat, 0),
        billboard: {
          image: Icons.lightning,
          scale: 0.6,
          color: Cesium.Color.fromCssColorString('#fef08a'),
        }
      });
    },
    onUpdate: () => {}
  });

  // Fade out and remove lightning strikes quickly
  useEffect(() => {
    if (!viewer || !visible) return;
    
    const interval = setInterval(() => {
      const now = Date.now();
      activeStrikes.current.forEach((time, id) => {
        if (now - time > 1500) { // 1.5s lifetime
          viewer.entities.removeById(id);
          activeStrikes.current.delete(id);
        }
      });
    }, 100);

    return () => clearInterval(interval);
  }, [viewer, visible]);

  return null;
}
