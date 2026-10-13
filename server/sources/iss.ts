import { client as axios } from '../lib/http';
import type { Entity } from '../../shared/entity';

export type ISSPollOptions = {
  intervalMs?: number;
};

const ISS_API = 'https://api.wheretheiss.at/v1/satellites/25544';

export function startISSSource(
  onEntities: (entities: Entity[]) => void,
  opts?: ISSPollOptions
) {
  const intervalMs = opts?.intervalMs ?? 5000;
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;

  async function fetchAndEmit() {
    try {
      const res = await axios.get(ISS_API, { timeout: 10000 });
      const d = res.data;

      const lat = parseFloat(d.latitude);
      const lon = parseFloat(d.longitude);
      const altKm = parseFloat(d.altitude);

      if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(altKm) || !Number.isFinite(d.timestamp)) {
        throw new Error('wheretheiss.at returned an invalid position');
      }

      const entities: Entity[] = [{

        id: 'iss:25544',
        type: 'iss',
        position: {
          lat,
          lon,
          alt: altKm * 1000,
        },
        timestamp: d.timestamp * 1000,
        metadata: {
          name: 'International Space Station',
          velocityKms: d.velocity ? parseFloat(d.velocity) : undefined,
          visibility: d.visibility || '',
          footprint: d.footprint ? parseFloat(d.footprint) : undefined,
          daynum: d.daynum ? parseFloat(d.daynum) : undefined,
          orbitalPeriod: 92.68,
          altitudeKm: altKm,
        },
      }];

      onEntities(entities);
    } catch (err: any) {
      console.warn('[ISS] API error:', err?.message || err);

      // Keep the last real observation. An old hard-coded orbit would look live
      // while placing the station at an incorrect position during an outage.
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
