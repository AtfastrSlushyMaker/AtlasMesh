import { useEffect, useMemo, useState } from 'react';
import {
  mdiPin, mdiPinOutline, mdiEyeOff, mdiEye, mdiOpenInNew, mdiCheckCircleOutline, mdiCloseCircleOutline,
  mdiHelpRhombusOutline, mdiArrowCollapse, mdiArrowExpand, mdiEarth, mdiVectorPolyline, mdiRadar,
} from '@mdi/js';
import type { ClaimKind, Evidence, GraphEdge, GraphNode, Investigation } from '../../../shared/osint';
import { Icon } from '../shell/Icon';
import { CLAIM_COLOR, CLAIM_TEXT, NODE_STYLE, edgeLabel, osint, pct, relText } from './model';
import { fmtAgo, fmtDate, titleCase } from '../lib/format';
import { toast } from '../shell/toast';
import { getViewer, setApp } from '../state';
import { flyTo } from '../globe/engine';

export function ClaimBadge({ claim }: { claim: ClaimKind }) {
  return (
    <span className="claim" style={{ color: CLAIM_COLOR[claim] }} title={CLAIM_TEXT[claim]}>
      {claim}
    </span>
  );
}

export function ConfidenceMeter({ score, level }: { score: number; level: string }) {
  const color = score >= 0.72 ? 'var(--fact)' : score >= 0.5 ? 'var(--inference)' : score >= 0.25 ? 'var(--hypothesis)' : 'var(--bad)';
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
        <span style={{ textTransform: 'capitalize' }}>{level} confidence</span>
        <span className="muted">{pct(score)}</span>
      </div>
      <div className="meter" role="meter" aria-valuenow={Math.round(score * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Confidence">
        <span style={{ width: `${score * 100}%`, background: color }} />
      </div>
    </div>
  );
}

export function EvidenceCard({ ev }: { ev: Evidence }) {
  const internal = ev.sourceUrl.startsWith('analyst://');
  return (
    <div className="evidence">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <strong>{ev.platform}</strong>
        <span className="faint" style={{ fontSize: 12 }}>{ev.method}{ev.selfReported ? ' · self-reported' : ''}</span>
      </div>
      <blockquote>{ev.excerpt}</blockquote>
      <div className="muted" style={{ fontSize: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <span>Retrieved {fmtAgo(ev.retrievedAt)}</span>
        {ev.observedDate && <span>Refers to {fmtDate(ev.observedDate, false)}</span>}
        <span>Source reliability {pct(ev.reliability)}</span>
      </div>
      {!internal && (
        <a href={ev.sourceUrl} target="_blank" rel="noreferrer" style={{ fontSize: 13, display: 'inline-flex', gap: 4, alignItems: 'center', marginTop: 6, overflowWrap: 'anywhere' }}>
          {ev.sourceUrl.replace(/^https?:\/\//, '').slice(0, 70)} <Icon path={mdiOpenInNew} size={13} />
        </a>
      )}
    </div>
  );
}

interface Common {
  inv: Investigation;
  refresh: () => Promise<void>;
  select: (id: string, kind: 'node' | 'edge') => void;
  onExpand: (nodeId: string, opts?: { depth?: number; connectors?: string[]; force?: boolean }) => void;
  jobRunning: boolean;
}

export function EdgeDetails({ edge, inv, refresh, select }: Common & { edge: GraphEdge }) {
  const [note, setNote] = useState('');
  const from = inv.nodes[edge.from];
  const to = inv.nodes[edge.to];
  const review = async (status: string) => {
    try {
      await osint.patchEdge(inv.id, edge.id, { review: status });
      await refresh();
      toast(status === 'verified' ? 'Marked verified' : status === 'rejected' ? 'Rejected — hidden from the graph and analysis' : status === 'uncertain' ? 'Marked uncertain' : 'Review cleared', 'success');
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };
  const addNote = async () => {
    if (!note.trim()) return;
    await osint.patchEdge(inv.id, edge.id, { note });
    setNote('');
    refresh();
  };
  const evidence = edge.evidenceIds.map((id) => inv.evidence[id]).filter(Boolean);
  const identity = edge.type.includes('SAME_ENTITY');
  return (
    <div className="pad" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div className="muted" style={{ fontSize: 13, marginBottom: 4 }}>{identity ? 'Identity link' : 'Relationship'}</div>
        <h2 className="panel-title" style={{ fontSize: 19, lineHeight: 1.25 }}>
          <button className="btn-link" onClick={() => select(edge.from, 'node')}>{from?.label}</button>{' '}
          <span className="muted" style={{ fontWeight: 500 }}>{relText(edge.type)}</span>{' '}
          <button className="btn-link" onClick={() => select(edge.to, 'node')}>{to?.label}</button>
        </h2>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <ClaimBadge claim={edge.claim} />
        <span className="muted" style={{ fontSize: 13 }}>{CLAIM_TEXT[edge.claim]}</span>
      </div>
      <ConfidenceMeter score={edge.confidence.score} level={edge.confidence.level} />
      {(edge.validFrom || edge.validTo) && (
        <div style={{ fontSize: 14 }}>
          <span className="muted">Valid </span>
          {edge.validFrom ? fmtDate(edge.validFrom, false) : 'unknown start'} – {edge.validTo ? fmtDate(edge.validTo, false) : 'present or unknown'}
        </div>
      )}
      {edge.reasoning && <p style={{ margin: 0, fontSize: 14 }}>{edge.reasoning}</p>}

      <section>
        <h3 className="section-title" style={{ marginBottom: 4 }}>Why this confidence</h3>
        {edge.confidence.signals.map((s) => (
          <div className="signal" key={s.id}>
            <span>{s.label}</span>
            <span style={{ color: s.weight > 0 ? 'var(--fact)' : s.weight < 0 ? 'var(--bad)' : 'var(--text-3)' }}>{s.weight > 0 ? '+' : ''}{Math.round(s.weight * 100)}</span>
            {s.detail && <span className="muted" style={{ gridColumn: '1 / -1', fontSize: 12.5 }}>{s.detail}</span>}
          </div>
        ))}
      </section>

      <section>
        <h3 className="section-title" style={{ marginBottom: 8 }}>Your review</h3>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className="btn btn-sm" aria-pressed={edge.review === 'verified'} style={edge.review === 'verified' ? { borderColor: 'var(--fact)', color: 'var(--fact)' } : undefined} onClick={() => review(edge.review === 'verified' ? 'unreviewed' : 'verified')}>
            <Icon path={mdiCheckCircleOutline} size={16} />Verified
          </button>
          <button className="btn btn-sm" aria-pressed={edge.review === 'uncertain'} style={edge.review === 'uncertain' ? { borderColor: 'var(--hypothesis)', color: 'var(--hypothesis)' } : undefined} onClick={() => review(edge.review === 'uncertain' ? 'unreviewed' : 'uncertain')}>
            <Icon path={mdiHelpRhombusOutline} size={16} />Uncertain
          </button>
          <button className="btn btn-sm" aria-pressed={edge.review === 'rejected'} style={edge.review === 'rejected' ? { borderColor: 'var(--bad)', color: 'var(--bad)' } : undefined} onClick={() => review(edge.review === 'rejected' ? 'unreviewed' : 'rejected')}>
            <Icon path={mdiCloseCircleOutline} size={16} />Reject
          </button>
        </div>
      </section>

      <section>
        <h3 className="section-title" style={{ marginBottom: 8 }}>Evidence ({evidence.length})</h3>
        {evidence.map((ev) => <EvidenceCard key={ev.id} ev={ev} />)}
        <div className="faint" style={{ fontSize: 12, marginTop: 6 }}>First seen {fmtAgo(edge.firstObserved)} · last seen {fmtAgo(edge.lastObserved)}</div>
      </section>

      <Notes notes={edge.notes} value={note} setValue={setNote} onAdd={addNote} />
    </div>
  );
}

function Notes({ notes, value, setValue, onAdd }: { notes: Array<{ id: string; text: string; createdAt: number }>; value: string; setValue: (v: string) => void; onAdd: () => void }) {
  return (
    <section>
      <h3 className="section-title" style={{ marginBottom: 8 }}>Analyst notes</h3>
      {notes.map((n) => (
        <div key={n.id} style={{ fontSize: 14, padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
          {n.text}
          <div className="faint" style={{ fontSize: 12 }}>{fmtDate(n.createdAt)}</div>
        </div>
      ))}
      <label className="field" style={{ marginTop: 8 }}>
        <span className="sr-only">Add a note</span>
        <textarea className="textarea" rows={2} value={value} onChange={(e) => setValue(e.target.value)} placeholder="What did you check? What's still open?" />
      </label>
      <button className="btn btn-sm" style={{ marginTop: 6 }} disabled={!value.trim()} onClick={onAdd}>Add note</button>
    </section>
  );
}

export function NodeDetails({ node, inv, refresh, select, onExpand, jobRunning, collapsed, toggleCollapse }: Common & { node: GraphNode; collapsed: boolean; toggleCollapse: () => void }) {
  const [conns, setConns] = useState<Array<{ id: string; name: string; done: boolean }> | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [depth, setDepth] = useState(1);
  const [note, setNote] = useState('');
  const [openAttr, setOpenAttr] = useState<string | null>(null);
  const st = NODE_STYLE[node.type];

  useEffect(() => {
    let alive = true;
    setConns(null);
    osint.nodeConnectors(inv.id, node.id).then((r) => {
      if (!alive) return;
      setConns(r.connectors);
      setChosen(new Set(r.connectors.filter((c) => !c.done).map((c) => c.id)));
    }).catch(() => alive && setConns([]));
    return () => {
      alive = false;
    };
  }, [node.id, node.expandedWith.length]);

  const rels = useMemo(
    () =>
      Object.values(inv.edges)
        .filter((e) => e.from === node.id || e.to === node.id)
        .sort((a, b) => b.confidence.score - a.confidence.score),
    [inv, node.id]
  );

  const patch = async (body: any, msg?: string) => {
    try {
      await osint.patchNode(inv.id, node.id, body);
      await refresh();
      if (msg) toast(msg, 'success');
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };

  const pending = conns?.filter((c) => !c.done) ?? [];
  const attrs = Object.entries(node.attributes).filter(([k]) => !['avatarUrl'].includes(k));
  const avatar = node.attributes.avatarUrl?.[0]?.value as string | undefined;
  const profile = (node.attributes.profileUrl?.[0]?.value || node.attributes.url?.[0]?.value) as string | undefined;

  return (
    <div className="pad" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 12 }}>
        {avatar && <img src={avatar} alt="" width={48} height={48} style={{ borderRadius: node.type === 'account' ? '50%' : 6, flexShrink: 0, background: 'var(--surface-3)' }} referrerPolicy="no-referrer" />}
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: st.color, fontSize: 13, fontWeight: 500 }}>
            <Icon path={st.icon} size={16} />{st.label}{inv.seedIds.includes(node.id) ? ' · starting point' : ''}
          </div>
          <h2 className="panel-title" style={{ overflowWrap: 'anywhere' }}>{node.label}</h2>
          <div className="faint" style={{ fontSize: 12, overflowWrap: 'anywhere' }}>{node.key}</div>
        </div>
      </div>

      <section className="panel" style={{ padding: 12, boxShadow: 'none', background: 'var(--surface-2)' }}>
        <h3 className="section-title" style={{ marginBottom: 8 }}>Discover more</h3>
        {conns === null ? (
          <div className="spinner" />
        ) : conns.length === 0 ? (
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>No connected source can look up a {st.label.toLowerCase()} yet.</p>
        ) : (
          <>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {conns.map((c) => (
                <button key={c.id} className="toggle-chip" aria-pressed={chosen.has(c.id)} onClick={() => setChosen((s) => { const n = new Set(s); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; })} title={c.done ? 'Already queried; select to query again' : 'Not yet queried'}>
                  {c.name}{c.done ? <span className="faint"> · done</span> : null}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select className="select" style={{ width: 'auto' }} value={depth} onChange={(e) => setDepth(Number(e.target.value))} aria-label="How far to follow new leads">
                <option value={1}>This entity only</option>
                <option value={2}>Follow strong leads 1 step</option>
                <option value={3}>Follow strong leads 2 steps</option>
              </select>
              <button
                className="btn btn-primary"
                disabled={jobRunning || chosen.size === 0}
                onClick={() => onExpand(node.id, { depth, connectors: [...chosen], force: [...chosen].some((id) => conns.find((c) => c.id === id)?.done) })}
                title={jobRunning ? 'Wait for the current discovery to finish' : undefined}
              >
                <Icon path={mdiRadar} size={18} />Discover
              </button>
            </div>
            <p className="faint" style={{ fontSize: 12, margin: '8px 0 0' }}>
              {pending.length ? `${pending.length} source${pending.length > 1 ? 's' : ''} not yet queried.` : 'All sources queried.'} Deeper steps only follow links above the confidence threshold and stop at the request budget.
            </p>
          </>
        )}
      </section>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button className="btn btn-sm" onClick={() => patch({ pinned: !node.pinned }, node.pinned ? 'Unpinned' : 'Pinned')}>
          <Icon path={node.pinned ? mdiPin : mdiPinOutline} size={16} />{node.pinned ? 'Unpin' : 'Pin'}
        </button>
        <button className="btn btn-sm" onClick={() => patch({ hidden: !node.hidden }, node.hidden ? 'Shown again' : 'Hidden — find it with “Show hidden”')}>
          <Icon path={node.hidden ? mdiEye : mdiEyeOff} size={16} />{node.hidden ? 'Unhide' : 'Hide'}
        </button>
        <button className="btn btn-sm" onClick={toggleCollapse} title="Hide neighbours that connect only through this entity">
          <Icon path={collapsed ? mdiArrowExpand : mdiArrowCollapse} size={16} />{collapsed ? 'Expand' : 'Collapse'}
        </button>
        {node.geo && (
          <button className="btn btn-sm" onClick={() => { setApp({ mode: 'globe' }); setTimeout(() => { const v = getViewer(); if (v) flyTo(v, node.geo!.lat, node.geo!.lon, 30000); }, 50); }}>
            <Icon path={mdiEarth} size={16} />On globe
          </button>
        )}
        {profile && <a className="btn btn-sm" href={profile} target="_blank" rel="noreferrer">Open profile<Icon path={mdiOpenInNew} size={14} /></a>}
      </div>

      {attrs.length > 0 && (
        <section>
          <h3 className="section-title" style={{ marginBottom: 6 }}>What sources say</h3>
          <dl className="kv" style={{ fontSize: 14 }}>
            {attrs.map(([k, values]) => (
              <div key={k} style={{ display: 'contents' }}>
                <dt>{titleCase(k)}</dt>
                <dd>
                  {values.map((v, i) => (
                    <div key={i} style={{ color: values.length > 1 ? 'var(--hypothesis)' : undefined }}>
                      {typeof v.value === 'string' && /^https?:\/\//.test(v.value) ? <a href={v.value} target="_blank" rel="noreferrer">{v.value.replace(/^https?:\/\//, '').slice(0, 48)}</a> : typeof v.value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v.value) ? fmtDate(v.value, false) : String(v.value)}
                      <button className="cite cite-evidence" onClick={() => setOpenAttr(openAttr === `${k}${i}` ? null : `${k}${i}`)} aria-expanded={openAttr === `${k}${i}`}>
                        {v.evidenceIds.length} source{v.evidenceIds.length > 1 ? 's' : ''}
                      </button>
                      {openAttr === `${k}${i}` && v.evidenceIds.map((id) => inv.evidence[id] && <EvidenceCard key={id} ev={inv.evidence[id]} />)}
                    </div>
                  ))}
                  {values.length > 1 && <div className="faint" style={{ fontSize: 12 }}>Sources disagree</div>}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <section>
        <h3 className="section-title" style={{ marginBottom: 6 }}>Relationships ({rels.length})</h3>
        {rels.slice(0, 60).map((e) => {
          const other = inv.nodes[e.from === node.id ? e.to : e.from];
          return (
            <button key={e.id} className="entity-row" onClick={() => select(e.id, 'edge')} style={{ opacity: e.review === 'rejected' ? 0.45 : 1 }}>
              <span className="dot" style={{ background: CLAIM_COLOR[e.claim] }} title={e.claim} />
              <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                <span className="muted">{e.from === node.id ? relText(e.type) : `← ${relText(e.type)}`}</span> {other?.label}
              </span>
              <span className="faint" style={{ fontSize: 12 }}>{pct(e.confidence.score)}</span>
            </button>
          );
        })}
        {rels.length > 60 && <div className="faint" style={{ fontSize: 12 }}>{rels.length - 60} more in the graph</div>}
      </section>

      <section>
        <h3 className="section-title" style={{ marginBottom: 6 }}>Evidence for this entity</h3>
        {node.evidenceIds.slice(0, 6).map((id) => inv.evidence[id] && <EvidenceCard key={id} ev={inv.evidence[id]} />)}
        <div className="faint" style={{ fontSize: 12, marginTop: 6 }}>Discovered by {node.discoveredBy} {fmtAgo(node.firstObserved)} · depth {node.depth}</div>
      </section>

      <Notes notes={node.notes} value={note} setValue={setNote} onAdd={async () => { await patch({ note }); setNote(''); }} />
    </div>
  );
}

export function PathDetails({ inv, a, b, onHighlight, select }: { inv: Investigation; a: string; b: string; onHighlight: (h: { nodeIds: string[]; edgeIds: string[] } | null) => void; select: (id: string, kind: 'node' | 'edge') => void }) {
  const [mode, setMode] = useState<'strongest' | 'shortest'>('strongest');
  const [path, setPath] = useState<{ nodeIds: string[]; edgeIds: string[]; strength: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setError(null);
    osint.path(inv.id, a, b, mode).then((r) => {
      if (!alive) return;
      setPath(r.path);
      onHighlight(r.path);
    }).catch((err) => {
      if (!alive) return;
      setPath(null);
      setError(err.message);
      onHighlight(null);
    });
    return () => {
      alive = false;
    };
  }, [a, b, mode, inv]);
  return (
    <div className="pad" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <div className="muted" style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}><Icon path={mdiVectorPolyline} size={16} />Discovery path</div>
        <h2 className="panel-title" style={{ fontSize: 19 }}>{inv.nodes[a]?.label} → {inv.nodes[b]?.label}</h2>
      </div>
      <div className="seg" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <button aria-pressed={mode === 'strongest'} onClick={() => setMode('strongest')}>Strongest evidence</button>
        <button aria-pressed={mode === 'shortest'} onClick={() => setMode('shortest')}>Fewest steps</button>
      </div>
      {error && <p className="muted">{error}. Expand either entity to find more connections.</p>}
      {path && (
        <>
          <div className="muted" style={{ fontSize: 14 }}>{path.edgeIds.length} step{path.edgeIds.length > 1 ? 's' : ''} · combined confidence {pct(path.strength)}</div>
          <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {path.edgeIds.map((id) => {
              const e = inv.edges[id];
              return (
                <li key={id}>
                  <button className="btn-link" style={{ textAlign: 'left' }} onClick={() => select(id, 'edge')}>{edgeLabel(inv, e)}</button>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                    <ClaimBadge claim={e.claim} />
                    <span className="muted" style={{ fontSize: 13 }}>{pct(e.confidence.score)} · {e.evidenceIds.length} evidence</span>
                  </div>
                  {e.evidenceIds[0] && inv.evidence[e.evidenceIds[0]] && <div className="faint" style={{ fontSize: 12.5, marginTop: 4 }}>“{inv.evidence[e.evidenceIds[0]].excerpt.slice(0, 140)}”</div>}
                </li>
              );
            })}
          </ol>
          <p className="faint" style={{ fontSize: 12 }}>A path is only as strong as its weakest step. Click a step to inspect its evidence.</p>
        </>
      )}
    </div>
  );
}
