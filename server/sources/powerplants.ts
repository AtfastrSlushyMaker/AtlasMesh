import axios from 'axios';
import type { Entity } from '../../shared/entity';

export type PowerPlantPollOptions = {
  intervalMs?: number;
};

const CSV_URL =
  'https://raw.githubusercontent.com/wri/global-power-plant-database/master/output_database/global_power_plant_database.csv';

const FALLBACK_PLANTS: Array<{ lat: number; lon: number; name: string; fuel: string; capacity: number; country: string }> = [
  { lat: 35.415, lon: 129.364, name: 'Shin-Kori', fuel: 'Nuclear', capacity: 4700, country: 'KOR' },
  { lat: 50.348, lon: 30.545, name: 'Kyiv Hydro', fuel: 'Hydro', capacity: 700, country: 'UKR' },
  { lat: 35.604, lon: -80.642, name: 'McGuire', fuel: 'Nuclear', capacity: 2400, country: 'USA' },
  { lat: -33.324, lon: 115.639, name: 'Collie', fuel: 'Coal', capacity: 340, country: 'AUS' },
  { lat: 51.054, lon: 13.735, name: 'Dresden-Mitte', fuel: 'Gas', capacity: 280, country: 'DEU' },
  { lat: 48.955, lon: 2.146, name: 'Porcheville', fuel: 'Oil', capacity: 450, country: 'FRA' },
  { lat: 35.650, lon: 139.750, name: 'Shinagawa', fuel: 'Gas', capacity: 870, country: 'JPN' },
  { lat: -25.465, lon: -49.300, name: 'Governador Bento Munhoz', fuel: 'Hydro', capacity: 1676, country: 'BRA' },
  { lat: 29.327, lon: 111.0, name: 'Three Gorges', fuel: 'Hydro', capacity: 22500, country: 'CHN' },
  { lat: 28.913, lon: 77.102, name: 'Rajiv Gandhi Solar Park', fuel: 'Solar', capacity: 648, country: 'IND' },
  { lat: 30.900, lon: 29.550, name: 'El-Dabaa', fuel: 'Nuclear', capacity: 4800, country: 'EGY' },
  { lat: -23.856, lon: 18.380, name: 'Kokerboom Wind', fuel: 'Wind', capacity: 100, country: 'NAM' },
];

export function startPowerPlantSource(
  onEntities: (entities: Entity[]) => void,
  opts?: PowerPlantPollOptions
) {
  const intervalMs = opts?.intervalMs ?? 24 * 60 * 60 * 1000;
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;

  async function fetchAndEmit() {
    try {
      const res = await axios.get(CSV_URL, { timeout: 30000, responseType: 'text' });
      const lines = (res.data as string).split('\n');
      if (lines.length < 2) throw new Error('CSV too short');

      const headers = lines[0].split(',').map((h: string) => h.trim());
      const idxLat = headers.indexOf('latitude');
      const idxLon = headers.indexOf('longitude');
      const idxName = headers.indexOf('name');
      const idxFuel = headers.indexOf('primary_fuel');
      const idxCap = headers.indexOf('capacity_mw');
      const idxCountry = headers.indexOf('country_long');

      if (idxLat === -1 || idxLon === -1) throw new Error('Missing lat/lon columns');

      const entities: Entity[] = [];
      let skipped = 0;

      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',');
        if (cols.length < Math.max(idxLat, idxLon) + 1) { skipped++; continue; }

        const lat = parseFloat(cols[idxLat]);
        const lon = parseFloat(cols[idxLon]);
        if (isNaN(lat) || isNaN(lon)) { skipped++; continue; }

        const name = idxName !== -1 ? cols[idxName]?.replace(/^"|"$/g, '') : 'Unknown';
        const fuel = idxFuel !== -1 ? cols[idxFuel]?.replace(/^"|"$/g, '') : '';
        const capMw = idxCap !== -1 ? parseFloat(cols[idxCap]) : 0;
        const country = idxCountry !== -1 ? cols[idxCountry]?.replace(/^"|"$/g, '') : '';

        entities.push({
          id: `powerplant:${i}:${name}`,
          type: 'powerplant',
          position: { lat, lon, alt: 0 },
          timestamp: Date.now(),
          metadata: { name, primaryFuel: fuel, capacityMw: Number.isFinite(capMw) ? capMw : 0, country },
        });
      }

      console.log(`[PowerPlants] Fetched ${entities.length} plants (skipped ${skipped} rows)`);
      if (entities.length > 0) {
        onEntities(entities);
      } else {
        throw new Error('No valid plants parsed');
      }
    } catch (err: any) {
      console.warn('[PowerPlants] Error:', err?.message || err, '- using fallback');
      const fallback = FALLBACK_PLANTS.map((p, i) => ({
        id: `powerplant:fallback:${i}`,
        type: 'powerplant' as const,
        position: { lat: p.lat, lon: p.lon, alt: 0 },
        timestamp: Date.now(),
        metadata: { name: p.name, primaryFuel: p.fuel, capacityMw: p.capacity, country: p.country },
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
