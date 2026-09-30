import type { Connector, ConnectorOutput } from './types';
import { empty, keyValue } from './types';
import { addLinks } from './github';
import { accountFromUrl, normEmail, normUrl } from '../normalize';
import { redact } from '../safety';

/**
 * Public web pages. Fetches one page (robots.txt permitting) and reads only
 * what the site owner published for machines and visitors: title, meta tags,
 * rel="me" links, schema.org JSON-LD, links to known profile platforms and
 * mailto: addresses. It does not crawl.
 */

const decode = (s: string) =>
  s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#x27;/g, "'").trim();

function meta(html: string, name: string) {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*(?:name|property)=["']${name}["']`, 'i');
  const m = html.match(re);
  return m ? decode(m[1] ?? m[2] ?? '') : undefined;
}

function jsonLd(html: string): any[] {
  const out: any[] = [];
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const v = JSON.parse(m[1].trim());
      const push = (x: any) => (Array.isArray(x) ? x.forEach(push) : x?.['@graph'] ? push(x['@graph']) : x && out.push(x));
      push(v);
    } catch {
      // malformed JSON-LD is common
    }
  }
  return out;
}

export const websiteConnector: Connector = {
  id: 'website',
  name: 'Public website',
  platform: 'Web',
  description: 'Reads one public page: title, meta tags, rel="me" links, schema.org data, profile links and published contact emails. Honours robots.txt.',
  accepts: ['website', 'domain'],
  canHandle: (n) => n.type === 'website' || (n.type === 'domain' && keyValue(n).split('.').length <= 3),
  reliability: 0.7,
  minIntervalMs: 1500,

  async run(node, ctx) {
    const target = node.type === 'domain' ? `https://${keyValue(node)}` : keyValue(node);
    const page = await ctx.getPage(target);
    if (!page) return empty();
    return parsePage(page.url, page.html, node.type === 'domain');
  },
};

export function parsePage(url: string, html: string, fromDomain: boolean): ConnectorOutput {
  const out = empty();
  const head = html.slice(0, 400_000);
  const title = decode(head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').slice(0, 160);
  const description = meta(head, 'description') || meta(head, 'og:description');
  const siteName = meta(head, 'og:site_name');
  const generator = meta(head, 'generator');
  const author = meta(head, 'author');
  const ev = (excerpt: string, extra: any = {}) => ({ sourceUrl: url, excerpt: redact(excerpt).slice(0, 300), method: 'html' as const, selfReported: true, ...extra });

  let self = '$self';
  if (fromDomain) {
    // Expanding a domain: the homepage becomes a website node hosted on it.
    self = 'site';
    out.entities.push({ ref: 'site', type: 'website', value: url, label: url.replace(/^https?:\/\//, ''), attributes: { title, description: description?.slice(0, 300) }, evidence: ev(`Homepage title: ${title}`) });
    out.relations.push({ from: 'site', to: '$self', type: 'HOSTED_BY', explicit: true, evidence: ev(`${url} served from this domain`, { selfReported: false }) });
  } else {
    out.selfAttributes = { title, description: description?.slice(0, 300), siteName, generator };
    out.selfEvidence = ev(`Page title: ${title}`);
  }

  if (generator) {
    const g = generator.split(/\s\d/)[0].trim();
    out.entities.push({ ref: 'gen', type: 'technology', value: g, label: g, evidence: ev(`<meta name="generator" content="${generator}">`) });
    out.relations.push({ from: self, to: 'gen', type: 'USES', explicit: true, evidence: ev(`Generator meta tag: ${generator}`) });
  }

  // schema.org Person / Organization with sameAs — explicit identity claims by the site owner.
  for (const item of jsonLd(head)) {
    const types = ([] as string[]).concat(item['@type'] || []);
    const isPerson = types.includes('Person');
    const isOrg = types.some((t) => /Organization|Corporation|LocalBusiness|EducationalOrganization|CollegeOrUniversity/.test(t));
    if (!(isPerson || isOrg) || !item.name) continue;
    const ref = `ld:${item.name}`;
    const type = isPerson ? 'person' : types.includes('CollegeOrUniversity') ? 'university' : 'organization';
    out.entities.push({
      ref, type, value: String(item.name), scope: isPerson ? `site:${new URL(url).hostname}` : undefined, label: String(item.name),
      attributes: { jobTitle: item.jobTitle, description: typeof item.description === 'string' ? item.description.slice(0, 200) : undefined },
      evidence: ev(`schema.org ${types.join('/')} "${item.name}"`, { method: 'structured-data' }),
    });
    out.relations.push({ from: ref, to: self, type: isPerson ? 'OWNS' : 'OWNS', explicit: true, reasoning: 'Site publishes structured data naming this entity as its subject.', evidence: ev(`JSON-LD on ${url}`, { method: 'structured-data' }) });
    const sameAs = ([] as any[]).concat(item.sameAs || []).filter((s) => typeof s === 'string');
    addLinks(out, ref, sameAs, url, 'schema.org sameAs');
    const worksFor = ([] as any[]).concat(item.worksFor || []).map((w) => (typeof w === 'string' ? w : w?.name)).filter(Boolean);
    for (const w of worksFor.slice(0, 3)) {
      const oref = `wf:${w}`;
      out.entities.push({ ref: oref, type: 'organization', value: w, label: w, evidence: ev(`worksFor: ${w}`, { method: 'structured-data' }) });
      out.relations.push({ from: ref, to: oref, type: 'WORKS_AT', explicit: true, evidence: ev(`schema.org worksFor "${w}"`, { method: 'structured-data' }) });
    }
    const alumni = ([] as any[]).concat(item.alumniOf || []).map((w) => (typeof w === 'string' ? w : w?.name)).filter(Boolean);
    for (const a of alumni.slice(0, 3)) {
      const uref = `al:${a}`;
      out.entities.push({ ref: uref, type: 'university', value: a, label: a, evidence: ev(`alumniOf: ${a}`, { method: 'structured-data' }) });
      out.relations.push({ from: ref, to: uref, type: 'STUDIED_AT', explicit: true, evidence: ev(`schema.org alumniOf "${a}"`, { method: 'structured-data' }) });
    }
  }

  if (author && !out.entities.some((e) => e.type === 'person')) {
    out.entities.push({ ref: 'author', type: 'person', value: author, scope: `site:${new URL(url).hostname}`, label: author, evidence: ev(`<meta name="author" content="${author}">`) });
    out.relations.push({ from: 'author', to: self, type: 'CREATED', explicit: true, evidence: ev(`Author meta tag: ${author}`) });
  }

  // rel="me" links are the IndieWeb convention for "this other profile is also me".
  const relMe = [...head.matchAll(/<(?:a|link)[^>]+rel=["'][^"']*\bme\b[^"']*["'][^>]*href=["']([^"']+)["']|<(?:a|link)[^>]+href=["']([^"']+)["'][^>]*rel=["'][^"']*\bme\b[^"']*["']/gi)].map((m) => m[1] || m[2]);
  const hrefs = [...head.matchAll(/<a[^>]+href=["']([^"'#]+)["']/gi)].map((m) => decode(m[1]));
  const profileLinks = hrefs.map((h) => { try { return new URL(h, url).toString(); } catch { return null; } }).filter((h): h is string => !!h && !!accountFromUrl(h));
  const personRef = out.entities.find((e) => e.type === 'person')?.ref || self;
  addLinks(out, personRef, relMe.map((h) => new URL(h, url).toString()), url, 'rel="me" link');
  addLinks(out, self, [...new Set(profileLinks)].slice(0, 20), url, 'Profile link on page');

  const emails = new Set<string>();
  for (const m of hrefs) if (/^mailto:/i.test(m)) { const e = normEmail(decodeURIComponent(m.slice(7).split('?')[0])); if (e) emails.add(e); }
  for (const e of [...emails].slice(0, 5)) {
    const ref = `mail:${e}`;
    out.entities.push({ ref, type: 'email', value: e, label: e, evidence: ev(`mailto:${e} link on page`) });
    out.relations.push({ from: self, to: ref, type: 'ASSOCIATED_WITH', explicit: true, evidence: ev(`Published contact address ${e}`) });
  }

  // Outbound links to other sites the page presents (first-party projects, employers…)
  if (!fromDomain) {
    const host = new URL(url).hostname;
    const external = [...new Set(hrefs.map((h) => normUrl(h)).filter((h): h is string => !!h && /^https?:/.test(h) && !h.includes(host) && !accountFromUrl(h)))];
    out.notes = [`${external.length} other outbound links not added (use analyst notes to track relevant ones).`];
  }
  return out;
}
