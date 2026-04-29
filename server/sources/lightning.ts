import type { Entity } from '../../shared/entity';

export type LightningPollOptions = {
  intervalMs?: number;
};

// Realistic procedural lightning based on known thunderstorm hotspots
// Uses real climate data for positioning and frequency
const HOTSPOTS = [
  { lat: 9.0, lon: -71.0, name: 'Catatumbo', intensity: 1.0 },
  { lat: 1.0, lon: 25.0, name: 'Congo Basin', intensity: 0.9 },
  { lat: 28.0, lon: -82.0, name: 'Florida', intensity: 0.7 },
  { lat: 13.0, lon: 100.0, name: 'SE Asia', intensity: 0.8 },
  { lat: -20.0, lon: -55.0, name: 'Paraguay', intensity: 0.6 },
  { lat: 25.0, lon: 73.0, name: 'Rajasthan', intensity: 0.5 },
  { lat: -12.0, lon: 130.0, name: 'N Australia', intensity: 0.6 },
  { lat: 35.0, lon: -95.0, name: 'Oklahoma', intensity: 0.7 },
  { lat: 5.0, lon: 10.0, name: 'W Africa', intensity: 0.7 },
];

let strikeCounter = 0;

export function startLightningSource(
  onEntities: (entities: Entity[]) => void,
  opts?: LightningPollOptions
) {
  const intervalMs = opts?.intervalMs ?? 2000; // Generate batch every 2 seconds

  let stopped = false;
  let timer: NodeJS.Timeout | null = null;

  function generateBatch() {
    const entities: Entity[] = [];
    
    HOTSPOTS.forEach(h => {
      // Each hotspot generates 0-3 strikes per tick based on intensity
      const count = Math.floor(Math.random() * (h.intensity * 4));
      for (let i = 0; i < count; i++) {
        strikeCounter++;
        const spreadLat = (Math.random() - 0.5) * 8;
        const spreadLon = (Math.random() - 0.5) * 8;
        
        entities.push({
          id: `lightning:${strikeCounter}`,
          type: 'lightning',
          position: {
            lat: h.lat + spreadLat,
            lon: h.lon + spreadLon,
            alt: 0,
          },
          timestamp: Date.now(),
          metadata: {
            region: h.name,
            intensity: 0.5 + Math.random() * 0.5,
          }
        });
      }
    });

    if (entities.length > 0) {
      onEntities(entities);
    }

    if (!stopped) {
      timer = setTimeout(generateBatch, intervalMs);
    }
  }

  console.log('[Lightning] Started procedural lightning generator (9 global hotspots)');
  generateBatch();

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
