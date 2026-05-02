import { useEffect, useRef } from 'react';
import { subscribeToEntityUpdates } from '../../hooks/useWebSocket';

export interface LayerProps {
  viewer: any;
  visible: boolean;
}

export interface ClusterConfig {
  pixelRange?: number;
  minimumClusterSize?: number;
  clusterIcon?: string;
}

export function useEntityLayer({
  viewer,
  visible,
  type,
  onAdd,
  onUpdate,
  cluster,
}: LayerProps & {
  type: string;
  onAdd: (entity: any, dataSource: any) => any;
  onUpdate: (cesiumEntity: any, updatedData: any, dataSource: any) => void;
  cluster?: ClusterConfig;
}) {
  const entitiesRef = useRef(new Map<string, any>());
  const dataSourceRef = useRef<any>(null);
  const errorCountRef = useRef<Record<string, number>>({});
  const clusterListenerRef = useRef<(() => void) | null>(null);

  const logLayerError = (phase: 'add' | 'update' | 'remove', entityId: string, err: unknown) => {
    const key = `${phase}:${entityId}`;
    const count = (errorCountRef.current[key] || 0) + 1;
    errorCountRef.current[key] = count;

    // Avoid flooding logs for the same failing entity.
    if (count <= 3) {
      console.warn(`[Layer:${type}] ${phase} failed for '${entityId}' (attempt ${count})`, err);
    }
  };

  // Initialize CustomDataSource.
  useEffect(() => {
    if (!viewer) return;

    const Cesium = (viewer as any).__cesium;
    if (!Cesium) return;

    const ds = new Cesium.CustomDataSource(type);
    dataSourceRef.current = ds;

    if (cluster) {
      ds.clustering.enabled = true;
      ds.clustering.pixelRange = cluster.pixelRange ?? 50;
      ds.clustering.minimumClusterSize = cluster.minimumClusterSize ?? 3;

      if (cluster.clusterIcon) {
        const iconUrl = cluster.clusterIcon;
        const removeListener = (ds.clustering as any).clusterEvent.addEventListener(
          (clusteredEntities: any[], clusterEntity: any) => {
            const count = clusteredEntities.length;

            clusterEntity.label.show = true;
            clusterEntity.label.text = String(count);
            clusterEntity.label.font = 'bold 10px "Inter", sans-serif';
            clusterEntity.label.fillColor = Cesium.Color.WHITE;
            clusterEntity.label.outlineColor = Cesium.Color.fromCssColorString('#000000').withAlpha(0.7);
            clusterEntity.label.outlineWidth = 3;
            clusterEntity.label.style = Cesium.LabelStyle.FILL;
            clusterEntity.label.pixelOffset = new Cesium.Cartesian2(0, -22);
            clusterEntity.label.scale = 0.65;
            clusterEntity.label.horizontalOrigin = Cesium.HorizontalOrigin.CENTER;
            clusterEntity.label.verticalOrigin = Cesium.VerticalOrigin.BOTTOM;
            clusterEntity.label.showBackground = true;
            clusterEntity.label.backgroundColor = new Cesium.Color(0.05, 0.05, 0.08, 0.7);
            clusterEntity.label.backgroundPadding = new Cesium.Cartesian2(5, 3);

            clusterEntity.billboard.show = true;
            clusterEntity.billboard.image = iconUrl;
            clusterEntity.billboard.scale = 0.35 + Math.min(count, 50) * 0.008;
          }
        );
        clusterListenerRef.current = removeListener;
      }
    } else {
      ds.clustering.enabled = false;
    }

    viewer.dataSources.add(ds);

    return () => {
      if (clusterListenerRef.current) {
        clusterListenerRef.current();
        clusterListenerRef.current = null;
      }
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
            ent._entityType = e.type || type;
            ent._displayName = e.metadata?.name || e.metadata?.callsign || e.metadata?.title || e.metadata?.shipName || e.id;
            entitiesRef.current.set(e.id, ent);
          }
        } catch (err) {
          logLayerError('add', e.id, err);
        }
      });

      // Process Updates
      diff.updated?.forEach((e: any) => {
        if (e.type !== type) return;
        const ent = entitiesRef.current.get(e.id);
        if (ent) {
          try {
            onUpdate(ent, e, ds);
            ent._metadata = e.metadata || {};
            ent._entityType = e.type || type;
          } catch (err) {
            logLayerError('update', e.id, err);
          }
        } else {
          try {
            const newEnt = onAdd(e, ds);
            if (newEnt) {
              newEnt._metadata = e.metadata || {};
              newEnt._entityType = e.type || type;
              newEnt._displayName = e.metadata?.name || e.metadata?.callsign || e.metadata?.title || e.metadata?.shipName || e.id;
              entitiesRef.current.set(e.id, newEnt);
            }
          } catch (err) {
            logLayerError('add', e.id, err);
          }
        }
      });

      // Process Removals
      diff.removed?.forEach((id: string) => {
        const ent = entitiesRef.current.get(id);
        if (ent) {
          try {
            ds.entities.remove(ent);
          } catch (err) {
            logLayerError('remove', id, err);
          }
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
