import { parse } from 'csv-parse/sync';
import type { Entity } from '../../shared/entity';
import { fetchCached, poll } from '../lib/http';

/**
 * The Meteoritical Society landings catalogue, as published by NASA Open Data.
 * data.nasa.gov retired its Socrata endpoint, so we read the TidyTuesday mirror
 * of the same export.
 */
const CSV_URL =
  'https://raw.githubusercontent.com/rfordatascience/tidytuesday/master/data/2019/2019-06-11/meteorites.csv';
const DAY = 24 * 60 * 60 * 1000;

export function startMeteoriteSource(onEntities: (entities: Entity[]) => void) {
  return poll(async () => {
    try {
      const csv = await fetchCached<string>(CSV_URL, 30 * DAY, { responseType: 'text', timeout: 60000 });
      const rows: any[] = parse(csv, { columns: true, skip_empty_lines: true, relax_column_count: true });
      const out: Entity[] = [];
      for (const r of rows) {
        const lat = parseFloat(r.lat);
        const lon = parseFloat(r.long);
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) continue;
        const mass = parseFloat(r.mass);
        out.push({
          id: `meteorite:${r.id}`,
          type: 'meteorite',
          position: { lat, lon, alt: 0 },
          timestamp: Date.now(),
          metadata: {
            name: r.name,
            massGrams: Number.isFinite(mass) ? mass : undefined,
            year: r.year || undefined,
            recclass: r.class,
            fall: r.fall,
            sourceUrl: `https://www.lpi.usra.edu/meteor/metbull.php?code=${r.id}`,
          },
        });
      }
      out.sort((a, b) => (b.metadata.massGrams || 0) - (a.metadata.massGrams || 0));
      const capped = out.slice(0, 8000);
      console.log(`[Meteorites] ${capped.length} of ${out.length}`);
      onEntities(capped);
    } catch (err: any) {
      console.warn('[Meteorites] Error:', err?.message || err);
      return 60 * 60 * 1000;
    }
  }, DAY);
}
