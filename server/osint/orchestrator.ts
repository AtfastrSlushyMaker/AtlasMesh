import type { AxiosRequestConfig } from 'axios';
import type { GraphNode, Investigation, Job, NodeType } from '../../shared/osint';
import type { Connector, ConnectorContext } from './connectors/types';
import { connectorsFor } from './connectors';
import { ingest } from './ingest';
import { resolveIdentities } from './resolve';
import { detectContradictions } from './analysis';
import { rescoreAll } from './confidence';
import { repo, newId } from './repository';
import { robotsAllows, safeFetchPage, safeGet, SafetyError } from './safety';

/**
 * Discovery orchestration: controlled, budgeted, breadth-first expansion.
 *
 * Depth 1 means "run connectors on the chosen node only". Deeper levels only
 * follow nodes of high-value types that were reached through edges above the
 * confidence threshold, so a weak name match never snowballs into a crawl.
 */

const lastCall = new Map<string, number>();

async function throttle(connector: Connector) {
  const wait = (lastCall.get(connector.id) ?? 0) + connector.minIntervalMs - Date.now();
  lastCall.set(connector.id, Math.max(Date.now(), (lastCall.get(connector.id) ?? 0) + connector.minIntervalMs));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

const FOLLOW_TYPES: NodeType[] = ['account', 'person', 'organization', 'university', 'repository', 'domain', 'website', 'package', 'paper'];

export interface ExpandOptions {
  depth?: number;
  connectors?: string[];
  force?: boolean;
}

const running = new Map<string, { job: Job; signal: { cancelled: boolean } }>();

export function getRunningJob(invId: string) {
  for (const r of running.values()) if (r.job.investigationId === invId) return r.job;
  return undefined;
}

export function cancelJob(jobId: string) {
  const r = running.get(jobId);
  if (!r) return false;
  r.signal.cancelled = true;
  return true;
}

export function startExpansion(inv: Investigation, nodeId: string, opts: ExpandOptions = {}): Job {
  const existing = getRunningJob(inv.id);
  if (existing) return existing;
  const job: Job = {
    id: newId('job'),
    investigationId: inv.id,
    seedNodeId: nodeId,
    status: 'queued',
    startedAt: Date.now(),
    requests: 0,
    nodesAdded: 0,
    edgesAdded: 0,
    log: [],
  };
  inv.jobs.unshift(job);
  inv.jobs = inv.jobs.slice(0, 30);
  const signal = { cancelled: false };
  running.set(job.id, { job, signal });
  run(inv, job, nodeId, opts, signal)
    .catch((err) => {
      job.status = 'failed';
      job.log.push({ at: Date.now(), level: 'error', message: err?.message || String(err) });
    })
    .finally(() => {
      job.finishedAt = Date.now();
      running.delete(job.id);
      if (repo.get(inv.id) === inv) repo.save(inv);
    });
  return job;
}

async function run(inv: Investigation, job: Job, seedId: string, opts: ExpandOptions, signal: { cancelled: boolean }) {
  job.status = 'running';
  const settings = inv.settings;
  const maxDepth = Math.max(1, Math.min(opts.depth ?? 1, settings.maxDepth));
  const seed = inv.nodes[seedId];
  if (!seed) throw new Error('Node not found');

  const log = (message: string, level: 'info' | 'warn' | 'error' = 'info', extra: { connector?: string; nodeId?: string } = {}) => {
    job.log.push({ at: Date.now(), level, message, ...extra });
    if (job.log.length > 300) job.log.splice(0, job.log.length - 300);
  };

  const makeCtx = (connector: Connector, node: GraphNode): ConnectorContext => {
    const beforeRequest = async () => {
      if (signal.cancelled) throw new Error('cancelled');
      if (job.requests >= settings.maxRequestsPerJob) throw new BudgetError();
      await throttle(connector);
      if (signal.cancelled) throw new Error('cancelled');
      if (job.requests >= settings.maxRequestsPerJob) throw new BudgetError();
      job.requests++;
    };
    return {
      signal,
      log: (m, level = 'info') => log(m, level, { connector: connector.id, nodeId: node.id }),
      async get<T>(url: string, config: AxiosRequestConfig = {}): Promise<T> {
        const { response } = await safeGet(url, { timeout: 20000, ...config }, false, beforeRequest);
        return response.data as T;
      },
      async getPage(url: string) {
        if (signal.cancelled) throw new Error('cancelled');
        if (job.requests >= settings.maxRequestsPerJob) throw new BudgetError();
        if (!(await robotsAllows(url, beforeRequest))) {
          log(`robots.txt disallows ${url}; skipped`, 'warn', { connector: connector.id, nodeId: node.id });
          return null;
        }
        return safeFetchPage(url, undefined, beforeRequest);
      },
    };
  };

  const queue: Array<{ id: string; level: number }> = [{ id: seedId, level: 1 }];
  const visited = new Set<string>();

  while (queue.length && !signal.cancelled) {
    const { id, level } = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const node = inv.nodes[id];
    if (!node) continue;

    let list = connectorsFor(node, opts.connectors ?? settings.enabledConnectors);
    if (!opts.force || id !== seedId) list = list.filter((c) => !node.expandedWith.includes(c.id));
    if (!list.length) {
      if (id === seedId) log(`No new sources can expand ${node.label}`, 'info', { nodeId: id });
      continue;
    }

    for (const connector of list) {
      if (signal.cancelled) break;
      if (job.requests >= settings.maxRequestsPerJob) {
        log(`Request budget of ${settings.maxRequestsPerJob} reached — stopping`, 'warn');
        signal.cancelled = true;
        break;
      }
      log(`${connector.name}: querying for ${node.label}`, 'info', { connector: connector.id, nodeId: id });
      try {
        const output = await connector.run(node, makeCtx(connector, node));
        if (!node.expandedWith.includes(connector.id)) node.expandedWith.push(connector.id);
        const res = ingest(inv, node, connector, output, settings.maxNodes);
        job.nodesAdded += res.newNodes.length;
        job.edgesAdded += res.newEdges.length;
        log(`${connector.name}: +${res.newNodes.length} nodes, +${res.newEdges.length} relationships`, 'info', { connector: connector.id, nodeId: id });
        for (const n of output.notes || []) log(n, 'info', { connector: connector.id, nodeId: id });

        if (level < maxDepth) {
          for (const e of res.newEdges) {
            const other = e.from === id ? e.to : e.to === id ? e.from : null;
            const target = other ?? (res.newNodes.some((n) => n.id === e.to) ? e.to : null);
            const t = target ? inv.nodes[target] : null;
            if (t && FOLLOW_TYPES.includes(t.type) && e.confidence.score >= settings.minConfidence && !t.hidden) queue.push({ id: t.id, level: level + 1 });
          }
        }
        if (repo.get(inv.id) === inv) repo.save(inv);
      } catch (err: any) {
        if (err instanceof BudgetError) {
          log(`Request budget of ${settings.maxRequestsPerJob} reached — stopping`, 'warn');
          signal.cancelled = true;
          break;
        }
        if (err?.message === 'cancelled') break;
        const status = err?.response?.status;
        const msg = err instanceof SafetyError ? `blocked by safety policy: ${err.message}` : status === 429 || status === 403 ? `rate limited by ${connector.platform} (HTTP ${status}); try again later` : status === 404 ? 'no record found' : err?.message || String(err);
        if (status === 404) node.expandedWith.push(connector.id);
        log(`${connector.name}: ${msg}`, status === 404 ? 'info' : 'warn', { connector: connector.id, nodeId: id });
      }
      if (Object.keys(inv.nodes).length >= settings.maxNodes) {
        log(`Node limit of ${settings.maxNodes} reached — stopping`, 'warn');
        signal.cancelled = true;
      }
    }
  }

  const r = resolveIdentities(inv);
  if (r.created) log(`Entity resolution: ${r.created} new identity link${r.created > 1 ? 's' : ''} proposed`);
  detectContradictions(inv);
  rescoreAll(inv);
  job.status = signal.cancelled && job.log.every((l) => !/budget|limit/.test(l.message)) ? 'cancelled' : 'done';
  log(`Finished: ${job.nodesAdded} nodes, ${job.edgesAdded} relationships, ${job.requests} requests`);
}

class BudgetError extends Error {}
