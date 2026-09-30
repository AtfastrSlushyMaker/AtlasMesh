import type { Entity } from '../../shared/entity';
import { fetchCached } from '../lib/http';

export type VolcanoPollOptions = {
  intervalMs?: number;
};

/**
 * Fetches active volcano data from the Smithsonian GVP (Global Volcanism Program) 
 * via the USGS Volcano Hazards API.
 */
export function startVolcanoSource(
  onEntities: (entities: Entity[]) => void,
  opts?: VolcanoPollOptions
) {
  const intervalMs = opts?.intervalMs ?? 6 * 60 * 60 * 1000; // 6 hours
  // USGS Volcano Hazards CAP Alerts (free, no auth)
  const url = 'https://volcanoes.usgs.gov/vsc/api/volcanoApi/volcanoesGVP';

  let stopped = false;
  let timer: NodeJS.Timeout | null = null;

  async function fetchAndEmit() {
    try {
      const res = { data: await fetchCached<any>(url, 24 * 60 * 60 * 1000, { timeout: 15000 }) };
      const volcanoes = res.data || [];
      
      const entities: Entity[] = [];
      
      const filtered = Array.isArray(volcanoes) ? volcanoes : [];
      
      filtered.forEach((v: any) => {
        const lat = parseFloat(v.latitude);
        const lon = parseFloat(v.longitude);
        if (isNaN(lat) || isNaN(lon)) return;
        
        entities.push({
          id: `volcano:${v.vnum || v.volcanoNumber || `${lat},${lon}`}`,
          type: 'volcano',
          position: { lat, lon, alt: 0 },
          timestamp: Date.now(),
          metadata: {
            name: v.vName || v.volcanoName || 'Unknown volcano',
            country: v.country || undefined,
            region: v.subregion || undefined,
            elevationM: Number.isFinite(Number(v.elevation_m)) ? Number(v.elevation_m) : undefined,
            observatory: v.obsAbbr || undefined,
            gvpNumber: v.vnum,
            sourceUrl: v.webpage || undefined,
          }
        });
      });

      console.log(`[Volcanoes] Fetched ${entities.length} volcanoes`);
      if (entities.length > 0) {
        onEntities(entities);
      }
    } catch (err: any) {
      console.warn('[Volcanoes] Error:', err?.message || err);
      // No mock data fallback!
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
