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
  {
    name: 'AQUA',
    tle1: '1 27424U 02022A   26122.83824692  .00000082  00000+0  34706-4 0  9996',
    tle2: '2 27424  98.2375 198.3945 0001489  95.7987 264.3387 14.57610552270697',
  },
  {
    name: 'LANDSAT 9',
    tle1: '1 49260U 21088A   26122.71273979  .00000049  00000+0  17604-4 0  9995',
    tle2: '2 49260  98.2250 196.8597 0001330  83.4352 276.7002 14.57108704241480',
  },
  {
    name: 'SENTINEL-2A',
    tle1: '1 40697U 15028A   26122.51249290  .00000036  00000+0  15138-4 0  9991',
    tle2: '2 40697  98.5698 204.0917 0001278  88.5286 271.6047 14.58215235573981',
  },
  {
    name: 'SUOMI NPP',
    tle1: '1 37849U 11061A   26122.78569584  .00000039  00000+0  22028-4 0  9998',
    tle2: '2 37849  98.7271 207.6751 0001381  99.6892 260.4485 14.57525653761080',
  },
  {
    name: 'NOAA 20',
    tle1: '1 43013U 17073A   26122.49728301  .00000038  00000+0  21186-4 0  9991',
    tle2: '2 43013  98.7112 208.3290 0001372  67.9425 292.1944 14.57525896417639',
  },
  {
    name: 'SENTINEL-1B',
    tle1: '1 41456U 16025A   26122.58262907  .00000044  00000+0  19495-4 0  9992',
    tle2: '2 41456  98.1876 199.9561 0001212  79.9006 280.2339 14.58188971530227',
  },
  {
    name: 'COSMOS 2542',
    tle1: '1 44787U 19079A   26122.72968865  .00005674  00000+0  64342-4 0  9997',
    tle2: '2 44787  97.6124 257.9998 0016916 149.9677 210.2683 15.31649793247683',
  },
  {
    name: 'COROT',
    tle1: '1 29678U 06063A   26122.50811904  .00001917  00000+0  98582-4 0  9994',
    tle2: '2 29678  90.0344 107.8616 0007327  42.1122 318.0853 14.19431689991664',
  },
  {
    name: 'NOAA 18',
    tle1: '1 28654U 05018A   26122.73654150  .00000072  00000+0  42728-4 0  9990',
    tle2: '2 28654  99.0051 203.1133 0013052 218.3194 141.7344 14.10970130 81795',
  },
  {
    name: 'METOP-B',
    tle1: '1 38771U 12049A   26122.81298662  .00000068  00000+0  42340-4 0  9990',
    tle2: '2 38771  98.6976 204.5575 0001531 136.4472 223.6912 14.57215455716269',
  },
  {
    name: 'SWARM A',
    tle1: '1 39452U 13067B   26122.62277720  .00000068  00000+0  41569-4 0  9994',
    tle2: '2 39452  87.3478  48.6486 0010335 274.5199  85.4542 14.49254262653618',
  },
  {
    name: 'SWARM B',
    tle1: '1 39451U 13067A   26122.64984988  .00000068  00000+0  41984-4 0  9997',
    tle2: '2 39451  87.3498  41.1909 0013982 270.4897  89.4387 14.49264576653618',
  },
  {
    name: 'SWARM C',
    tle1: '1 39453U 13067C   26122.71435441  .00000061  00000+0  39744-4 0  9998',
    tle2: '2 39453  87.3499  49.0044 0008627 267.6409  92.3633 14.49296957653618',
  },
  {
    name: 'ICESAT-2',
    tle1: '1 43662U 18070A   26122.83961956  .00002728  00000+0  67535-4 0  9993',
    tle2: '2 43662  92.0008 253.8187 0006109 185.0793 175.0386 15.31646070390332',
  },
  {
    name: 'TSS-1',
    tle1: '1 44401U 19032A   26122.82644317  .00012086  00000+0  61861-4 0  9999',
    tle2: '2 44401  28.5188  21.0461 0003457 280.3115  79.7062 15.22727248377377',
  },
  {
    name: 'HAIYANG 2B',
    tle1: '1 43655U 18081A   26122.82052265  .00000031  00000+0  13290-4 0  9993',
    tle2: '2 43655  99.3212 164.7920 0001347 107.3566 252.7846 14.58796212387807',
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
  const retryMs = 5 * 60 * 1000; // 5 minutes after failure
  const url = opts?.url ?? 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle';

  let stopped = false;
  let timer: NodeJS.Timeout | null = null;
  let lastSucceeded = true;

  async function fetchAndEmit() {
    try {
      const res = await axios.get(url, { 
        timeout: 15000,
        headers: {
          'User-Agent': 'AtlasMesh/2.0 (geospatial viz app; github.com/malek/atlasmesh)',
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
          // Exclude Starlink satellites — they are tracked separately via starlink.ts
          if (/^STARLINK[- ]/i.test(name)) continue;

          const satId = tle2.substring(2, 7).trim();
          
          entities.push({
            id: `satellite:${satId}`,
            type: 'satellite',
            position: { lat: 0, lon: 0, alt: 0 },
            timestamp: Date.now(),
            metadata: {
              name,
              tle1,
              tle2,
            }
          });
        }
      }

      console.log(`[Satellites] Fetched ${entities.length} active satellites (Starlink excluded)`);
      lastSucceeded = true;
      onEntities(entities);
    } catch (err: any) {
      lastSucceeded = false;
      if (err.response && err.response.status === 403) {
        console.warn(`[Satellites] Celestrak 403 (rate limited). Retrying in ${retryMs / 1000}s.`);
      } else {
        console.warn('[Satellites] Error:', err.message || err);
      }
      console.warn('[Satellites] Using fallback TLE set');
      emitFallbackSatellites(onEntities);
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
