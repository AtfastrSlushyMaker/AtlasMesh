import type { Entity } from '../../shared/entity';
import { client, poll } from '../lib/http';

/**
 * NASA EONET open natural events. Everything stays in the "event" layer with
 * its category; the client picks icons per category. Storm tracks keep their
 * recent positions so they can be drawn as paths.
 */
const URL = 'https://eonet.gsfc.nasa.gov/api/v3/events?status=open&days=60';
const MAX_WILDFIRE_EVENTS = 400; // FIRMS already covers fires in detail

export function startEventsSource(onEntities: (entities: Entity[]) => void) {
  return poll(async () => {
    try {
      const res = await client.get(URL, { timeout: 45000 });
      const events: any[] = res.data?.events || [];
      const out: Entity[] = [];
      let fires = 0;
      const sorted = events
        .filter((e) => e.geometry?.length)
        .sort((a, b) => Date.parse(b.geometry.at(-1).date) - Date.parse(a.geometry.at(-1).date));
      for (const e of sorted) {
        const cats: string[] = (e.categories || []).map((c: any) => c.title);
        if (cats.includes('Wildfires') && ++fires > MAX_WILDFIRE_EVENTS) continue;
        const geom = e.geometry[e.geometry.length - 1];
        let lon: number;
        let lat: number;
        if (geom.type === 'Point') [lon, lat] = geom.coordinates;
        else {
          // Polygon: centroid of the outer ring
          const ring: number[][] = geom.coordinates?.[0] || [];
          lon = ring.reduce((s, p) => s + p[0], 0) / (ring.length || 1);
          lat = ring.reduce((s, p) => s + p[1], 0) / (ring.length || 1);
        }
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        const track = e.geometry.length > 1 && e.geometry.every((g: any) => g.type === 'Point')
          ? e.geometry.slice(-40).map((g: any) => ({ lon: g.coordinates[0], lat: g.coordinates[1] }))
          : undefined;
        out.push({
          id: `event:${e.id}`,
          type: 'event',
          position: { lat, lon },
          timestamp: Date.parse(geom.date) || Date.now(),
          metadata: {
            name: e.title,
            category: cats[0] || 'Other',
            categories: cats,
            magnitude: geom.magnitudeValue != null ? `${geom.magnitudeValue} ${geom.magnitudeUnit || ''}`.trim() : undefined,
            lastObserved: geom.date,
            observations: e.geometry.length,
            path: track,
            sourceUrl: e.sources?.[0]?.url || e.link,
          },
        });
      }
      console.log(`[Events] ${out.length} open EONET events`);
      onEntities(out);
    } catch (err: any) {
      console.warn('[Events] Error:', err?.message || err);
      return 2 * 60 * 1000;
    }
  }, 10 * 60 * 1000);
}
