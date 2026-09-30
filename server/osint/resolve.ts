import type { ConfidenceSignal, GraphEdge, GraphNode, Investigation } from '../../shared/osint';
import { levelForScore } from '../../shared/osint';
import { nodeTitle, normName, normOrg, platformLabel } from './normalize';
import { newId } from './repository';
import { claimFor } from './confidence';

/**
 * Entity resolution.
 *
 * Identity clusters are built around person nodes (a person plus the
 * accounts it OWNS) and around orphan accounts. Pairs of clusters are
 * compared on public signals; each match produces an identity edge whose
 * confidence signals and plain-English reasoning are stored with it.
 *
 * Nodes are never merged. A confirmed match is an explicit SAME_ENTITY_AS
 * edge that the analyst can reject.
 */

interface Cluster {
  anchor: GraphNode; // person, or account when no person is attached
  members: GraphNode[]; // anchor + owned accounts
  names: Set<string>;
  handles: Map<string, string>; // handle → platform
  emails: Set<string>;
  domains: Set<string>;
  websites: Set<string>;
  orgs: Set<string>;
  repos: Set<string>;
  locations: Set<string>;
  linksTo: Set<string>; // node ids linked from any member
}

function jaroWinkler(a: string, b: string) {
  if (a === b) return 1;
  const m = Math.floor(Math.max(a.length, b.length) / 2) - 1;
  const am = new Array(a.length).fill(false);
  const bm = new Array(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = Math.max(0, i - m); j < Math.min(b.length, i + m + 1); j++) {
      if (bm[j] || a[i] !== b[j]) continue;
      am[i] = bm[j] = true;
      matches++;
      break;
    }
  }
  if (!matches) return 0;
  let t = 0;
  let k = 0;
  for (let i = 0; i < a.length; i++) {
    if (!am[i]) continue;
    while (!bm[k]) k++;
    if (a[i] !== b[k]) t++;
    k++;
  }
  const jaro = (matches / a.length + matches / b.length + (matches - t / 2) / matches) / 3;
  let p = 0;
  while (p < 4 && a[p] && a[p] === b[p]) p++;
  return jaro + p * 0.1 * (1 - jaro);
}

function buildClusters(inv: Investigation): Cluster[] {
  const nodes = inv.nodes;
  const edges = Object.values(inv.edges).filter((e) => e.review !== 'rejected');
  const out = new Map<string, Cluster>(); // key: anchor id
  const owner = new Map<string, string>(); // account id → person id

  for (const e of edges) {
    if (e.type === 'OWNS' && nodes[e.from]?.type === 'person' && nodes[e.to]?.type === 'account') owner.set(e.to, e.from);
  }

  const clusterOf = (n: GraphNode) => {
    const anchorId = n.type === 'account' && owner.has(n.id) ? owner.get(n.id)! : n.id;
    let c = out.get(anchorId);
    if (!c) {
      const anchor = nodes[anchorId];
      c = { anchor, members: [anchor], names: new Set(), handles: new Map(), emails: new Set(), domains: new Set(), websites: new Set(), orgs: new Set(), repos: new Set(), locations: new Set(), linksTo: new Set() };
      out.set(anchorId, c);
    }
    if (!c.members.includes(n)) c.members.push(n);
    return c;
  };

  for (const n of Object.values(nodes)) {
    if (n.type !== 'person' && n.type !== 'account') continue;
    const c = clusterOf(n);
    if (n.type === 'person') c.names.add(normName(n.label));
    if (n.type === 'account') {
      const v = n.key.slice('account:'.length);
      const i = v.lastIndexOf(':');
      const platform = v.slice(0, i);
      const handle = v.slice(i + 1);
      if (platform !== 'orcid' && platform !== 'stackoverflow' && platform !== 'semanticscholar') c.handles.set(handle, platform);
      for (const dn of n.attributes.displayName || []) c.names.add(normName(String(dn.value)));
    }
    for (const loc of n.attributes.location || []) c.locations.add(String(loc.value).toLowerCase().split(',').pop()!.trim());
  }

  for (const e of edges) {
    const from = nodes[e.from];
    const to = nodes[e.to];
    if (!from || !to) continue;
    const c = (from.type === 'person' || from.type === 'account') ? clusterOf(from) : null;
    if (!c) continue;
    if (to.type === 'email' && e.type === 'ASSOCIATED_WITH') c.emails.add(to.id);
    if (e.type === 'LINKS_TO') {
      c.linksTo.add(to.id);
      if (to.type === 'website') {
        c.websites.add(to.id);
        for (const h of edges) if (h.from === to.id && h.type === 'HOSTED_BY' && nodes[h.to]?.type === 'domain') c.domains.add(h.to);
      }
    }
    if ((to.type === 'organization' || to.type === 'university') && ['WORKS_AT', 'WORKED_AT', 'MEMBER_OF', 'STUDIED_AT'].includes(e.type)) c.orgs.add(normOrg(to.label));
    if (to.type === 'repository' && ['CREATED', 'OWNS', 'MAINTAINS'].includes(e.type)) c.repos.add(to.id);
  }
  return [...out.values()].filter((c) => c.anchor);
}

const COMMON_HANDLES = new Set(['admin', 'dev', 'test', 'user', 'info', 'john', 'alex', 'david', 'mike', 'root', 'hello']);

function compare(a: Cluster, b: Cluster, inv: Investigation): { score: number; signals: ConfidenceSignal[] } {
  const signals: ConfidenceSignal[] = [];
  const idsA = new Set(a.members.map((m) => m.id));
  const idsB = new Set(b.members.map((m) => m.id));
  const labelOf = (id: string) => inv.nodes[id]?.label ?? id;

  // Explicit cross-links: one profile points at the other.
  const aToB = [...a.linksTo].some((id) => idsB.has(id));
  const bToA = [...b.linksTo].some((id) => idsA.has(id));
  if (aToB && bToA) signals.push({ id: 'res:mutual-link', label: 'Profiles link to each other', weight: 0.7 });
  else if (aToB || bToA) signals.push({ id: 'res:cross-link', label: 'One profile links to the other', weight: 0.5, detail: aToB ? `${nodeTitle(a.anchor)} → ${nodeTitle(b.anchor)}` : `${nodeTitle(b.anchor)} → ${nodeTitle(a.anchor)}` });

  const sharedEmail = [...a.emails].filter((e) => b.emails.has(e));
  if (sharedEmail.length) signals.push({ id: 'res:email', label: 'Same public email address', weight: 0.55, detail: sharedEmail.map(labelOf).join(', ') });

  const sharedDomain = [...a.domains].filter((d) => b.domains.has(d));
  const sharedSite = [...a.websites].filter((w) => b.websites.has(w));
  if (sharedSite.length) signals.push({ id: 'res:website', label: 'Same personal website', weight: 0.35, detail: sharedSite.map(labelOf).join(', ') });
  else if (sharedDomain.length) signals.push({ id: 'res:domain', label: 'Websites on the same domain', weight: 0.25, detail: sharedDomain.map(labelOf).join(', ') });

  const sharedRepos = [...a.repos].filter((r) => b.repos.has(r));
  if (sharedRepos.length) signals.push({ id: 'res:repo', label: 'Own or maintain the same repository', weight: 0.25, detail: sharedRepos.slice(0, 3).map(labelOf).join(', ') });

  const sharedHandles = [...a.handles.keys()].filter((h) => b.handles.has(h) && a.handles.get(h) !== b.handles.get(h));
  if (sharedHandles.length) {
    const h = sharedHandles[0];
    const distinctive = h.length >= 7 && !COMMON_HANDLES.has(h) && /[\d_-]|[a-z]{7,}/.test(h);
    signals.push({ id: 'res:handle', label: distinctive ? 'Same distinctive username on two platforms' : 'Same username on two platforms', weight: distinctive ? 0.25 : 0.12, detail: `"${h}" on ${platformLabel(a.handles.get(h)!)} and ${platformLabel(b.handles.get(h)!)}` });
  }

  let bestName = 0;
  for (const x of a.names) for (const y of b.names) bestName = Math.max(bestName, x && y ? jaroWinkler(x, y) : 0);
  if (bestName === 1) signals.push({ id: 'res:name', label: 'Identical public name', weight: 0.18 });
  else if (bestName >= 0.93) signals.push({ id: 'res:name', label: 'Very similar public name', weight: 0.1 });
  else if (a.names.size && b.names.size && bestName < 0.7) signals.push({ id: 'res:name-mismatch', label: 'Public names differ', weight: -0.2 });

  const sharedOrgs = [...a.orgs].filter((o) => o && b.orgs.has(o));
  if (sharedOrgs.length) signals.push({ id: 'res:org', label: 'Same organisation affiliation', weight: Math.min(0.24, 0.12 * sharedOrgs.length), detail: sharedOrgs.join(', ') });

  if (a.locations.size && b.locations.size) {
    const overlap = [...a.locations].some((l) => b.locations.has(l));
    signals.push(overlap
      ? { id: 'res:location', label: 'Consistent declared location', weight: 0.05 }
      : { id: 'res:location-mismatch', label: 'Declared locations differ', weight: -0.1, detail: `${[...a.locations].join('/')} vs ${[...b.locations].join('/')}` });
  }

  const score = Math.max(0, Math.min(1, signals.reduce((s, x) => s + x.weight, 0)));
  return { score, signals };
}

function explain(a: Cluster, b: Cluster, signals: ConfidenceSignal[], score: number) {
  const positives = signals.filter((s) => s.weight > 0).map((s) => (s.detail ? `${s.label.toLowerCase()} (${s.detail})` : s.label.toLowerCase()));
  const negatives = signals.filter((s) => s.weight < 0).map((s) => s.label.toLowerCase());
  const verb = score >= 0.9 ? 'is' : score >= 0.72 ? 'is likely' : score >= 0.5 ? 'may be' : 'could be';
  let text = `${nodeTitle(a.anchor)} ${verb} the same real-world entity as ${nodeTitle(b.anchor)}`;
  if (positives.length) text += ` because of: ${positives.join('; ')}`;
  if (negatives.length) text += `. Against: ${negatives.join('; ')}`;
  return `${text}.`;
}

/** Recompute identity edges. Existing analyst reviews are preserved. */
export function resolveIdentities(inv: Investigation): { created: number; updated: number } {
  const clusters = buildClusters(inv);
  let created = 0;
  let updated = 0;
  if (clusters.length > 600) return { created, updated }; // O(n²) guard

  for (let i = 0; i < clusters.length; i++) {
    for (let j = i + 1; j < clusters.length; j++) {
      const a = clusters[i];
      const b = clusters[j];
      const { score, signals } = compare(a, b, inv);
      if (score < 0.3 || !signals.some((s) => s.weight > 0.2 || s.id === 'res:name')) continue;

      const [from, to] = [a.anchor.id, b.anchor.id].sort();
      const type = score >= 0.85 ? 'SAME_ENTITY_AS' : 'POSSIBLY_SAME_ENTITY_AS';
      const existing = Object.values(inv.edges).find(
        (e) => (e.type === 'SAME_ENTITY_AS' || e.type === 'POSSIBLY_SAME_ENTITY_AS') && ((e.from === from && e.to === to) || (e.from === to && e.to === from))
      );
      const reasoning = explain(a, b, signals, score);
      const confidence = { score: +score.toFixed(3), level: levelForScore(score), signals };

      // Evidence for an inference is the union of what the members were observed with.
      const evIds = [...new Set([...a.anchor.evidenceIds.slice(0, 3), ...b.anchor.evidenceIds.slice(0, 3)])];
      if (existing) {
        if (existing.review === 'unreviewed' || existing.review === 'uncertain') {
          existing.type = existing.review === 'uncertain' ? 'POSSIBLY_SAME_ENTITY_AS' : type;
        }
        existing.confidence = existing.review === 'verified'
          ? { score: 1, level: 'confirmed', signals: [...signals, { id: 'analyst', label: 'Verified by analyst', weight: 0 }] }
          : existing.review === 'rejected'
            ? { score: 0, level: 'unresolved', signals: [...signals, { id: 'analyst', label: 'Rejected by analyst', weight: 0 }] }
            : confidence;
        existing.reasoning = reasoning;
        existing.lastObserved = Date.now();
        for (const id of evIds) if (!existing.evidenceIds.includes(id)) existing.evidenceIds.push(id);
        existing.claim = claimFor(existing);
        updated++;
      } else {
        const edge = {
          id: newId('e'), type, from, to, claim: 'INFERENCE' as GraphEdge['claim'], explicit: false, confidence, evidenceIds: evIds,
          firstObserved: Date.now(), lastObserved: Date.now(), reasoning, review: 'unreviewed' as const, notes: [],
        };
        edge.claim = claimFor(edge as any);
        inv.edges[edge.id] = edge as any;
        created++;
      }
    }
  }
  return { created, updated };
}
