import { parse } from 'csv-parse/sync';
import type { Entity } from '../../shared/entity';
import { fetchCached, poll } from '../lib/http';

/** WRI Global Power Plant Database v1.3 (CC BY 4.0). Also feeds the wind-farm layer. */
export const GPPD_URL =
  'https://raw.githubusercontent.com/wri/global-power-plant-database/master/output_database/global_power_plant_database.csv';

const DAY = 24 * 60 * 60 * 1000;

interface Plant {
  id: string;
  name: string;
  lat: number;
  lon: number;
  fuel: string;
  capacityMw: number;
  country: string;
  owner?: string;
  commissioningYear?: number;
}

/** Parse once per download; both layers share the result. */
let cached: { at: number; plants: Plant[] } | null = null;

export async function loadPlants(): Promise<Plant[]> {
  if (cached && Date.now() - cached.at < DAY) return cached.plants;
  const csv = await fetchCached<string>(GPPD_URL, 7 * DAY, { responseType: 'text', timeout: 60000 });
  const rows: any[] = parse(csv, { columns: true, skip_empty_lines: true, relax_column_count: true });
  const plants: Plant[] = [];
  for (const r of rows) {
    const lat = parseFloat(r.latitude);
    const lon = parseFloat(r.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const cap = parseFloat(r.capacity_mw);
    const year = parseFloat(r.commissioning_year);
    plants.push({
      id: r.gppd_idnr || `${r.country}:${r.name}`,
      name: r.name,
      lat,
      lon,
      fuel: r.primary_fuel,
      capacityMw: Number.isFinite(cap) ? cap : 0,
      country: r.country_long,
      owner: r.owner || undefined,
      commissioningYear: Number.isFinite(year) ? Math.round(year) : undefined,
    });
  }
  cached = { at: Date.now(), plants };
  return plants;
}

function toEntity(p: Plant, type: 'powerplant' | 'windfarm'): Entity {
  return {
    id: `${type}:${p.id}`,
    type,
    position: { lat: p.lat, lon: p.lon, alt: 0 },
    timestamp: Date.now(),
    metadata: {
      name: p.name,
      primaryFuel: p.fuel,
      capacityMw: p.capacityMw,
      country: p.country,
      owner: p.owner,
      commissioningYear: p.commissioningYear,
      sourceUrl: 'https://datasets.wri.org/dataset/globalpowerplantdatabase',
    },
  };
}

export function startPowerPlantSource(onEntities: (entities: Entity[]) => void) {
  return poll(async () => {
    try {
      const plants = await loadPlants();
      const out = plants
        .filter((p) => p.fuel !== 'Wind')
        .sort((a, b) => b.capacityMw - a.capacityMw)
        .slice(0, 6000)
        .map((p) => toEntity(p, 'powerplant'));
      console.log(`[PowerPlants] ${out.length} plants`);
      onEntities(out);
    } catch (err: any) {
      console.warn('[PowerPlants] Error:', err?.message || err);
      return 10 * 60 * 1000;
    }
  }, DAY);
}

export function startWindFarmSource(onEntities: (entities: Entity[]) => void) {
  return poll(async () => {
    try {
      const plants = await loadPlants();
      const out = plants
        .filter((p) => p.fuel === 'Wind')
        .sort((a, b) => b.capacityMw - a.capacityMw)
        .slice(0, 4000)
        .map((p) => toEntity(p, 'windfarm'));
      console.log(`[WindFarms] ${out.length} wind farms`);
      onEntities(out);
    } catch (err: any) {
      console.warn('[WindFarms] Error:', err?.message || err);
      return 10 * 60 * 1000;
    }
  }, DAY);
}
