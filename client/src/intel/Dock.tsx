import { useEffect, useMemo, useRef, useState } from 'react';
import { mdiRobotOutline, mdiSend, mdiDownload, mdiContentCopy, mdiChevronDown, mdiChevronUp, mdiStop } from '@mdi/js';
import type { AnalystAnswer, Investigation, TimelineEvent } from '../../../shared/osint';
import { Icon } from '../shell/Icon';
import { Markdown, CiteHandler } from './Markdown';
import { ClaimBadge } from './Details';
import { osint } from './model';
import { fmtAgo, fmtDate } from '../lib/format';
import { toast } from '../shell/toast';

export type DockTab = 'analyst' | 'timeline' | 'contradictions' | 'report' | 'log';

const EXAMPLES = [
  'Summarize the publicly documented professional footprint.',
  'Why do you believe these accounts belong to the same person?',
  'Which relationships are only hypotheses?',
  'What organisations appear most often?',
  'What changed over time?',
  'What should I investigate next?',
];

interface Props {
  inv: Investigation;
  tab: DockTab;
  setTab: (t: DockTab) => void;
  open: boolean;
  setOpen: (o: boolean) => void;
  onCite: CiteHandler;
  onHighlight: (h: { nodeIds: string[]; edgeIds: string[] } | null) => void;
  focus: string[];
  llm: boolean;
  job: any | null;
  onCancel: () => void;
  refresh: () => Promise<void>;
}

function Analyst({ inv, onCite, onHighlight, focus, llm }: Pick<Props, 'inv' | 'onCite' | 'onHighlight' | 'focus' | 'llm'>) {
  const [q, setQ] = useState('');
  const [thread, setThread] = useState<Array<{ q: string; a?: AnalystAnswer; error?: string }>>([]);
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setThread([]);
  }, [inv.id]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [thread.length, busy]);

  const ask = async (question: string) => {
    const text = question.trim();
    if (!text || busy) return;
    setQ('');
    setBusy(true);
    setThread((t) => [...t, { q: text }]);
    try {
      const a = await osint.ask(inv.id, text, focus);
      setThread((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, a } : x)));
      if (a.highlight?.nodeIds.length) onHighlight(a.highlight);
    } catch (err: any) {
      setThread((t) => t.map((x, i) => (i === t.length - 1 ? { ...x, error: err.message } : x)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div className="scroll pad chat" style={{ flex: 1 }}>
        {!thread.length && (
          <div>
            <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>
              The analyst reasons over this investigation's graph only and cites the entities, links and sources it used.
              {llm ? ' Answers come from DeepSeek; confidence levels come from the graph, not the model.' : ' No language model is configured, so a rules-based analyst answers common questions.'}
              {focus.length ? ` Selected: ${focus.map((id) => inv.nodes[id]?.label).filter(Boolean).join(', ')}.` : ''}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {EXAMPLES.map((e) => <button key={e} className="filter-chip" onClick={() => ask(e)}>{e}</button>)}
            </div>
          </div>
        )}
        {thread.map((t, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="bubble-q">{t.q}</div>
            {t.a && (
              <div className="bubble-a">
                <div className="ai-label"><Icon path={mdiRobotOutline} size={14} />{t.a.mode === 'llm' ? 'AI analyst' : 'Rules-based analyst'} · {t.a.citations.length} citation{t.a.citations.length === 1 ? '' : 's'}</div>
                <Markdown text={t.a.answer} inv={inv} onCite={onCite} />
                {t.a.toolTrace?.length ? <details className="faint" style={{ fontSize: 12 }}><summary>How it looked this up</summary>{t.a.toolTrace.join(' → ')}</details> : null}
              </div>
            )}
            {t.error && <div style={{ color: 'var(--bad)', fontSize: 14 }}>{t.error}</div>}
          </div>
        ))}
        {busy && <div className="ai-label"><div className="spinner" />Reading the graph…</div>}
        <div ref={end} />
      </div>
      <form className="pad" style={{ display: 'flex', gap: 8, borderTop: '1px solid var(--line)', paddingTop: 10, paddingBottom: 10 }} onSubmit={(e) => { e.preventDefault(); ask(q); }}>
        <label className="sr-only" htmlFor="ask">Ask the analyst</label>
        <input id="ask" className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={focus.length >= 2 ? 'How are the selected entities connected?' : 'Ask about this investigation'} autoComplete="off" />
        <button className="btn btn-primary" disabled={!q.trim() || busy} aria-label="Ask"><Icon path={mdiSend} size={18} /></button>
      </form>
    </div>
  );
}

function Timeline({ inv, onCite }: Pick<Props, 'inv' | 'onCite'>) {
  const [events, setEvents] = useState<TimelineEvent[] | null>(null);
  useEffect(() => {
    osint.timeline(inv.id).then((r) => setEvents(r.events)).catch(() => setEvents([]));
  }, [inv]);
  if (!events) return <div className="pad"><div className="spinner" /></div>;
  if (!events.length) return <div className="pad muted">No dated evidence yet. Account creation dates, employment periods, publications and domain registrations appear here as sources are queried.</div>;
  const years = new Map<string, TimelineEvent[]>();
  for (const e of events) (years.get(e.date.slice(0, 4)) ?? years.set(e.date.slice(0, 4), []).get(e.date.slice(0, 4))!).push(e);
  return (
    <div className="scroll pad" style={{ height: '100%' }}>
      {[...years.entries()].map(([y, list]) => (
        <section key={y}>
          <div className="timeline-year">{y}</div>
          <ul className="timeline">
            {list.map((ev) => (
              <li key={ev.id}>
                <button className="timeline-item" onClick={() => (ev.edgeIds[0] ? onCite('edge', ev.edgeIds[0]) : onCite('node', ev.nodeIds[0]))}>
                  <span className="muted">{fmtDate(ev.date, false).replace(/, \d{4}$/, '')}</span>
                  <span>{ev.label} {ev.claim !== 'FACT' && <ClaimBadge claim={ev.claim} />}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Contradictions({ inv, onCite, onHighlight, refresh }: Pick<Props, 'inv' | 'onCite' | 'onHighlight' | 'refresh'>) {
  const list = inv.contradictions;
  if (!list.length) return <div className="pad muted">No conflicting evidence detected. When sources disagree (two current employers, different locations, one email for different names) both sides are kept and listed here.</div>;
  const set = async (id: string, status: string) => {
    try {
      await osint.patchContradiction(inv.id, id, status);
      await refresh();
      toast(status === 'dismissed' ? 'Dismissed' : 'Updated', 'success');
    } catch (err: any) {
      toast(err.message, 'error');
    }
  };
  return (
    <div className="scroll pad" style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {list.map((c) => (
        <div key={c.id} className="evidence" style={{ opacity: c.status === 'dismissed' ? 0.5 : 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <strong style={{ textTransform: 'capitalize' }}>{c.kind}</strong>
            <span className="chip" style={{ color: c.status === 'unresolved' ? 'var(--bad)' : 'var(--text-3)' }}>{c.status === 'temporal' ? 'Explained by dates' : c.status}</span>
          </div>
          <p style={{ margin: '6px 0' }}>{c.description}</p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button className="btn btn-sm" onClick={() => onHighlight({ nodeIds: c.nodeIds, edgeIds: c.edgeIds })}>Show in graph</button>
            {c.edgeIds.map((id) => <button key={id} className="cite cite-edge" onClick={() => onCite('edge', id)}>evidence</button>)}
            {c.status !== 'dismissed' && <button className="btn btn-sm btn-ghost" onClick={() => set(c.id, 'dismissed')}>Dismiss</button>}
          </div>
        </div>
      ))}
    </div>
  );
}

function Report({ inv, onCite }: Pick<Props, 'inv' | 'onCite'>) {
  const [md, setMd] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setMd(null);
  }, [inv.id]);
  const generate = async () => {
    setBusy(true);
    try {
      setMd((await osint.report(inv.id)).markdown);
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };
  const download = () => {
    const blob = new Blob([md || ''], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${inv.title.replace(/[^\w-]+/g, '_')}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div className="pad" style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--line)', paddingTop: 10, paddingBottom: 10 }}>
        <button className="btn btn-primary" onClick={generate} disabled={busy}>{busy ? 'Writing report…' : md ? 'Regenerate report' : 'Generate report'}</button>
        {md && <button className="btn" onClick={download}><Icon path={mdiDownload} size={16} />Download .md</button>}
        {md && <button className="btn" onClick={() => navigator.clipboard.writeText(md).then(() => toast('Report copied', 'success'))}><Icon path={mdiContentCopy} size={16} />Copy</button>}
      </div>
      <div className="scroll pad" style={{ flex: 1 }}>
        {md ? <Markdown text={md} inv={inv} onCite={onCite} /> : <p className="muted" style={{ margin: 0 }}>The report lists key entities, confirmed findings, identity links with reasoning, a timeline, hypotheses, contradictions, gaps, next steps and every source URL used. Speculation is labelled, never stated as fact.</p>}
      </div>
    </div>
  );
}

function Log({ inv, job, onCancel }: Pick<Props, 'inv' | 'job' | 'onCancel'>) {
  const jobs = inv.jobs;
  const [open, setOpen] = useState<string | null>(jobs[0]?.id ?? null);
  useEffect(() => {
    if (job) setOpen(job.id);
  }, [job?.id]);
  if (!jobs.length) return <div className="pad muted">Discovery runs appear here with every source queried and what it returned.</div>;
  return (
    <div className="scroll pad" style={{ height: '100%' }}>
      {jobs.map((j) => {
        const live = job?.id === j.id ? job : j;
        return (
          <div key={j.id} style={{ marginBottom: 10 }}>
            <button className="entity-row" onClick={() => setOpen(open === j.id ? null : j.id)} aria-expanded={open === j.id}>
              <span className="dot" style={{ background: live.status === 'running' ? 'var(--accent-line)' : live.status === 'done' ? 'var(--ok)' : live.status === 'failed' ? 'var(--bad)' : 'var(--text-3)' }} />
              <span style={{ flex: 1 }}>{inv.nodes[j.seedNodeId]?.label || 'Entity'} · {live.status}</span>
              <span className="faint" style={{ fontSize: 12 }}>+{live.nodesAdded} entities · {live.requests} requests · {fmtAgo(j.startedAt)}</span>
            </button>
            {live.status === 'running' && <button className="btn btn-sm" style={{ margin: '4px 0 0 24px' }} onClick={onCancel}><Icon path={mdiStop} size={16} />Stop</button>}
            {open === j.id && (
              <ol style={{ listStyle: 'none', margin: '6px 0 0 24px', padding: 0, fontSize: 13 }}>
                {live.log.map((l: any, i: number) => (
                  <li key={i} style={{ color: l.level === 'warn' ? 'var(--warn)' : l.level === 'error' ? 'var(--bad)' : 'var(--text-2)', padding: '2px 0' }}>
                    <span className="faint">{new Date(l.at).toLocaleTimeString()} </span>{l.message}
                  </li>
                ))}
              </ol>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function Dock(props: Props) {
  const { inv, tab, setTab, open, setOpen, job } = props;
  const unresolved = useMemo(() => inv.contradictions.filter((c) => c.status === 'unresolved').length, [inv]);
  const tabs: Array<[DockTab, string, number?]> = [
    ['analyst', 'Analyst'],
    ['timeline', 'Timeline'],
    ['contradictions', 'Contradictions', unresolved],
    ['report', 'Report'],
    ['log', job ? 'Discovery · running' : 'Discovery log'],
  ];
  return (
    <section className="intel-dock" aria-label="Analysis">
      <div className="tabs" role="tablist">
        {tabs.map(([id, label, count]) => (
          <button key={id} role="tab" className="tab" aria-selected={tab === id && open} onClick={() => { setTab(id); setOpen(true); }}>
            {label}
            {count ? <span className="tab-count">{count}</span> : null}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <button className="icon-btn" onClick={() => setOpen(!open)} aria-label={open ? 'Collapse panel' : 'Expand panel'}>
          <Icon path={open ? mdiChevronDown : mdiChevronUp} />
        </button>
      </div>
      {open && (
        <div role="tabpanel" style={{ flex: 1, minHeight: 0 }}>
          {tab === 'analyst' && <Analyst {...props} />}
          {tab === 'timeline' && <Timeline {...props} />}
          {tab === 'contradictions' && <Contradictions {...props} />}
          {tab === 'report' && <Report {...props} />}
          {tab === 'log' && <Log {...props} />}
        </div>
      )}
    </section>
  );
}
