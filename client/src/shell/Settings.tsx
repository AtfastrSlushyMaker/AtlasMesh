import { useEffect, useMemo, useRef, useState } from 'react';
import {
  mdiArrowLeft, mdiTuneVariant, mdiEarth, mdiKeyVariant, mdiGraphOutline, mdiInformationOutline, mdiEye, mdiEyeOff,
  mdiOpenInNew, mdiCheckCircleOutline, mdiAlertCircleOutline, mdiLockOutline,
} from '@mdi/js';
import { Icon } from './Icon';
import { toast } from './toast';
import { confirmAction } from './confirm';
import { DEFAULT_PREFS, SettingsSection, setApp, setPrefs, useApp } from '../state';
import { BASEMAPS } from '../globe/engine';
import { defaultVisibility } from '../lib/layers';
import { api, storage } from '../lib/api';
import { RunLocally } from './RunLocally';

interface ServerSetting {
  key: string;
  label: string;
  group: string;
  secret: boolean;
  help: string;
  link?: string;
  placeholder?: string;
  set: boolean;
  source: 'environment' | 'app' | null;
  preview: string | null;
}

interface SettingsResponse {
  canEdit: boolean;
  reason: string | null;
  settings: ServerSetting[];
  services: { llm: boolean; aircraftAuthenticated: boolean; ships: boolean };
}

const keyHeaders = (): Record<string, string> => {
  const k = storage.get<string>('intel:key', '');
  return k ? { 'x-atlas-key': k } : {};
};

const SECTIONS: Array<{ id: SettingsSection; label: string; icon: string }> = [
  { id: 'general', label: 'General', icon: mdiTuneVariant },
  { id: 'globe', label: 'Globe & map', icon: mdiEarth },
  { id: 'keys', label: 'API keys', icon: mdiKeyVariant },
  { id: 'intel', label: 'Intel workspace', icon: mdiGraphOutline },
  { id: 'about', label: 'About & data', icon: mdiInformationOutline },
];

function Row({ label, help, children, id }: { label: string; help?: string; children: React.ReactNode; id?: string }) {
  return (
    <div className="setting">
      <div>
        <div className="setting-label" id={id}>{label}</div>
        {help && <div className="setting-help">{help}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: Array<[T, string]>; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} role="radio" aria-checked={value === v} onClick={() => onChange(v)}>{text}</button>
      ))}
    </div>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button className="btn btn-ghost" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} style={{ paddingLeft: 0 }}>
      <span className="switch" data-on={on} aria-hidden />
      <span>{on ? 'On' : 'Off'}</span>
    </button>
  );
}

function General() {
  const prefs = useApp((s) => s.prefs);
  return (
    <section aria-labelledby="s-general">
      <h2 id="s-general" className="panel-title" style={{ fontSize: 28 }}>General</h2>
      <Row label="Appearance" help="Day suits bright rooms; Night is easier on the eyes in the dark. The globe itself always stays dark.">
        <Seg label="Appearance" value={prefs.theme} onChange={(theme) => setPrefs({ theme })} options={[['day', 'Day'], ['night', 'Night'], ['system', 'Match system']]} />
      </Row>
      <Row label="Units" help="Used for speed, altitude, distance and temperature.">
        <Seg label="Units" value={prefs.units} onChange={(units) => setPrefs({ units })} options={[['metric', 'Metric'], ['imperial', 'Imperial'], ['nautical', 'Nautical']]} />
      </Row>
      <Row label="Clock" help="The clock in the top bar. Select the clock itself to switch quickly.">
        <Seg label="Clock" value={prefs.clock} onChange={(clock) => setPrefs({ clock })} options={[['utc', 'UTC'], ['local', 'Local time']]} />
      </Row>
      <Row label="Motion" help="Reduce turns off interface animations, whatever the system setting.">
        <Seg label="Motion" value={prefs.motion} onChange={(motion) => setPrefs({ motion })} options={[['system', 'Follow system'], ['reduce', 'Reduce']]} />
      </Row>
      <Row label="Welcome card" help="The short list of places to start, shown on first visit.">
        <button className="btn" onClick={() => { setPrefs({ welcomeDone: false }); setApp({ settings: null, mode: 'globe' }); }}>Show Welcome Again</button>
      </Row>
      <Row label="Reset" help="Restores default layers, map and preferences on this device. API keys and investigations are not affected.">
        <button
          className="btn"
          onClick={async () => {
            if (!(await confirmAction({ title: 'Reset preferences?', body: 'Layers, base map and preferences on this device go back to their defaults.', confirm: 'Reset Preferences' }))) return;
            setApp({ prefs: { ...DEFAULT_PREFS, welcomeDone: true }, visibility: defaultVisibility(), basemap: 'satellite', lighting: true, overlays: { labels: true, radar: false, clouds: false, nightlights: false } });
            toast('Preferences reset', 'success');
          }}
        >
          Reset Preferences
        </button>
      </Row>
    </section>
  );
}

function GlobeSection() {
  const prefs = useApp((s) => s.prefs);
  const basemap = useApp((s) => s.basemap);
  const lighting = useApp((s) => s.lighting);
  const overlays = useApp((s) => s.overlays);
  return (
    <section aria-labelledby="s-globe">
      <h2 id="s-globe" className="panel-title" style={{ fontSize: 28 }}>Globe &amp; map</h2>
      <Row label="Rendering quality" help="Battery saver renders fewer pixels and updates motion less often. Sharp uses your screen’s full resolution.">
        <Seg label="Rendering quality" value={prefs.quality} onChange={(quality) => setPrefs({ quality })} options={[['saver', 'Battery saver'], ['balanced', 'Balanced'], ['sharp', 'Sharp']]} />
      </Row>
      <Row label="Base map">
        <Seg label="Base map" value={basemap} onChange={(b) => setApp({ basemap: b })} options={BASEMAPS.map((b) => [b.id, b.label] as [typeof b.id, string])} />
      </Row>
      <Row label="Place names" help="Country, city and road labels over the imagery.">
        <Toggle label="Place names" on={overlays.labels} onChange={(on) => setApp((s) => ({ overlays: { ...s.overlays, labels: on } }))} />
      </Row>
      <Row label="Day and night shading" help="Darkens the side of Earth where it’s night right now.">
        <Toggle label="Day and night shading" on={lighting} onChange={(on) => setApp({ lighting: on })} />
      </Row>
      <p className="muted" style={{ fontSize: 14 }}>Choose which data layers appear from <button className="btn-link" onClick={() => setApp({ settings: null, mode: 'globe', drawer: 'layers' })}>Layers</button>.</p>
    </section>
  );
}

function KeyCard({ s, canEdit, pairValue, onChanged, value, setValue }: { s: ServerSetting; canEdit: boolean; pairValue?: string; onChanged: (r: SettingsResponse['settings']) => void; value: string; setValue: (v: string) => void }) {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState<'save' | 'test' | 'clear' | null>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const fromEnv = s.source === 'environment';
  const inputId = `key-${s.key}`;

  const save = async () => {
    setBusy('save');
    setResult(null);
    try {
      const r = await api<{ settings: ServerSetting[]; restarted: string[] }>('/api/settings', { method: 'PUT', json: { values: { [s.key]: value } }, headers: keyHeaders() });
      onChanged(r.settings);
      setValue('');
      toast(`${s.label} saved${r.restarted.length ? ` · ${r.restarted.join(', ')} restarted` : ''}`, 'success');
    } catch (err: any) {
      setResult({ ok: false, message: err.message });
    } finally {
      setBusy(null);
    }
  };
  const test = async () => {
    setBusy('test');
    setResult(null);
    try {
      setResult(await api('/api/settings/test', { method: 'POST', json: { key: s.key, value: value || undefined, pair: pairValue || undefined }, headers: keyHeaders() }));
    } catch (err: any) {
      setResult({ ok: false, message: err.message });
    } finally {
      setBusy(null);
    }
  };
  const clear = async () => {
    if (!(await confirmAction({ title: `Remove ${s.label}?`, body: 'Features that depend on it stop working until you add it again.', confirm: 'Remove Key' }))) return;
    setBusy('clear');
    try {
      const r = await api<{ settings: ServerSetting[] }>('/api/settings', { method: 'PUT', json: { values: { [s.key]: null } }, headers: keyHeaders() });
      onChanged(r.settings);
      toast(`${s.label} removed`, 'success');
    } catch (err: any) {
      toast(err.message, 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="key-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <label htmlFor={inputId} className="setting-label">{s.label}</label>
          <div className="setting-help">{s.help}</div>
        </div>
        <span className="chip" style={{ flexShrink: 0, color: s.set ? 'var(--ok)' : 'var(--text-3)', borderColor: s.set ? 'var(--ok)' : undefined }}>
          {s.set ? (fromEnv ? 'Set on server' : 'Saved') : 'Not set'}
        </span>
      </div>
      {fromEnv ? (
        <p className="muted" style={{ fontSize: 13.5, margin: '10px 0 0' }}>
          <Icon path={mdiLockOutline} size={14} /> Set in the server environment ({s.preview}). Change it in <code>.env</code> or your host’s dashboard.
        </p>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <input
                id={inputId}
                name={s.key.toLowerCase()}
                className="input"
                type={s.secret && !show ? 'password' : 'text'}
                value={value}
                onChange={(e) => { setValue(e.target.value); setResult(null); }}
                placeholder={s.set ? `Current: ${s.preview} — enter a new value to replace` : s.placeholder || 'Paste the key…'}
                autoComplete="off"
                spellCheck={false}
                disabled={!canEdit}
                style={{ paddingRight: s.secret ? 40 : undefined }}
              />
              {s.secret && (
                <button className="icon-btn" style={{ position: 'absolute', right: 1, top: 1 }} aria-label={show ? 'Hide value' : 'Show value'} onClick={() => setShow(!show)} type="button">
                  <Icon path={show ? mdiEyeOff : mdiEye} size={18} />
                </button>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="btn btn-primary btn-sm" disabled={!canEdit || !value.trim() || !!busy} onClick={save}>{busy === 'save' ? 'Saving…' : 'Save Key'}</button>
            {s.key !== 'OSINT_ACCESS_KEY' && !['LLM_BASE_URL', 'LLM_MODEL'].includes(s.key) && (
              <button className="btn btn-sm" disabled={!canEdit || (!value.trim() && !s.set) || !!busy} onClick={test}>{busy === 'test' ? 'Testing…' : 'Test'}</button>
            )}
            {s.set && <button className="btn btn-ghost btn-sm" disabled={!canEdit || !!busy} onClick={clear}>Remove</button>}
            {s.link && <a className="btn btn-ghost btn-sm" href={s.link} target="_blank" rel="noreferrer">Get a key<Icon path={mdiOpenInNew} size={14} /></a>}
          </div>
          {result && (
            <div role="status" style={{ marginTop: 8, fontSize: 14, display: 'flex', gap: 6, alignItems: 'center', color: result.ok ? 'var(--ok)' : 'var(--bad)' }}>
              <Icon path={result.ok ? mdiCheckCircleOutline : mdiAlertCircleOutline} size={16} />
              {result.message}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ShowcaseNotice() {
  return (
    <div className="key-card" style={{ marginTop: 16, borderTop: '4px solid var(--accent)' }}>
      <div className="setting-label" style={{ marginBottom: 6 }}>This is the public demo</div>
      <p className="setting-help" style={{ marginBottom: 14 }}>This demo shows live globe data. API-key setup and investigations are available in a local copy:</p>
      <RunLocally compact />
    </div>
  );
}

function Keys() {
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [accessKey, setAccessKey] = useState('');

  const load = () =>
    api<SettingsResponse>('/api/settings', { headers: keyHeaders() })
      .then((d) => { setData(d); setError(null); })
      .catch((err) => setError(err.message));
  useEffect(() => { load(); }, []);

  const groups = useMemo(() => {
    const g = new Map<string, ServerSetting[]>();
    for (const s of data?.settings || []) (g.get(s.group) ?? g.set(s.group, []).get(s.group)!).push(s);
    return [...g.entries()];
  }, [data]);

  return (
    <section aria-labelledby="s-keys">
      <h2 id="s-keys" className="panel-title" style={{ fontSize: 28 }}>API keys</h2>
      <p className="muted" style={{ fontSize: 14.5 }}>
        Every key is optional. Keys are stored on the server in <code>server/data/settings.json</code>, never in this browser, and are shown masked. Feeds that use a key restart as soon as you save it.
      </p>
      {error && <p role="alert" style={{ color: 'var(--bad)' }}>Settings couldn’t be loaded: {error}. Check that the server is running.</p>}
      {!data && !error && <div className="skeleton" style={{ height: 120 }} />}
      {data && (
        <>
          <div className="stat-row" style={{ margin: '16px 0 8px' }}>
            {[
              ['AI analyst', data.services.llm ? 'On' : 'Rules only'],
              ['Aircraft', data.services.aircraftAuthenticated ? 'Every minute' : 'Every 15 min'],
              ['Ships', data.services.ships ? 'Live' : 'Off'],
            ].map(([k, v]) => (
              <div key={k} className="stat"><div className="num" style={{ fontSize: 20 }}>{v}</div><div className="label">{k}</div></div>
            ))}
          </div>
          {!data.canEdit && (
            <div className="key-card" style={{ borderColor: 'var(--warn)', marginTop: 12 }}>
              <div className="setting-label">Read only</div>
              <p className="setting-help">{data.reason}</p>
              <form
                style={{ display: 'flex', gap: 6, marginTop: 8 }}
                onSubmit={(e) => { e.preventDefault(); storage.set('intel:key', accessKey.trim()); setAccessKey(''); load(); }}
              >
                <label className="sr-only" htmlFor="access-key">Access key</label>
                <input id="access-key" name="access-key" className="input" type="password" autoComplete="current-password" value={accessKey} onChange={(e) => setAccessKey(e.target.value)} placeholder="Access key…" />
                <button className="btn" disabled={!accessKey.trim()}>Unlock</button>
              </form>
            </div>
          )}
          {groups.map(([group, list]) => (
            <div key={group} style={{ marginTop: 26 }}>
              <h3 className="section-title" style={{ fontSize: 16, marginBottom: 10, color: 'var(--text)' }}>{group}</h3>
              {list.map((s) => (
                <KeyCard
                  key={s.key}
                  s={s}
                  canEdit={data.canEdit}
                  value={drafts[s.key] || ''}
                  setValue={(v) => setDrafts((d) => ({ ...d, [s.key]: v }))}
                  pairValue={s.key === 'OPENSKY_CLIENT_ID' ? drafts.OPENSKY_CLIENT_SECRET : s.key === 'OPENSKY_CLIENT_SECRET' ? drafts.OPENSKY_CLIENT_ID : undefined}
                  onChanged={(settings) => { setData((d) => (d ? { ...d, settings } : d)); load(); }}
                />
              ))}
            </div>
          ))}
        </>
      )}
    </section>
  );
}

function IntelSection() {
  const d = useApp((s) => s.prefs.intelDefaults);
  const set = (patch: Partial<typeof d>) => setPrefs({ intelDefaults: { ...d, ...patch } });
  const [key, setKey] = useState('');
  const hasKey = !!storage.get<string>('intel:key', '');
  return (
    <section aria-labelledby="s-intel">
      <h2 id="s-intel" className="panel-title" style={{ fontSize: 28 }}>Intel workspace</h2>
      <p className="muted" style={{ fontSize: 14.5 }}>Defaults for new investigations. Each investigation can change its own limits later.</p>
      <Row label="Follow depth" help="How many steps discovery may follow strong leads from the entity you expand.">
        <Seg label="Follow depth" value={String(d.maxDepth) as '1' | '2' | '3'} onChange={(v) => set({ maxDepth: Number(v) })} options={[['1', 'Only that entity'], ['2', '1 step'], ['3', '2 steps']]} />
      </Row>
      <Row label="Requests per run" help="Upper bound on calls to outside services for each discovery run.">
        <input className="input" type="number" inputMode="numeric" name="requests" min={5} max={300} value={d.maxRequestsPerJob} onChange={(e) => set({ maxRequestsPerJob: Math.max(5, Math.min(300, Number(e.target.value) || 5)) })} aria-label="Requests per run" />
      </Row>
      <Row label="Entities per investigation" help="Discovery stops adding entities past this number.">
        <input className="input" type="number" inputMode="numeric" name="max-nodes" min={20} max={2000} value={d.maxNodes} onChange={(e) => set({ maxNodes: Math.max(20, Math.min(2000, Number(e.target.value) || 20)) })} aria-label="Entities per investigation" />
      </Row>
      <Row label={`Follow links above ${Math.round(d.minConfidence * 100)}% confidence`} help="Deeper discovery ignores weaker links, so a name match doesn’t snowball.">
        <input type="range" min={0.3} max={0.95} step={0.05} value={d.minConfidence} onChange={(e) => set({ minConfidence: Number(e.target.value) })} aria-label="Minimum confidence to follow" style={{ width: '100%' }} />
      </Row>
      <Row label="Access key on this device" help={hasKey ? 'A key is saved in this browser and sent with workspace requests.' : 'Only needed if the server requires one.'}>
        <form style={{ display: 'flex', gap: 6 }} onSubmit={(e) => { e.preventDefault(); storage.set('intel:key', key.trim()); setKey(''); toast(key.trim() ? 'Access key saved on this device' : 'Access key removed from this device', 'success'); }}>
          <label className="sr-only" htmlFor="device-key">Access key</label>
          <input id="device-key" name="device-key" className="input" type="password" autoComplete="current-password" value={key} onChange={(e) => setKey(e.target.value)} placeholder={hasKey ? '•••••• saved' : 'Access key…'} />
          <button className="btn">{key.trim() ? 'Save' : hasKey ? 'Forget' : 'Save'}</button>
        </form>
      </Row>
    </section>
  );
}

function About() {
  const [health, setHealth] = useState<any>(null);
  useEffect(() => { api('/health').then(setHealth).catch(() => {}); }, []);
  return (
    <section aria-labelledby="s-about">
      <h2 id="s-about" className="panel-title" style={{ fontSize: 28 }}>About &amp; data</h2>
      <div className="stat-row" style={{ margin: '16px 0' }}>
        <div className="stat"><div className="num">{health?.version ?? '—'}</div><div className="label">Server version</div></div>
        <div className="stat"><div className="num">{health ? new Intl.NumberFormat().format(health.entities) : '—'}</div><div className="label">Entities tracked</div></div>
        <div className="stat"><div className="num">{health ? `${Math.round(health.uptime / 60)} min` : '—'}</div><div className="label">Uptime</div></div>
      </div>
      <Row label="Feed health" help="Which sources are live, stale or need a key."><button className="btn" onClick={() => setApp({ settings: null, mode: 'globe', drawer: 'feeds' })}>Open Feeds</button></Row>
      <Row label="Keyboard shortcuts"><button className="btn" onClick={() => setApp({ settings: null, helpOpen: true })}>Show Shortcuts</button></Row>
      <Row label="What’s stored where" help="Preferences, layer choices and a workspace access key stay in this browser. API keys and investigations are stored on the server that runs AtlasMesh. Nothing is sent to third parties except the requests each data source needs.">
        <span />
      </Row>
      <p className="muted" style={{ fontSize: 13.5, marginTop: 18 }}>
        Data: OpenSky Network, AISStream, Celestrak, wheretheiss.at, The Space Devs, NASA (CNEOS, EONET, FIRMS, GIBS), USGS, GDACS, Smithsonian GVP, Open-Meteo, NOAA NDBC, Transport for London, Caltrans, Fintraffic, TeleGeography, PeeringDB, OpenFlights, WRI, Meteoritical Society. Maps: Esri, RainViewer, OpenStreetMap contributors.
      </p>
    </section>
  );
}

export function Settings() {
  const requestedSection = useApp((s) => s.settings);
  const serverMode = useApp((s) => s.server?.mode);
  const full = serverMode === 'full';
  // Credentials stay unmounted until the server explicitly enables them, even
  // if an older UI action selected a section before its config arrived.
  const section = !full && (requestedSection === 'keys' || requestedSection === 'intel') ? 'general' : requestedSection;
  const sections = full ? SECTIONS : SECTIONS.filter((s) => s.id !== 'keys' && s.id !== 'intel');
  const mainRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!section) return;
    mainRef.current?.scrollTo({ top: 0 });
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setApp({ settings: null });
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [section]);
  if (!section) return null;
  return (
    <div className="settings" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <div className="settings-head">
        <button className="btn btn-ghost" onClick={() => setApp({ settings: null })} autoFocus>
          <Icon path={mdiArrowLeft} size={18} />Back
        </button>
        <h1 id="settings-title" className="panel-title" style={{ fontSize: 20 }}>Settings</h1>
      </div>
      <nav className="settings-nav" aria-label="Settings sections">
        {sections.map((s) => (
          <button key={s.id} aria-current={section === s.id ? 'page' : undefined} onClick={() => setApp({ settings: s.id })}>
            <Icon path={s.icon} size={18} />{s.label}
          </button>
        ))}
      </nav>
      <div className="settings-main scroll" ref={mainRef}>
        {section === 'general' && <General />}
        {section === 'general' && serverMode === 'showcase' && <ShowcaseNotice />}
        {section === 'globe' && <GlobeSection />}
        {full && section === 'keys' && <Keys />}
        {full && section === 'intel' && <IntelSection />}
        {section === 'about' && <About />}
      </div>
    </div>
  );
}
