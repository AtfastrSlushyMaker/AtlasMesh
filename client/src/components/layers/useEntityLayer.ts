import { useEffect, useRef } from 'react';
import { subscribeToEntityUpdates } from '../../hooks/useWebSocket';

export interface LayerProps {
  viewer: any;
  visible: boolean;
}

export function useEntityLayer({
  viewer,
  visible,
  type,
  onAdd,
  onUpdate
}: LayerProps & {
  type: string;
  onAdd: (entity: any, dataSource: any) => any;
  onUpdate: (cesiumEntity: any, updatedData: any, dataSource: any) => void;
}) {
  const entitiesRef = useRef(new Map<string, any>());
  const dataSourceRef = useRef<any>(null);

  // Initialize CustomDataSource and Clustering
  useEffect(() => {
    if (!viewer) return;
    
    const Cesium = (viewer as any).__cesium;
    if (!Cesium) return;

    const ds = new Cesium.CustomDataSource(type);
    dataSourceRef.current = ds;
    
    // Enable Clustering
    ds.clustering.enabled = true;
    ds.clustering.pixelRange = 40;
    ds.clustering.minimumClusterSize = 3;

    // Custom styling for cluster icons using Canvas for a sleek glowing circle
    const createClusterIcon = (text: string) => {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d');
      if (!ctx) return '';
      
      // Glow effect
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#3b82f6';
      
      // Circle background
      ctx.beginPath();
      ctx.arc(32, 32, 22, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)'; // Dark slate background
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#3b82f6';
      ctx.stroke();

      // Text
      ctx.shadowBlur = 0;
      ctx.font = 'bold 14px Inter, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 32, 32);

      return canvas.toDataURL();
    };

    ds.clustering.clusterEvent.addEventListener((clusteredEntities: any[], cluster: any) => {
      cluster.label.show = false; 
      cluster.billboard.show = true;
      cluster.billboard.id = cluster.label.id;
      cluster.billboard.verticalOrigin = Cesium.VerticalOrigin.CENTER;
      
      const count = clusteredEntities.length;
      const text = count >= 1000 ? `${(count / 1000).toFixed(1)}k` : `${count}`;
      cluster.billboard.image = createClusterIcon(text);
    });

    viewer.dataSources.add(ds);

    return () => {
      viewer.dataSources.remove(ds);
    };
  }, [viewer, type]);

  // Handle visibility toggling
  useEffect(() => {
    if (dataSourceRef.current) {
      dataSourceRef.current.show = visible;
    }
  }, [visible]);

  // Imperatively handle incoming diffs bypassing React state
  useEffect(() => {
    if (!viewer || !dataSourceRef.current) return;

    const handleDiff = (diff: any) => {
      if (!diff) return;

      const ds = dataSourceRef.current;

      // Process Additions
      diff.added?.forEach((e: any) => {
        if (e.type !== type) return;
        if (entitiesRef.current.has(e.id)) return;
        
        try {
          const ent = onAdd(e, ds);
          if (ent) {
            ent._metadata = e.metadata || {};
            ent._displayName = e.metadata?.name || e.metadata?.callsign || e.metadata?.title || e.metadata?.shipName || e.id;
            entitiesRef.current.set(e.id, ent);
          }
        } catch (err) { }
      });

      // Process Updates
      diff.updated?.forEach((e: any) => {
        if (e.type !== type) return;
        const ent = entitiesRef.current.get(e.id);
        if (ent) {
          try {
            onUpdate(ent, e, ds);
            ent._metadata = e.metadata || {};
          } catch (err) { }
        } else {
          try {
            const newEnt = onAdd(e, ds);
            if (newEnt) {
              newEnt._metadata = e.metadata || {};
              newEnt._displayName = e.metadata?.name || e.metadata?.callsign || e.metadata?.title || e.metadata?.shipName || e.id;
              entitiesRef.current.set(e.id, newEnt);
            }
          } catch (err) { }
        }
      });

      // Process Removals
      diff.removed?.forEach((id: string) => {
        const ent = entitiesRef.current.get(id);
        if (ent) {
          ds.entities.remove(ent);
          entitiesRef.current.delete(id);
        }
      });
    };

    const unsubscribe = subscribeToEntityUpdates(handleDiff);
    return () => unsubscribe();
  }, [viewer, type, onAdd, onUpdate]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (dataSourceRef.current) {
        dataSourceRef.current.entities.removeAll();
      }
      entitiesRef.current.clear();
    };
  }, []);
}
