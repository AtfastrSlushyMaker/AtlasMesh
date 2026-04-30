import axios from 'axios';
import type { Entity } from '../../shared/entity';

export type EventsPollOptions = {
  intervalMs?: number;
  url?: string;
};

export function startEventsSource(
  onEntities: (entities: Entity[]) => void,
  opts?: EventsPollOptions
) {
  const intervalMs = opts?.intervalMs ?? 5 * 60 * 1000; // 5 minutes
  const url = opts?.url ?? 'https://eonet.gsfc.nasa.gov/api/v3/events?status=open';

  let stopped = false;
  let timer: NodeJS.Timeout | null = null;

  async function fetchAndEmit() {
    try {
      const res = await axios.get(url);
      const events = res.data.events || [];
      
      const entities: Entity[] = [];
      
      events.forEach((e: any) => {
        // Find the most recent geometry
        if (!e.geometry || e.geometry.length === 0) return;
        const geom = e.geometry[e.geometry.length - 1];
        
        let lon = 0, lat = 0;
        if (geom.type === 'Point') {
          lon = geom.coordinates[0];
          lat = geom.coordinates[1];
        } else if (geom.type === 'Polygon') {
          // just use first point for simplicity
          lon = geom.coordinates[0][0][0];
          lat = geom.coordinates[0][0][1];
        }

        const categories = e.categories.map((c: any) => c.title) as string[];
        
        // Map EONET categories to our specific layer types to avoid cluttering "Events"
        let type: import('../../shared/entity').EntityType = 'event';
        if (categories.includes('Wildfires')) type = 'wildfire';
        else if (categories.includes('Volcanoes')) type = 'volcano';
        else if (categories.includes('Earthquakes')) type = 'earthquake';
        else if (categories.includes('Severe Storms')) type = 'weather';

        entities.push({
          id: `eonet:${e.id}`,
          type,
          position: { lon, lat },
          timestamp: new Date(geom.date).getTime(),
          metadata: {
            title: e.title,
            categories: categories,
            sources: e.sources.map((s: any) => s.url)
          }
        });
      });

      console.log(`[Events] Fetched ${entities.length} EONET events`);
      onEntities(entities);
    } catch (err: any) {
      console.warn('[Events] Error:', err?.message || err);
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
