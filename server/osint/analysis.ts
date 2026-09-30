import type { Contradiction, GraphEdge, GraphNode, Investigation, TimelineEvent } from '../../shared/osint';
import { normName } from './normalize';
import { newId } from './repository';

/**
 * Deterministic graph analysis shared by the UI, the rules-based analyst and
 * the LLM tools: contradictions, timeline, paths, statistics, next steps.
 */

const EMPLOYMENT = new Set(['WORKS_AT', 'WORKED_AT']);

function overlaps(a: GraphEdge, b: GraphEdge) {
  const aStart = a.validFrom || '0000';
  const aEnd = a.validTo || '9999';
  const bStart = b.validFrom || '0000';
  const bEnd = b.validTo || '9999';
  return aStart <= bEnd && bStart <= aEnd;
}

/** Detect conflicting evidence. Both sides are kept; nothing is overwritten. */
export function detectContradictions(inv: Investigation) {
  const found: Contradiction[] = [];
  const nodes = inv.nodes;
  const edges = Object.values(inv.edges).filter((e) => e.review !== 'rejected');

  // Employment: current at two different organisations according to different sources.
  const bySubject = new Map<string, GraphEdge[]>();
  for (const e of edges) if (EMPLOYMENT.has(e.type)) (bySubject.get(e.from) ?? bySubject.set(e.from, []).get(e.from)!).push(e);
  for (const [subject, list] of bySubject) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (a.to === b.to) {
          // Same org, one source says current, another says it ended.
          if (!!a.validTo !== !!b.validTo) {
            found.push({
              id: '', kind: 'employment', status: 'temporal',
              description: `${nodes[subject]?.label} and ${nodes[a.to]?.label}: one source shows a current role, another shows it ended ${a.validTo || b.validTo}.`,
              nodeIds: [subject, a.to], edgeIds: [a.id, b.id], evidenceIds: [...a.evidenceIds, ...b.evidenceIds],
            });
          }
          continue;
        }
        const aCurrent = a.type === 'WORKS_AT' && !a.validTo;
        const bCurrent = b.type === 'WORKS_AT' && !b.validTo;
        if (!aCurrent || !bCurrent) {
          if (a.validFrom && b.validFrom && !overlaps(a, b)) continue; // sequential jobs, no conflict
          if (!aCurrent && !bCurrent) continue;
        }
        const srcA = new Set(a.evidenceIds.map((id) => inv.evidence[id]?.platform));
        const srcB = new Set(b.evidenceIds.map((id) => inv.evidence[id]?.platform));
        const sameSource = [...srcA].some((p) => srcB.has(p));
        if (aCurrent && bCurrent && !sameSource) {
          found.push({
            id: '', kind: 'employment', status: 'unresolved',
            description: `${nodes[subject]?.label} is shown as currently at both ${nodes[a.to]?.label} (${[...srcA].join(', ')}) and ${nodes[b.to]?.label} (${[...srcB].join(', ')}).`,
            nodeIds: [subject, a.to, b.to], edgeIds: [a.id, b.id], evidenceIds: [...a.evidenceIds, ...b.evidenceIds],
          });
        }
      }
    }
  }

  // Location: one node declaring different countries/regions on different platforms.
  for (const n of Object.values(nodes)) {
    const locs = n.attributes.location || [];
    if (locs.length < 2) continue;
    const tails = new Set(locs.map((l) => String(l.value).toLowerCase().split(',').pop()!.trim()));
    if (tails.size > 1) {
      found.push({
        id: '', kind: 'location', status: 'unresolved',
        description: `${n.label} declares different locations: ${locs.map((l) => `"${l.value}"`).join(' vs ')}.`,
        nodeIds: [n.id], edgeIds: [], evidenceIds: locs.flatMap((l) => l.evidenceIds),
      });
    }
  }

  // Identity: a confirmed identity link between entities with clearly different names.
  for (const e of edges) {
    if (e.type !== 'SAME_ENTITY_AS') continue;
    const a = nodes[e.from];
    const b = nodes[e.to];
    if (a?.type === 'person' && b?.type === 'person' && normName(a.label).split(' ').pop() !== normName(b.label).split(' ').pop()) {
      found.push({
        id: '', kind: 'identity', status: 'unresolved',
        description: `${a.label} and ${b.label} are linked as the same entity but have different family names.`,
        nodeIds: [a.id, b.id], edgeIds: [e.id], evidenceIds: e.evidenceIds,
      });
    }
  }

  // Emails shared by persons with unrelated names.
  const emailOwners = new Map<string, GraphNode[]>();
  for (const e of edges) {
    if (e.type !== 'ASSOCIATED_WITH' || nodes[e.to]?.type !== 'email') continue;
    const n = nodes[e.from];
    if (n?.type === 'person') (emailOwners.get(e.to) ?? emailOwners.set(e.to, []).get(e.to)!).push(n);
  }
  for (const [email, owners] of emailOwners) {
    const names = new Set(owners.map((o) => normName(o.label)));
    if (names.size > 1 && owners.length > 1) {
      found.push({
        id: '', kind: 'name', status: 'unresolved',
        description: `${nodes[email]?.label} is published by entities with different names: ${[...names].join(', ')}. It may be a shared or role address.`,
        nodeIds: [email, ...owners.map((o) => o.id)], edgeIds: [], evidenceIds: [],
      });
    }
  }

  // Keep ids and analyst dismissals stable across recomputation.
  const sig = (c: Contradiction) => `${c.kind}|${[...c.nodeIds].sort().join(',')}|${[...c.edgeIds].sort().join(',')}`;
  const previous = new Map(inv.contradictions.map((c) => [sig(c), c]));
  inv.contradictions = found.map((c) => {
    const prev = previous.get(sig(c));
    return { ...c, id: prev?.id || newId('c'), status: prev?.status === 'dismissed' ? 'dismissed' : c.status };
  });
  return inv.contradictions;
}

const DATE_ATTRS: Record<string, string> = {
  createdAt: 'created',
  registered: 'domain registered',
  expires: 'domain expires',
  published: 'published',
  firstRelease: 'first release',
  inception: 'founded',
};

export function buildTimeline(inv: Investigation): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const nodes = inv.nodes;
  for (const e of Object.values(inv.edges)) {
    if (e.review === 'rejected') continue;
    const from = nodes[e.from]?.label;
    const to = nodes[e.to]?.label;
    const verb = e.type.toLowerCase().replace(/_/g, ' ');
    if (e.validFrom) events.push({ id: `${e.id}:from`, date: e.validFrom, label: `${from} ${verb} ${to}${e.validTo ? ' (start)' : ''}`, nodeIds: [e.from, e.to], edgeIds: [e.id], evidenceIds: e.evidenceIds, claim: e.claim });
    if (e.validTo) events.push({ id: `${e.id}:to`, date: e.validTo, label: `${from} left ${to}`, nodeIds: [e.from, e.to], edgeIds: [e.id], evidenceIds: e.evidenceIds, claim: e.claim });
  }
  for (const n of Object.values(nodes)) {
    for (const [attr, verb] of Object.entries(DATE_ATTRS)) {
      const v = n.attributes[attr]?.[0];
      if (!v || typeof v.value !== 'string' || !/^\d{4}/.test(v.value)) continue;
      // Skip if an edge already provides the same date for this node
      const d = String(v.value).slice(0, 10);
      if (events.some((ev) => ev.nodeIds.includes(n.id) && ev.date.slice(0, 10) === d)) continue;
      events.push({ id: `${n.id}:${attr}`, date: d, label: `${n.label} ${verb}`, nodeIds: [n.id], edgeIds: [], evidenceIds: v.evidenceIds, claim: 'FACT' });
    }
  }
  return events.sort((a, b) => a.date.localeCompare(b.date));
}

// ---------- Paths ----------

export interface PathResult {
  nodeIds: string[];
  edgeIds: string[];
  /** Product of edge confidences. */
  strength: number;
}

function adjacency(inv: Investigation, minScore = 0) {
  const adj = new Map<string, Array<{ to: string; edge: GraphEdge }>>();
  for (const e of Object.values(inv.edges)) {
    if (e.review === 'rejected' || e.confidence.score < minScore) continue;
    (adj.get(e.from) ?? adj.set(e.from, []).get(e.from)!).push({ to: e.to, edge: e });
    (adj.get(e.to) ?? adj.set(e.to, []).get(e.to)!).push({ to: e.from, edge: e });
  }
  return adj;
}

/** Dijkstra. mode "shortest" = fewest hops; "strongest" = maximises product of confidences. */
export function findPath(inv: Investigation, a: string, b: string, mode: 'shortest' | 'strongest' = 'strongest', minScore = 0): PathResult | null {
  if (!inv.nodes[a] || !inv.nodes[b]) return null;
  const adj = adjacency(inv, minScore);
  const dist = new Map<string, number>([[a, 0]]);
  const prev = new Map<string, { node: string; edge: string }>();
  const visited = new Set<string>();
  const queue: Array<[number, string]> = [[0, a]];
  while (queue.length) {
    queue.sort((x, y) => x[0] - y[0]);
    const [d, u] = queue.shift()!;
    if (visited.has(u)) continue;
    visited.add(u);
    if (u === b) break;
    for (const { to, edge } of adj.get(u) || []) {
      const w = mode === 'shortest' ? 1 : -Math.log(Math.max(edge.confidence.score, 0.01));
      const nd = d + w;
      if (nd < (dist.get(to) ?? Infinity)) {
        dist.set(to, nd);
        prev.set(to, { node: u, edge: edge.id });
        queue.push([nd, to]);
      }
    }
  }
  if (!prev.has(b) && a !== b) return null;
  const nodeIds = [b];
  const edgeIds: string[] = [];
  let cur = b;
  while (cur !== a) {
    const p = prev.get(cur)!;
    edgeIds.unshift(p.edge);
    nodeIds.unshift(p.node);
    cur = p.node;
  }
  const strength = edgeIds.reduce((s, id) => s * inv.edges[id].confidence.score, 1);
  return { nodeIds, edgeIds, strength: +strength.toFixed(3) };
}

export function stats(inv: Investigation) {
  const nodes = Object.values(inv.nodes);
  const edges = Object.values(inv.edges).filter((e) => e.review !== 'rejected');
  const byType: Record<string, number> = {};
  for (const n of nodes) byType[n.type] = (byType[n.type] || 0) + 1;
  const degree = new Map<string, number>();
  for (const e of edges) {
    degree.set(e.from, (degree.get(e.from) || 0) + 1);
    degree.set(e.to, (degree.get(e.to) || 0) + 1);
  }
  const rank = (types: string[]) =>
    nodes.filter((n) => types.includes(n.type)).map((n) => ({ id: n.id, label: n.label, degree: degree.get(n.id) || 0 })).sort((a, b) => b.degree - a.degree).slice(0, 10);
  const claims = { FACT: 0, INFERENCE: 0, HYPOTHESIS: 0 };
  for (const e of edges) claims[e.claim]++;
  const sources: Record<string, number> = {};
  for (const ev of Object.values(inv.evidence)) sources[ev.platform] = (sources[ev.platform] || 0) + 1;
  return {
    nodes: nodes.length,
    edges: edges.length,
    evidence: Object.keys(inv.evidence).length,
    byType,
    claims,
    sources,
    topOrganizations: rank(['organization', 'university']),
    topPeople: rank(['person', 'account']),
    topTechnologies: rank(['technology']),
  };
}

/** Weak or unconfirmed claims, weakest first. */
export function weakClaims(inv: Investigation, limit = 25) {
  return Object.values(inv.edges)
    .filter((e) => e.review !== 'rejected' && e.review !== 'verified' && (e.claim !== 'FACT' || e.confidence.score < 0.6))
    .sort((a, b) => a.confidence.score - b.confidence.score)
    .slice(0, limit);
}

/** Suggest unexpanded nodes worth investigating, with the reason. */
export function nextSteps(inv: Investigation, available: (n: GraphNode) => string[], limit = 8) {
  const degree = new Map<string, number>();
  for (const e of Object.values(inv.edges)) {
    if (e.review === 'rejected') continue;
    degree.set(e.from, (degree.get(e.from) || 0) + e.confidence.score);
    degree.set(e.to, (degree.get(e.to) || 0) + e.confidence.score);
  }
  const suggestions: Array<{ nodeId: string; label: string; connectors: string[]; reason: string; priority: number }> = [];
  for (const n of Object.values(inv.nodes)) {
    if (n.hidden) continue;
    const pending = available(n).filter((c) => !n.expandedWith.includes(c));
    if (!pending.length) continue;
    const weight = (degree.get(n.id) || 0) + (n.pinned ? 3 : 0) + (['person', 'organization', 'domain', 'account'].includes(n.type) ? 1 : 0) - n.depth * 0.3;
    suggestions.push({ nodeId: n.id, label: n.label, connectors: pending, reason: `${pending.length} source${pending.length > 1 ? 's' : ''} not yet queried (${pending.join(', ')})`, priority: weight });
  }
  const hypotheses = Object.values(inv.edges).filter((e) => e.type === 'POSSIBLY_SAME_ENTITY_AS' && e.review === 'unreviewed').slice(0, 3);
  const out = suggestions.sort((a, b) => b.priority - a.priority).slice(0, limit);
  return { expand: out, reviewIdentity: hypotheses.map((e) => ({ edgeId: e.id, label: `${inv.nodes[e.from]?.label} ↔ ${inv.nodes[e.to]?.label}`, score: e.confidence.score })) };
}

export function neighbors(inv: Investigation, id: string) {
  return Object.values(inv.edges)
    .filter((e) => e.from === id || e.to === id)
    .map((e) => ({ edge: e, other: inv.nodes[e.from === id ? e.to : e.from] }))
    .filter((x) => x.other);
}

export function searchNodes(inv: Investigation, q: string, limit = 10) {
  const t = normName(q);
  if (!t) return [];
  return Object.values(inv.nodes)
    .map((n) => {
      const l = normName(n.label);
      const k = n.key.toLowerCase();
      const score = l === t ? 3 : l.startsWith(t) ? 2 : l.includes(t) || k.includes(t) ? 1 : 0;
      return { n, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.n);
}
