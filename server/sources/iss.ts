import axios from 'axios';
import type { Entity } from '../../shared/entity';

export type ISSPollOptions = {
  intervalMs?: number;
};

const ISS_API = 'https://api.wheretheiss.at/v1/satellites/25544';

const TLE_FALLBACK = {
  name: 'ISS (ZARYA)',
  tle1: '1 25544U 98067A   26122.84576389  .00016480  00000+0  29688-3 0  9994',
  tle2: '2 25544  51.6410 346.7210 0004767  69.3854  27.3319 15.50084214510620',
};

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

      if (isNaN(lat) || isNaN(lon)) return;

      const entities: Entity[] = [{

        id: 'iss:25544',
        type: 'iss',
        position: {
          lat,
          lon,
          alt: isNaN(altKm) ? 420000 : altKm * 1000,
        },
        timestamp: Date.now(),
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

      // Fallback: send ISS as a TLE-based satellite so client propagates it
      const entities: Entity[] = [{
        id: 'iss:25544:tle',
        type: 'iss',
        position: { lat: 0, lon: 0, alt: 0 },
        timestamp: Date.now(),
        metadata: {
          name: 'International Space Station',
          tle1: TLE_FALLBACK.tle1,
          tle2: TLE_FALLBACK.tle2,
          isTLEFallback: true,
        },
      }];
      onEntities(entities);
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
