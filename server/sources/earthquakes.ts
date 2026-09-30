import axios from 'axios';
import type { Entity } from '../../shared/entity';

export type EarthquakesPollOptions = {
  intervalMs?: number;
  url?: string;
};

export function startEarthquakesSource(
  onEntities: (entities: Entity[]) => void,
  opts?: EarthquakesPollOptions
) {
  const intervalMs = opts?.intervalMs ?? 60000; // 1 minute
  const url = opts?.url ?? 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson';

  let stopped = false;
  let timer: NodeJS.Timeout | null = null;

  async function fetchAndEmit() {
    try {
      const res = await axios.get(url, { timeout: 20000 });
      const features = res.data.features || [];
      
      const entities: Entity[] = features.map((f: any) => {
        const coords = f.geometry.coordinates; // [lon, lat, depth]
        const props = f.properties;
        
        return {
          id: `earthquake:${f.id}`,
          type: 'earthquake',
          position: {
            lon: coords[0],
            lat: coords[1],
            alt: 0, // drawn at the surface; depth is kept in metadata
          },
          timestamp: props.time,
          metadata: {
            name: props.title,
            mag: props.mag,
            depthKm: coords[2],
            place: props.place,
            tsunami: props.tsunami === 1,
            alert: props.alert || undefined,
            felt: props.felt || undefined,
            url: props.url,
            title: props.title
          }
        };
      });

      console.log(`[Earthquakes] Fetched ${entities.length} earthquakes`);
      onEntities(entities);
    } catch (err: any) {
      console.warn('[Earthquakes] Error:', err?.message || err);
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
