import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { mdiFitToPageOutline, mdiRadar, mdiStop, mdiGraphOutline } from '@mdi/js';
import type { Investigation, InvestigationSummary } from '../../../shared/osint';
import { Icon } from '../shell/Icon';
import { GraphView, GraphFilters, visibleGraph } from './GraphView';
import { CaseList, EntityPanel, NewInvestigation } from './Sidebar';
import { EdgeDetails, NodeDetails, PathDetails } from './Details';
import { Dock, DockTab } from './Dock';
import { osint, pct } from './model';
import { toast } from '../shell/toast';
import { confirmAction } from '../shell/confirm';
import { RunLocally } from '../shell/RunLocally';
import { setApp, useApp } from '../state';
import { storage } from '../lib/api';
import { parseUrl, syncUrlSoon } from '../lib/url';
import './intel.css';

const emptyFilters = (): GraphFilters => ({ types: new Set(), platforms: new Set(), claims: new Set(), minConfidence: 0, showHidden: false, showRejected: false });

type MView = 'cases' | 'graph' | 'details' | 'dock';

function KeyGate({ onUnlock }: { onUnlock: () => void }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    osint.setKey(value.trim());
    const r = await osint.access().catch(() => null);
    if (r?.ok) onUnlock();
    else setError('That key was not accepted.');
  };
  return (
    <div className="intel" style={{ display: 'grid', placeItems: 'center', gridTemplateAreas: 'none', gridTemplateColumns: '1fr', gridTemplateRows: '1fr' }}>
      <form className="panel pad" onSubmit={submit} style={{ width: 'min(400px, calc(100% - 32px))', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 className="panel-title">Intel workspace access</h2>
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>This server protects investigations with an access key. Ask whoever runs it for the key.</p>
        <label className="field">
          <span>Access key</span>
          <input className="input" type="password" value={value} onChange={(e) => setValue(e.target.value)} autoFocus aria-invalid={!!error} autoComplete="current-password" />
        </label>
        {error && <div role="alert" style={{ color: 'var(--bad)', fontSize: 14 }}>{error}</div>}
        <button className="btn btn-primary" disabled={!value.trim()}>Unlock</button>
      </form>
    </div>
  );
}

export default function Workspace() {
  const [access, setAccess] = useState<'checking' | 'ok' | 'locked' | 'showcase' | 'unavailable'>('checking');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let disposed = false;
    setAccess('checking');
    osint.access().then((r) => {
      if (!disposed) setAccess(r.showcase ? 'showcase' : r.ok ? 'ok' : 'locked');
    }).catch(() => {
      if (!disposed) setAccess('unavailable');
    });
    return () => { disposed = true; };
  }, [attempt]);
  if (access === 'checking') return <div className="intel" style={{ display: 'grid', placeItems: 'center' }}><div className="spinner" /></div>;
  if (access === 'unavailable') {
    return (
      <div className="intel" style={{ display: 'grid', placeItems: 'center' }}>
        <div className="panel pad" role="alert" style={{ maxWidth: 440 }}>
          <h2 className="panel-title">The Intel workspace can’t connect</h2>
          <p className="muted">The server couldn’t confirm workspace access. Check the connection and try again.</p>
          <button className="btn btn-primary" onClick={() => setAttempt((n) => n + 1)}>Try again</button>
        </div>
      </div>
    );
  }
  if (access === 'showcase') {
    return (
      <div className="intel scroll" style={{ display: 'block', gridTemplateAreas: 'none' }}>
        <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 20px' }}>
          <h1 className="panel-title" style={{ fontSize: 32, marginBottom: 10 }}>The Intel workspace runs on your own computer</h1>
          <p style={{ marginTop: 0 }}>
            Investigations query outside services and can use a paid AI model, so this public demo leaves them off. Run AtlasMesh locally to map public information about handles, domains, organisations, repositories and papers, with every link tied to its source.
          </p>
          <RunLocally compact />
        </div>
      </div>
    );
  }
  if (access === 'locked') return <KeyGate onUnlock={() => setAccess('ok')} />;
  return <WorkspaceInner />;
}

function WorkspaceInner() {
  const [list, setList] = useState<InvestigationSummary[]>([]);
  const [invId, setInvId] = useState<string | null>(() => storage.get('intel:last', null));
  const [inv, setInv] = useState<Investigation | null>(null);
  const [job, setJob] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [highlight, setHighlight] = useState<{ nodeIds: string[]; edgeIds: string[] } | null>(null);
  const [filters, setFilters] = useState<GraphFilters>(emptyFilters);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [dockTab, setDockTab] = useState<DockTab>('analyst');
  const [dockOpen, setDockOpen] = useState(true);
  const [fit, setFit] = useState(0);
  const [llm, setLlm] = useState(false);
  const [mview, setMview] = useState<MView>('graph');
  const seedFromGlobe = useApp((s) => s.intelSeed);
  const request = useRef<{ id: string; controller: AbortController } | null>(null);
  const currentId = useRef(invId);
  const prevJob = useRef<any>(null);
  currentId.current = invId;

  const loadList = useCallback(() => osint.list().then((r) => setList(r.investigations)).catch(() => {}), []);

  const refresh = useCallback(async () => {
    if (!invId || currentId.current !== invId || request.current?.id === invId) return;
    request.current?.controller.abort();
    const pending = { id: invId, controller: new AbortController() };
    request.current = pending;
    try {
      const full = await osint.get(invId, { signal: pending.controller.signal });
      if (request.current !== pending || currentId.current !== invId) return;
      setInv(full);
      setJob(full.runningJob);
    } catch (err: any) {
      if (request.current !== pending || pending.controller.signal.aborted || currentId.current !== invId) return;
      if (err.status === 404) {
        setInvId(null);
        setInv(null);
      } else toast(err.message, 'error');
    } finally {
      if (request.current === pending) request.current = null;
    }
  }, [invId]);

  useEffect(() => {
    loadList();
    osint.connectors().then((r) => setLlm(r.analyst.llm)).catch(() => {});
  }, []);

  useEffect(() => {
    storage.set('intel:last', invId);
    syncUrlSoon();
    setSelected([]);
    setHighlight(null);
    setCollapsed(new Set());
    setFilters(emptyFilters());
    setInv(null);
    setJob(null);
    prevJob.current = null;
    if (invId) {
      refresh();
      setMview('graph');
    } else setMview('cases');
    return () => {
      request.current?.controller.abort();
      request.current = null;
    };
  }, [invId]);

  // Globe → Intel hand-off opens the new-investigation form prefilled.
  useEffect(() => {
    if (seedFromGlobe) {
      setCreating(true);
      setInvId(null);
    }
  }, [seedFromGlobe]);

  // Poll while a discovery job runs
  useEffect(() => {
    if (!job || job.status !== 'running') return;
    const t = setInterval(refresh, 1500);
    return () => clearInterval(t);
  }, [job?.id, job?.status, refresh]);

  useEffect(() => {
    if (prevJob.current && !job) {
      const done = inv?.jobs.find((j) => j.id === prevJob.current.id);
      if (done) toast(`Discovery ${done.status === 'done' ? 'finished' : done.status}: +${done.nodesAdded} entities, +${done.edgesAdded} links`, done.status === 'failed' ? 'error' : 'success');
      loadList();
    }
    prevJob.current = job;
  }, [job]);

  useEffect(() => {
    const onHash = () => {
      const parsed = parseUrl();
      if (parsed.mode === 'intel' && parsed.inv) setInvId(parsed.inv);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const expand = useCallback(async (nodeId: string, opts: { depth?: number; connectors?: string[]; force?: boolean } = {}) => {
    if (!inv) return;
    try {
      const r = await osint.expand(inv.id, nodeId, opts);
      if (currentId.current !== inv.id) return;
      setJob(r.job);
      if (window.innerWidth >= 900) setDockTab('log');
      toast(`Querying sources for ${inv.nodes[nodeId]?.label}`, 'info');
    } catch (err: any) {
      toast(err.message, 'error');
    }
  }, [inv]);

  const onCreated = async (created: Investigation, autoExpand: boolean) => {
    setCreating(false);
    setApp({ intelSeed: null });
    await loadList();
    setInvId(created.id);
    if (autoExpand && created.seedIds[0]) {
      try {
        const r = await osint.expand(created.id, created.seedIds[0], { depth: 1 });
        setJob(r.job);
        setDockTab('log');
      } catch (err: any) {
        toast(err.message, 'error');
      }
    }
  };

  const remove = async (id: string) => {
    const c = list.find((x) => x.id === id);
    if (!(await confirmAction({ title: `Delete “${c?.title}”?`, body: 'Its graph, evidence, notes and reports are removed permanently. This can’t be undone.', confirm: 'Delete Investigation' }))) return;
    await osint.remove(id);
    if (invId === id) setInvId(null);
    loadList();
    toast('Investigation deleted', 'success');
  };

  const select = useCallback((id: string | null, kind: 'node' | 'edge' | null, additive = false) => {
    setHighlight(null);
    if (!id) return setSelected([]);
    setSelected((cur) => {
      if (additive && kind === 'node') {
        if (cur.includes(id)) return cur.filter((x) => x !== id);
        const nodes = cur.filter((x) => x.startsWith('n_'));
        return [...nodes.slice(-1), id];
      }
      return [id];
    });
    if (window.innerWidth < 900) setMview('details');
  }, []);

  const onCite = useCallback((kind: 'node' | 'edge' | 'evidence', id: string) => {
    if (!inv) return;
    if (kind === 'evidence') {
      const edge = Object.values(inv.edges).find((e) => e.evidenceIds.includes(id));
      const node = Object.values(inv.nodes).find((n) => n.evidenceIds.includes(id));
      if (edge) select(edge.id, 'edge');
      else if (node) select(node.id, 'node');
      return;
    }
    select(id, kind);
    setHighlight(kind === 'edge' && inv.edges[id] ? { nodeIds: [inv.edges[id].from, inv.edges[id].to], edgeIds: [id] } : { nodeIds: [id], edgeIds: [] });
  }, [inv, select]);

  const cancel = async () => {
    if (inv && job) {
      await osint.cancel(inv.id, job.id);
      toast('Stopping after the current request', 'info');
    }
  };

  const visibleCount = useMemo(() => (inv ? visibleGraph(inv, filters, collapsed).nodes.length : 0), [inv, filters, collapsed]);
  const selNode = inv && selected.length === 1 ? inv.nodes[selected[0]] : null;
  const selEdge = inv && selected.length === 1 ? inv.edges[selected[0]] : null;
  const pathPair = inv && selected.length === 2 && selected.every((id) => inv.nodes[id]) ? selected : null;
  const jobRunning = !!job && job.status === 'running';

  return (
    <div className="intel" data-dock={dockOpen ? 'open' : 'closed'} data-mview={mview}>
      <div className="mobile-tabs tabs" role="tablist">
        {(['cases', 'graph', 'details', 'dock'] as MView[]).map((v) => (
          <button key={v} role="tab" className="tab" aria-selected={mview === v} onClick={() => setMview(v)} disabled={v !== 'cases' && !inv}>
            {v === 'cases' ? 'Cases' : v === 'graph' ? 'Graph' : v === 'details' ? 'Details' : 'Analysis'}
          </button>
        ))}
      </div>

      <aside className="intel-side" aria-label="Investigations">
        {creating || (!inv && !invId && !list.length) ? (
          <div className="scroll">
            <NewInvestigation onCreated={onCreated} initialSeed={seedFromGlobe} onCancel={list.length ? () => { setCreating(false); setApp({ intelSeed: null }); } : undefined} />
          </div>
        ) : inv ? (
          <EntityPanel inv={inv} filters={filters} setFilters={setFilters} selected={selected} onSelect={(id, add) => select(id, 'node', add)} onBack={() => { setInvId(null); loadList(); }} refresh={refresh} />
        ) : (
          <div className="scroll"><CaseList list={list} current={invId} onOpen={setInvId} onNew={() => setCreating(true)} onDelete={remove} /></div>
        )}
      </aside>

      <main className="intel-graph">
        {inv ? (
          <>
            <GraphView inv={inv} filters={filters} selected={selected} highlight={highlight} collapsed={collapsed} onSelect={select} onExpand={(id) => expand(id, { depth: 1 })} fitSignal={fit} />
            <div className="graph-toolbar">
              <div className="panel" style={{ padding: '6px 10px', fontSize: 13.5, boxShadow: 'none' }}>
                {visibleCount} of {Object.keys(inv.nodes).length} entities · {Object.keys(inv.evidence).length} evidence records
              </div>
              <span style={{ flex: 1 }} />
              {highlight && <button className="btn btn-sm" onClick={() => setHighlight(null)}>Clear highlight</button>}
              <button className="btn btn-sm" onClick={() => setFit((f) => f + 1)}><Icon path={mdiFitToPageOutline} size={16} />Fit</button>
            </div>
            {jobRunning && (
              <div className="job-banner panel rise" role="status">
                <div className="spinner" />
                <span style={{ fontSize: 14 }}>{job.log?.at(-1)?.message || 'Querying sources'}</span>
                <span className="faint" style={{ fontSize: 12 }}>{job.requests}/{inv.settings.maxRequestsPerJob} requests</span>
                <button className="btn btn-sm" onClick={cancel}><Icon path={mdiStop} size={16} />Stop</button>
              </div>
            )}
            {Object.keys(inv.edges).length === 0 && !jobRunning && (
              <div className="empty" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
                <div className="panel" style={{ padding: 20, maxWidth: 380, pointerEvents: 'auto' }}>
                  <h3 className="panel-title" style={{ fontSize: 18 }}>Nothing discovered yet</h3>
                  <p className="muted" style={{ fontSize: 14 }}>Query public sources for the starting point. You choose which leads to follow after that.</p>
                  <button className="btn btn-primary" onClick={() => inv.seedIds[0] && expand(inv.seedIds[0], { depth: 1 })}><Icon path={mdiRadar} size={18} />Discover from {inv.nodes[inv.seedIds[0]]?.label}</button>
                </div>
              </div>
            )}
            <div className="graph-legend panel" style={{ boxShadow: 'none' }}>
              <span><span className="legend-line" />Fact</span>
              <span><span className="legend-line" style={{ borderTopStyle: 'dashed', borderColor: 'var(--inference)' }} />Inference</span>
              <span><span className="legend-line" style={{ borderTopStyle: 'dotted', borderColor: 'var(--hypothesis)' }} />Hypothesis</span>
              <span><span className="legend-line" style={{ borderColor: 'var(--accent-line)' }} />Identity link</span>
              <span className="faint">Double-click to discover</span>
            </div>
          </>
        ) : (
          <div className="empty">
            <div style={{ maxWidth: 440 }}>
              <Icon path={mdiGraphOutline} size={40} color="var(--text-4)" />
              <h2 className="panel-title" style={{ margin: '10px 0 6px' }}>Map public information into an evidence graph</h2>
              <p className="muted">Start from a name, handle, email, domain, repository, package or paper. Every link keeps its source, and AtlasMesh marks what a source states, what it infers and what is only a hypothesis.</p>
              {!creating && <button className="btn btn-primary" onClick={() => setCreating(true)}>New investigation</button>}
            </div>
          </div>
        )}
      </main>

      <aside className="intel-details" aria-label="Details">
        <div className="scroll" style={{ flex: 1 }}>
          {!inv ? (
            <div className="pad muted" style={{ fontSize: 14 }}>Details about the selected entity or relationship appear here.</div>
          ) : pathPair ? (
            <PathDetails inv={inv} a={pathPair[0]} b={pathPair[1]} onHighlight={setHighlight} select={(id, k) => select(id, k)} />
          ) : selEdge ? (
            <EdgeDetails edge={selEdge} inv={inv} refresh={refresh} select={(id, k) => select(id, k)} onExpand={expand} jobRunning={jobRunning} />
          ) : selNode ? (
            <NodeDetails
              node={selNode}
              inv={inv}
              refresh={refresh}
              select={(id, k) => select(id, k)}
              onExpand={expand}
              jobRunning={jobRunning}
              collapsed={collapsed.has(selNode.id)}
              toggleCollapse={() => setCollapsed((c) => { const n = new Set(c); n.has(selNode.id) ? n.delete(selNode.id) : n.add(selNode.id); return n; })}
            />
          ) : (
            <Overview inv={inv} select={(id, k) => select(id, k)} expand={expand} jobRunning={jobRunning} />
          )}
        </div>
      </aside>

      {inv && (
        <Dock inv={inv} tab={dockTab} setTab={setDockTab} open={dockOpen} setOpen={setDockOpen} onCite={onCite} onHighlight={setHighlight} focus={selected.filter((id) => inv.nodes[id])} llm={llm} job={job} onCancel={cancel} refresh={refresh} />
      )}
    </div>
  );
}

function Overview({ inv, select, expand, jobRunning }: { inv: Investigation; select: (id: string, k: 'node' | 'edge') => void; expand: (id: string, o?: any) => void; jobRunning: boolean }) {
  const [ins, setIns] = useState<any>(null);
  useEffect(() => {
    osint.insights(inv.id).then(setIns).catch(() => {});
  }, [inv]);
  if (!ins) return <div className="pad"><div className="spinner" /></div>;
  const s = ins.stats;
  return (
    <div className="pad" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h2 className="panel-title">Overview</h2>
        <p className="muted" style={{ fontSize: 13.5, margin: '4px 0 0' }}>Select an entity or link in the graph to inspect its evidence.</p>
      </div>
      <dl className="kv">
        <dt>Entities</dt><dd>{s.nodes}</dd>
        <dt>Relationships</dt><dd>{s.edges}</dd>
        <dt>Facts</dt><dd style={{ color: 'var(--fact)' }}>{s.claims.FACT}</dd>
        <dt>Inferences</dt><dd style={{ color: 'var(--inference)' }}>{s.claims.INFERENCE}</dd>
        <dt>Hypotheses</dt><dd style={{ color: 'var(--hypothesis)' }}>{s.claims.HYPOTHESIS}</dd>
        <dt>Sources used</dt><dd>{Object.keys(s.sources).filter((x) => x !== 'Analyst').join(', ') || '—'}</dd>
      </dl>
      {ins.next.reviewIdentity.length > 0 && (
        <section>
          <h3 className="section-title" style={{ marginBottom: 6 }}>Identity links to review</h3>
          {ins.next.reviewIdentity.map((x: any) => (
            <button key={x.edgeId} className="entity-row" onClick={() => select(x.edgeId, 'edge')}>
              <span className="dot" style={{ background: 'var(--accent-line)' }} />
              <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.label}</span>
              <span className="faint" style={{ fontSize: 12 }}>{pct(x.score)}</span>
            </button>
          ))}
        </section>
      )}
      {ins.next.expand.length > 0 && (
        <section>
          <h3 className="section-title" style={{ marginBottom: 6 }}>Worth expanding next</h3>
          {ins.next.expand.map((x: any) => (
            <div key={x.nodeId} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button className="entity-row" style={{ flex: 1 }} onClick={() => select(x.nodeId, 'node')}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.label}</div>
                  <div className="faint" style={{ fontSize: 12 }}>{x.reason}</div>
                </span>
              </button>
              <button className="icon-btn" disabled={jobRunning} aria-label={`Discover from ${x.label}`} title="Discover" onClick={() => expand(x.nodeId, { depth: 1 })}><Icon path={mdiRadar} size={18} /></button>
            </div>
          ))}
        </section>
      )}
      {s.topOrganizations.length > 0 && (
        <section>
          <h3 className="section-title" style={{ marginBottom: 6 }}>Most connected organisations</h3>
          {s.topOrganizations.slice(0, 6).map((o: any) => (
            <button key={o.id} className="entity-row" onClick={() => select(o.id, 'node')}>
              <span style={{ flex: 1 }}>{o.label}</span><span className="faint" style={{ fontSize: 12 }}>{o.degree}</span>
            </button>
          ))}
        </section>
      )}
    </div>
  );
}
