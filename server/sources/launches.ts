import axios from 'axios';
import type { Entity } from '../../shared/entity';

export type LaunchesPollOptions = {
  intervalMs?: number;
  url?: string;
};

export function startLaunchesSource(
  onEntities: (entities: Entity[]) => void,
  opts?: LaunchesPollOptions
) {
  const intervalMs = opts?.intervalMs ?? 15 * 60 * 1000; // 15 minutes
  const url = opts?.url ?? 'https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=10';

  let stopped = false;
  let timer: NodeJS.Timeout | null = null;

  async function fetchAndEmit() {
    try {
      const res = await axios.get(url);
      const results = res.data.results || [];
      
      const entities: Entity[] = results.map((l: any) => {
        const pad = l.pad;
        return {
          id: `launch:${l.id}`,
          type: 'launch',
          position: {
            lon: parseFloat(pad.longitude),
            lat: parseFloat(pad.latitude)
          },
          timestamp: new Date(l.net).getTime(), // NET (No Earlier Than) time
          metadata: {
            name: l.name,
            status: l.status.name,
            provider: l.launch_service_provider?.name,
            pad: pad.name
          }
        };
      });

      console.log(`[Launches] Fetched ${entities.length} upcoming launches`);
      onEntities(entities);
    } catch (err: any) {
      console.warn('[Launches] Error:', err?.message || err);
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
