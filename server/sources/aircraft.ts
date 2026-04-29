import axios from 'axios';
import type { Entity } from '../../shared/entity';

export type AircraftPollOptions = {
  intervalMs?: number;
  url?: string;
};

/**
 * Start polling OpenSky states API and invoke onEntities with normalized Entity[]
 * Returns a stop() function to cancel polling.
 */
export function startAircraftSource(
  onEntities: (entities: Entity[]) => void,
  opts?: AircraftPollOptions
) {
  const intervalMs = opts?.intervalMs ?? 15000; // Increased interval to avoid 429
  const url = opts?.url ?? 'https://opensky-network.org/api/states/all';

  let stopped = false;
  let timer: NodeJS.Timeout | null = null;
  let dynamicInterval = intervalMs;
  let consecutive429 = 0;

  function wait(ms: number) {
    return new Promise((res) => setTimeout(res, ms));
  }

  async function fetchWithRetry(input: string, opts?: { retries?: number }) {
    const retries = opts?.retries ?? 2;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const authOptions: any = { timeout: 10000 };
        if (process.env.OPENSKY_USERNAME && process.env.OPENSKY_PASSWORD) {
            authOptions.auth = {
                username: process.env.OPENSKY_USERNAME,
                password: process.env.OPENSKY_PASSWORD
            };
        }
        const res = await axios.get(input, authOptions);
        
        // reset counter on success
        consecutive429 = 0;
        return res;
      } catch (err: any) {
        if (err.response?.status === 429) {
          // rate limited -> back off significantly
          consecutive429++;
          dynamicInterval = Math.max(dynamicInterval * 4, 2 * 60 * 1000); // Back off 2 mins
          console.warn(`[Aircraft] OpenSky rate limited (429). Backing off for ${dynamicInterval}ms`);
          return null;
        }

        if (attempt === retries) {
          throw err;
        }
        const backoff = Math.pow(2, attempt) * 1000;
        console.warn(`[Aircraft] Fetch attempt ${attempt + 1} failed, retrying in ${backoff}ms`);
        await wait(backoff);
      }
    }
    return null;
  }

  async function fetchAndEmit() {
    try {
      const res = await fetchWithRetry(url, { retries: 2 });
      if (!res) return;
      
      const data = res.data;
      const states = data.states || [];
      const entities: Entity[] = states.map((s: any) => {
        const icao24 = s[0];
        const callsign = s[1] ? s[1].trim() : '';
        const origin_country = s[2];
        const lon = s[5];
        const lat = s[6];
        const baro_alt = s[7];
        const velocity = s[9]; // m/s
        const heading = s[10];
        const geo_alt = s[13];

        return {
          id: `aircraft:opensky:${icao24}`,
          type: 'aircraft',
          position: {
            lat: lat ?? 0,
            lon: lon ?? 0,
            alt: typeof geo_alt === 'number' ? geo_alt : (typeof baro_alt === 'number' ? baro_alt : undefined)
          },
          velocity: typeof velocity === 'number' ? velocity : undefined,
          heading: typeof heading === 'number' ? heading : undefined,
          timestamp: Math.floor((s[4] ?? Date.now()/1000) * 1000),
          metadata: {
            icao24,
            callsign,
            origin_country,
          }
        } as Entity;
      });

      console.log(`[Aircraft] Fetched ${entities.length} aircraft`);
      onEntities(entities);
    } catch (err: any) {
      console.warn('[Aircraft] Error fetching OpenSky data:', err?.message || err);
    } finally {
      if (!stopped) {
        timer = setTimeout(fetchAndEmit, dynamicInterval);
        if (dynamicInterval > intervalMs) {
          dynamicInterval = Math.max(intervalMs, Math.floor(dynamicInterval / 1.5));
        }
      }
    }
  }

  fetchAndEmit();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
