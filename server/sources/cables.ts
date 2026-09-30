import type { Entity } from '../../shared/entity';
import { fetchCached } from '../lib/http';

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
      const res = { data: await fetchCached<any>(url, 7 * 24 * 60 * 60 * 1000, { timeout: 30000 }) };
      const features = res.data.features || [];
      
      const entities: Entity[] = [];

      features.forEach((feature: any, idx: number) => {
        const props = feature.properties || {};
        const geom = feature.geometry;
        if (!geom) return;

        const id = props.id || props.slug || `cable_${idx}`;
        const name = props.name || 'Unknown Cable';
        
        // Keep segments separate: joining them draws straight lines across continents.
        const rawSegments: number[][][] =
          geom.type === 'MultiLineString' ? geom.coordinates : geom.type === 'LineString' ? [geom.coordinates] : [];
        const segments = rawSegments
          .filter((seg) => seg.length > 1)
          .map((seg) => {
            const step = Math.max(1, Math.ceil(seg.length / 60));
            const out = seg.filter((_, i) => i % step === 0);
            if (out[out.length - 1] !== seg[seg.length - 1]) out.push(seg[seg.length - 1]);
            return out.map((c) => ({ lon: +c[0].toFixed(4), lat: +c[1].toFixed(4) }));
          });
        if (!segments.length) return;
        const longest = segments.reduce((a, b) => (b.length > a.length ? b : a));
        const mid = longest[Math.floor(longest.length / 2)];
        const midCoord = [mid.lon, mid.lat];

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
            sourceUrl: props.url || `https://www.submarinecablemap.com/submarine-cable/${props.id || ''}`,
            // Store sampled path for polyline rendering on client
            segments,
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
