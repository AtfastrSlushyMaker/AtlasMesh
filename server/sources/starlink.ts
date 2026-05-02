import axios from 'axios';
import type { Entity } from '../../shared/entity';

export type StarlinkPollOptions = {
  intervalMs?: number;
};

const STARLINK_URL = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle';

const FALLBACK_TLES = [
  {
    name: 'STARLINK-1007',
    tle1: '1 44713U 19074A   26122.52002294  .00001366  00000+0  68636-4 0  9994',
    tle2: '2 44713  53.0547 179.6596 0001421  89.3568 270.7734 15.06381222    41',
  },
  {
    name: 'STARLINK-30080',
    tle1: '1 56314U 23056T   26122.80000000  .00000200  00000+0  11000-4 0  9999',
    tle2: '2 56314  43.0000 270.0000 0001500 180.0000 180.0000 15.05000000    10',
  },
  {
    name: 'STARLINK-31152',
    tle1: '1 60735U 24152E   26122.80000000  .00000250  00000+0  12000-4 0  9997',
    tle2: '2 60735  53.1600 320.0000 0001500 180.0000 180.0000 15.05000000    09',
  },
  {
    name: 'STARLINK-32123',
    tle1: '1 61200U 24180A   26122.80000000  .00000180  00000+0  10000-4 0  9998',
    tle2: '2 61200  43.0000  90.0000 0001500 180.0000 180.0000 15.05000000    08',
  },
  {
    name: 'STARLINK-33005',
    tle1: '1 62005U 24215B   26122.80000000  .00000210  00000+0  10500-4 0  9995',
    tle2: '2 62005  53.1600  15.0000 0001500 180.0000 180.0000 15.05000000    07',
  },
];

function emitFallbackStarlink(onEntities: (entities: Entity[]) => void) {
  const fallback = FALLBACK_TLES.map((s, idx) => ({
    id: `starlink:fallback:${idx + 1}`,
    type: 'starlink' as const,
    position: { lat: 0, lon: 0, alt: 0 },
    timestamp: Date.now(),
    metadata: { name: s.name, tle1: s.tle1, tle2: s.tle2, fallback: true },
  }));
  onEntities(fallback);
}

export function startStarlinkSource(
  onEntities: (entities: Entity[]) => void,
  opts?: StarlinkPollOptions
) {
  const intervalMs = opts?.intervalMs ?? 6 * 60 * 60 * 1000;
  const retryMs = 5 * 60 * 1000;
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;
  let lastSucceeded = true;

  async function fetchAndEmit() {
    try {
      const res = await axios.get(STARLINK_URL, {
        timeout: 30000,
        headers: {
          'User-Agent': 'AtlasMesh/2.0 (geospatial viz app; github.com/malek/atlasmesh)',
          'Accept': 'text/plain',
        },
      });
      const data = res.data;
      if (typeof data !== 'string') {
        emitFallbackStarlink(onEntities);
        return;
      }

      const lines = data.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);
      const entities: Entity[] = [];

      for (let i = 0; i < lines.length - 2; i += 3) {
        const name = lines[i];
        const tle1 = lines[i + 1];
        const tle2 = lines[i + 2];

        if (tle1 && tle2 && tle1.startsWith('1 ') && tle2.startsWith('2 ')) {
          const satId = tle2.substring(2, 7).trim();

          entities.push({
            id: `starlink:${satId}`,
            type: 'starlink',
            position: { lat: 0, lon: 0, alt: 0 },
            timestamp: Date.now(),
            metadata: { name, tle1, tle2 },
          });
        }
      }

      console.log(`[Starlink] Fetched ${entities.length} satellites`);
      lastSucceeded = true;
      if (entities.length > 0) {
        onEntities(entities);
      } else {
        emitFallbackStarlink(onEntities);
      }
    } catch (err: any) {
      lastSucceeded = false;
      console.warn(`[Starlink] Error: ${err?.message || err}. Retrying in ${retryMs / 1000}s.`);
      emitFallbackStarlink(onEntities);
    } finally {
      if (!stopped) {
        timer = setTimeout(fetchAndEmit, lastSucceeded ? intervalMs : retryMs);
      }
    }
  }

  fetchAndEmit();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
