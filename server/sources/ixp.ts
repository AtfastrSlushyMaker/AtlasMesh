import type { Entity } from '../../shared/entity';
import { fetchCached } from '../lib/http';

export type IXPPollOptions = {
  intervalMs?: number;
};

const DAY = 24 * 60 * 60 * 1000;
// Exchanges do not have coordinates. depth=1 expands their associated
// facilities to IDs, which can be joined to the public facility catalogue.
const PEERINGDB_URL = 'https://www.peeringdb.com/api/ix?depth=1&fields=id,name,name_long,city,country,net_count,website,fac_set';
const FACILITIES_URL = 'https://www.peeringdb.com/api/fac?fields=id,name,city,country,latitude,longitude';

const coordinate = (value: unknown) =>
  (typeof value === 'number' || typeof value === 'string') && String(value).trim() !== '' ? Number(value) : NaN;
const same = (a: unknown, b: unknown) =>
  typeof a === 'string' && typeof b === 'string' && a.trim() !== '' && a.trim().toLowerCase() === b.trim().toLowerCase();

export function startIXPSource(
  onEntities: (entities: Entity[]) => void,
  opts?: IXPPollOptions
) {
  const intervalMs = opts?.intervalMs ?? DAY;
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;
  let failed = false;

  async function fetchAndEmit() {
    try {
      // Two bulk requests per day, rather than one request per exchange.
      const [exchanges, facilityCatalogue] = await Promise.all([
        fetchCached<any>(PEERINGDB_URL, DAY, { timeout: 30000 }),
        fetchCached<any>(FACILITIES_URL, DAY, { timeout: 30000 }),
      ]);
      const data = exchanges?.data;

      if (!Array.isArray(data) || data.length === 0) {
        throw new Error('PeeringDB returned an empty or invalid exchange catalogue');
      }
      if (!Array.isArray(facilityCatalogue?.data) || facilityCatalogue.data.length === 0) {
        throw new Error('PeeringDB returned an empty or invalid facility catalogue');
      }
      const facilities = new Map<number, { id: number; name: string; city: string; country: string; lat: number; lon: number }>();
      for (const f of facilityCatalogue.data) {
        const lat = coordinate(f.latitude);
        const lon = coordinate(f.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
        facilities.set(Number(f.id), { id: Number(f.id), name: f.name, city: f.city, country: f.country, lat, lon });
      }

      const entities: Entity[] = [];
      let skipped = 0;

      for (const ix of data) {
        const associated = (Array.isArray(ix.fac_set) ? ix.fac_set : [])
          .map((id: number) => facilities.get(Number(id))).filter(Boolean);
        const score = (f: typeof associated[number]) =>
          (same(f.country, ix.country) ? 2 : 0) + (same(f.city, ix.city) ? 1 : 0);
        // Map an actual associated site, preferring the exchange's declared
        // city/country and then the lowest facility ID for a stable position.
        associated.sort((a, b) => score(b) - score(a) || a.id - b.id);
        const facility = associated[0];
        if (!facility) { skipped++; continue; }

        entities.push({
          id: `ixp:${ix.id}`,
          type: 'ixp',
          position: { lat: facility.lat, lon: facility.lon, alt: 0 },
          timestamp: Date.now(),
          metadata: {
            name: ix.name || 'Unknown IXP',
            nameLong: ix.name_long || '',
            city: ix.city || '',
            country: ix.country || '',
            iataCode: ix.iata_code || '',
            netCount: ix.net_count || 0,
            website: ix.website || undefined,
            sourceUrl: `https://www.peeringdb.com/ix/${ix.id}`,
            facilityId: facility.id,
            facilityName: facility.name,
            facilitySourceUrl: `https://www.peeringdb.com/fac/${facility.id}`,
            locationNote: 'Position of an associated PeeringDB facility; the exchange may operate at other sites.',
          },
        });
      }

      console.log(`[IXP] Fetched ${entities.length} exchange points (skipped ${skipped})`);
      if (!entities.length) throw new Error(`No exchange locations could be mapped from ${data.length} exchanges and their public facilities`);
      onEntities(entities);
    } catch (err: any) {
      console.warn('[IXP] Error:', err?.response?.status === 429 ? 'PeeringDB rate limit reached; retrying in 10 minutes' : err?.message || err);
      failed = true;
    } finally {
      if (!stopped) {
        // PeeringDB rate-limits anonymous bursts; retry failures after 10 minutes, not a day.
        timer = setTimeout(fetchAndEmit, failed ? 10 * 60 * 1000 : intervalMs);
        failed = false;
      }
    }
  }

  fetchAndEmit();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
