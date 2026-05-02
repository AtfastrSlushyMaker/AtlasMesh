import axios from 'axios';
import type { Entity } from '../../shared/entity';

export type AirportPollOptions = {
  intervalMs?: number;
};

const AIRPORTS_URL =
  'https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports.dat';

export function startAirportSource(
  onEntities: (entities: Entity[]) => void,
  opts?: AirportPollOptions
) {
  const intervalMs = opts?.intervalMs ?? 24 * 60 * 60 * 1000;
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;

  async function fetchAndEmit() {
    try {
      const res = await axios.get(AIRPORTS_URL, { timeout: 20000, responseType: 'text' });
      const lines = (res.data as string).split('\n').filter((l: string) => l.trim());

      const entities: Entity[] = [];

      for (const line of lines) {
        // Format: id,name,city,country,iata,icao,lat,lon,alt,timezone,dst,tz,type,source
        const parts = line.split(',');
        if (parts.length < 8) continue;

        const name = parts[1]?.replace(/"/g, '').trim() || '';
        const city = parts[2]?.replace(/"/g, '').trim() || '';
        const country = parts[3]?.replace(/"/g, '').trim() || '';
        const iata = parts[4]?.replace(/"/g, '').trim() || '';
        const icao = parts[5]?.replace(/"/g, '').trim() || '';
        const lat = parseFloat(parts[6]);
        const lon = parseFloat(parts[7]);

        if (isNaN(lat) || isNaN(lon)) continue;
        // Only include airports with valid IATA codes
        if (iata.length !== 3 || iata === '\\N') continue;

        entities.push({
          id: `airport:${iata}`,
          type: 'airport',
          position: { lat, lon, alt: 0 },
          timestamp: Date.now(),
          metadata: { name, city, country, iata, icao },
        });
      }

      console.log(`[Airports] Fetched ${entities.length} airports with IATA codes`);
      if (entities.length > 0) {
        onEntities(entities);
      }
    } catch (err: any) {
      console.warn('[Airports] Error:', err?.message || err);
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
