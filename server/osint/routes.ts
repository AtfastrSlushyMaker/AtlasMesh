import express, { Request, Response, NextFunction } from 'express';
import type { Investigation, InvestigationSettings, NodeType } from '../../shared/osint';
import { repo, newId } from './repository';
import { connectorInfo, connectorsFor } from './connectors';
import { detectSeed, nodeKey, normDomain } from './normalize';
import { addEvidence, upsertNode } from './ingest';
import { startExpansion, cancelJob, getRunningJob } from './orchestrator';
import { buildTimeline, findPath, nextSteps, stats } from './analysis';
import { rescoreAll } from './confidence';
import { detectContradictions } from './analysis';
import { ask, analystAvailable } from './analyst';
import { buildReport } from './report';

/**
 * Investigation workspace API. Mounted at /api/osint.
 */
export const osintRouter = express.Router();

/**
 * Optional access gate. When OSINT_ACCESS_KEY is set, every Intel request
 * must send it in the x-atlas-key header. Without it anyone who can reach
 * the server can run investigations (and spend the LLM key), so production
 * deployments should set it.
 */
const ACCESS_KEY = process.env.OSINT_ACCESS_KEY;
if (!ACCESS_KEY && process.env.NODE_ENV === 'production') {
  console.warn('[osint] OSINT_ACCESS_KEY is not set: the Intel workspace is open to anyone who can reach this server.');
}
osintRouter.get('/access', (req, res) => {
  res.json({ required: !!ACCESS_KEY, ok: !ACCESS_KEY || req.get('x-atlas-key') === ACCESS_KEY });
});
osintRouter.use((req, res, next) => {
  if (!ACCESS_KEY || req.get('x-atlas-key') === ACCESS_KEY) return next();
  res.status(401).json({ error: 'This workspace needs an access key.', code: 'access_key' });
});

const DEFAULT_SETTINGS: InvestigationSettings = {
  maxDepth: 2,
  maxNodes: 400,
  maxRequestsPerJob: 60,
  minConfidence: 0.6,
  enabledConnectors: null,
};

// ---------- tiny per-IP rate limiter for expensive endpoints ----------
const buckets = new Map<string, { tokens: number; at: number }>();
function limit(perMinute: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const k = `${req.ip}:${req.baseUrl}${req.route?.path}`;
    const now = Date.now();
    const b = buckets.get(k) ?? { tokens: perMinute, at: now };
    b.tokens = Math.min(perMinute, b.tokens + ((now - b.at) / 60000) * perMinute);
    b.at = now;
    if (b.tokens < 1) {
      res.setHeader('Retry-After', '10');
      return res.status(429).json({ error: 'Too many requests. Wait a few seconds and try again.' });
    }
    b.tokens -= 1;
    buckets.set(k, b);
    next();
  };
}

const load = (req: Request, res: Response): Investigation | null => {
  const inv = repo.get(req.params.id);
  if (!inv) {
    res.status(404).json({ error: 'Investigation not found' });
    return null;
  }
  return inv;
};

const SEED_TYPES: NodeType[] = ['person', 'organization', 'university', 'account', 'email', 'domain', 'website', 'repository', 'package', 'paper', 'project', 'event'];

function addSeed(inv: Investigation, value: string, type?: NodeType) {
  const raw = String(value || '').trim().slice(0, 300);
  if (!raw) throw new Error('Enter something to start from');
  let seed = type && type !== 'account' && type !== 'package' && type !== 'repository' ? null : detectSeed(raw);
  if (!seed) {
    const t = (SEED_TYPES.includes(type as NodeType) ? type : 'person') as NodeType;
    const v = t === 'domain' ? normDomain(raw) || raw : raw;
    seed = { type: t, value: v, label: raw };
  }
  const key = nodeKey(seed.type, seed.value, seed.type === 'person' ? 'seed' : undefined);
  if (!key) throw new Error(`"${raw}" is not a valid ${seed.type}`);
  const ev = addEvidence(inv, { id: 'analyst', platform: 'Analyst', reliability: 1 }, {
    sourceUrl: 'analyst://seed',
    excerpt: `Starting point entered by the analyst: ${raw}`,
    method: 'analyst',
  });
  const { node } = upsertNode(inv, seed.type, key, seed.label, ev, { depth: 0, discoveredBy: 'analyst' });
  if (!inv.seedIds.includes(node.id)) inv.seedIds.push(node.id);
  return node;
}

osintRouter.get('/connectors', (_req, res) => res.json({ connectors: connectorInfo(), analyst: { llm: analystAvailable(), provider: analystAvailable() ? 'DeepSeek' : null } }));

osintRouter.get('/investigations', (_req, res) => res.json({ investigations: repo.list() }));

osintRouter.post('/investigations', (req, res) => {
  const { title, objective, seeds, settings } = req.body || {};
  const inv: Investigation = {
    id: newId('inv'),
    title: String(title || 'Untitled investigation').slice(0, 120),
    objective: String(objective || '').slice(0, 2000),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    settings: { ...DEFAULT_SETTINGS, ...sanitizeSettings(settings) },
    seedIds: [],
    nodes: {},
    edges: {},
    evidence: {},
    contradictions: [],
    notes: [],
    jobs: [],
  };
  try {
    for (const s of (Array.isArray(seeds) ? seeds : []).slice(0, 10)) addSeed(inv, s.value, s.type);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
  repo.save(inv);
  res.status(201).json(inv);
});

osintRouter.get('/investigations/:id', (req, res) => {
  const inv = load(req, res);
  if (inv) res.json({ ...inv, runningJob: getRunningJob(inv.id) ?? null });
});

osintRouter.patch('/investigations/:id', (req, res) => {
  const inv = load(req, res);
  if (!inv) return;
  const { title, objective, settings } = req.body || {};
  if (typeof title === 'string') inv.title = title.slice(0, 120);
  if (typeof objective === 'string') inv.objective = objective.slice(0, 2000);
  if (settings) inv.settings = { ...inv.settings, ...sanitizeSettings(settings) };
  repo.save(inv);
  res.json({ ok: true, settings: inv.settings });
});

osintRouter.delete('/investigations/:id', (req, res) => {
  res.json({ deleted: repo.delete(req.params.id) });
});

osintRouter.post('/investigations/:id/seeds', (req, res) => {
  const inv = load(req, res);
  if (!inv) return;
  try {
    const node = addSeed(inv, req.body?.value, req.body?.type);
    repo.save(inv);
    res.status(201).json({ node });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

osintRouter.post('/investigations/:id/nodes/:nodeId/expand', limit(20), (req, res) => {
  const inv = load(req, res);
  if (!inv) return;
  const node = inv.nodes[req.params.nodeId];
  if (!node) return res.status(404).json({ error: 'Entity not found' });
  const running = getRunningJob(inv.id);
  if (running) return res.status(409).json({ error: 'A discovery job is already running for this investigation', job: running });
  const available = connectorsFor(node, req.body?.connectors ?? inv.settings.enabledConnectors);
  if (!available.length) return res.status(422).json({ error: `No connected source can expand a ${node.type}` });
  const job = startExpansion(inv, node.id, {
    depth: Number(req.body?.depth) || 1,
    connectors: Array.isArray(req.body?.connectors) ? req.body.connectors : undefined,
    force: !!req.body?.force,
  });
  res.status(202).json({ job });
});

osintRouter.get('/investigations/:id/nodes/:nodeId/connectors', (req, res) => {
  const inv = load(req, res);
  if (!inv) return;
  const node = inv.nodes[req.params.nodeId];
  if (!node) return res.status(404).json({ error: 'Entity not found' });
  res.json({ connectors: connectorsFor(node, null).map((c) => ({ id: c.id, name: c.name, done: node.expandedWith.includes(c.id) })) });
});

osintRouter.get('/investigations/:id/jobs/:jobId', (req, res) => {
  const inv = load(req, res);
  if (!inv) return;
  const job = inv.jobs.find((j) => j.id === req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json({ job });
});

osintRouter.post('/investigations/:id/jobs/:jobId/cancel', (req, res) => {
  res.json({ cancelled: cancelJob(req.params.jobId) });
});

osintRouter.patch('/investigations/:id/nodes/:nodeId', (req, res) => {
  const inv = load(req, res);
  if (!inv) return;
  const node = inv.nodes[req.params.nodeId];
  if (!node) return res.status(404).json({ error: 'Entity not found' });
  const { pinned, hidden, note, label } = req.body || {};
  if (typeof pinned === 'boolean') node.pinned = pinned;
  if (typeof hidden === 'boolean') node.hidden = hidden;
  if (typeof label === 'string' && label.trim()) node.label = label.trim().slice(0, 140);
  if (typeof note === 'string' && note.trim()) node.notes.push({ id: newId('note'), text: note.trim().slice(0, 2000), createdAt: Date.now() });
  repo.save(inv);
  res.json({ node });
});

osintRouter.patch('/investigations/:id/edges/:edgeId', (req, res) => {
  const inv = load(req, res);
  if (!inv) return;
  const edge = inv.edges[req.params.edgeId];
  if (!edge) return res.status(404).json({ error: 'Relationship not found' });
  const { review, note } = req.body || {};
  if (['unreviewed', 'verified', 'rejected', 'uncertain'].includes(review)) {
    edge.review = review;
    if (review === 'verified' && edge.type === 'POSSIBLY_SAME_ENTITY_AS') edge.type = 'SAME_ENTITY_AS';
    const ev = addEvidence(inv, { id: 'analyst', platform: 'Analyst', reliability: 1 }, { sourceUrl: 'analyst://review', excerpt: `Analyst marked this relationship ${review}`, method: 'analyst' });
    if (!edge.evidenceIds.includes(ev.id)) edge.evidenceIds.push(ev.id);
  }
  if (typeof note === 'string' && note.trim()) edge.notes.push({ id: newId('note'), text: note.trim().slice(0, 2000), createdAt: Date.now() });
  detectContradictions(inv);
  rescoreAll(inv);
  repo.save(inv);
  res.json({ edge });
});

osintRouter.patch('/investigations/:id/contradictions/:cid', (req, res) => {
  const inv = load(req, res);
  if (!inv) return;
  const c = inv.contradictions.find((x) => x.id === req.params.cid);
  if (!c) return res.status(404).json({ error: 'Contradiction not found' });
  if (['temporal', 'unresolved', 'dismissed'].includes(req.body?.status)) c.status = req.body.status;
  rescoreAll(inv);
  repo.save(inv);
  res.json({ contradiction: c });
});

osintRouter.post('/investigations/:id/notes', (req, res) => {
  const inv = load(req, res);
  if (!inv) return;
  const text = String(req.body?.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Note is empty' });
  inv.notes.push({ id: newId('note'), text: text.slice(0, 4000), createdAt: Date.now() });
  repo.save(inv);
  res.status(201).json({ notes: inv.notes });
});

osintRouter.get('/investigations/:id/timeline', (req, res) => {
  const inv = load(req, res);
  if (inv) res.json({ events: buildTimeline(inv) });
});

osintRouter.get('/investigations/:id/path', (req, res) => {
  const inv = load(req, res);
  if (!inv) return;
  const p = findPath(inv, String(req.query.from), String(req.query.to), req.query.mode === 'shortest' ? 'shortest' : 'strongest');
  if (!p) return res.status(404).json({ error: 'No evidence-backed path connects these entities' });
  res.json({ path: p });
});

osintRouter.get('/investigations/:id/insights', (req, res) => {
  const inv = load(req, res);
  if (!inv) return;
  res.json({
    stats: stats(inv),
    next: nextSteps(inv, (n) => connectorsFor(n, inv.settings.enabledConnectors).map((c) => c.id)),
  });
});

osintRouter.post('/investigations/:id/ask', limit(12), async (req, res) => {
  const inv = load(req, res);
  if (!inv) return;
  const question = String(req.body?.question || '').trim();
  if (!question) return res.status(400).json({ error: 'Ask a question about the investigation' });
  try {
    const focus = Array.isArray(req.body?.focus) ? req.body.focus.filter((id: string) => inv.nodes[id]).slice(0, 5) : [];
    res.json(await ask(inv, question, focus));
  } catch (err: any) {
    const status = err?.response?.status;
    console.warn('[osint] analyst error:', err?.response?.data || err?.message);
    res.status(502).json({ error: status === 401 ? 'The language model rejected the API key. Check DEEPSEEK_API_KEY.' : status === 402 ? 'The DeepSeek account has no balance left.' : 'The analyst could not answer. Try again, or ask a narrower question.' });
  }
});

osintRouter.post('/investigations/:id/report', limit(6), async (req, res) => {
  const inv = load(req, res);
  if (!inv) return;
  try {
    res.json(await buildReport(inv));
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Report failed' });
  }
});

osintRouter.get('/investigations/:id/export', (req, res) => {
  const inv = load(req, res);
  if (!inv) return;
  res.setHeader('Content-Disposition', `attachment; filename="${inv.title.replace(/[^\w-]+/g, '_')}.json"`);
  res.json(inv);
});

function sanitizeSettings(s: any): Partial<InvestigationSettings> {
  if (!s || typeof s !== 'object') return {};
  const out: Partial<InvestigationSettings> = {};
  const n = (v: any, lo: number, hi: number) => (Number.isFinite(Number(v)) ? Math.max(lo, Math.min(hi, Number(v))) : undefined);
  if (s.maxDepth != null) out.maxDepth = n(s.maxDepth, 1, 3);
  if (s.maxNodes != null) out.maxNodes = n(s.maxNodes, 20, 2000);
  if (s.maxRequestsPerJob != null) out.maxRequestsPerJob = n(s.maxRequestsPerJob, 5, 300);
  if (s.minConfidence != null) out.minConfidence = n(s.minConfidence, 0, 1);
  if (s.enabledConnectors === null || Array.isArray(s.enabledConnectors)) out.enabledConnectors = s.enabledConnectors;
  for (const k of Object.keys(out) as (keyof InvestigationSettings)[]) if (out[k] === undefined) delete out[k];
  return out;
}
