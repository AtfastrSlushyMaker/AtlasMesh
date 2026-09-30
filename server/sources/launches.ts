import type { Entity } from '../../shared/entity';
import { fetchCached } from '../lib/http';

export type LaunchesPollOptions = {
  intervalMs?: number;
  url?: string;
};

export function startLaunchesSource(
  onEntities: (entities: Entity[]) => void,
  opts?: LaunchesPollOptions
) {
  const intervalMs = opts?.intervalMs ?? 15 * 60 * 1000; // 15 minutes
  const url = opts?.url ?? 'https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=30&mode=detailed';

  let stopped = false;
  let timer: NodeJS.Timeout | null = null;

  async function fetchAndEmit() {
    try {
      const res = { data: await fetchCached<any>(url, 20 * 60 * 1000) };
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
            status: l.status?.name,
            net: l.net,
            windowStart: l.window_start,
            windowEnd: l.window_end,
            provider: l.launch_service_provider?.name,
            rocket: l.rocket?.configuration?.full_name || l.rocket?.configuration?.name,
            mission: l.mission?.name,
            missionType: l.mission?.type,
            orbit: l.mission?.orbit?.name,
            description: l.mission?.description,
            pad: pad.name,
            location: pad.location?.name,
            imageUrl: typeof l.image === 'string' ? l.image : l.image?.image_url,
            webcastLive: !!l.webcast_live,
            sourceUrl: `https://thespacedevs.com/llapi`,
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
