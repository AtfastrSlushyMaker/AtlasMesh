import { parse } from 'csv-parse/sync';
import type { Entity } from '../../shared/entity';
import { client, poll } from '../lib/http';

/** NASA FIRMS VIIRS (Suomi NPP) active-fire detections, last 24h. Public CSV, no key. */
const URL =
  'https://firms.modaps.eosdis.nasa.gov/data/active_fire/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_Global_24h.csv';

/** Global detections number in the tens of thousands; keep the most intense. */
const MAX_FIRES = 2500;

export function startWildfiresSource(onEntities: (entities: Entity[]) => void) {
  return poll(async () => {
    try {
      const res = await client.get(URL, { responseType: 'text', timeout: 60000 });
      const rows: any[] = parse(String(res.data), { columns: true, skip_empty_lines: true });
      const out: Entity[] = [];
      for (const r of rows) {
        const lat = parseFloat(r.latitude);
        const lon = parseFloat(r.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        if (r.confidence === 'l') continue; // low-confidence detections are mostly noise
        const t = String(r.acq_time || '0000').padStart(4, '0');
        const ts = Date.parse(`${r.acq_date}T${t.slice(0, 2)}:${t.slice(2)}:00Z`);
        const frp = parseFloat(r.frp);
        out.push({
          id: `wildfire:${lat.toFixed(3)}:${lon.toFixed(3)}:${r.acq_date}${t}`,
          type: 'wildfire',
          position: { lat, lon },
          timestamp: Number.isFinite(ts) ? ts : Date.now(),
          metadata: {
            name: `Fire hotspot ${lat.toFixed(2)}, ${lon.toFixed(2)}`,
            frpMw: Number.isFinite(frp) ? frp : undefined,
            brightnessK: parseFloat(r.bright_ti4) || undefined,
            confidence: r.confidence === 'h' ? 'high' : 'nominal',
            daynight: r.daynight === 'D' ? 'day' : 'night',
            satellite: 'Suomi NPP / VIIRS',
            detectedAt: Number.isFinite(ts) ? new Date(ts).toISOString() : undefined,
            sourceUrl: 'https://firms.modaps.eosdis.nasa.gov/map/',
          },
        });
      }
      out.sort((a, b) => (b.metadata.frpMw || 0) - (a.metadata.frpMw || 0));
      const top = out.slice(0, MAX_FIRES);
      console.log(`[Wildfires] ${top.length} of ${out.length} hotspots`);
      onEntities(top);
    } catch (err: any) {
      console.warn('[Wildfires] Error:', err?.message || err);
      return 10 * 60 * 1000;
    }
  }, 60 * 60 * 1000);
}
