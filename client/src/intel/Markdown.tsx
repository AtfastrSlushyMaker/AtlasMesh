import { Fragment, ReactNode } from 'react';
import type { Investigation } from '../../../shared/osint';
import { edgeLabel } from './model';

/**
 * Minimal, safe Markdown renderer for analyst answers and reports. Builds
 * React nodes (no HTML injection) and turns [N:id] / [E:id] / [V:id]
 * citations into buttons that select the cited element.
 */

export type CiteHandler = (kind: 'node' | 'edge' | 'evidence', id: string) => void;

const INLINE = /(\[(N|E|V):([a-z]+_[0-9a-f]+)\])|(\*\*([^*]+)\*\*)|((?<!\w)_([^_\n]+)_(?!\w))|(`([^`]+)`)|(\[([^\]]+)\]\((https?:\/\/[^)\s]+)\))|(https?:\/\/[^\s)<]+)/g;

function inline(text: string, inv: Investigation | null, onCite: CiteHandler, key: string, numbers: Map<string, number>): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    const k = `${key}-${i++}`;
    if (m[1]) {
      const kind = m[2] === 'N' ? 'node' : m[2] === 'E' ? 'edge' : 'evidence';
      const id = m[3];
      const label =
        kind === 'node' ? inv?.nodes[id]?.label :
        kind === 'edge' ? (inv?.edges[id] ? edgeLabel(inv, inv.edges[id]) : undefined) :
        inv?.evidence[id] ? `${inv.evidence[id].platform}: ${inv.evidence[id].excerpt}` : undefined;
      // Footnote-style numbers: the sentence already names the entity, the chip links to its evidence.
      if (!numbers.has(id)) numbers.set(id, numbers.size + 1);
      out.push(
        <button key={k} className={`cite cite-${kind}`} onClick={() => onCite(kind, id)} title={`${kind === 'node' ? 'Entity' : kind === 'edge' ? 'Relationship' : 'Source'}: ${label || id}`} aria-label={`Citation ${numbers.get(id)}: ${label || id}`}>
          {numbers.get(id)}
        </button>
      );
    } else if (m[4]) out.push(<strong key={k}>{m[5]}</strong>);
    else if (m[6]) out.push(<em key={k}>{m[7]}</em>);
    else if (m[8]) out.push(<code key={k}>{m[9]}</code>);
    else if (m[10]) out.push(<a key={k} href={m[12]} target="_blank" rel="noreferrer">{m[11]}</a>);
    else if (m[13]) out.push(<a key={k} href={m[13]} target="_blank" rel="noreferrer">{m[13].replace(/^https?:\/\//, '').slice(0, 60)}</a>);
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text, inv, onCite }: { text: string; inv: Investigation | null; onCite: CiteHandler }) {
  const lines = text.split('\n');
  const numbers = new Map<string, number>();
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: ReactNode[] } | null = null;
  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? 'ol' : 'ul';
    blocks.push(<Tag key={`l${blocks.length}`}>{list.items}</Tag>);
    list = null;
  };
  lines.forEach((raw, idx) => {
    const line = raw.replace(/\s+$/, '');
    const k = `b${idx}`;
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    const li = line.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
    if (!line.trim()) return flush();
    if (h) {
      flush();
      const Tag = (['h3', 'h4', 'h5'] as const)[h[1].length - 1];
      blocks.push(<Tag key={k}>{inline(h[2], inv, onCite, k, numbers)}</Tag>);
    } else if (li) {
      const ordered = /\d/.test(li[2]);
      if (!list || list.ordered !== ordered) {
        flush();
        list = { ordered, items: [] };
      }
      list.items.push(<li key={k} style={li[1].length >= 2 ? { marginLeft: 16, listStyle: 'circle' } : undefined}>{inline(li[3], inv, onCite, k, numbers)}</li>);
    } else if (line.startsWith('>')) {
      flush();
      blocks.push(<blockquote key={k}>{inline(line.replace(/^>\s?/, ''), inv, onCite, k, numbers)}</blockquote>);
    } else {
      flush();
      blocks.push(<p key={k}>{inline(line, inv, onCite, k, numbers)}</p>);
    }
  });
  flush();
  return <div className="md">{blocks.map((b, i) => <Fragment key={i}>{b}</Fragment>)}</div>;
}
