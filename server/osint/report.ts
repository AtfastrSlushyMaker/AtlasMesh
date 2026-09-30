import type { GraphEdge, Investigation } from '../../shared/osint';
import { buildTimeline, nextSteps, stats, weakClaims } from './analysis';
import { connectorsFor } from './connectors';
import { finalize, llmSummary } from './analyst';

/**
 * Evidence-backed investigation report (Markdown). Every line that states
 * something about an entity carries its id; the "Sources" section lists
 * every URL the conclusions rely on.
 */
export async function buildReport(inv: Investigation) {
  const N = (id: string) => `${inv.nodes[id]?.label ?? id} [N:${id}]`;
  const line = (e: GraphEdge) =>
    `- ${N(e.from)} — ${e.type.replace(/_/g, ' ').toLowerCase()} — ${N(e.to)}${e.validFrom ? ` (${e.validFrom}${e.validTo ? ` – ${e.validTo}` : ''})` : ''} · ${e.claim}, ${e.confidence.level} ${Math.round(e.confidence.score * 100)}% [E:${e.id}]`;

  const live = Object.values(inv.edges).filter((e) => e.review !== 'rejected');
  const st = stats(inv);
  const facts = live.filter((e) => e.claim === 'FACT' && e.confidence.score >= 0.7 && !e.type.includes('SAME_ENTITY')).sort((a, b) => b.confidence.score - a.confidence.score).slice(0, 25);
  const identity = live.filter((e) => e.type.includes('SAME_ENTITY')).sort((a, b) => b.confidence.score - a.confidence.score);
  const hypotheses = weakClaims(inv, 20).filter((e) => e.claim === 'HYPOTHESIS');
  const timeline = buildTimeline(inv);
  const next = nextSteps(inv, (n) => connectorsFor(n, inv.settings.enabledConnectors).map((c) => c.id));
  const missing: string[] = [];
  if (!st.byType.organization && !st.byType.university) missing.push('No organisational affiliation has been found.');
  if (!timeline.length) missing.push('No dated evidence; the timeline is empty.');
  if (!identity.length && (st.byType.account || 0) > 1) missing.push('Accounts on different platforms have not been linked to one identity.');
  if (!st.byType.domain && !st.byType.website) missing.push('No websites or domains are associated with the subject.');

  const usedEvidence = new Set<string>();
  for (const e of [...facts, ...identity, ...hypotheses]) e.evidenceIds.forEach((id) => usedEvidence.add(id));
  timeline.forEach((t) => t.evidenceIds.forEach((id) => usedEvidence.add(id)));
  const sources = new Map<string, { platform: string; retrievedAt: number; ids: string[] }>();
  for (const id of usedEvidence) {
    const ev = inv.evidence[id];
    if (!ev) continue;
    const s = sources.get(ev.sourceUrl) ?? { platform: ev.platform, retrievedAt: ev.retrievedAt, ids: [] };
    s.ids.push(id);
    sources.set(ev.sourceUrl, s);
  }

  const md: string[] = [];
  md.push(`# ${inv.title}`, '');
  md.push(`Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC from ${st.nodes} entities, ${st.edges} relationships and ${st.evidence} evidence records.`, '');
  md.push('> Claims are labelled FACT (a source states it), INFERENCE (derived from several pieces of evidence) or HYPOTHESIS (insufficient evidence). Confidence percentages come from the listed signals, not from the language model.', '');
  md.push('## Objective', '', inv.objective || '_No objective recorded._', '');
  md.push('%%SUMMARY%%');
  md.push('## Key entities', '');
  md.push(`Starting points: ${inv.seedIds.map(N).join(', ') || '—'}`, '');
  const keyEntities = [...st.topPeople.slice(0, 6), ...st.topOrganizations.slice(0, 6)].filter((x) => x.degree > 0);
  keyEntities.forEach((k) => md.push(`- ${N(k.id)} — ${inv.nodes[k.id].type}, ${k.degree} relationships`));
  md.push('');
  md.push('## Strongest confirmed findings', '');
  md.push(...(facts.length ? facts.map(line) : ['_None yet._']), '');
  md.push('## Identity resolution', '');
  if (!identity.length) md.push('_No identity links proposed._');
  for (const e of identity.slice(0, 15)) {
    md.push(line(e));
    if (e.reasoning) md.push(`  - ${e.reasoning}`);
  }
  md.push('');
  md.push('## Timeline', '');
  md.push(...(timeline.length ? timeline.slice(-40).map((t) => `- **${t.date.slice(0, 10)}** ${t.label}${t.claim !== 'FACT' ? ` _(${t.claim.toLowerCase()})_` : ''} ${t.edgeIds[0] ? `[E:${t.edgeIds[0]}]` : `[N:${t.nodeIds[0]}]`}`) : ['_No dated evidence._']), '');
  md.push('## Important hypotheses', '');
  md.push(...(hypotheses.length ? hypotheses.map((e) => `${line(e)}${e.reasoning ? `\n  - ${e.reasoning}` : ''}`) : ['_None._']), '');
  md.push('## Contradictions', '');
  const cs = inv.contradictions.filter((c) => c.status !== 'dismissed');
  md.push(...(cs.length ? cs.map((c) => `- **${c.status}** — ${c.description} ${c.edgeIds.map((id) => `[E:${id}]`).join(' ')}`) : ['_None detected._']), '');
  md.push('## Missing information', '');
  md.push(...(missing.length ? missing.map((m) => `- ${m}`) : ['_No obvious gaps._']), '');
  md.push('## Suggested next steps', '');
  md.push(...next.expand.map((x) => `- Expand ${N(x.nodeId)} — ${x.reason}`), ...next.reviewIdentity.map((x) => `- Review identity hypothesis ${x.label} [E:${x.edgeId}]`), '');
  if (inv.notes.length) {
    md.push('## Analyst notes', '');
    inv.notes.forEach((n) => md.push(`- ${new Date(n.createdAt).toISOString().slice(0, 10)}: ${n.text}`));
    md.push('');
  }
  md.push('## Sources', '');
  [...sources.entries()].sort((a, b) => a[1].platform.localeCompare(b[1].platform)).forEach(([url, s]) =>
    md.push(`- ${s.platform} — ${url} (retrieved ${new Date(s.retrievedAt).toISOString().slice(0, 10)}) ${s.ids.slice(0, 3).map((id) => `[V:${id}]`).join(' ')}`)
  );

  let text = md.join('\n');
  const summary = await llmSummary(inv, text.replace('%%SUMMARY%%', ''));
  text = text.replace('%%SUMMARY%%', summary ? `## Executive summary\n\n_Written by the AI analyst from the sections below._\n\n${summary}\n` : '');
  const checked = finalize(inv, text, summary ? 'llm' : 'rules');
  return { markdown: checked.answer, citations: checked.citations };
}
