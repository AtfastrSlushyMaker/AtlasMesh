import { useMemo, useSyncExternalStore } from 'react';
import { mdiClose } from '@mdi/js';
import { Icon } from './Icon';
import { CATEGORIES, LAYERS, LAYER_BY_ID } from '../lib/layers';
import { BASEMAPS, OVERLAYS } from '../globe/engine';
import { setApp, useApp } from '../state';
import { useLive } from '../lib/live';
import { countsByType, displayName, entityIndex, indexVersion, subscribeIndex } from '../globe/index';
import { fmtAgo, fmtInt, fmtDate } from '../lib/format';
import type { Entity, SourceInfo } from '../../../shared/entity';

const STATUS_COLOR: Record<SourceInfo['status'], string> = {
  live: 'var(--ok)',
  pending: 'var(--paper-3)',
  stale: 'var(--warn)',
  error: 'var(--bad)',
  disabled: 'var(--paper-4)',
};
const STATUS_TEXT: Record<SourceInfo['status'], string> = {
  live: 'Live',
  pending: 'Loading',
  stale: 'Stale',
  error: 'Failing',
  disabled: 'Needs setup',
};

function DrawerFrame({ title, children, subtitle }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <aside className="drawer panel rise" aria-label={title}>
      <div className="drawer-head">
        <div>
          <h2 className="panel-title">{title}</h2>
          {subtitle && <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{subtitle}</div>}
        </div>
        <button className="icon-btn" aria-label={`Close ${title}`} onClick={() => setApp({ drawer: null })}>
          <Icon path={mdiClose} />
        </button>
      </div>
      <div className="drawer-body scroll">{children}</div>
    </aside>
  );
}

function Switch({ on, color }: { on: boolean; color?: string }) {
  return <span className="switch" data-on={on} style={{ ['--sw-color' as any]: color }} aria-hidden />;
}

export function LayersDrawer() {
  const visibility = useApp((s) => s.visibility);
  const basemap = useApp((s) => s.basemap);
  const overlays = useApp((s) => s.overlays);
  const lighting = useApp((s) => s.lighting);
  const { sources } = useLive();
  useSyncExternalStore(subscribeIndex, indexVersion);
  const counts = countsByType();
  const byType = Object.fromEntries(sources.map((s) => [s.type, s]));
  const onCount = LAYERS.filter((l) => visibility[l.id]).length;

  const toggle = (id: string) => setApp((s) => ({ visibility: { ...s.visibility, [id]: !s.visibility[id] } }));
  const setGroup = (cat: string, on: boolean) =>
    setApp((s) => ({ visibility: { ...s.visibility, ...Object.fromEntries(LAYERS.filter((l) => l.category === cat).map((l) => [l.id, on])) } }));

  return (
    <DrawerFrame title="Layers" subtitle={`${onCount} of ${LAYERS.length} shown`}>
      <div className="group" style={{ padding: '4px 8px 12px' }}>
        <div className="section-title" style={{ marginBottom: 8 }}>Base map</div>
        <div className="seg" role="group" aria-label="Base map">
          {BASEMAPS.map((b) => (
            <button key={b.id} aria-pressed={basemap === b.id} onClick={() => setApp({ basemap: b.id })}>{b.label}</button>
          ))}
        </div>
        <div style={{ marginTop: 10 }}>
          {OVERLAYS.map((o) => (
            <button key={o.id} className="layer-row" style={{ gridTemplateColumns: '1fr 32px' }} onClick={() => setApp((s) => ({ overlays: { ...s.overlays, [o.id]: !s.overlays[o.id] } }))} aria-pressed={overlays[o.id]}>
              <span>
                <div className="layer-name">{o.label}</div>
                <div className="layer-meta">{o.description}</div>
              </span>
              <Switch on={overlays[o.id]} />
            </button>
          ))}
          <button className="layer-row" style={{ gridTemplateColumns: '1fr 32px' }} onClick={() => setApp({ lighting: !lighting })} aria-pressed={lighting}>
            <span>
              <div className="layer-name">Day and night</div>
              <div className="layer-meta">Shade the globe by where the sun is now</div>
            </span>
            <Switch on={lighting} />
          </button>
        </div>
      </div>

      {CATEGORIES.map((cat) => {
        const layers = LAYERS.filter((l) => l.category === cat.id);
        const allOn = layers.every((l) => visibility[l.id]);
        return (
          <div className="group" key={cat.id}>
            <div className="group-head">
              <h3 className="section-title">{cat.label}</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setGroup(cat.id, !allOn)}>{allOn ? 'Hide all' : 'Show all'}</button>
            </div>
            {layers.map((l) => {
              const on = !!visibility[l.id];
              const src = byType[l.id];
              const status = src?.status;
              const meta = !on
                ? l.description
                : status === 'disabled'
                  ? src.note || 'Needs configuration on the server'
                  : status === 'error'
                    ? `Source failing: ${src.lastError || 'unknown error'}`
                    : status === 'stale'
                      ? `No update since ${fmtAgo(src.lastUpdate)}`
                      : src?.lastUpdate
                        ? `${src.provider} · updated ${fmtAgo(src.lastUpdate)}`
                        : `${src?.provider || ''} · loading`;
              return (
                <button key={l.id} className="layer-row" data-off={!on} onClick={() => toggle(l.id)} aria-pressed={on} title={l.description}>
                  <Icon path={l.icon} color={on ? l.color : 'var(--paper-4)'} size={20} />
                  <span style={{ minWidth: 0 }}>
                    <div className="layer-name">{l.label}</div>
                    <div className="layer-meta" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: on && status && status !== 'live' && status !== 'pending' ? STATUS_COLOR[status] : undefined }}>{meta}</div>
                  </span>
                  <span className="layer-count">{on && counts[l.id] ? fmtInt(counts[l.id]) : ''}</span>
                  <Switch on={on} color={l.color} />
                </button>
              );
            })}
          </div>
        );
      })}
    </DrawerFrame>
  );
}

export function FeedsDrawer() {
  const { sources, conn } = useLive();
  const order: SourceInfo['status'][] = ['error', 'stale', 'disabled', 'pending', 'live'];
  const sorted = [...sources].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));
  const live = sources.filter((s) => s.status === 'live').length;
  return (
    <DrawerFrame title="Data feeds" subtitle={conn === 'live' ? `${live} of ${sources.length} feeds live` : 'Waiting for the server'}>
      {!sources.length && <p className="muted" style={{ padding: '0 8px' }}>Feed health appears once the server connection is up.</p>}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {sorted.map((s) => {
          const l = LAYER_BY_ID[s.type];
          return (
            <li key={s.id} style={{ padding: '10px 8px', borderBottom: '1px solid var(--line)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {l && <Icon path={l.icon} color={l.color} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500 }}>{s.label}</div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    <a href={s.url} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>{s.provider}</a>
                    {s.lastUpdate ? ` · ${fmtAgo(s.lastUpdate)}` : ''}
                    {s.count ? ` · ${fmtInt(s.count)}` : ''}
                  </div>
                </div>
                <span className="chip" style={{ borderColor: STATUS_COLOR[s.status], color: STATUS_COLOR[s.status] }}>{STATUS_TEXT[s.status]}</span>
              </div>
              {(s.note || s.lastError) && (
                <div style={{ fontSize: 13, marginTop: 6, marginLeft: 28, color: s.lastError && s.status !== 'live' ? 'var(--bad)' : 'var(--paper-3)' }}>
                  {s.status !== 'live' && s.lastError ? s.lastError : s.note}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </DrawerFrame>
  );
}

interface Happening {
  entity: Entity;
  title: string;
  detail: string;
  at: number;
  weight: number;
}

/** What is notable right now, ranked: strong quakes, severe alerts, imminent launches, storms. */
function happenings(): Happening[] {
  const out: Happening[] = [];
  const now = Date.now();
  for (const e of entityIndex.values()) {
    const m = e.metadata || {};
    if (e.type === 'earthquake' && Number(m.mag) >= 4.5) {
      out.push({ entity: e, title: `M${Number(m.mag).toFixed(1)} earthquake`, detail: m.place || '', at: e.timestamp, weight: Number(m.mag) * 2 + (m.tsunami ? 4 : 0) });
    } else if (e.type === 'disaster' && m.alertLevel !== 'Green') {
      out.push({ entity: e, title: `${m.alertLevel} alert: ${m.hazard}`, detail: m.name || m.country || '', at: e.timestamp, weight: m.alertLevel === 'Red' ? 14 : 9 });
    } else if (e.type === 'launch') {
      const t = Date.parse(m.net);
      if (t > now - 3600e3 && t < now + 3 * 86400e3) out.push({ entity: e, title: `Launch ${fmtAgo(t)}`, detail: `${m.name}${m.location ? ` · ${m.location}` : ''}`, at: t, weight: 8 });
    } else if (e.type === 'event' && m.category === 'Severe Storms') {
      out.push({ entity: e, title: m.name, detail: m.magnitude ? `Winds ${m.magnitude}` : 'Tropical system', at: e.timestamp, weight: 8 });
    } else if (e.type === 'fireball' && now - e.timestamp < 30 * 86400e3) {
      out.push({ entity: e, title: 'Fireball detected', detail: fmtDate(e.timestamp, false), at: e.timestamp, weight: 3 });
    }
  }
  return out.sort((a, b) => b.weight - a.weight || b.at - a.at).slice(0, 40);
}

export function ActivityDrawer({ onPick }: { onPick: (id: string) => void }) {
  const v = useSyncExternalStore(subscribeIndex, indexVersion);
  const items = useMemo(happenings, [v]);
  const visibility = useApp((s) => s.visibility);
  const needed = ['earthquake', 'disaster', 'launch', 'event'].filter((t) => !visibility[t]);
  return (
    <DrawerFrame title="Activity" subtitle="Notable events on the globe right now">
      {needed.length > 0 && (
        <p className="muted" style={{ fontSize: 13, padding: '0 8px' }}>
          Turn on {needed.map((t) => LAYER_BY_ID[t as keyof typeof LAYER_BY_ID].label.toLowerCase()).join(', ')} to include them here.
        </p>
      )}
      {!items.length && <p className="muted" style={{ padding: '0 8px' }}>Nothing notable yet. Strong earthquakes, severe disaster alerts, launches in the next three days and active storms show up here.</p>}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {items.map((h) => {
          const l = LAYER_BY_ID[h.entity.type];
          return (
            <li key={h.entity.id}>
              <button className="list-button" onClick={() => onPick(h.entity.id)}>
                <Icon path={l.icon} color={l.color} size={20} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500 }}>{h.title}</div>
                  <div className="muted" style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.detail || displayName(h.entity)}</div>
                </span>
                <span className="faint" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{h.entity.type === 'launch' ? '' : fmtAgo(h.at)}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="faint" style={{ fontSize: 12, padding: '8px' }}>
        Sources: USGS, GDACS, The Space Devs, NASA EONET and CNEOS.
      </p>
    </DrawerFrame>
  );
}
