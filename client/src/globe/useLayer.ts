import { useEffect, useRef } from 'react';
import * as Cesium from 'cesium';
import type { Entity } from '../../../shared/entity';
import { onDiff } from '../lib/live';
import { entityIndex, touchIndex } from './index';
import { applyLayerDiff, clearLayerEntities } from './layerDiff';

export interface LayerSpec {
  type: string;
  create: (e: Entity, ds: Cesium.CustomDataSource) => Cesium.Entity | null;
  /** Default: rebuild via remove + create. */
  update?: (ent: Cesium.Entity, e: Entity, ds: Cesium.CustomDataSource) => void;
  onRemove?: (id: string, ds: Cesium.CustomDataSource) => void;
  cluster?: { pixelRange: number; minimumClusterSize: number; icon?: string };
}

/**
 * Binds one CustomDataSource to the live feed for a single entity type.
 * Diffs are applied in a batch with Cesium events suspended, which is what
 * keeps tens of thousands of updates from stalling the main thread.
 */
export function useLayer(viewer: Cesium.Viewer | null, visible: boolean, spec: LayerSpec) {
  const specRef = useRef(spec);
  specRef.current = spec;
  const dsRef = useRef<Cesium.CustomDataSource | null>(null);
  const map = useRef(new Map<string, Cesium.Entity>());

  useEffect(() => {
    if (!viewer) return;
    const ds = new Cesium.CustomDataSource(spec.type);
    dsRef.current = ds;
    if (spec.cluster) {
      ds.clustering.enabled = true;
      ds.clustering.pixelRange = spec.cluster.pixelRange;
      ds.clustering.minimumClusterSize = spec.cluster.minimumClusterSize;
      const icon = spec.cluster.icon;
      ds.clustering.clusterEvent.addEventListener((entities: Cesium.Entity[], cluster: any) => {
        cluster.label.show = true;
        cluster.label.text = entities.length > 999 ? `${Math.round(entities.length / 100) / 10}k` : String(entities.length);
        cluster.label.font = '600 12px Archivo, sans-serif';
        cluster.label.fillColor = Cesium.Color.fromCssColorString('#10202a');
        cluster.label.showBackground = true;
        cluster.label.backgroundColor = Cesium.Color.fromCssColorString('#eef1f2').withAlpha(0.92);
        cluster.label.backgroundPadding = new Cesium.Cartesian2(5, 3);
        cluster.label.pixelOffset = new Cesium.Cartesian2(0, -18);
        cluster.label.verticalOrigin = Cesium.VerticalOrigin.BOTTOM;
        cluster.label.disableDepthTestDistance = 0;
        if (icon) {
          cluster.billboard.show = true;
          cluster.billboard.image = icon;
          cluster.billboard.scale = 0.5;
        }
      });
    }
    // Cesium adds even a plain data source in a microtask. Cleanup can run
    // before that resolves, so remove a late registration too.
    let disposed = false;
    void viewer.dataSources.add(ds).then(() => {
      if (disposed && !viewer.isDestroyed()) viewer.dataSources.remove(ds, true);
    });
    return () => {
      disposed = true;
      clearLayerEntities(ds, map.current, specRef.current, entityIndex);
      touchIndex();
      if (!viewer.isDestroyed()) viewer.dataSources.remove(ds, true);
      dsRef.current = null;
    };
  }, [viewer, spec.type]);

  useEffect(() => {
    const ds = dsRef.current;
    if (!ds || !viewer || viewer.isDestroyed()) return;
    ds.show = visible;
    if (!visible) {
      // Free memory: the server stops sending this layer and resends a snapshot when re-enabled.
      clearLayerEntities(ds, map.current, specRef.current, entityIndex);
      touchIndex();
    }
    viewer.scene.requestRender();
  }, [visible, viewer]);

  useEffect(() => {
    if (!viewer) return;
    return onDiff((diff) => {
      const ds = dsRef.current;
      if (!ds || !ds.show || viewer.isDestroyed()) return;
      const touched = applyLayerDiff(diff, ds, map.current, specRef.current, entityIndex);
      if (touched) {
        touchIndex();
        viewer.scene.requestRender();
      }
    });
  }, [viewer]);

  return { dataSource: dsRef, entities: map };
}
