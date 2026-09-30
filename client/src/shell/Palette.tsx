import { useEffect, useMemo, useRef, useState } from 'react';
import { mdiMagnify, mdiMapMarker, mdiGraphOutline, mdiEarth, mdiHelpCircleOutline, mdiPulse } from '@mdi/js';
import { Icon } from './Icon';
import { LAYERS, LAYER_BY_ID } from '../lib/layers';
import { BASEMAPS } from '../globe/engine';
import { entityIndex, displayName } from '../globe/index';
import { getApp, getViewer, setApp, useApp } from '../state';
import { flyTo } from '../globe/engine';

interface Item {
  key: string;
  section: 'Places' | 'On the globe' | 'Commands';
  icon: string;
  color?: string;
  title: string;
  sub?: string;
  run: () => void;
}

function score(q: string, text: string) {
  const t = text.toLowerCase();
  if (t === q) return 100;
  if (t.startsWith(q)) return 80;
  const i = t.indexOf(q);
  if (i >= 0) return 60 - Math.min(i, 30) + (/[\s\-_/(]/.test(t[i - 1] || ' ') ? 10 : 0);
  // subsequence match, e.g. "ba123" → "BAW123"
  let j = 0;
  for (const ch of t) if (ch === q[j]) j++;
  return j === q.length ? 20 : 0;
}

function searchEntities(q: string, onPick: (id: string) => void): Item[] {
  if (q.length < 2) return [];
  const hits: Array<{ s: number; id: string; name: string; type: string; sub?: string }> = [];
  for (const e of entityIndex.values()) {
    const name = displayName(e);
    let s = score(q, name);
    const alt = e.metadata?.icao24 || e.metadata?.iata || e.metadata?.mmsi || e.metadata?.noradId;
    if (alt) s = Math.max(s, score(q, String(alt)) - 10);
    if (s > 0) hits.push({ s, id: e.id, name, type: e.type, sub: e.metadata?.place || e.metadata?.country || e.metadata?.originCountry });
    if (hits.length > 4000) break;
  }
  return hits
    .sort((a, b) => b.s - a.s)
    .slice(0, 8)
    .map((h) => {
      const l = LAYER_BY_ID[h.type as keyof typeof LAYER_BY_ID];
      return { key: h.id, section: 'On the globe', icon: l?.icon || mdiMapMarker, color: l?.color, title: h.name, sub: [l?.noun, h.sub].filter(Boolean).join(' · '), run: () => onPick(h.id) };
    });
}

function commands(q: string): Item[] {
  const s = getApp();
  const all: Item[] = [
    { key: 'intel', section: 'Commands', icon: mdiGraphOutline, title: 'Open Intel workspace', sub: 'Investigate people, organisations, domains', run: () => setApp({ mode: 'intel' }) },
    { key: 'activity', section: 'Commands', icon: mdiPulse, title: 'Show activity', sub: 'Strong quakes, alerts, launches', run: () => setApp({ mode: 'globe', drawer: 'activity' }) },
    { key: 'help', section: 'Commands', icon: mdiHelpCircleOutline, title: 'Keyboard shortcuts', run: () => setApp({ helpOpen: true }) },
    ...BASEMAPS.map<Item>((b) => ({ key: `bm:${b.id}`, section: 'Commands', icon: mdiEarth, title: `Base map: ${b.label}`, run: () => setApp({ basemap: b.id }) })),
    ...LAYERS.map<Item>((l) => ({
      key: `layer:${l.id}`,
      section: 'Commands',
      icon: l.icon,
      color: l.color,
      title: `${s.visibility[l.id] ? 'Hide' : 'Show'} ${l.label.toLowerCase()}`,
      sub: 'Layer',
      run: () => setApp((st) => ({ visibility: { ...st.visibility, [l.id]: !st.visibility[l.id] } })),
    })),
  ];
  if (!q) return all.slice(0, 3);
  return all
    .map((c) => ({ c, s: score(q, c.title) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 6)
    .map((x) => x.c);
}

export function Palette({ onPick }: { onPick: (id: string) => void }) {
  const open = useApp((s) => s.paletteOpen);
  const [q, setQ] = useState('');
  const [places, setPlaces] = useState<Item[]>([]);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ('');
      setActive(0);
    }
  }, [open]);

  // Place search (Photon/OSM), debounced
  useEffect(() => {
    const term = q.trim();
    if (term.length < 3) return setPlaces([]);
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(term)}&limit=5&lang=en`, { signal: ctl.signal })
        .then((r) => r.json())
        .then((d) =>
          setPlaces(
            (d.features || []).map((f: any, i: number) => {
              const p = f.properties || {};
              const [lon, lat] = f.geometry.coordinates;
              const kind = p.type || p.osm_value;
              const h = kind === 'country' ? 3_500_000 : kind === 'state' ? 1_200_000 : kind === 'city' ? 120_000 : 30_000;
              return {
                key: `place:${i}:${p.osm_id}`,
                section: 'Places',
                icon: mdiMapMarker,
                title: p.name || term,
                sub: [p.city !== p.name ? p.city : null, p.state, p.country].filter(Boolean).join(', '),
                run: () => {
                  const v = getViewer();
                  if (v) flyTo(v, lat, lon, h);
                  setApp({ mode: 'globe' });
                },
              } as Item;
            })
          )
        )
        .catch(() => {});
    }, 250);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q]);

  const items = useMemo(() => {
    const term = q.trim().toLowerCase();
    return [...searchEntities(term, onPick), ...places, ...commands(term)];
  }, [q, places, onPick]);

  useEffect(() => {
    setActive(0);
  }, [items.length]);

  if (!open) return null;
  const close = () => setApp({ paletteOpen: false });
  const run = (it: Item) => {
    close();
    it.run();
  };

  let lastSection = '';
  return (
    <div className="overlay" onMouseDown={close}>
      <div className="palette panel rise" role="dialog" aria-modal="true" aria-label="Search" onMouseDown={(e) => e.stopPropagation()}>
        <div className="palette-input">
          <Icon path={mdiMagnify} color="var(--paper-3)" />
          <input
            ref={input}
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Callsign, city, camera, layer…"
            aria-label="Search"
            aria-controls="palette-list"
            aria-activedescendant={items[active] ? `pi-${active}` : undefined}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(items.length - 1, a + 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
              else if (e.key === 'Enter' && items[active]) run(items[active]);
              else if (e.key === 'Escape') close();
            }}
          />
          <span className="kbd">Esc</span>
        </div>
        <div className="palette-list scroll" id="palette-list" role="listbox">
          {!items.length && <div className="muted" style={{ padding: 16 }}>No matches for “{q}”. Try a callsign, a city name or a layer.</div>}
          {items.map((it, i) => {
            const header = it.section !== lastSection ? <div className="palette-section">{it.section}</div> : null;
            lastSection = it.section;
            return (
              <div key={it.key}>
                {header}
                <button id={`pi-${i}`} role="option" aria-selected={i === active} className="palette-item" onMouseEnter={() => setActive(i)} onClick={() => run(it)}>
                  <Icon path={it.icon} color={it.color || 'var(--paper-3)'} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.title}</div>
                    {it.sub && <div className="muted" style={{ fontSize: 13 }}>{it.sub}</div>}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function HelpDialog() {
  const open = useApp((s) => s.helpOpen);
  if (!open) return null;
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
  const mod = isMac ? '⌘' : 'Ctrl';
  const rows: Array<[string, string]> = [
    [`${mod} K  or  /`, 'Search and commands'],
    ['L', 'Layers'],
    ['A', 'Activity'],
    ['I', 'Intel workspace'],
    ['G', 'Back to the globe'],
    ['+  /  −', 'Zoom in / out'],
    ['H', 'Whole Earth'],
    ['Esc', 'Close panel or dialog'],
    ['?', 'This help'],
  ];
  const close = () => setApp({ helpOpen: false });
  return (
    <div className="overlay" onMouseDown={close}>
      <div className="panel rise" role="dialog" aria-modal="true" aria-labelledby="help-title" style={{ width: 'min(460px, 100%)', padding: 20 }} onMouseDown={(e) => e.stopPropagation()}>
        <h2 id="help-title" className="panel-title" style={{ marginBottom: 12 }}>Keyboard shortcuts</h2>
        <dl className="kv" style={{ gridTemplateColumns: '140px 1fr' }}>
          {rows.map(([k, v]) => (
            <div key={k} style={{ display: 'contents' }}>
              <dt><span className="kbd">{k}</span></dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <p className="muted" style={{ fontSize: 13, marginTop: 16 }}>
          Drag to rotate, scroll or pinch to zoom, right-drag or two-finger drag to tilt. Click anything on the globe for details.
        </p>
        <div style={{ textAlign: 'right' }}><button className="btn" onClick={close}>Close</button></div>
      </div>
    </div>
  );
}
