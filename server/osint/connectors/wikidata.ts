import type { Connector } from './types';
import { empty } from './types';
import { normOrg } from '../normalize';

/**
 * Wikidata: structured facts about organisations and universities
 * (official website, inception, headquarters coordinates, industry).
 * The best label match is recorded with the matching method so a wrong
 * disambiguation stays visible.
 */
const API = 'https://www.wikidata.org/w/api.php';

const claimValue = (entity: any, prop: string) => entity.claims?.[prop]?.[0]?.mainsnak?.datavalue?.value;

export const wikidataConnector: Connector = {
  id: 'wikidata',
  name: 'Wikidata',
  platform: 'Wikidata',
  description: 'Official website, founding date, headquarters location and parent organisation for organisations and universities.',
  accepts: ['organization', 'university'],
  reliability: 0.8,
  minIntervalMs: 500,

  async run(node, ctx) {
    const out = empty();
    const search = await ctx.get(`${API}?action=wbsearchentities&search=${encodeURIComponent(node.label)}&language=en&type=item&limit=5&format=json`);
    const hits: any[] = search?.search || [];
    const exact = hits.find((h) => normOrg(h.label || '') === normOrg(node.label));
    // Only exact label matches: a fuzzy disambiguation would attach facts about the wrong entity.
    if (!exact) {
      ctx.log(`No Wikidata item named exactly "${node.label}"`);
      return out;
    }
    const hit = exact;
    const data = await ctx.get(`https://www.wikidata.org/wiki/Special:EntityData/${hit.id}.json`);
    const e = data?.entities?.[hit.id];
    if (!e) return out;
    const src = `https://www.wikidata.org/wiki/${hit.id}`;
    const method = 'exact label match';
    const inception = claimValue(e, 'P571')?.time?.replace(/^\+/, '').slice(0, 10);
    const website = claimValue(e, 'P856');
    const coord = claimValue(e, 'P625');
    out.selfAttributes = {
      wikidataId: hit.id,
      wikidataDescription: hit.description,
      inception,
      officialWebsite: website,
      wikidataMatch: method,
    };
    out.selfEvidence = { sourceUrl: src, excerpt: `${hit.label} — ${hit.description || ''} (${method})`, method: 'api', observedDate: inception };
    if (coord?.latitude != null) out.selfGeo = { lat: coord.latitude, lon: coord.longitude, label: `${hit.label} (Wikidata)` };
    if (website) {
      out.entities.push({ ref: 'site', type: 'website', value: website, label: String(website).replace(/^https?:\/\//, ''), evidence: { sourceUrl: src, excerpt: `Official website (P856): ${website}`, method: 'api' } });
      out.relations.push({ from: '$self', to: 'site', type: 'OWNS', explicit: true, reasoning: 'Wikidata item matched on exact label; homonyms are possible.', evidence: { sourceUrl: src, excerpt: `P856 official website`, method: 'api' } });
    }
    return out;
  },
};
