import axios from 'axios';
import type { Entity } from '../../shared/entity';

export type SubmarineCablePollOptions = {
  intervalMs?: number;
};

/**
 * Fetches submarine cable data from the public TeleGeography API.
 * This is static infrastructure data, so we only fetch once on startup.
 */
export function startSubmarineCableSource(
  onEntities: (entities: Entity[]) => void,
  opts?: SubmarineCablePollOptions
) {
  const intervalMs = opts?.intervalMs ?? 24 * 60 * 60 * 1000; // Refresh daily (static data)
  const url = 'https://www.submarinecablemap.com/api/v3/cable/cable-geo.json';

  let stopped = false;
  let timer: NodeJS.Timeout | null = null;

  async function fetchAndEmit() {
    try {
      const res = await axios.get(url, { timeout: 30000 });
      const features = res.data.features || [];
      
      const entities: Entity[] = [];

      features.forEach((feature: any, idx: number) => {
        const props = feature.properties || {};
        const geom = feature.geometry;
        if (!geom) return;

        const id = props.id || props.slug || `cable_${idx}`;
        const name = props.name || 'Unknown Cable';
        
        // For MultiLineString or LineString, extract representative coordinates
        let coordinates: number[][] = [];
        if (geom.type === 'MultiLineString') {
          // Flatten all line segments
          geom.coordinates.forEach((segment: number[][]) => {
            coordinates.push(...segment);
          });
        } else if (geom.type === 'LineString') {
          coordinates = geom.coordinates;
        }
        
        if (coordinates.length === 0) return;

        // Sample every Nth coordinate for the cable path (too many points = too slow)
        const sampleRate = Math.max(1, Math.floor(coordinates.length / 20));
        const sampledCoords = coordinates.filter((_: any, i: number) => i % sampleRate === 0);
        
        // Use the midpoint as the entity position
        const midIdx = Math.floor(sampledCoords.length / 2);
        const midCoord = sampledCoords[midIdx] || sampledCoords[0];

        entities.push({
          id: `cable:${id}`,
          type: 'cable',
          position: {
            lon: midCoord[0],
            lat: midCoord[1],
          },
          timestamp: Date.now(),
          metadata: {
            name,
            color: props.color || '#00ffaa',
            length_km: props.length ? parseFloat(props.length) : undefined,
            owners: props.owners || '',
            rfs: props.rfs || '', // Ready for service date
            url: props.url || '',
            // Store sampled path for polyline rendering on client
            path: sampledCoords.map((c: number[]) => ({ lon: c[0], lat: c[1] })),
          }
        });
      });

      console.log(`[Submarine Cables] Fetched ${entities.length} cables`);
      if (entities.length > 0) {
        onEntities(entities);
      }
    } catch (err: any) {
      console.warn('[Submarine Cables] Error:', err?.message || err);
    } finally {
      if (!stopped) {
        timer = setTimeout(fetchAndEmit, intervalMs);
      }
    }
  }

  fetchAndEmit();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
