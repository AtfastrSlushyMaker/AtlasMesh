import type { Entity } from '../../shared/entity';
import { client, poll } from '../lib/http';

/** GDACS (UN / EC JRC) — current alerts for earthquakes, cyclones, floods, volcanoes, droughts, wildfires. */
const GDACS_URL = 'https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=EQ;TC;FL;VO;DR;WF';

const HAZARD: Record<string, string> = {
  EQ: 'Earthquake',
  TC: 'Tropical cyclone',
  FL: 'Flood',
  VO: 'Volcano',
  DR: 'Drought',
  WF: 'Wildfire',
};

export function startDisasterSource(onEntities: (entities: Entity[]) => void) {
  return poll(async () => {
    try {
      const res = await client.get(GDACS_URL, { headers: { Accept: 'application/json' } });
      const out: Entity[] = [];
      for (const f of res.data?.features || []) {
        const p = f.properties || {};
        const [lon, lat] = f.geometry?.coordinates || [];
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        out.push({
          id: `disaster:${p.eventtype}:${p.eventid}`,
          type: 'disaster',
          position: { lat, lon },
          timestamp: Date.parse(p.datemodified || p.fromdate) || Date.now(),
          metadata: {
            name: p.name || p.eventname,
            hazard: HAZARD[p.eventtype] || p.eventtype,
            hazardCode: p.eventtype,
            alertLevel: p.alertlevel,
            severity: p.severitydata?.severitytext,
            country: p.country,
            from: p.fromdate,
            to: p.todate,
            current: p.iscurrent === 'true' || p.iscurrent === true,
            sourceUrl: p.url?.report || `https://www.gdacs.org/report.aspx?eventid=${p.eventid}&eventtype=${p.eventtype}`,
          },
        });
      }
      console.log(`[Disasters] ${out.length} GDACS alerts`);
      onEntities(out);
    } catch (err: any) {
      console.warn('[Disasters] Error:', err?.message || err);
    }
  }, 10 * 60 * 1000);
}
