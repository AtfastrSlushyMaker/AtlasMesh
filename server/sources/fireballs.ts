import axios from 'axios';
import type { Entity } from '../../shared/entity';

export type FireballsPollOptions = {
  intervalMs?: number;
  limit?: number;
  url?: string;
};

type FireballApiResponse = {
  count?: string;
  fields?: string[];
  data?: Array<Array<string | null>>;
};

function toSignedCoordinate(value: string | null, direction: string | null): number | null {
  if (!value || !direction) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;

  const sign = direction === 'S' || direction === 'W' ? -1 : 1;
  return parsed * sign;
}

export function startFireballsSource(
  onEntities: (entities: Entity[]) => void,
  opts?: FireballsPollOptions
) {
  const intervalMs = opts?.intervalMs ?? 60 * 60 * 1000;
  const limit = opts?.limit ?? 200;
  const url = opts?.url ?? `https://ssd-api.jpl.nasa.gov/fireball.api?limit=${limit}`;

  let stopped = false;
  let timer: NodeJS.Timeout | null = null;

  async function fetchAndEmit() {
    try {
      const res = await axios.get<FireballApiResponse>(url, { timeout: 15000 });
      const fields = res.data.fields || [];
      const rows = res.data.data || [];

      const dateIdx = fields.indexOf('date');
      const energyIdx = fields.indexOf('energy');
      const impactIdx = fields.indexOf('impact-e');
      const latIdx = fields.indexOf('lat');
      const latDirIdx = fields.indexOf('lat-dir');
      const lonIdx = fields.indexOf('lon');
      const lonDirIdx = fields.indexOf('lon-dir');
      const altIdx = fields.indexOf('alt');
      const velIdx = fields.indexOf('vel');

      const entities: Entity[] = [];

      rows.forEach((row, idx) => {
        if (latIdx === -1 || lonIdx === -1 || latDirIdx === -1 || lonDirIdx === -1) {
          return;
        }

        const lat = toSignedCoordinate(row[latIdx], row[latDirIdx]);
        const lon = toSignedCoordinate(row[lonIdx], row[lonDirIdx]);
        if (lat === null || lon === null) return;

        const dateRaw = dateIdx !== -1 ? row[dateIdx] : null;
        const when = dateRaw ? new Date(`${dateRaw}Z`).getTime() : Date.now();

        const energy = energyIdx !== -1 && row[energyIdx] ? Number(row[energyIdx]) : null;
        const impactEnergy = impactIdx !== -1 && row[impactIdx] ? Number(row[impactIdx]) : null;
        const altitudeKm = altIdx !== -1 && row[altIdx] ? Number(row[altIdx]) : null;
        const velocityKms = velIdx !== -1 && row[velIdx] ? Number(row[velIdx]) : null;

        const idDate = typeof dateRaw === 'string' ? dateRaw.replace(/[^0-9]/g, '') : `${idx}`;

        entities.push({
          id: `event:fireball:${idDate}:${idx}`,
          type: 'event',
          position: { lat, lon, alt: altitudeKm && Number.isFinite(altitudeKm) ? altitudeKm * 1000 : undefined },
          timestamp: Number.isFinite(when) ? when : Date.now(),
          metadata: {
            title: 'NASA Fireball Event',
            source: 'NASA JPL CNEOS Fireball API',
            energy_kt: Number.isFinite(energy as number) ? energy : undefined,
            impact_energy_kt: Number.isFinite(impactEnergy as number) ? impactEnergy : undefined,
            altitude_km: Number.isFinite(altitudeKm as number) ? altitudeKm : undefined,
            velocity_km_s: Number.isFinite(velocityKms as number) ? velocityKms : undefined,
            occurred_at_utc: dateRaw || undefined,
          },
        });
      });

      console.log(`[Fireballs] Fetched ${entities.length} events`);
      onEntities(entities);
    } catch (err: any) {
      console.warn('[Fireballs] Error:', err?.message || err);
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
