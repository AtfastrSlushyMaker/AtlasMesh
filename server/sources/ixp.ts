import axios from 'axios';
import type { Entity } from '../../shared/entity';

export type IXPPollOptions = {
  intervalMs?: number;
};

const PEERINGDB_URL = 'https://www.peeringdb.com/api/ix';

export function startIXPSource(
  onEntities: (entities: Entity[]) => void,
  opts?: IXPPollOptions
) {
  const intervalMs = opts?.intervalMs ?? 24 * 60 * 60 * 1000;
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;

  async function fetchAndEmit() {
    try {
      const res = await axios.get(PEERINGDB_URL, { timeout: 30000 });
      const data = res.data?.data;

      if (!Array.isArray(data) || data.length === 0) {
        console.warn('[IXP] Empty PeeringDB response');
        return;
      }

      const entities: Entity[] = [];
      let skipped = 0;

      for (const ix of data) {
        const lat = ix.latitude ? parseFloat(ix.latitude) : NaN;
        const lon = ix.longitude ? parseFloat(ix.longitude) : NaN;
        if (isNaN(lat) || isNaN(lon)) { skipped++; continue; }

        entities.push({
          id: `ixp:${ix.id}`,
          type: 'ixp',
          position: { lat, lon, alt: 0 },
          timestamp: Date.now(),
          metadata: {
            name: ix.name || 'Unknown IXP',
            nameLong: ix.name_long || '',
            city: ix.city || '',
            country: ix.country || '',
            iataCode: ix.iata_code || '',
            netCount: ix.net_count || 0,
            website: ix.website || '',
          },
        });
      }

      console.log(`[IXP] Fetched ${entities.length} exchange points (skipped ${skipped})`);
      if (entities.length > 0) {
        onEntities(entities);
      }
    } catch (err: any) {
      console.warn('[IXP] Error:', err?.message || err);
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
