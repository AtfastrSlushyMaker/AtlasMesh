import type { Connector, ConnectorOutput } from './types';
import { accountParts, empty, keyValue } from './types';
import { addLinks } from './github';
import { normDoi, normName, normOrcid } from '../normalize';

const orcidHeaders = { Accept: 'application/json' };
const date = (d: any) => {
  if (!d?.year?.value) return undefined;
  return [d.year.value, d.month?.value, d.day?.value].filter(Boolean).join('-');
};

/** ORCID public API: researcher record, affiliations, works. */
export const orcidConnector: Connector = {
  id: 'orcid',
  name: 'ORCID',
  platform: 'ORCID',
  description: 'Researcher records: employment and education history with dates, works (DOIs) and linked profiles. Name search returns candidates only.',
  accepts: ['account', 'person'],
  canHandle: (n) => n.type === 'person' || accountParts(n)?.platform === 'orcid',
  reliability: 0.95,
  minIntervalMs: 400,

  async run(node, ctx) {
    if (node.type === 'person') return orcidSearch(node.label, ctx);
    return orcidRecord(accountParts(node)!.handle, ctx);
  },
};

async function orcidSearch(name: string, ctx: any): Promise<ConnectorOutput> {
  const out = empty();
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return out;
  const q = `given-names:${encodeURIComponent(parts.slice(0, -1).join(' '))}+AND+family-name:${encodeURIComponent(parts[parts.length - 1])}`;
  const res = await ctx.get(`https://pub.orcid.org/v3.0/expanded-search/?q=${q}&rows=5`, { headers: orcidHeaders });
  for (const r of res?.['expanded-result'] || []) {
    const id = r['orcid-id'];
    const ref = `orcid:${id}`;
    const full = [r['given-names'], r['family-names']].filter(Boolean).join(' ');
    const inst = (r['institution-name'] || []).slice(0, 3).join('; ');
    out.entities.push({ ref, type: 'account', value: `orcid:${id}`, label: `${full} (ORCID ${id})`, attributes: { displayName: full, institutions: inst || undefined, profileUrl: `https://orcid.org/${id}` }, evidence: { sourceUrl: `https://orcid.org/${id}`, excerpt: `${full}${inst ? ` — ${inst}` : ''}`, method: 'api' } });
    out.relations.push({
      from: '$self', to: ref, type: 'POSSIBLY_SAME_ENTITY_AS', explicit: false,
      reasoning: `ORCID name search for "${name}" returned ${full}. Many researchers share names; confirm with affiliations or works.`,
      evidence: { sourceUrl: `https://orcid.org/orcid-search/search?searchQuery=${encodeURIComponent(name)}`, excerpt: 'Name search candidate', method: 'inference' },
    });
  }
  return out;
}

async function orcidRecord(id: string, ctx: any): Promise<ConnectorOutput> {
  const out = empty();
  const orcid = normOrcid(id);
  if (!orcid) return out;
  const rec = await ctx.get(`https://pub.orcid.org/v3.0/${orcid}/record`, { headers: orcidHeaders });
  const src = `https://orcid.org/${orcid}`;
  const person = rec.person || {};
  const given = person.name?.['given-names']?.value;
  const family = person.name?.['family-name']?.value;
  const full = [given, family].filter(Boolean).join(' ') || person.name?.['credit-name']?.value;
  out.selfAttributes = { displayName: full, biography: person.biography?.content?.slice(0, 400), profileUrl: src, claimed: rec.history?.claimed };
  out.selfEvidence = { sourceUrl: src, excerpt: `ORCID record ${orcid}${full ? ` for ${full}` : ''}`, method: 'api' };
  if (full) {
    // An ORCID iD is a unique researcher identifier, so the person is scoped to it.
    out.entities.push({ ref: 'person', type: 'person', value: full, scope: `orcid:${orcid}`, label: full, evidence: { sourceUrl: src, excerpt: `Name on ORCID record: ${full}`, method: 'api' } });
    out.relations.push({ from: 'person', to: '$self', type: 'OWNS', explicit: true, evidence: { sourceUrl: src, excerpt: `ORCID iD ${orcid} registered to ${full}`, method: 'api' } });
  }
  const who = full ? 'person' : '$self';

  for (const u of person['researcher-urls']?.['researcher-url'] || []) {
    if (u.url?.value) addLinks(out, who, [u.url.value], src, `Researcher URL (${u['url-name'] || 'link'})`);
  }
  for (const e of person.emails?.email || []) {
    if (!e.email) continue;
    out.entities.push({ ref: `email:${e.email}`, type: 'email', value: e.email, label: e.email, evidence: { sourceUrl: src, excerpt: `Public email on ORCID: ${e.email}${e.verified ? ' (verified)' : ''}`, method: 'api' } });
    out.relations.push({ from: who, to: `email:${e.email}`, type: 'ASSOCIATED_WITH', explicit: true, evidence: { sourceUrl: src, excerpt: 'Public ORCID email', method: 'api' } });
  }

  const acts = rec['activities-summary'] || {};
  const affiliations = (kind: 'employments' | 'educations') =>
    (acts[kind]?.['affiliation-group'] || []).flatMap((g: any) => g.summaries || []).map((s: any) => s[kind === 'employments' ? 'employment-summary' : 'education-summary']).filter(Boolean);

  for (const [kind, rel, type] of [['employments', 'WORKS_AT', 'organization'], ['educations', 'STUDIED_AT', 'university']] as const) {
    for (const a of affiliations(kind).slice(0, 12)) {
      const org = a.organization?.name;
      if (!org) continue;
      const from = date(a['start-date']);
      const to = date(a['end-date']);
      const ref = `${kind}:${org}`;
      if (!out.entities.some((e) => e.ref === ref)) {
        out.entities.push({
          ref, type, value: org, label: org,
          attributes: { city: a.organization?.address?.city, country: a.organization?.address?.country, ror: a.organization?.['disambiguated-organization']?.['disambiguated-organization-identifier'] },
          evidence: { sourceUrl: src, excerpt: `${org}${a.organization?.address?.city ? `, ${a.organization.address.city}` : ''}`, method: 'api' },
        });
      }
      const relType = rel === 'WORKS_AT' && to ? 'WORKED_AT' : rel;
      out.relations.push({
        from: who, to: ref, type: relType, explicit: true, validFrom: from, validTo: to,
        evidence: { sourceUrl: src, excerpt: `${a['role-title'] ? `${a['role-title']}, ` : ''}${org} (${from || '?'} – ${to || 'present'})`, method: 'api', observedDate: from },
      });
    }
  }

  for (const g of (acts.works?.group || []).slice(0, 15)) {
    const w = g['work-summary']?.[0];
    if (!w) continue;
    const doi = (w['external-ids']?.['external-id'] || []).find((x: any) => x['external-id-type'] === 'doi')?.['external-id-value'];
    const title = w.title?.title?.value;
    if (!title) continue;
    const ref = `work:${doi || title}`;
    const pub = date(w['publication-date']);
    out.entities.push({ ref, type: 'paper', value: doi || title, label: title.length > 90 ? `${title.slice(0, 87)}…` : title, attributes: { doi, published: pub, journal: w['journal-title']?.value, workType: w.type }, evidence: { sourceUrl: doi ? `https://doi.org/${doi}` : src, excerpt: title, method: 'api', observedDate: pub } });
    out.relations.push({ from: who, to: ref, type: 'AUTHORED', explicit: true, validFrom: pub, evidence: { sourceUrl: src, excerpt: `Listed on ORCID record: "${title}"`, method: 'api', observedDate: pub } });
  }
  return out;
}

/** Crossref: DOI metadata (authors with ORCID, venue) and author-name search. */
export const crossrefConnector: Connector = {
  id: 'crossref',
  name: 'Crossref',
  platform: 'Crossref',
  description: 'Publication metadata for DOIs, including co-authors and their ORCID iDs.',
  accepts: ['paper'],
  canHandle: (n) => n.key.startsWith('paper:doi:'),
  reliability: 0.9,
  minIntervalMs: 300,

  async run(node, ctx) {
    const out = empty();
    const doi = normDoi(keyValue(node));
    if (!doi) return out;
    const res = await ctx.get(`https://api.crossref.org/works/${encodeURIComponent(doi)}?mailto=atlasmesh@users.noreply.github.com`);
    const w = res.message || {};
    const src = `https://doi.org/${doi}`;
    const issued = (w.issued?.['date-parts']?.[0] || []).join('-');
    out.selfAttributes = { title: w.title?.[0], published: issued || undefined, publisher: w.publisher, venue: w['container-title']?.[0], citations: w['is-referenced-by-count'], url: src };
    out.selfEvidence = { sourceUrl: src, excerpt: `${w.title?.[0] || doi} — ${w['container-title']?.[0] || w.publisher || ''}`, method: 'api', observedDate: issued };
    for (const [i, a] of (w.author || []).slice(0, 25).entries()) {
      const name = [a.given, a.family].filter(Boolean).join(' ') || a.name;
      if (!name) continue;
      const orcid = a.ORCID ? normOrcid(a.ORCID) : null;
      const ref = `a${i}`;
      if (orcid) {
        out.entities.push({ ref, type: 'account', value: `orcid:${orcid}`, label: `${name} (ORCID ${orcid})`, attributes: { displayName: name, profileUrl: `https://orcid.org/${orcid}` }, evidence: { sourceUrl: src, excerpt: `Author ${name}, ORCID ${orcid}`, method: 'api' } });
      } else {
        out.entities.push({ ref, type: 'person', value: name, scope: `doi:${doi}`, label: name, attributes: { affiliation: a.affiliation?.[0]?.name }, evidence: { sourceUrl: src, excerpt: `Author ${name}${a.affiliation?.[0]?.name ? ` (${a.affiliation[0].name})` : ''}`, method: 'api' } });
      }
      out.relations.push({ from: ref, to: '$self', type: 'AUTHORED', explicit: true, validFrom: issued, evidence: { sourceUrl: src, excerpt: `Author #${i + 1}: ${name}`, method: 'api', observedDate: issued } });
      if (a.affiliation?.[0]?.name) {
        const oref = `aff:${a.affiliation[0].name}`;
        if (!out.entities.some((e) => e.ref === oref)) {
          out.entities.push({ ref: oref, type: 'organization', value: a.affiliation[0].name, label: a.affiliation[0].name, evidence: { sourceUrl: src, excerpt: `Affiliation listed on paper`, method: 'api' } });
        }
        out.relations.push({ from: ref, to: oref, type: 'ASSOCIATED_WITH', explicit: true, validFrom: issued, reasoning: 'Affiliation at time of publication.', evidence: { sourceUrl: src, excerpt: `${name} — ${a.affiliation[0].name}`, method: 'api', observedDate: issued } });
      }
    }
    if (w['container-title']?.[0]) {
      const venue = w['container-title'][0];
      const isEvent = /conference|proceedings|symposium|workshop/i.test(venue);
      out.entities.push({ ref: 'venue', type: isEvent ? 'event' : 'document', value: venue, label: venue, evidence: { sourceUrl: src, excerpt: `Published in ${venue}`, method: 'api' } });
      out.relations.push({ from: '$self', to: 'venue', type: 'PUBLISHED_IN', explicit: true, validFrom: issued, evidence: { sourceUrl: src, excerpt: `Venue: ${venue}`, method: 'api', observedDate: issued } });
    }
    return out;
  },
};

/** arXiv API: papers by author name (candidates) and paper authors. */
export const arxivConnector: Connector = {
  id: 'arxiv',
  name: 'arXiv',
  platform: 'arXiv',
  description: 'Preprints by an author name. Name matches are recorded as hypotheses.',
  accepts: ['person'],
  reliability: 0.8,
  minIntervalMs: 3000, // arXiv asks for ≥3s between API calls
  async run(node, ctx) {
    const out = empty();
    const name = node.label.trim();
    if (name.split(/\s+/).length < 2) return out;
    const xml: string = await ctx.get(`https://export.arxiv.org/api/query?search_query=au:%22${encodeURIComponent(name)}%22&max_results=8&sortBy=submittedDate`, { responseType: 'text' });
    const entries = String(xml).split('<entry>').slice(1);
    for (const e of entries) {
      const pick = (tag: string) => e.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))?.[1]?.replace(/\s+/g, ' ').trim();
      const title = pick('title');
      const id = pick('id');
      const published = pick('published');
      if (!title || !id) continue;
      const authors = [...e.matchAll(/<name>([^<]+)<\/name>/g)].map((m) => m[1].trim());
      if (!authors.some((a) => normName(a) === normName(name))) continue;
      const ref = `arxiv:${id}`;
      out.entities.push({ ref, type: 'paper', value: `arxiv:${id.split('/abs/')[1] || id}`, label: title.length > 90 ? `${title.slice(0, 87)}…` : title, attributes: { published, authors: authors.slice(0, 8).join(', '), url: id }, evidence: { sourceUrl: id, excerpt: `${title} — ${authors.slice(0, 5).join(', ')}`, method: 'api', observedDate: published } });
      out.relations.push({
        from: '$self', to: ref, type: 'AUTHORED', explicit: false, validFrom: published?.slice(0, 10),
        reasoning: `An arXiv author is named exactly "${name}". Without an ORCID or affiliation match this is a name-based hypothesis.`,
        evidence: { sourceUrl: id, excerpt: `Author list includes "${name}"`, method: 'inference', observedDate: published },
      });
      for (const co of authors.filter((a) => normName(a) !== normName(name)).slice(0, 6)) {
        const cref = `co:${ref}:${co}`;
        out.entities.push({ ref: cref, type: 'person', value: co, scope: `arxiv:${id}`, label: co, evidence: { sourceUrl: id, excerpt: `Co-author on "${title}"`, method: 'api' } });
        out.relations.push({ from: cref, to: ref, type: 'AUTHORED', explicit: true, validFrom: published?.slice(0, 10), evidence: { sourceUrl: id, excerpt: `Author list of arXiv ${id}`, method: 'api', observedDate: published } });
      }
    }
    return out;
  },
};

/** Semantic Scholar: author candidates with publication counts (API key optional). */
export const semanticScholarConnector: Connector = {
  id: 'semanticscholar',
  name: 'Semantic Scholar',
  platform: 'Semantic Scholar',
  description: 'Author candidates with affiliations, h-index and top papers.',
  accepts: ['person'],
  reliability: 0.8,
  minIntervalMs: process.env.S2_API_KEY ? 1100 : 3500,
  optionalEnv: ['S2_API_KEY'],
  async run(node, ctx) {
    const out = empty();
    const headers = process.env.S2_API_KEY ? { 'x-api-key': process.env.S2_API_KEY } : {};
    const res = await ctx.get(`https://api.semanticscholar.org/graph/v1/author/search?query=${encodeURIComponent(node.label)}&limit=4&fields=name,affiliations,paperCount,hIndex,url,homepage,papers.title,papers.year,papers.externalIds`, { headers });
    for (const a of res?.data || []) {
      const ref = `s2:${a.authorId}`;
      out.entities.push({ ref, type: 'account', value: `semanticscholar:${a.authorId}`, label: `${a.name} (Semantic Scholar)`, attributes: { displayName: a.name, affiliations: (a.affiliations || []).join('; ') || undefined, papers: a.paperCount, hIndex: a.hIndex, profileUrl: a.url }, evidence: { sourceUrl: a.url, excerpt: `${a.name}: ${a.paperCount} papers, h-index ${a.hIndex}`, method: 'api' } });
      out.relations.push({ from: '$self', to: ref, type: 'POSSIBLY_SAME_ENTITY_AS', explicit: false, reasoning: `Semantic Scholar author search for "${node.label}" returned ${a.name}.`, evidence: { sourceUrl: a.url, excerpt: 'Name search candidate', method: 'inference' } });
      if (a.homepage) addLinks(out, ref, [a.homepage], a.url, 'Author homepage');
      for (const p of (a.papers || []).slice(0, 4)) {
        const doi = p.externalIds?.DOI;
        const pref = `p:${p.paperId}`;
        out.entities.push({ ref: pref, type: 'paper', value: doi || p.title, label: p.title?.length > 90 ? `${p.title.slice(0, 87)}…` : p.title, attributes: { year: p.year, doi }, evidence: { sourceUrl: a.url, excerpt: p.title, method: 'api', observedDate: p.year ? String(p.year) : undefined } });
        out.relations.push({ from: ref, to: pref, type: 'AUTHORED', explicit: true, validFrom: p.year ? String(p.year) : undefined, evidence: { sourceUrl: a.url, excerpt: `Listed on author profile`, method: 'api', observedDate: p.year ? String(p.year) : undefined } });
      }
    }
    return out;
  },
};
