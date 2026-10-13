import type { Entity } from '../../shared/entity';
import { fetchCached, poll } from '../lib/http';

/**
 * Public traffic and weather cameras.
 *
 * Only feeds that the operating agency publishes for public viewing are used:
 * - Transport for London JamCams (open data, no key)
 * - Caltrans CCTV (California DOT open data, no key)
 * - Fintraffic Digitraffic weather cameras (Finland, open data, CC BY 4.0)
 *
 * Deliberately excluded: directories of unsecured private cameras.
 */

const TFL_URL = 'https://api.tfl.gov.uk/Place/Type/JamCam';
const CALTRANS_DISTRICTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const caltransUrl = (d: number) => {
  const dd = String(d).padStart(2, '0');
  return `https://cwwp2.dot.ca.gov/data/d${d}/cctv/cctvStatusD${dd}.json`;
};
const DIGITRAFFIC_URL = 'https://tie.digitraffic.fi/api/weathercam/v1/stations';

async function loadTfl(): Promise<Entity[]> {
  const rows = await fetchCached<any[]>(TFL_URL, 10 * 60 * 1000);
  if (!Array.isArray(rows)) throw new Error('TfL returned an invalid camera catalogue');
  const out: Entity[] = [];
  for (const r of rows || []) {
    const props: Record<string, string> = {};
    for (const p of r.additionalProperties || []) props[p.key] = p.value;
    if (props.available === 'false' || !props.imageUrl) continue;
    out.push({
      id: `camera:tfl:${r.id}`,
      type: 'camera',
      position: { lat: r.lat, lon: r.lon },
      timestamp: Date.now(),
      metadata: {
        name: r.commonName,
        operator: 'Transport for London',
        country: 'United Kingdom',
        view: props.view || undefined,
        imageUrl: props.imageUrl,
        videoUrl: props.videoUrl,
        refreshSeconds: 300,
        license: 'TfL open data',
        sourceUrl: 'https://tfl.gov.uk/traffic/status/',
      },
    });
  }
  return out;
}

async function loadCaltrans(): Promise<Entity[]> {
  const out: Entity[] = [];
  const results = await Promise.allSettled(
    CALTRANS_DISTRICTS.map((d) => fetchCached<any>(caltransUrl(d), 60 * 60 * 1000))
  );
  const failed = results.flatMap((res, i) =>
    res.status === 'rejected' || !Array.isArray(res.value?.data) ? [CALTRANS_DISTRICTS[i]] : []);
  if (failed.length) {
    throw new Error(`Caltrans districts ${failed.join(', ')} failed; keeping the last complete catalogue`);
  }
  results.forEach((res, i) => {
    if (res.status !== 'fulfilled') return;
    for (const row of res.value?.data || []) {
      const c = row.cctv;
      if (!c || c.inService !== 'true') continue;
      const lat = parseFloat(c.location?.latitude);
      const lon = parseFloat(c.location?.longitude);
      const img = c.imageData?.static?.currentImageURL;
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || !img) continue;
      out.push({
        id: `camera:caltrans:${CALTRANS_DISTRICTS[i]}:${c.index}`,
        type: 'camera',
        position: { lat, lon },
        timestamp: Date.now(),
        metadata: {
          name: c.location.locationName,
          operator: 'Caltrans',
          country: 'United States',
          region: c.location.nearbyPlace || c.location.county,
          route: c.location.route,
          view: c.location.direction,
          imageUrl: img,
          streamUrl: c.imageData?.streamingVideoURL || undefined,
          refreshSeconds: Number(c.imageData?.static?.currentImageUpdateFrequency || 5) * 60,
          license: 'Caltrans open data',
          sourceUrl: 'https://cwwp2.dot.ca.gov/',
        },
      });
    }
  });
  return out;
}

async function loadDigitraffic(): Promise<Entity[]> {
  const data = await fetchCached<any>(DIGITRAFFIC_URL, 60 * 60 * 1000, {
    headers: { 'Digitraffic-User': 'AtlasMesh', 'Accept-Encoding': 'gzip' },
  });
  if (!Array.isArray(data?.features)) throw new Error('Digitraffic returned an invalid camera catalogue');
  const out: Entity[] = [];
  for (const f of data?.features || []) {
    const [lon, lat] = f.geometry?.coordinates || [];
    const p = f.properties || {};
    const preset = (p.presets || []).find((x: any) => x.inCollection);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !preset) continue;
    out.push({
      id: `camera:digitraffic:${p.id}`,
      type: 'camera',
      position: { lat, lon },
      timestamp: Date.now(),
      metadata: {
        name: String(p.name || p.id).replace(/_/g, ' '),
        operator: 'Fintraffic',
        country: 'Finland',
        imageUrl: `https://weathercam.digitraffic.fi/${preset.id}.jpg`,
        presets: (p.presets || []).filter((x: any) => x.inCollection).length,
        refreshSeconds: 600,
        license: 'CC BY 4.0, Fintraffic / digitraffic.fi',
        sourceUrl: 'https://www.digitraffic.fi/en/road-traffic/',
      },
    });
  }
  return out;
}

export function startCameraSource(onEntities: (entities: Entity[]) => void) {
  const latest: Entity[][] = [[], [], []];
  return poll(async () => {
    const parts = await Promise.allSettled([loadTfl(), loadCaltrans(), loadDigitraffic()]);
    const errors: string[] = [];
    const names = ['TfL', 'Caltrans', 'Digitraffic'];
    parts.forEach((p, i) => {
      if (p.status === 'fulfilled') latest[i] = p.value;
      else errors.push(`${names[i]} failed: ${(p.reason as any)?.message || p.reason}`);
    });
    const all = latest.flat();
    console.log(`[Cameras] ${all.length} public cameras`);
    if (all.length || !errors.length) onEntities(all);
    // Report after the partial update, which otherwise clears the feed's error.
    // Failed providers retain their last catalogue instead of disappearing.
    for (const message of errors) console.warn('[Cameras]', message);
  }, 30 * 60 * 1000);
}
