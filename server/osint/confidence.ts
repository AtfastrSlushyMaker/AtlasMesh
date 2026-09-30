import type { Confidence, ConfidenceSignal, GraphEdge, Investigation } from '../../shared/osint';
import { levelForScore } from '../../shared/osint';

/**
 * Explainable confidence scoring for relationships. The score is the clamped
 * sum of named signals; the UI shows each signal so an analyst can see
 * exactly why a level was assigned.
 */

export function scoreEdge(inv: Investigation, edge: GraphEdge): Confidence {
  const signals: ConfidenceSignal[] = [];
  const evidence = edge.evidenceIds.map((id) => inv.evidence[id]).filter(Boolean);
  const direct = evidence.filter((e) => e.method !== 'inference');

  if (edge.review === 'verified') {
    return { score: 1, level: 'confirmed', signals: [{ id: 'analyst', label: 'Verified by analyst', weight: 1 }] };
  }
  if (edge.review === 'rejected') {
    return { score: 0, level: 'unresolved', signals: [{ id: 'analyst', label: 'Rejected by analyst', weight: -1 }] };
  }

  // Identity edges carry their resolver-computed signals.
  if (edge.type === 'SAME_ENTITY_AS' || edge.type === 'POSSIBLY_SAME_ENTITY_AS') {
    const prior = edge.confidence?.signals?.filter((s) => s.id.startsWith('res:')) ?? [];
    if (prior.length) {
      const score = clamp(prior.reduce((a, s) => a + s.weight, 0));
      if (edge.review === 'uncertain') prior.push({ id: 'analyst', label: 'Marked uncertain by analyst', weight: 0 });
      return { score: edge.review === 'uncertain' ? Math.min(score, 0.6) : score, level: levelForScore(edge.review === 'uncertain' ? Math.min(score, 0.6) : score), signals: prior };
    }
  }

  if (edge.explicit && direct.length) {
    signals.push({ id: 'direct', label: 'Source states it directly', weight: 0.5 });
  } else if (direct.length) {
    signals.push({ id: 'indirect', label: 'Derived from source data', weight: 0.25 });
  } else {
    signals.push({ id: 'inferred', label: 'Inferred, no direct statement', weight: 0.1 });
  }

  const bestReliability = Math.max(0, ...evidence.map((e) => e.reliability));
  signals.push({ id: 'reliability', label: 'Source reliability', weight: +(0.25 * bestReliability).toFixed(3), detail: `${Math.round(bestReliability * 100)}% for best source` });

  const platforms = new Set(evidence.map((e) => e.platform));
  if (platforms.size > 1) {
    signals.push({ id: 'independent', label: 'Independent sources agree', weight: Math.min(0.3, 0.12 * (platforms.size - 1)), detail: [...platforms].join(', ') });
  }

  if (evidence.length && evidence.every((e) => e.selfReported)) {
    signals.push({ id: 'self-reported', label: 'Only self-reported', weight: -0.08, detail: 'The subject published this about themselves' });
  }

  const contradictions = inv.contradictions.filter((c) => c.status === 'unresolved' && c.edgeIds.includes(edge.id));
  if (contradictions.length) {
    signals.push({ id: 'contradiction', label: 'Contradicted by other evidence', weight: -0.25 * contradictions.length, detail: contradictions.map((c) => c.description).join(' · ') });
  }

  if (edge.validTo) {
    signals.push({ id: 'historical', label: 'Historical (has end date)', weight: 0, detail: `Ended ${edge.validTo}` });
  } else if (edge.lastObserved && Date.now() - edge.lastObserved > 365 * 24 * 3600 * 1000) {
    signals.push({ id: 'aging', label: 'Not re-observed for over a year', weight: -0.1 });
  }

  let score = clamp(signals.reduce((a, s) => a + s.weight, 0));
  if (edge.review === 'uncertain') {
    signals.push({ id: 'analyst', label: 'Marked uncertain by analyst', weight: 0 });
    score = Math.min(score, 0.6);
  }
  return { score: +score.toFixed(3), level: levelForScore(score), signals };
}

export function claimFor(edge: GraphEdge): GraphEdge['claim'] {
  if (edge.review === 'verified') return 'FACT';
  if (edge.type === 'SAME_ENTITY_AS') return 'INFERENCE';
  if (edge.type === 'POSSIBLY_SAME_ENTITY_AS') return edge.confidence.score >= 0.5 ? 'INFERENCE' : 'HYPOTHESIS';
  if (edge.explicit) return 'FACT';
  return edge.confidence.score >= 0.5 ? 'INFERENCE' : 'HYPOTHESIS';
}

export function rescoreAll(inv: Investigation) {
  for (const e of Object.values(inv.edges)) {
    e.confidence = scoreEdge(inv, e);
    e.claim = claimFor(e);
  }
}

const clamp = (n: number) => Math.max(0, Math.min(1, n));
