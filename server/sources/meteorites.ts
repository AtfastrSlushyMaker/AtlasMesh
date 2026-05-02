import axios from 'axios';
import type { Entity } from '../../shared/entity';

export type MeteoritePollOptions = {
  intervalMs?: number;
};

const NASA_URL = 'https://data.nasa.gov/resource/gh4g-9sfh.json?$limit=50000';

export function startMeteoriteSource(
  onEntities: (entities: Entity[]) => void,
  opts?: MeteoritePollOptions
) {
  const intervalMs = opts?.intervalMs ?? 24 * 60 * 60 * 1000;
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;

  async function fetchAndEmit() {
    try {
      const res = await axios.get(NASA_URL, {
        timeout: 30000,
        headers: { 'Accept': 'application/json' },
      });
      const rows = res.data as any[];

      if (!Array.isArray(rows) || rows.length === 0) {
        console.warn('[Meteorites] Empty response from NASA');
        return;
      }

      const entities: Entity[] = [];
      let skipped = 0;

      for (const r of rows) {
        const lat = r.reclat ? parseFloat(r.reclat) : NaN;
        const lon = r.reclong ? parseFloat(r.reclong) : NaN;
        if (isNaN(lat) || isNaN(lon) || lat === 0 && lon === 0) { skipped++; continue; }

        const massG = r.mass ? parseFloat(r.mass) : undefined;
        const year = r.year ? String(r.year).split('-')[0] : 'Unknown';

        entities.push({
          id: `meteorite:${r.id || r.name}`,
          type: 'meteorite',
          position: { lat, lon, alt: 0 },
          timestamp: Date.now(),
          metadata: {
            name: r.name || 'Unknown Meteorite',
            massGrams: massG,
            year,
            recclass: r.recclass || '',
            fall: r.fall || '',
          },
        });
      }

      console.log(`[Meteorites] Fetched ${entities.length} meteorites (skipped ${skipped})`);
      if (entities.length > 0) {
        onEntities(entities);
      }
    } catch (err: any) {
      console.warn('[Meteorites] Error:', err?.message || err);
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
