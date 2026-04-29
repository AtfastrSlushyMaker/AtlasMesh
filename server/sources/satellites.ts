import axios from 'axios';
import type { Entity } from '../../shared/entity';

export type SatellitePollOptions = {
  intervalMs?: number;
  url?: string;
};

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
