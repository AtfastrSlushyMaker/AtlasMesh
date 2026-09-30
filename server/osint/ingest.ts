import type { Evidence, GraphEdge, GraphNode, Investigation, NodeType, RelType } from '../../shared/osint';
import type { Connector, ConnectorOutput, EvidenceInput, FoundEntity } from './connectors/types';
import { nodeKey } from './normalize';
import { redact } from './safety';
import { newId } from './repository';
import { scoreEdge, claimFor } from './confidence';

/**
 * Data ingestion: merges one connector output into the graph.
 * - Evidence is always appended, never overwritten.
 * - Nodes collapse only on identical canonical keys (see normalize.ts).
 * - Edges collapse on (type, from, to); new evidence strengthens them.
 */

export function addEvidence(inv: Investigation, c: Pick<Connector, 'id' | 'platform' | 'reliability'>, input: EvidenceInput): Evidence {
  // Deduplicate identical excerpts from the same URL.
  const excerpt = redact(String(input.excerpt || '')).slice(0, 400);
  const existing = Object.values(inv.evidence).find((e) => e.connector === c.id && e.sourceUrl === input.sourceUrl && e.excerpt === excerpt);
  if (existing) {
    existing.retrievedAt = Date.now();
    return existing;
  }
  const ev: Evidence = {
    id: newId('ev'),
    connector: c.id,
    platform: c.platform,
    retrievedAt: Date.now(),
    reliability: input.reliability ?? (input.selfReported ? c.reliability * 0.9 : c.reliability),
    sourceUrl: input.sourceUrl,
    excerpt,
    method: input.method,
    observedDate: input.observedDate,
    selfReported: input.selfReported,
  };
  inv.evidence[ev.id] = ev;
  return ev;
}

function setAttributes(node: GraphNode, attrs: Record<string, any> | undefined, evidenceId: string) {
  if (!attrs) return;
  for (const [k, raw] of Object.entries(attrs)) {
    if (raw === undefined || raw === null || raw === '') continue;
    const value = typeof raw === 'string' ? redact(raw).slice(0, 500) : raw;
    const list = (node.attributes[k] ||= []);
    const same = list.find((a) => a.value === value);
    // Different values for the same attribute are kept side by side — contradiction detection reads them.
    if (same) {
      if (!same.evidenceIds.includes(evidenceId)) same.evidenceIds.push(evidenceId);
    } else {
      list.push({ value, evidenceIds: [evidenceId] });
    }
  }
}

export function findByKey(inv: Investigation, key: string) {
  for (const n of Object.values(inv.nodes)) if (n.key === key) return n;
  return undefined;
}

export function upsertNode(
  inv: Investigation,
  type: NodeType,
  key: string,
  label: string,
  evidence: Evidence,
  meta: { depth: number; discoveredBy: string; attributes?: Record<string, any>; geo?: GraphNode['geo'] }
): { node: GraphNode; created: boolean } {
  const now = Date.now();
  let node = findByKey(inv, key);
  let created = false;
  if (!node) {
    node = {
      id: newId('n'),
      type,
      key,
      label: label.slice(0, 140),
      attributes: {},
      evidenceIds: [],
      firstObserved: now,
      lastObserved: now,
      depth: meta.depth,
      discoveredBy: meta.discoveredBy,
      expandedWith: [],
      notes: [],
    };
    inv.nodes[node.id] = node;
    created = true;
  }
  node.lastObserved = now;
  node.depth = Math.min(node.depth, meta.depth);
  if (!node.evidenceIds.includes(evidence.id)) node.evidenceIds.push(evidence.id);
  setAttributes(node, meta.attributes, evidence.id);
  if (meta.geo && !node.geo) node.geo = meta.geo;
  return { node, created };
}

export function upsertEdge(
  inv: Investigation,
  type: RelType,
  from: string,
  to: string,
  evidence: Evidence,
  opts: { explicit: boolean; validFrom?: string; validTo?: string; reasoning?: string }
): { edge: GraphEdge; created: boolean } {
  if (from === to) return { edge: undefined as any, created: false };
  const now = Date.now();
  let edge = Object.values(inv.edges).find((e) => e.type === type && e.from === from && e.to === to);
  let created = false;
  if (!edge) {
    edge = {
      id: newId('e'),
      type,
      from,
      to,
      claim: 'HYPOTHESIS',
      explicit: opts.explicit,
      confidence: { score: 0, level: 'unresolved', signals: [] },
      evidenceIds: [],
      firstObserved: now,
      lastObserved: now,
      validFrom: opts.validFrom,
      validTo: opts.validTo,
      reasoning: opts.reasoning,
      review: 'unreviewed',
      notes: [],
    };
    inv.edges[edge.id] = edge;
    created = true;
  }
  edge.lastObserved = now;
  edge.explicit = edge.explicit || opts.explicit;
  if (opts.validFrom && (!edge.validFrom || opts.validFrom < edge.validFrom)) edge.validFrom = opts.validFrom;
  if (opts.validTo) edge.validTo = opts.validTo;
  if (opts.reasoning && !edge.reasoning) edge.reasoning = opts.reasoning;
  if (!edge.evidenceIds.includes(evidence.id)) edge.evidenceIds.push(evidence.id);
  edge.confidence = scoreEdge(inv, edge);
  edge.claim = claimFor(edge);
  return { edge, created };
}

export interface IngestResult {
  newNodes: GraphNode[];
  newEdges: GraphEdge[];
  touchedNodeIds: Set<string>;
}

export function ingest(inv: Investigation, self: GraphNode, connector: Connector, output: ConnectorOutput, maxNodes: number): IngestResult {
  const result: IngestResult = { newNodes: [], newEdges: [], touchedNodeIds: new Set([self.id]) };
  const refToId = new Map<string, string>([['$self', self.id]]);

  if (output.selfEvidence) {
    const ev = addEvidence(inv, connector, output.selfEvidence);
    if (!self.evidenceIds.includes(ev.id)) self.evidenceIds.push(ev.id);
    setAttributes(self, output.selfAttributes, ev.id);
    if (output.selfGeo && !self.geo) self.geo = output.selfGeo;
  }

  const byRef = new Map<string, FoundEntity>();
  for (const ent of output.entities) if (!byRef.has(ent.ref)) byRef.set(ent.ref, ent);

  for (const ent of byRef.values()) {
    const key = nodeKey(ent.type, ent.value, ent.scope);
    if (!key) continue;
    const existing = findByKey(inv, key);
    if (!existing && Object.keys(inv.nodes).length >= maxNodes) continue; // node budget reached
    const ev = addEvidence(inv, connector, ent.evidence);
    const { node, created } = upsertNode(inv, ent.type, key, ent.label, ev, {
      depth: self.depth + 1,
      discoveredBy: connector.id,
      attributes: ent.attributes || undefined,
      geo: ent.geo,
    });
    refToId.set(ent.ref, node.id);
    result.touchedNodeIds.add(node.id);
    if (created) result.newNodes.push(node);
  }

  for (const rel of output.relations) {
    const from = refToId.get(rel.from);
    const to = refToId.get(rel.to);
    if (!from || !to) continue;
    const ev = addEvidence(inv, connector, rel.evidence);
    const { edge, created } = upsertEdge(inv, rel.type, from, to, ev, rel);
    if (created && edge) result.newEdges.push(edge);
  }
  return result;
}
