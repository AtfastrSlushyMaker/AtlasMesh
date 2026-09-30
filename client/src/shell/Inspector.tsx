import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { mdiClose, mdiContentCopy, mdiOpenInNew, mdiCrosshairsGps, mdiGraphOutline, mdiRefresh, mdiShareVariantOutline } from '@mdi/js';
import { shareUrl } from '../lib/url';
import type { Entity } from '../../../shared/entity';
import { Icon } from './Icon';
import { LAYERS, LAYER_BY_ID } from '../lib/layers';
import { entityIndex, displayName, indexVersion, subscribeIndex } from '../globe/index';
import { currentPosition } from '../globe/Globe';
import { flyTo } from '../globe/engine';
import { getApp, getViewer, setApp, useApp } from '../state';
import { api } from '../lib/api';
import { fmtAgo, fmtAltitude, fmtDate, fmtDMS, fmtDistance, fmtHeight, fmtNum, fmtSpeed, fmtTemp, fmtWind, titleCase } from '../lib/format';
import { toast } from './toast';

type Row = [label: string, value: React.ReactNode];
type Stat = [label: string, value: string | undefined];
const u = (v: any, unit: string, digits = 1) => (v == null || v === '' || !Number.isFinite(Number(v)) ? undefined : `${fmtNum(Number(v), digits)} ${unit}`);
const n = (v: any) => (v == null || v === '' || !Number.isFinite(Number(v)) ? undefined : Number(v));
const kmh = (v: any) => (n(v) != null ? fmtSpeed(n(v)! / 3.6) : undefined);
const knots = (v: any) => (n(v) != null ? fmtSpeed(n(v)! * 0.514444) : undefined);

/**
 * Curated facts per layer: up to three headline stats, then detail rows.
 * Anything else is under "All fields". Units follow Settings.
 */
function facts(e: Entity): { subtitle?: string; stats: Stat[]; rows: Row[] } {
  const m = e.metadata || {};
  switch (e.type) {
    case 'aircraft':
      return {
        subtitle: [m.callsign, m.originCountry].filter(Boolean).join(' · '),
        stats: [['Altitude', m.onGround ? 'Ground' : fmtHeight(m.altitudeM)], ['Speed', fmtSpeed(e.velocity)], ['Heading', u(e.heading, '°', 0)]],
        rows: [['Vertical rate', m.verticalRateMs != null ? `${fmtHeight(m.verticalRateMs * 60)}/min` : undefined], ['Squawk', m.squawk], ['ICAO 24-bit', m.icao24], ['Last contact', fmtAgo(e.timestamp)]],
      };
    case 'ship':
      return { subtitle: `MMSI ${m.mmsi}`, stats: [['Speed', knots(m.sog)], ['Course', u(m.cog, '°', 0)]], rows: [['Last report', fmtAgo(e.timestamp)]] };
    case 'satellite':
    case 'starlink':
      return { subtitle: `NORAD ${m.noradId}`, stats: [['Inclination', u(m.inclinationDeg, '°')], ['Orbit', u(m.periodMin, 'min')]], rows: [] };
    case 'iss':
      return { stats: [['Altitude', n(m.altitudeKm) != null ? fmtDistance(m.altitudeKm) : undefined], ['Speed', kmh(m.velocityKms)], ['Sunlight', m.visibility === 'daylight' ? 'Day side' : m.visibility ? 'Night side' : undefined]], rows: [['Footprint', fmtDistance(m.footprint)]] };
    case 'earthquake':
      return {
        subtitle: m.place,
        stats: [['Magnitude', m.mag != null ? `M${Number(m.mag).toFixed(1)}` : undefined], ['Depth', fmtDistance(m.depthKm)], ['When', fmtAgo(e.timestamp)]],
        rows: [['Time', fmtDate(e.timestamp)], ['Tsunami flag', m.tsunami ? 'Yes' : undefined], ['PAGER alert', m.alert], ['Felt reports', m.felt]],
      };
    case 'disaster':
      return { subtitle: m.country, stats: [['Alert', m.alertLevel], ['Hazard', m.hazard]], rows: [['Severity', m.severity], ['Since', fmtDate(m.from, false)], ['Last update', fmtAgo(e.timestamp)]] };
    case 'event':
      return { subtitle: m.category, stats: [['Strength', m.magnitude], ['Seen', fmtAgo(m.lastObserved)]], rows: [['Observations', m.observations]] };
    case 'wildfire':
      return { stats: [['Power', u(m.frpMw, 'MW', 0)], ['Confidence', m.confidence], ['Detected', fmtAgo(m.detectedAt)]], rows: [['Brightness', u(m.brightnessK, 'K', 0)], ['Detected at', `${fmtDate(m.detectedAt)} (${m.daynight})`], ['Sensor', m.satellite]] };
    case 'volcano':
      return { subtitle: [m.region, m.country].filter(Boolean).join(', '), stats: [['Summit', fmtHeight(m.elevationM)]], rows: [['Observatory', m.observatory], ['GVP number', m.gvpNumber]] };
    case 'weather':
      return {
        subtitle: m.conditions,
        stats: [['Now', fmtTemp(m.temperatureC)], ['Feels like', fmtTemp(m.feelsLikeC)], ['Wind', fmtWind(m.windSpeedMs)]],
        rows: [['Humidity', u(m.humidityPct, '%', 0)], ['Wind from', u(m.windDirDeg, '°', 0)], ['Gusts', fmtWind(m.gustMs)], ['Pressure', u(m.pressureHpa, 'hPa', 0)], ['Precipitation', u(m.precipitationMm, 'mm')], ['Observed', fmtAgo(e.timestamp)]],
      };
    case 'buoy':
      return {
        stats: [['Waves', fmtHeight(m.waveHeightM)], ['Water', fmtTemp(m.waterTempC)], ['Wind', fmtWind(m.windSpeedMs)]],
        rows: [['Wave period', u(m.dominantPeriodS, 's', 0)], ['Wind from', u(m.windDirDeg, '°', 0)], ['Gusts', fmtWind(m.gustMs)], ['Air temperature', fmtTemp(m.airTempC)], ['Pressure', u(m.pressureHpa, 'hPa')], ['Observed', fmtAgo(m.observedAt)]],
      };
    case 'camera':
      return { subtitle: [m.region || m.route, m.country].filter(Boolean).join(' · '), stats: [], rows: [['Operator', m.operator], ['Facing', m.view], ['Refreshes', m.refreshSeconds ? `every ${Math.round(m.refreshSeconds / 60)} min` : undefined], ['Licence', m.license]] };
    case 'launch':
      return {
        subtitle: m.provider,
        stats: [['Lift-off', fmtAgo(m.net)], ['Status', m.status]],
        rows: [['Window opens', fmtDate(m.net)], ['Rocket', m.rocket], ['Mission', m.mission], ['Orbit', m.orbit], ['Pad', m.pad], ['Site', m.location]],
      };
    case 'fireball':
      return { stats: [['Impact energy', u(m.impact_energy_kt, 'kt', 2)], ['Speed', u(m.velocity_km_s, 'km/s')]], rows: [['Time', fmtDate(e.timestamp)], ['Radiated energy', m.energy_kt != null ? `${m.energy_kt} ×10¹⁰ J` : undefined], ['Altitude', fmtDistance(m.altitude_km)]] };
    case 'powerplant':
    case 'windfarm':
      return { subtitle: m.country, stats: [['Capacity', u(m.capacityMw, 'MW', 0)], ['Fuel', m.primaryFuel]], rows: [['Owner', m.owner], ['Commissioned', m.commissioningYear]] };
    case 'meteorite':
      return { stats: [['Mass', m.massGrams != null ? (m.massGrams > 1000 ? `${fmtNum(m.massGrams / 1000)} kg` : `${fmtNum(m.massGrams, 0)} g`) : undefined], ['Year', m.year]], rows: [['Class', m.recclass], ['Seen falling', m.fall === 'Fell' ? 'Yes' : 'Found later']] };
    case 'ixp':
      return { subtitle: [m.city, m.country].filter(Boolean).join(', '), stats: [['Networks', m.netCount != null ? fmtNum(m.netCount, 0) : undefined]], rows: [['Full name', m.nameLong], ['Website', m.website]] };
    case 'airport':
      return { subtitle: [m.city, m.country].filter(Boolean).join(', '), stats: [['IATA', m.iata], ['ICAO', m.icao]], rows: [] };
    case 'cable':
      return { stats: [['Length', fmtDistance(m.length_km)]], rows: [['In service', m.rfs], ['Owners', m.owners]] };
    default:
      return { stats: [], rows: [] };
  }
}

const HIDE = new Set(['path', 'segments', 'color', 'title', 'source', 'tle1', 'tle2', 'imageUrl', 'videoUrl', 'streamUrl', 'sourceUrl', 'avatarUrl', 'sources', 'categories']);

/** Suggest an Intel starting point where the data names a public organisation or domain. */
function intelSeed(e: Entity): { value: string; type: string; label: string } | null {
  const m = e.metadata || {};
  if (e.type === 'ixp' && m.website) {
    try {
      return { value: new URL(m.website).hostname.replace(/^www\./, ''), type: 'domain', label: 'Investigate operator domain' };
    } catch {
      return null;
    }
  }
  if ((e.type === 'powerplant' || e.type === 'windfarm') && m.owner) return { value: m.owner, type: 'organization', label: 'Investigate owner' };
  if (e.type === 'launch' && m.provider) return { value: m.provider, type: 'organization', label: 'Investigate launch provider' };
  return null;
}

function CameraFrame({ e }: { e: Entity }) {
  const m = e.metadata || {};
  const every = Math.max(60, Number(m.refreshSeconds) || 300) * 1000;
  const [tick, setTick] = useState(Date.now());
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [clip, setClip] = useState(false);
  useEffect(() => {
    setState('loading');
    setClip(false);
    const t = setInterval(() => setTick(Date.now()), every);
    return () => clearInterval(t);
  }, [e.id, every]);
  const src = `${m.imageUrl}${String(m.imageUrl).includes('?') ? '&' : '?'}t=${Math.floor(tick / every)}`;
  return (
    <div>
      <div className="camera-frame">
        {clip && m.videoUrl ? (
          <video src={m.videoUrl} autoPlay muted loop playsInline controls />
        ) : (
          <img src={src} width={640} height={400} alt={`Latest image from ${m.name}`} onLoad={() => setState('ok')} onError={() => setState('error')} />
        )}
        {state === 'loading' && !clip && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}><div className="spinner" /></div>}
        {state === 'error' && !clip && (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 16, textAlign: 'center' }} className="muted">
            The operator isn't serving an image for this camera right now.
          </div>
        )}
        {state === 'ok' && !clip && <span className="camera-age">Checked {fmtAgo(tick)}</span>}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button className="btn btn-sm" onClick={() => { setTick(Date.now()); setState('loading'); }}><Icon path={mdiRefresh} size={16} />Refresh</button>
        {m.videoUrl && <button className="btn btn-sm" onClick={() => setClip((c) => !c)}>{clip ? 'Show still' : 'Play latest clip'}</button>}
        {m.streamUrl && <a className="btn btn-sm" href={m.streamUrl} target="_blank" rel="noreferrer">Live stream<Icon path={mdiOpenInNew} size={14} /></a>}
      </div>
    </div>
  );
}

function Nearby({ e, onPick }: { e: Entity; onPick: (id: string) => void }) {
  const [items, setItems] = useState<Array<{ id: string; type: string; name: string; distanceKm: number }> | null>(null);
  useEffect(() => {
    let alive = true;
    setItems(null);
    const p = currentPosition(e.id) || e.position;
    if (e.type === 'satellite' || e.type === 'starlink' || e.type === 'iss' || e.type === 'cable') return;
    // Only layers that are on the globe, so every result is clickable; skip this entity's own type.
    const types = LAYERS.filter((l) => getApp().visibility[l.id] && l.id !== e.type && !['satellite', 'starlink', 'iss'].includes(l.id)).map((l) => l.id);
    if (!types.length) return setItems([]);
    api(`/api/near?lat=${p.lat}&lon=${p.lon}&radiusKm=75&types=${types.join(',')}`)
      .then((r) => alive && setItems(r.results.slice(0, 8)))
      .catch(() => alive && setItems([]));
    return () => {
      alive = false;
    };
  }, [e.id]);
  if (!items || !items.length) return null;
  return (
    <section>
      <h3 className="section-title" style={{ marginBottom: 6 }}>Nearby ({fmtDistance(75)})</h3>
      {items.map((x) => {
        const l = LAYER_BY_ID[x.type as keyof typeof LAYER_BY_ID];
        return (
          <button key={x.id} className="list-button" onClick={() => onPick(x.id)}>
            {l && <Icon path={l.icon} color={l.color} />}
            <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.name}</span>
            <span className="faint" style={{ fontSize: 13 }}>{fmtDistance(x.distanceKm)}</span>
          </button>
        );
      })}
    </section>
  );
}

export function Inspector({ onPick }: { onPick: (id: string) => void }) {
  const id = useApp((s) => s.selectedId);
  useSyncExternalStore(subscribeIndex, indexVersion);
  const e = id ? entityIndex.get(id) : undefined;
  const [livePos, setLivePos] = useState<{ lat: number; lon: number; alt: number } | null>(null);

  useEffect(() => {
    document.body.dataset.inspector = e ? 'open' : '';
  }, [!!e]);

  // Moving objects: refresh position readout every second.
  useEffect(() => {
    if (!id) return;
    const upd = () => setLivePos(currentPosition(id));
    upd();
    const t = setInterval(upd, 1000);
    return () => clearInterval(t);
  }, [id]);

  const info = useMemo(() => (e ? facts(e) : null), [e]);
  if (!e || !info) return null;
  const l = LAYER_BY_ID[e.type];
  const m = e.metadata || {};
  const p = livePos || { lat: e.position.lat, lon: e.position.lon, alt: e.position.alt ?? 0 };
  const rows = info.rows.filter(([, v]) => v !== undefined && v !== null && v !== '' && v !== '—');
  const stats = info.stats.filter(([, v]) => v !== undefined && v !== '' && v !== '—');
  const extra = Object.entries(m).filter(([k, v]) => !HIDE.has(k) && v !== undefined && v !== null && v !== '' && typeof v !== 'object');
  const seed = intelSeed(e);
  const copy = (text: string) => navigator.clipboard?.writeText(text).then(() => toast('Coordinates copied', 'success'));

  return (
    <aside className="inspector" aria-label={`${l?.noun}: ${displayName(e)}`}>
      <div className="inspector-head" style={{ display: 'flex', gap: 12, ['--c' as any]: l?.color }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="inspector-kind">
            {l && <span className="swatch" style={{ background: l.color, width: 20, height: 20 }}><Icon path={l.icon} size={13} color="#0b141c" /></span>}
            {l?.noun || e.type}
          </div>
          <h2 className="inspector-title">{displayName(e)}</h2>
          {info.subtitle && <div className="muted" style={{ marginTop: 4 }}>{info.subtitle}</div>}
        </div>
        <button className="icon-btn" aria-label="Close details" onClick={() => setApp({ selectedId: null })}><Icon path={mdiClose} /></button>
      </div>
      <div className="inspector-body scroll">
        {e.type === 'camera' && m.imageUrl && <CameraFrame e={e} />}
        {e.type === 'launch' && m.imageUrl && (
          <div className="camera-frame"><img src={m.imageUrl} width={640} height={400} alt={`${m.rocket || 'Rocket'} for ${m.name}`} loading="lazy" /></div>
        )}
        {stats.length > 0 && (
          <div className="stat-row">
            {stats.map(([k, v]) => (
              <div key={k} className="stat">
                <div className="num">{v}</div>
                <div className="label">{k}</div>
              </div>
            ))}
          </div>
        )}
        {rows.length > 0 && (
          <dl className="kv">
            {rows.map(([k, v]) => (
              <div key={k} style={{ display: 'contents' }}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        )}
        {m.description && <p style={{ margin: 0, fontSize: 14 }} className="muted">{String(m.description).slice(0, 500)}</p>}

        <section>
          <h3 className="section-title" style={{ marginBottom: 6 }}>Position</h3>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 17 }}>{fmtDMS(p.lat, p.lon)}</div>
          <div className="muted" style={{ fontSize: 13 }}>
            {p.lat.toFixed(4)}, {p.lon.toFixed(4)}
            {p.alt > 1000 ? ` · ${fmtAltitude(p.alt)} up` : ''}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button className="btn btn-sm" onClick={() => { const v = getViewer(); if (v) flyTo(v, p.lat, p.lon, Math.max(p.alt * 3, e.type === 'camera' ? 25000 : 400000)); }}>
              <Icon path={mdiCrosshairsGps} size={16} />Fly here
            </button>
            <button className="btn btn-sm" onClick={() => copy(`${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`)}><Icon path={mdiContentCopy} size={16} />Copy Coordinates</button>
            <button className="btn btn-sm" onClick={() => navigator.clipboard?.writeText(shareUrl()).then(() => toast('Link copied. It opens this object on the globe.', 'success'))}><Icon path={mdiShareVariantOutline} size={16} />Copy Link</button>
            {m.sourceUrl && <a className="btn btn-sm" href={m.sourceUrl} target="_blank" rel="noreferrer">View at source<Icon path={mdiOpenInNew} size={14} /></a>}
          </div>
        </section>

        {seed && (
          <section>
            <button className="btn" style={{ width: '100%' }} onClick={() => setApp({ mode: 'intel', intelSeed: { value: seed.value, type: seed.type } })}>
              <Icon path={mdiGraphOutline} size={18} />{seed.label}: {seed.value}
            </button>
          </section>
        )}

        <Nearby e={e} onPick={onPick} />

        {extra.length > 0 && (
          <details>
            <summary className="section-title" style={{ cursor: 'pointer' }}>All fields</summary>
            <dl className="kv" style={{ marginTop: 8, fontSize: 13 }}>
              {extra.map(([k, v]) => (
                <div key={k} style={{ display: 'contents' }}>
                  <dt>{titleCase(k)}</dt>
                  <dd>{String(v)}</dd>
                </div>
              ))}
            </dl>
          </details>
        )}
        <div className="faint" style={{ fontSize: 12 }}>
          {l?.description} Id <code>{e.id}</code>
        </div>
      </div>
    </aside>
  );
}
