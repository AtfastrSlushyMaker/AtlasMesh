import axios from 'axios';
import type { Entity } from '../../shared/entity';

export type WindFarmPollOptions = {
  intervalMs?: number;
};

const GLOBAL_WIND_URL =
  'https://raw.githubusercontent.com/niclasj/global-renewable-power-plants/main/data/global_renewable_power_plants.csv';

const FALLBACK_FARMS: Array<{ lat: number; lon: number; name: string; capacity: number; country: string }> = [
  { lat: 55.700, lon: 1.820, name: 'Hornsea', capacity: 1218, country: 'GBR' },
  { lat: 51.470, lon: -3.170, name: 'Gwynt y Môr', capacity: 576, country: 'GBR' },
  { lat: 53.330, lon: 6.750, name: 'Gemini', capacity: 600, country: 'NLD' },
  { lat: 54.050, lon: 6.330, name: 'Gode Wind', capacity: 582, country: 'DEU' },
  { lat: 55.160, lon: 12.720, name: 'Kriegers Flak', capacity: 604, country: 'DNK' },
  { lat: 56.620, lon: 7.350, name: 'Horns Rev', capacity: 369, country: 'DNK' },
  { lat: 33.250, lon: 129.700, name: 'Saikai', capacity: 250, country: 'JPN' },
  { lat: -41.300, lon: 174.800, name: 'West Wind', capacity: 143, country: 'NZL' },
  { lat: 32.710, lon: -101.910, name: 'Horse Hollow', capacity: 735, country: 'USA' },
  { lat: 36.560, lon: -98.230, name: 'Traverse', capacity: 999, country: 'USA' },
  { lat: 40.960, lon: 118.480, name: 'Weichang', capacity: 580, country: 'CHN' },
  { lat: -33.460, lon: 138.190, name: 'Hornsdale', capacity: 315, country: 'AUS' },
];

export function startWindFarmSource(
  onEntities: (entities: Entity[]) => void,
  opts?: WindFarmPollOptions
) {
  const intervalMs = opts?.intervalMs ?? 24 * 60 * 60 * 1000;
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;

  async function fetchAndEmit() {
    try {
      const res = await axios.get(GLOBAL_WIND_URL, { timeout: 30000, responseType: 'text' });
      const lines = (res.data as string).split('\n');
      if (lines.length < 2) throw new Error('CSV too short');

      const headers = lines[0].split(',').map((h: string) => h.trim());
      const idxLat = headers.indexOf('latitude');
      const idxLon = headers.indexOf('longitude');
      const idxName = headers.indexOf('name') !== -1 ? headers.indexOf('name') : headers.indexOf('plant_name');
      const idxCap = headers.indexOf('capacity_mw') !== -1 ? headers.indexOf('capacity_mw') : headers.indexOf('capacity');
      const idxCountry = headers.indexOf('country');

      if (idxLat === -1 || idxLon === -1) throw new Error('Missing lat/lon columns');

      const entities: Entity[] = [];
      let skipped = 0;

      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',');
        if (cols.length < Math.max(idxLat, idxLon) + 1) { skipped++; continue; }

        const lat = parseFloat(cols[idxLat]);
        const lon = parseFloat(cols[idxLon]);
        if (isNaN(lat) || isNaN(lon)) { skipped++; continue; }

        const name = idxName !== -1 ? cols[idxName]?.replace(/^"|"$/g, '') : 'Wind Farm';
        const capMw = idxCap !== -1 ? parseFloat(cols[idxCap]) : 0;
        const country = idxCountry !== -1 ? cols[idxCountry]?.replace(/^"|"$/g, '') : '';

        entities.push({
          id: `windfarm:${i}:${name}`,
          type: 'windfarm',
          position: { lat, lon, alt: 0 },
          timestamp: Date.now(),
          metadata: { name, capacityMw: Number.isFinite(capMw) ? capMw : 0, country },
        });
      }

      const sorted = entities.sort((a, b) => (b.metadata.capacityMw || 0) - (a.metadata.capacityMw || 0));
      const capped = sorted.slice(0, 3000);
      console.log(`[WindFarms] Fetched ${capped.length} wind farms (from ${entities.length} total, skipped ${skipped})`);
      if (capped.length > 0) {
        onEntities(capped);
      } else {
        throw new Error('No wind farms parsed');
      }
    } catch (err: any) {
      console.warn('[WindFarms] Error:', err?.message || err, '- using fallback');
      const fallback = FALLBACK_FARMS.map((f, i) => ({
        id: `windfarm:fallback:${i}`,
        type: 'windfarm' as const,
        position: { lat: f.lat, lon: f.lon, alt: 0 },
        timestamp: Date.now(),
        metadata: { name: f.name, capacityMw: f.capacity, country: f.country },
      }));
      onEntities(fallback);
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
