import axios from 'axios';
import type { Entity } from '../../shared/entity';

export type SatellitePollOptions = {
  intervalMs?: number;
  url?: string;
};

const FALLBACK_TLES = [
  {
    name: 'ISS (ZARYA)',
    tle1: '1 25544U 98067A   26122.84576389  .00016480  00000+0  29688-3 0  9994',
    tle2: '2 25544  51.6410 346.7210 0004767  69.3854  27.3319 15.50084214510620',
  },
  {
    name: 'HST',
    tle1: '1 20580U 90037B   26122.52002294  .00001366  00000+0  68636-4 0  9994',
    tle2: '2 20580  28.4694  88.1212 0002618 321.3274  38.7509 15.26281883999863',
  },
  {
    name: 'NOAA 19',
    tle1: '1 33591U 09005A   26122.80931292  .00000065  00000+0  59473-4 0  9998',
    tle2: '2 33591  99.1879 150.9265 0014337 286.6635  73.3029 14.12422757884136',
  },
  {
    name: 'TERRA',
    tle1: '1 25994U 99068A   26122.77949304  .00000069  00000+0  26674-4 0  9993',
    tle2: '2 25994  98.2101 181.4633 0001129  98.6706 261.4623 14.57109796398480',
  },
];

function emitFallbackSatellites(onEntities: (entities: Entity[]) => void) {
  const fallback = FALLBACK_TLES.map((s, idx) => ({
    id: `satellite:fallback:${idx + 1}`,
    type: 'satellite' as const,
    position: { lat: 0, lon: 0, alt: 0 },
    timestamp: Date.now(),
    metadata: {
      name: s.name,
      tle1: s.tle1,
      tle2: s.tle2,
      fallback: true,
    },
  }));
  onEntities(fallback);
}

export function startSatellitesSource(
  onEntities: (entities: Entity[]) => void,
  opts?: SatellitePollOptions
) {
  const intervalMs = opts?.intervalMs ?? 2 * 60 * 60 * 1000; // 2 hours
  const url = opts?.url ?? 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle';

  let stopped = false;
  let timer: NodeJS.Timeout | null = null;

  async function fetchAndEmit() {
    try {
      const res = await axios.get(url, { 
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/plain'
        }
      });
      const data = res.data;
      if (typeof data !== 'string') return;
      
      const lines = data.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      const entities: Entity[] = [];

      for (let i = 0; i < lines.length - 2; i += 3) {
        const name = lines[i];
        const tle1 = lines[i + 1];
        const tle2 = lines[i + 2];

        if (tle1 && tle2 && tle1.startsWith('1 ') && tle2.startsWith('2 ')) {
          const satId = tle2.substring(2, 7).trim();
          
          entities.push({
            id: `satellite:${satId}`,
            type: 'satellite',
            position: { lat: 0, lon: 0, alt: 0 }, // calculated on client
            timestamp: Date.now(),
            metadata: {
              name,
              tle1,
              tle2,
            }
          });
        }
      }

      console.log(`[Satellites] Fetched ${entities.length} active satellites`);
      onEntities(entities);
    } catch (err: any) {
      if (err.response && err.response.status === 403) {
        console.warn('Celestrak: unexpected 403. Make sure to use a valid User-Agent.');
      } else {
        console.warn('Celestrak error:', err.message || err);
      }
      console.warn('[Satellites] Using fallback TLE set');
      emitFallbackSatellites(onEntities);
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
