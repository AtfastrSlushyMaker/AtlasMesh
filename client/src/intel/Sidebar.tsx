import { useMemo, useState } from 'react';
import { mdiArrowLeft, mdiPlus, mdiMagnify, mdiTune, mdiDelete, mdiShieldAlertOutline, mdiPin } from '@mdi/js';
import type { Investigation, InvestigationSummary, NodeType } from '../../../shared/osint';
import { Icon } from '../shell/Icon';
import { NODE_STYLE, SEED_TYPES, osint } from './model';
import type { GraphFilters } from './GraphView';
import { fmtAgo } from '../lib/format';
import { toast } from '../shell/toast';

export function NewInvestigation({ onCreated, initialSeed, onCancel }: { onCreated: (inv: Investigation, autoExpand: boolean) => void; initialSeed?: { value: string; type?: string } | null; onCancel?: () => void }) {
  const [title, setTitle] = useState('');
  const [objective, setObjective] = useState('');
  const [seed, setSeed] = useState(initialSeed?.value || '');
  const [type, setType] = useState(initialSeed?.type || 'auto');
  const [auto, setAuto] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = SEED_TYPES.find((x) => x.id === type)!;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!seed.trim()) return setError('Add at least one starting point.');
    setBusy(true);
    setError(null);
    try {
      const inv = await osint.create({
        title: title.trim() || seed.trim(),
        objective: objective.trim(),
        seeds: [{ value: seed.trim(), type: type === 'auto' ? undefined : type }],
      });
      onCreated(inv, auto);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h2 className="panel-title">New investigation</h2>
      <label className="field">
        <span>Start from</span>
        <select className="select" value={type} onChange={(e) => setType(e.target.value)}>
          {SEED_TYPES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </label>
      <label className="field">
        <span>{type === 'auto' ? 'Identifier' : t.label}</span>
        <input className="input" value={seed} onChange={(e) => setSeed(e.target.value)} placeholder={t.placeholder} autoFocus aria-invalid={!!error} />
      </label>
      <label className="field">
        <span>Title <span className="faint">(optional)</span></span>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Defaults to the starting point" />
      </label>
      <label className="field">
        <span>Objective <span className="faint">(optional)</span></span>
        <textarea className="textarea" rows={2} value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="What are you trying to establish?" />
      </label>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
        <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
        Query sources right away
      </label>
      {error && <div role="alert" style={{ color: 'var(--bad)', fontSize: 14 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Start investigation'}</button>
        {onCancel && <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>}
      </div>
      <div className="faint" style={{ fontSize: 12.5, display: 'flex', gap: 8 }}>
        <Icon path={mdiShieldAlertOutline} size={16} />
        <span>Uses official APIs and public pages only, respects robots.txt, and never collects home addresses, phone numbers or other sensitive personal data. Intended for professional, research, security and journalistic work.</span>
      </div>
    </form>
  );
}

export function CaseList({ list, current, onOpen, onNew, onDelete }: { list: InvestigationSummary[]; current: string | null; onOpen: (id: string) => void; onNew: () => void; onDelete: (id: string) => void }) {
  return (
    <div className="pad" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 className="panel-title">Investigations</h2>
        <button className="btn btn-sm btn-primary" onClick={onNew}><Icon path={mdiPlus} size={16} />New</button>
      </div>
      {!list.length && <p className="muted" style={{ fontSize: 14 }}>No investigations yet. Start from a person, username, organisation, domain, repository, package or paper.</p>}
      {list.map((c) => (
        <div key={c.id} style={{ display: 'flex', gap: 4 }}>
          <button className="case" aria-current={current === c.id} onClick={() => onOpen(c.id)}>
            <div style={{ fontWeight: 600 }}>{c.title}</div>
            <div className="muted" style={{ fontSize: 13 }}>{c.nodeCount} entities · {c.edgeCount} links · {fmtAgo(c.updatedAt)}</div>
          </button>
          <button className="icon-btn" aria-label={`Delete ${c.title}`} onClick={() => onDelete(c.id)}><Icon path={mdiDelete} size={18} /></button>
        </div>
      ))}
    </div>
  );
}

interface EntitiesProps {
  inv: Investigation;
  filters: GraphFilters;
  setFilters: (f: GraphFilters) => void;
  selected: string[];
  onSelect: (id: string, additive: boolean) => void;
  onBack: () => void;
  refresh: () => Promise<void>;
}

export function EntityPanel({ inv, filters, setFilters, selected, onSelect, onBack, refresh }: EntitiesProps) {
  const [q, setQ] = useState('');
  const [seed, setSeed] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState(inv.settings);

  const degree = useMemo(() => {
    const d = new Map<string, number>();
    for (const e of Object.values(inv.edges)) {
      if (e.review === 'rejected') continue;
      d.set(e.from, (d.get(e.from) || 0) + 1);
      d.set(e.to, (d.get(e.to) || 0) + 1);
    }
    return d;
  }, [inv]);

  const typesPresent = useMemo(() => {
    const c: Partial<Record<NodeType, number>> = {};
    for (const n of Object.values(inv.nodes)) c[n.type] = (c[n.type] || 0) + 1;
    return Object.entries(c).sort((a, b) => (b[1] as number) - (a[1] as number)) as Array<[NodeType, number]>;
  }, [inv]);

  const platforms = useMemo(() => [...new Set(Object.values(inv.evidence).map((e) => e.platform))].filter((p) => p !== 'Analyst').sort(), [inv]);

  const nodes = useMemo(() => {
    const term = q.trim().toLowerCase();
    return Object.values(inv.nodes)
      .filter((n) => (filters.showHidden || !n.hidden) && !filters.types.has(n.type))
      .filter((n) => !term || n.label.toLowerCase().includes(term) || n.key.includes(term))
      .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || Number(inv.seedIds.includes(b.id)) - Number(inv.seedIds.includes(a.id)) || (degree.get(b.id) || 0) - (degree.get(a.id) || 0))
      .slice(0, 300);
  }, [inv, q, filters, degree]);

  const toggleSet = (key: 'types' | 'platforms' | 'claims', v: string) => {
    const next = new Set(filters[key]);
    next.has(v) ? next.delete(v) : next.add(v);
    setFilters({ ...filters, [key]: next });
  };

  const addSeed = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!seed.trim()) return;
    try {
      const r = await osint.addSeed(inv.id, seed.trim());
      setSeed('');
      await refresh();
      onSelect(r.node.id, false);
      toast(`Added ${r.node.label}`, 'success');
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };

  const saveSettings = async () => {
    try {
      await osint.update(inv.id, { settings });
      await refresh();
      setShowSettings(false);
      toast('Limits saved', 'success');
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
      <div className="pad" style={{ paddingBottom: 8 }}>
        <button className="btn btn-ghost btn-sm" onClick={onBack} style={{ marginLeft: -8 }}><Icon path={mdiArrowLeft} size={16} />All investigations</button>
        <h2 className="panel-title" style={{ marginTop: 4 }}>{inv.title}</h2>
        {inv.objective && <p className="muted" style={{ fontSize: 13.5, margin: '4px 0 0' }}>{inv.objective}</p>}
      </div>
      <form onSubmit={addSeed} className="pad" style={{ display: 'flex', gap: 6, paddingTop: 0, paddingBottom: 8 }}>
        <label className="sr-only" htmlFor="addseed">Add a starting point</label>
        <input id="addseed" className="input" value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="Add username, domain, email…" />
        <button className="btn" aria-label="Add starting point"><Icon path={mdiPlus} size={18} /></button>
      </form>

      <div className="pad" style={{ paddingTop: 0, paddingBottom: 8, display: 'flex', gap: 6 }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <span style={{ position: 'absolute', left: 9, top: 10 }}><Icon path={mdiMagnify} size={18} color="var(--paper-4)" /></span>
          <input className="input" style={{ paddingLeft: 32 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find in this investigation" aria-label="Find in this investigation" />
        </div>
        <button className="icon-btn" aria-expanded={showSettings} aria-label="Filters and limits" title="Filters and limits" onClick={() => setShowSettings((s) => !s)} style={{ border: '1px solid var(--line-strong)' }}>
          <Icon path={mdiTune} />
        </button>
      </div>

      {showSettings && (
        <div className="pad" style={{ borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 12, background: 'var(--ink-2)' }}>
          <div>
            <div className="section-title" style={{ marginBottom: 6 }}>Entity types</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {typesPresent.map(([t, n]) => (
                <button key={t} className="filter-chip" aria-pressed={!filters.types.has(t)} onClick={() => toggleSet('types', t)}>
                  <span className="dot" style={{ background: NODE_STYLE[t].color }} />{NODE_STYLE[t].label} {n}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="section-title" style={{ marginBottom: 6 }}>Claims</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {['FACT', 'INFERENCE', 'HYPOTHESIS'].map((c) => (
                <button key={c} className="filter-chip" aria-pressed={!filters.claims.has(c)} onClick={() => toggleSet('claims', c)}>{c.toLowerCase()}</button>
              ))}
            </div>
          </div>
          {platforms.length > 1 && (
            <div>
              <div className="section-title" style={{ marginBottom: 6 }}>Sources</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {platforms.map((p) => <button key={p} className="filter-chip" aria-pressed={!filters.platforms.has(p)} onClick={() => toggleSet('platforms', p)}>{p}</button>)}
              </div>
            </div>
          )}
          <label className="field">
            <span>Minimum confidence: {Math.round(filters.minConfidence * 100)}%</span>
            <input type="range" min={0} max={0.9} step={0.05} value={filters.minConfidence} onChange={(e) => setFilters({ ...filters, minConfidence: Number(e.target.value) })} />
          </label>
          <label style={{ display: 'flex', gap: 8, fontSize: 14 }}><input type="checkbox" checked={filters.showHidden} onChange={(e) => setFilters({ ...filters, showHidden: e.target.checked })} />Show hidden entities</label>
          <label style={{ display: 'flex', gap: 8, fontSize: 14 }}><input type="checkbox" checked={filters.showRejected} onChange={(e) => setFilters({ ...filters, showRejected: e.target.checked })} />Show rejected links</label>
          <hr className="divider" />
          <div className="section-title">Discovery limits</div>
          <label className="field"><span>Max follow depth</span>
            <select className="select" value={settings.maxDepth} onChange={(e) => setSettings({ ...settings, maxDepth: Number(e.target.value) })}>{[1, 2, 3].map((d) => <option key={d} value={d}>{d}</option>)}</select>
          </label>
          <label className="field"><span>Requests per run</span>
            <input className="input" type="number" min={5} max={300} value={settings.maxRequestsPerJob} onChange={(e) => setSettings({ ...settings, maxRequestsPerJob: Number(e.target.value) })} />
          </label>
          <label className="field"><span>Max entities in investigation</span>
            <input className="input" type="number" min={20} max={2000} value={settings.maxNodes} onChange={(e) => setSettings({ ...settings, maxNodes: Number(e.target.value) })} />
          </label>
          <label className="field"><span>Follow links above {Math.round(settings.minConfidence * 100)}% confidence</span>
            <input type="range" min={0.3} max={0.95} step={0.05} value={settings.minConfidence} onChange={(e) => setSettings({ ...settings, minConfidence: Number(e.target.value) })} />
          </label>
          <button className="btn btn-sm" onClick={saveSettings}>Save limits</button>
        </div>
      )}

      <div className="scroll" style={{ flex: 1, padding: '4px 8px 12px' }} role="listbox" aria-label="Entities" aria-multiselectable>
        {nodes.map((n) => {
          const st = NODE_STYLE[n.type];
          return (
            <button key={n.id} className="entity-row" role="option" aria-selected={selected.includes(n.id)} onClick={(e) => onSelect(n.id, e.shiftKey)} style={{ opacity: n.hidden ? 0.5 : 1 }}>
              <Icon path={st.icon} size={16} color={st.color} />
              <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: inv.seedIds.includes(n.id) ? 600 : 400 }}>{n.label}</span>
              {n.pinned && <Icon path={mdiPin} size={14} color="var(--paper-3)" />}
              <span className="faint" style={{ fontSize: 12 }}>{degree.get(n.id) || ''}</span>
            </button>
          );
        })}
        {Object.keys(inv.nodes).length > nodes.length && !q && <div className="faint" style={{ fontSize: 12, padding: 8 }}>Showing {nodes.length} of {Object.keys(inv.nodes).length}. Use search or filters.</div>}
        <div className="faint" style={{ fontSize: 12, padding: 8 }}>Shift-click two entities to find the path between them.</div>
      </div>
    </div>
  );
}
