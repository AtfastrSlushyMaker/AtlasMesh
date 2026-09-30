import type { AnalystAnswer, AnalystCitation, GraphEdge, Investigation } from '../../shared/osint';
import { client } from '../lib/http';
import { buildTimeline, findPath, neighbors, nextSteps, searchNodes, stats, weakClaims } from './analysis';
import { connectorsFor } from './connectors';

/**
 * AI graph analyst. The model never browses: it reasons over the
 * investigation graph through tools and must cite node [N:id], edge [E:id]
 * or evidence [V:id] ids. Citations are validated against the graph before
 * the answer is returned; unknown ids are dropped.
 *
 * Provider: DeepSeek (OpenAI-compatible). Without a key, a rules-based
 * analyst answers the common question shapes deterministically.
 */

const API_URL = (process.env.LLM_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '') + '/chat/completions';
const MODEL = process.env.LLM_MODEL || 'deepseek-chat';
const key = () => process.env.DEEPSEEK_API_KEY || process.env.LLM_API_KEY;

export const analystAvailable = () => !!key();

const SYSTEM = `You are the intelligence analyst inside AtlasMesh, an OSINT workspace.
You answer questions ONLY from the investigation graph, which you inspect with tools. You do not know anything about the subjects beyond what tools return.

Rules:
- Cite every substantive statement with ids from tool results: [N:node_id] for entities, [E:edge_id] for relationships, [V:evidence_id] for evidence.
- Label each conclusion as FACT (a source states it), INFERENCE (derived from several pieces of evidence) or HYPOTHESIS (insufficient evidence). Use the claim and confidence fields from the graph; never upgrade them.
- Say plainly when the graph does not contain the answer and suggest which node to expand next.
- Mention contradictions when they touch the question.
- Never speculate about sensitive traits (health, religion, sexuality, politics, ethnicity, finances), home addresses, phone numbers or family members, even if asked. Decline that part briefly.
- Be concise. Use short paragraphs or bullet lists. No preamble.`;

type Tool = { name: string; description: string; parameters: any; run: (inv: Investigation, args: any) => any };

const compactNode = (inv: Investigation, id: string) => {
  const n = inv.nodes[id];
  if (!n) return null;
  const attrs: Record<string, any> = {};
  for (const [k, v] of Object.entries(n.attributes).slice(0, 12)) attrs[k] = v.map((x) => x.value).slice(0, 3);
  return { id: n.id, type: n.type, label: n.label, key: n.key, attributes: attrs, pinned: !!n.pinned, notes: n.notes.map((x) => x.text).slice(0, 3), expandedWith: n.expandedWith };
};

const compactEdge = (inv: Investigation, e: GraphEdge, withEvidence = false) => ({
  id: e.id,
  type: e.type,
  from: { id: e.from, label: inv.nodes[e.from]?.label },
  to: { id: e.to, label: inv.nodes[e.to]?.label },
  claim: e.claim,
  confidence: e.confidence.score,
  level: e.confidence.level,
  review: e.review,
  validFrom: e.validFrom,
  validTo: e.validTo,
  reasoning: e.reasoning,
  signals: e.confidence.signals.map((s) => `${s.label} (${s.weight >= 0 ? '+' : ''}${s.weight})`),
  evidence: withEvidence
    ? e.evidenceIds.slice(0, 4).map((id) => {
        const v = inv.evidence[id];
        return v && { id: v.id, platform: v.platform, url: v.sourceUrl, excerpt: v.excerpt, date: v.observedDate };
      })
    : e.evidenceIds.slice(0, 4),
});

const TOOLS: Tool[] = [
  {
    name: 'overview',
    description: 'Investigation objective, counts by type and claim, top organisations/people/technologies, sources used.',
    parameters: { type: 'object', properties: {} },
    run: (inv) => ({ title: inv.title, objective: inv.objective, ...stats(inv), seeds: inv.seedIds.map((id) => ({ id, label: inv.nodes[id]?.label })) }),
  },
  {
    name: 'find_nodes',
    description: 'Search entities by name or identifier.',
    parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    run: (inv, a) => searchNodes(inv, String(a.query || ''), 10).map((n) => ({ id: n.id, type: n.type, label: n.label })),
  },
  {
    name: 'get_node',
    description: 'Full attributes of one entity and its relationships with evidence.',
    parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    run: (inv, a) => ({ node: compactNode(inv, a.id), relationships: neighbors(inv, a.id).slice(0, 40).map((x) => compactEdge(inv, x.edge, true)) }),
  },
  {
    name: 'find_path',
    description: 'Evidence-backed path between two entities. mode "strongest" maximises confidence, "shortest" minimises hops.',
    parameters: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' }, mode: { type: 'string', enum: ['strongest', 'shortest'] } }, required: ['from', 'to'] },
    run: (inv, a) => {
      const p = findPath(inv, a.from, a.to, a.mode === 'shortest' ? 'shortest' : 'strongest');
      return p ? { strength: p.strength, steps: p.edgeIds.map((id) => compactEdge(inv, inv.edges[id], true)) } : { error: 'No path between these entities' };
    },
  },
  {
    name: 'list_identity_links',
    description: 'All SAME_ENTITY_AS and POSSIBLY_SAME_ENTITY_AS links with their reasoning and signals.',
    parameters: { type: 'object', properties: {} },
    run: (inv) => Object.values(inv.edges).filter((e) => e.type.includes('SAME_ENTITY')).slice(0, 40).map((e) => compactEdge(inv, e)),
  },
  {
    name: 'list_weak_claims',
    description: 'Hypotheses and weakly supported relationships, weakest first.',
    parameters: { type: 'object', properties: {} },
    run: (inv) => weakClaims(inv, 30).map((e) => compactEdge(inv, e)),
  },
  {
    name: 'list_contradictions',
    description: 'Conflicting evidence detected in the graph.',
    parameters: { type: 'object', properties: {} },
    run: (inv) => inv.contradictions,
  },
  {
    name: 'timeline',
    description: 'Chronological dated events with their edge and evidence ids.',
    parameters: { type: 'object', properties: {} },
    run: (inv) => buildTimeline(inv).slice(-80),
  },
  {
    name: 'next_steps',
    description: 'Unexpanded entities ranked by importance, and identity links awaiting review.',
    parameters: { type: 'object', properties: {} },
    run: (inv) => nextSteps(inv, (n) => connectorsFor(n, inv.settings.enabledConnectors).map((c) => c.id)),
  },
];

export async function ask(inv: Investigation, question: string, focus?: string[]): Promise<AnalystAnswer> {
  if (!analystAvailable()) return rulesAnswer(inv, question, focus);

  const trace: string[] = [];
  const messages: any[] = [
    { role: 'system', content: SYSTEM },
    {
      role: 'user',
      content:
        (focus?.length ? `Selected entities: ${focus.map((id) => `${inv.nodes[id]?.label} [N:${id}]`).join(', ')}\n\n` : '') +
        `Question: ${question.slice(0, 2000)}`,
    },
  ];
  const tools = TOOLS.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));

  for (let round = 0; round < 6; round++) {
    const res = await client.post(
      API_URL,
      { model: MODEL, messages, tools, temperature: 0.2, max_tokens: 1400 },
      { headers: { Authorization: `Bearer ${key()}`, 'Content-Type': 'application/json' }, timeout: 90000 }
    );
    const msg = res.data?.choices?.[0]?.message;
    if (!msg) throw new Error('Empty response from the language model');
    messages.push(msg);
    if (!msg.tool_calls?.length) return finalize(inv, msg.content || '', 'llm', trace);
    for (const call of msg.tool_calls) {
      const tool = TOOLS.find((t) => t.name === call.function?.name);
      let args: any = {};
      try {
        args = JSON.parse(call.function?.arguments || '{}');
      } catch {
        // bad JSON from model
      }
      trace.push(`${call.function?.name}(${Object.values(args).join(', ')})`);
      const result = tool ? tool.run(inv, args) : { error: 'unknown tool' };
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result).slice(0, 24000) });
    }
  }
  messages.push({ role: 'user', content: 'Answer now with what you have, with citations.' });
  const res = await client.post(API_URL, { model: MODEL, messages, temperature: 0.2, max_tokens: 1200 }, { headers: { Authorization: `Bearer ${key()}` }, timeout: 90000 });
  return finalize(inv, res.data?.choices?.[0]?.message?.content || '', 'llm', trace);
}

/** Validate citations and collect them for the UI. */
export function finalize(inv: Investigation, text: string, mode: 'llm' | 'rules', trace?: string[]): AnalystAnswer {
  const citations: AnalystCitation[] = [];
  const seen = new Set<string>();
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();
  const cleaned = text.replace(/\[(N|E|V):([a-z]+_[0-9a-f]+)\]/g, (m, kind, id) => {
    const exists = kind === 'N' ? inv.nodes[id] : kind === 'E' ? inv.edges[id] : inv.evidence[id];
    if (!exists) return '';
    if (!seen.has(id)) {
      seen.add(id);
      const label =
        kind === 'N' ? inv.nodes[id].label :
        kind === 'E' ? `${inv.nodes[inv.edges[id].from]?.label} ${inv.edges[id].type} ${inv.nodes[inv.edges[id].to]?.label}` :
        `${inv.evidence[id].platform}: ${inv.evidence[id].excerpt.slice(0, 60)}`;
      citations.push({ kind: kind === 'N' ? 'node' : kind === 'E' ? 'edge' : 'evidence', id, label });
    }
    if (kind === 'N') nodeIds.add(id);
    if (kind === 'E') {
      edgeIds.add(id);
      nodeIds.add(inv.edges[id].from);
      nodeIds.add(inv.edges[id].to);
    }
    return m;
  });
  return { answer: cleaned.trim(), citations, mode, highlight: { nodeIds: [...nodeIds], edgeIds: [...edgeIds] }, toolTrace: trace };
}

// ---------- Rules-based analyst ----------

const cite = (kind: 'N' | 'E' | 'V', id: string) => `[${kind}:${id}]`;
const edgeLine = (inv: Investigation, e: GraphEdge) =>
  `${inv.nodes[e.from]?.label} ${cite('N', e.from)} **${e.type}** ${inv.nodes[e.to]?.label} ${cite('N', e.to)} — ${e.claim}, ${e.confidence.level} (${Math.round(e.confidence.score * 100)}%) ${cite('E', e.id)}`;

export function rulesAnswer(inv: Investigation, question: string, focus: string[] = []): AnalystAnswer {
  const q = question.toLowerCase();
  const lines: string[] = [];
  const pickTwo = () => {
    if (focus.length >= 2) return [focus[0], focus[1]];
    const m = question.match(/between\s+(.+?)\s+and\s+(.+?)[?.]?$/i) || question.match(/is\s+(.+?)\s+connected to\s+(.+?)[?.]?$/i);
    if (!m) return null;
    const a = searchNodes(inv, m[1].trim(), 1)[0];
    const b = searchNodes(inv, m[2].trim(), 1)[0];
    return a && b ? [a.id, b.id] : null;
  };

  if (/path|connect|link(ed)? to|between/.test(q)) {
    const pair = pickTwo();
    if (!pair) {
      lines.push('Select two entities in the graph (shift-click), or name both, e.g. "path between Alice and Acme".');
    } else {
      const p = findPath(inv, pair[0], pair[1], /short/.test(q) ? 'shortest' : 'strongest');
      if (!p) lines.push(`No evidence-backed path connects ${inv.nodes[pair[0]].label} ${cite('N', pair[0])} and ${inv.nodes[pair[1]].label} ${cite('N', pair[1])} yet. Expanding either entity may reveal one.`);
      else {
        lines.push(`${/short/.test(q) ? 'Shortest' : 'Strongest'} path, ${p.edgeIds.length} step${p.edgeIds.length > 1 ? 's' : ''}, combined confidence ${Math.round(p.strength * 100)}%:`);
        p.edgeIds.forEach((id, i) => lines.push(`${i + 1}. ${edgeLine(inv, inv.edges[id])}`));
        const weakest = p.edgeIds.map((id) => inv.edges[id]).sort((a, b) => a.confidence.score - b.confidence.score)[0];
        if (weakest.claim !== 'FACT') lines.push(`\nThe weakest step is a ${weakest.claim.toLowerCase()} ${cite('E', weakest.id)}; treat the whole path as no stronger than that.`);
      }
    }
  } else if (/same (person|entity)|why .*(believe|think)|belong|identity|merge/.test(q)) {
    const ids = Object.values(inv.edges).filter((e) => e.type.includes('SAME_ENTITY') && (!focus.length || focus.includes(e.from) || focus.includes(e.to)));
    if (!ids.length) lines.push('No identity links have been proposed yet. Expand accounts on different platforms to give the resolver something to compare.');
    for (const e of ids.slice(0, 8)) {
      lines.push(`- ${edgeLine(inv, e)}`);
      if (e.reasoning) lines.push(`  ${e.reasoning}`);
    }
  } else if (/hypothes|weak|uncertain|unverified|shaky/.test(q)) {
    const weak = weakClaims(inv, 12);
    lines.push(weak.length ? 'Weakest claims first:' : 'Every relationship currently rests on a direct source statement.');
    weak.forEach((e) => lines.push(`- ${edgeLine(inv, e)}`));
  } else if (/contradict|conflict|inconsisten/.test(q)) {
    const cs = inv.contradictions.filter((c) => c.status !== 'dismissed');
    lines.push(cs.length ? `${cs.length} contradiction${cs.length > 1 ? 's' : ''}:` : 'No contradictions detected.');
    cs.forEach((c) => lines.push(`- (${c.status}) ${c.description} ${c.edgeIds.map((id) => cite('E', id)).join(' ')} ${c.nodeIds.slice(0, 2).map((id) => cite('N', id)).join(' ')}`));
  } else if (/when|timeline|chronolog|changed|over time|history/.test(q)) {
    const t = buildTimeline(inv).slice(-25);
    lines.push(t.length ? 'Dated events:' : 'No dated evidence yet.');
    t.forEach((ev) => lines.push(`- ${ev.date.slice(0, 10)} — ${ev.label} ${ev.edgeIds.length ? cite('E', ev.edgeIds[0]) : cite('N', ev.nodeIds[0])}${ev.claim !== 'FACT' ? ` (${ev.claim.toLowerCase()})` : ''}`));
  } else if (/next|investigate|what should|suggest|gap|missing/.test(q)) {
    const s = nextSteps(inv, (n) => connectorsFor(n, inv.settings.enabledConnectors).map((c) => c.id));
    lines.push('Suggested next steps:');
    s.expand.forEach((x) => lines.push(`- Expand ${x.label} ${cite('N', x.nodeId)}: ${x.reason}`));
    s.reviewIdentity.forEach((x) => lines.push(`- Review identity hypothesis ${x.label} ${cite('E', x.edgeId)} (${Math.round(x.score * 100)}%)`));
  } else if (/organi[sz]ation|compan|frequent|most|top/.test(q)) {
    const st = stats(inv);
    lines.push('Organisations by number of relationships:');
    st.topOrganizations.forEach((o) => lines.push(`- ${o.label} ${cite('N', o.id)}: ${o.degree}`));
    if (st.topTechnologies.length) lines.push('\nTechnologies:', ...st.topTechnologies.slice(0, 6).map((o) => `- ${o.label} ${cite('N', o.id)}: ${o.degree}`));
  } else {
    // Default: professional footprint summary around the focus or first seed.
    const subject = focus[0] || inv.seedIds[0];
    const n = subject && inv.nodes[subject];
    if (!n) lines.push('Add a starting entity to begin.');
    else {
      lines.push(`Publicly documented footprint of ${n.label} ${cite('N', n.id)}:`);
      const rels = neighbors(inv, n.id).filter((x) => x.edge.review !== 'rejected').sort((a, b) => b.edge.confidence.score - a.edge.confidence.score);
      const facts = rels.filter((x) => x.edge.claim === 'FACT').slice(0, 10);
      const other = rels.filter((x) => x.edge.claim !== 'FACT').slice(0, 6);
      if (facts.length) lines.push('\n**Facts**', ...facts.map((x) => `- ${edgeLine(inv, x.edge)}`));
      if (other.length) lines.push('\n**Inferences and hypotheses**', ...other.map((x) => `- ${edgeLine(inv, x.edge)}`));
      if (!rels.length) lines.push('Nothing found yet. Expand this entity to query sources.');
    }
  }
  lines.push('\n_Rules-based analyst. Set DEEPSEEK_API_KEY on the server for free-form questions._');
  return finalize(inv, lines.join('\n'), 'rules');
}

export async function llmSummary(inv: Investigation, reportContext: string): Promise<string | null> {
  if (!analystAvailable()) return null;
  try {
    const res = await client.post(
      API_URL,
      {
        model: MODEL,
        temperature: 0.2,
        max_tokens: 700,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: `Write a 120-200 word executive summary of this investigation. Cite ids exactly as given. Separate facts from inferences and hypotheses.\n\n${reportContext.slice(0, 30000)}` },
        ],
      },
      { headers: { Authorization: `Bearer ${key()}` }, timeout: 90000 }
    );
    return res.data?.choices?.[0]?.message?.content || null;
  } catch (err: any) {
    console.warn('[osint] summary failed:', err?.message);
    return null;
  }
}
