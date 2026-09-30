import type { Entity } from '../../shared/entity';
import { fetchCached, poll } from '../lib/http';

/**
 * Celestrak GP element sets. Both layers are read from one cached download of
 * the "active" group; Celestrak asks clients not to re-download more than
 * once every couple of hours, so the on-disk cache matters here.
 */
const ACTIVE_URL = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle';
const TTL = 3 * 60 * 60 * 1000;

interface Tle {
  name: string;
  norad: string;
  tle1: string;
  tle2: string;
}

async function loadTles(): Promise<Tle[]> {
  const text = await fetchCached<string>(ACTIVE_URL, TTL, { responseType: 'text', timeout: 60000 });
  const lines = String(text).split('\n').map((l) => l.trim()).filter(Boolean);
  const out: Tle[] = [];
  for (let i = 0; i + 2 < lines.length; i++) {
    const [name, l1, l2] = [lines[i], lines[i + 1], lines[i + 2]];
    if (l1?.startsWith('1 ') && l2?.startsWith('2 ')) {
      out.push({ name, norad: l2.substring(2, 7).trim(), tle1: l1, tle2: l2 });
      i += 2;
    }
  }
  return out;
}

function toEntity(t: Tle, type: 'satellite' | 'starlink'): Entity {
  // Inclination and mean motion are handy for the info panel without propagating.
  const inclination = parseFloat(t.tle2.substring(8, 16));
  const meanMotion = parseFloat(t.tle2.substring(52, 63));
  return {
    id: `${type}:${t.norad}`,
    type,
    position: { lat: 0, lon: 0, alt: 0 }, // propagated client-side from the TLE
    timestamp: Date.now(),
    metadata: {
      name: t.name,
      noradId: t.norad,
      inclinationDeg: Number.isFinite(inclination) ? inclination : undefined,
      periodMin: Number.isFinite(meanMotion) && meanMotion > 0 ? +(1440 / meanMotion).toFixed(1) : undefined,
      tle1: t.tle1,
      tle2: t.tle2,
      sourceUrl: `https://celestrak.org/satcat/table-satcat.php?CATNR=${t.norad}`,
    },
  };
}

const isStarlink = (t: Tle) => /^STARLINK[- ]/i.test(t.name);

const explain = (err: any) =>
  err?.response?.status === 403
    ? 'Celestrak allows one download of this data every 2 hours per address; retrying in 15 minutes'
    : err?.message || String(err);

export function startSatellitesSource(onEntities: (entities: Entity[]) => void) {
  return poll(async () => {
    try {
      const all = await loadTles();
      const out = all.filter((t) => !isStarlink(t)).map((t) => toEntity(t, 'satellite'));
      console.log(`[Satellites] ${out.length} active (Starlink excluded)`);
      onEntities(out);
    } catch (err: any) {
      console.warn('[Satellites] Error:', explain(err));
      return 15 * 60 * 1000;
    }
  }, TTL);
}

export function startStarlinkSource(onEntities: (entities: Entity[]) => void) {
  return poll(async () => {
    try {
      const all = await loadTles();
      const out = all.filter(isStarlink).map((t) => toEntity(t, 'starlink'));
      console.log(`[Starlink] ${out.length} satellites`);
      onEntities(out);
    } catch (err: any) {
      console.warn('[Starlink] Error:', explain(err));
      return 15 * 60 * 1000;
    }
  }, TTL);
}
