import type { Entity } from '../../shared/entity';
import { client, poll } from '../lib/http';

/** NOAA National Data Buoy Center — latest observation from every reporting station. */
const NDBC_URL = 'https://www.ndbc.noaa.gov/data/latest_obs/latest_obs.txt';

const num = (v: string | undefined) => {
  if (!v || v === 'MM') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

export function startBuoySource(onEntities: (entities: Entity[]) => void) {
  return poll(async () => {
    try {
      const res = await client.get(NDBC_URL, { responseType: 'text' });
      const lines = String(res.data).split('\n');
      const out: Entity[] = [];
      for (const line of lines) {
        if (!line || line.startsWith('#')) continue;
        const c = line.trim().split(/\s+/);
        if (c.length < 22) continue;
        const [stn, lat, lon, yy, mo, dd, hh, mm] = c;
        const latN = Number(lat);
        const lonN = Number(lon);
        if (!Number.isFinite(latN) || !Number.isFinite(lonN)) continue;
        const ts = Date.parse(`${yy}-${mo}-${dd}T${hh}:${mm}:00Z`);
        out.push({
          id: `buoy:${stn}`,
          type: 'buoy',
          position: { lat: latN, lon: lonN },
          timestamp: Number.isFinite(ts) ? ts : Date.now(),
          metadata: {
            name: `Station ${stn}`,
            station: stn,
            windDirDeg: num(c[8]),
            windSpeedMs: num(c[9]),
            gustMs: num(c[10]),
            waveHeightM: num(c[11]),
            dominantPeriodS: num(c[12]),
            pressureHpa: num(c[15]),
            airTempC: num(c[17]),
            waterTempC: num(c[18]),
            observedAt: Number.isFinite(ts) ? new Date(ts).toISOString() : undefined,
            sourceUrl: `https://www.ndbc.noaa.gov/station_page.php?station=${stn}`,
          },
        });
      }
      console.log(`[Buoys] ${out.length} NDBC stations`);
      onEntities(out);
    } catch (err: any) {
      console.warn('[Buoys] Error:', err?.message || err);
    }
  }, 30 * 60 * 1000);
}
