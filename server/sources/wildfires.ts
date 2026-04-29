import axios from 'axios';
import type { Entity } from '../../shared/entity';

export type WildfiresPollOptions = {
  intervalMs?: number;
  url?: string;
};

export function startWildfiresSource(
  onEntities: (entities: Entity[]) => void,
  opts?: WildfiresPollOptions
) {
  const intervalMs = opts?.intervalMs ?? 60 * 60 * 1000; // 1 hour
  // FIX Bug #5: Use the open NRT (near-real-time) VIIRS feed which doesn't require MAP_KEY
  const url = opts?.url ?? 'https://firms.modaps.eosdis.nasa.gov/data/active_fire/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_Global_24h.csv';

  let stopped = false;
  let timer: NodeJS.Timeout | null = null;

  async function fetchAndEmit() {
    try {
      const res = await axios.get(url, { timeout: 30000 });
      const lines = res.data.split('\n');
      const header = lines[0]?.split(',') || [];
      
      // Find column indices dynamically
      const latIdx = header.findIndex((h: string) => h.trim().toLowerCase() === 'latitude');
      const lonIdx = header.findIndex((h: string) => h.trim().toLowerCase() === 'longitude');
      const brightIdx = header.findIndex((h: string) => h.trim().toLowerCase().includes('bright'));
      const confIdx = header.findIndex((h: string) => h.trim().toLowerCase() === 'confidence');
      const frpIdx = header.findIndex((h: string) => h.trim().toLowerCase() === 'frp');
      const dateIdx = header.findIndex((h: string) => h.trim().toLowerCase() === 'acq_date');
      const timeIdx = header.findIndex((h: string) => h.trim().toLowerCase() === 'acq_time');
      
      if (latIdx === -1 || lonIdx === -1) {
        console.warn('[Wildfires] CSV header parsing failed, columns:', header.slice(0, 10));
        return;
      }

      const entities: Entity[] = [];
      const dataLines = lines.slice(1).filter((l: string) => l.trim().length > 0);
      
      // Limit to 500 to prevent overwhelming Cesium
      for (let i = 0; i < Math.min(dataLines.length, 500); i++) {
        const cols = dataLines[i].split(',');
        const lat = parseFloat(cols[latIdx]);
        const lon = parseFloat(cols[lonIdx]);
        
        if (isNaN(lat) || isNaN(lon)) continue;
        
        let timestamp = Date.now();
        if (dateIdx !== -1 && timeIdx !== -1 && cols[dateIdx] && cols[timeIdx]) {
          const t = cols[timeIdx].trim().padStart(4, '0');
          try {
            timestamp = new Date(`${cols[dateIdx].trim()}T${t.substring(0,2)}:${t.substring(2,4)}Z`).getTime();
          } catch(e) {}
        }

        entities.push({
          id: `wildfire:${i}_${lat.toFixed(2)}_${lon.toFixed(2)}`,
          type: 'wildfire',
          position: { lat, lon },
          timestamp,
          metadata: {
            brightness: brightIdx !== -1 ? parseFloat(cols[brightIdx]) : undefined,
            confidence: confIdx !== -1 ? cols[confIdx]?.trim() : undefined,
            frp: frpIdx !== -1 ? parseFloat(cols[frpIdx]) : undefined,
          }
        });
      }

      console.log(`[Wildfires] Fetched ${entities.length} active fire hotspots`);
      if (entities.length > 0) {
        onEntities(entities);
      }
    } catch (err: any) {
      console.warn('[Wildfires] Error:', err?.message || err);
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
