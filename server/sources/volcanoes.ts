import axios from 'axios';
import type { Entity } from '../../shared/entity';

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
      const res = await axios.get(url, { timeout: 15000 });
      const volcanoes = res.data || [];
      
      const entities: Entity[] = [];
      
      const filtered = Array.isArray(volcanoes) ? volcanoes : [];
      
      filtered.forEach((v: any) => {
        const lat = parseFloat(v.latitude);
        const lon = parseFloat(v.longitude);
        if (isNaN(lat) || isNaN(lon)) return;
        
        entities.push({
          id: `volcano:${v.volcanoNumber || v.volcanoName}`,
          type: 'volcano',
          position: { lat, lon, alt: v.elevation ? parseFloat(v.elevation) : 0 },
          timestamp: Date.now(),
          metadata: {
            name: v.volcanoName || 'Unknown',
            country: v.country || '',
            type: v.volcanoType || '',
            elevation: v.elevation ? parseFloat(v.elevation) : undefined,
            lastEruption: v.lastEruptionYear || 'Unknown',
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
