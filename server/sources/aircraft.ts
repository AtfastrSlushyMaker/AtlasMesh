import axios from 'axios';
import type { Entity } from '../../shared/entity';

export type AircraftPollOptions = {
  intervalMs?: number;
  url?: string;
};

// Demo aircraft at major airports as fallback
const DEMO_AIRCRAFT: Entity[] = [
  {
    id: 'aircraft:demo:ba001',
    type: 'aircraft',
    position: { lat: 51.47, lon: -0.46, alt: 0 },
    timestamp: Date.now(),
    metadata: { callsign: 'BA001', icao24: 'demo001', origin_country: 'United Kingdom', name: 'London Heathrow' },
  },
  {
    id: 'aircraft:demo:dl101',
    type: 'aircraft',
    position: { lat: 40.64, lon: -73.78, alt: 5000 },
    timestamp: Date.now(),
    metadata: { callsign: 'DL101', icao24: 'demo002', origin_country: 'United States', name: 'JFK Approach' },
  },
  {
    id: 'aircraft:demo:af022',
    type: 'aircraft',
    position: { lat: 48.86, lon: 2.35, alt: 30000 },
    timestamp: Date.now(),
    metadata: { callsign: 'AF022', icao24: 'demo003', origin_country: 'France', name: 'Paris Overflight' },
  },
  {
    id: 'aircraft:demo:lh405',
    type: 'aircraft',
    position: { lat: 50.04, lon: 8.57, alt: 12000 },
    timestamp: Date.now(),
    metadata: { callsign: 'LH405', icao24: 'demo004', origin_country: 'Germany', name: 'Frankfurt Approach' },
  },
  {
    id: 'aircraft:demo:jl061',
    type: 'aircraft',
    position: { lat: 35.55, lon: 139.78, alt: 25000 },
    timestamp: Date.now(),
    metadata: { callsign: 'JL061', icao24: 'demo005', origin_country: 'Japan', name: 'Tokyo Haneda' },
  },
];

export function startAircraftSource(
  onEntities: (entities: Entity[]) => void,
  opts?: AircraftPollOptions
) {
  const intervalMs = opts?.intervalMs ?? 15000;
  const url = opts?.url ?? 'https://opensky-network.org/api/states/all';

  let stopped = false;
  let timer: NodeJS.Timeout | null = null;
  let dynamicInterval = intervalMs;
  let consecutiveErrors = 0;
  let usedFallback = false;

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
        consecutiveErrors = 0;
        return res;
      } catch (err: any) {
        if (err.response?.status === 429) {
          dynamicInterval = Math.max(dynamicInterval * 2, 60000);
          console.warn(`[Aircraft] OpenSky rate limited (429). Backing off to ${dynamicInterval}ms`);
          return null;
        }
        if (attempt === retries) throw err;
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
      if (!res) {
        consecutiveErrors++;
        if (consecutiveErrors >= 3 && !usedFallback) {
          console.warn('[Aircraft] Using demo fallback aircraft (set OPENSKY_USERNAME/PASSWORD for real data)');
          onEntities(DEMO_AIRCRAFT);
          usedFallback = true;
        }
        return;
      }

      const data = res.data;
      const states = data.states || [];
      if (states.length === 0) {
        console.log('[Aircraft] OpenSky returned 0 states');
        return;
      }

      const entities: Entity[] = states.map((s: any) => {
        const icao24 = s[0];
        const callsign = s[1] ? s[1].trim() : '';
        const origin_country = s[2];
        const lon = s[5];
        const lat = s[6];
        const baro_alt = s[7];
        const velocity = s[9];
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
          timestamp: Math.floor((s[4] ?? Date.now() / 1000) * 1000),
          metadata: { icao24, callsign, origin_country }
        } as Entity;
      });

      console.log(`[Aircraft] Fetched ${entities.length} aircraft`);
      onEntities(entities);
      usedFallback = false;
    } catch (err: any) {
      console.warn('[Aircraft] Error fetching OpenSky data:', err?.message || err);
      consecutiveErrors++;
      if (consecutiveErrors >= 3 && !usedFallback) {
        console.warn('[Aircraft] Using demo fallback aircraft (set OPENSKY_USERNAME/PASSWORD for real data)');
        onEntities(DEMO_AIRCRAFT);
        usedFallback = true;
      }
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
