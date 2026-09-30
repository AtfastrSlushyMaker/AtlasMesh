import { mdiPulse, mdiCctv, mdiGraphOutline, mdiKeyVariant, mdiClose, mdiDocker } from '@mdi/js';
import { Icon } from './Icon';
import { setApp, setPrefs, useApp, getViewer } from '../state';
import { entityIndex } from '../globe/index';
import { flyTo } from '../globe/engine';

/**
 * First-run card: three routes to real value, dismissible, shown once.
 * Reopen from Settings → General.
 */
export function Welcome({ onPick }: { onPick: (id: string) => void }) {
  const done = useApp((s) => s.prefs.welcomeDone);
  const mode = useApp((s) => s.mode);
  const showcase = useApp((s) => s.server?.mode === 'showcase');
  if (done || mode !== 'globe') return null;
  const finish = () => setPrefs({ welcomeDone: true });

  const camera = () => {
    const cam = [...entityIndex.values()].find((e) => e.type === 'camera' && e.id.startsWith('camera:tfl'));
    if (cam) onPick(cam.id);
    else {
      const v = getViewer();
      if (v) flyTo(v, 51.51, -0.12, 40000);
      setApp((s) => ({ visibility: { ...s.visibility, camera: true } }));
    }
    finish();
  };

  const actions = [
    { icon: mdiPulse, color: '#ee6a5f', title: 'See what’s happening now', sub: 'Strong earthquakes, disaster alerts, launches and storms', run: () => { setApp({ drawer: 'activity' }); finish(); } },
    { icon: mdiCctv, color: '#c9a93a', title: 'Look through a live camera', sub: 'Public traffic cameras in London, California and Finland', run: camera },
    showcase
      ? { icon: mdiDocker, color: '#1d5fa8', title: 'Run your own copy', sub: 'Adds the Intel workspace, your API keys and saved investigations', run: () => { setApp({ runLocalOpen: true }); finish(); } }
      : { icon: mdiGraphOutline, color: '#1d5fa8', title: 'Start an investigation', sub: 'Map public information about a handle, domain or organisation', run: () => { setApp({ mode: 'intel' }); finish(); } },
  ];

  return (
    <section className="welcome rise" aria-labelledby="welcome-title">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div>
          <h2 id="welcome-title" className="panel-title" style={{ fontSize: 24 }}>The planet, live</h2>
          <p className="muted" style={{ margin: '4px 0 14px', fontSize: 14 }}>Everything on the globe comes from public feeds and updates on its own. Pick a place to start.</p>
        </div>
        <button className="icon-btn" aria-label="Dismiss welcome" onClick={finish}><Icon path={mdiClose} /></button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {actions.map((a) => (
          <button key={a.title} className="welcome-action" onClick={a.run}>
            <span className="swatch" style={{ background: a.color }}><Icon path={a.icon} color="#fff" size={20} /></span>
            <span>
              <div style={{ fontWeight: 700 }}>{a.title}</div>
              <div className="muted" style={{ fontSize: 13 }}>{a.sub}</div>
            </span>
          </button>
        ))}
      </div>
      {!showcase && (
        <button className="btn btn-ghost btn-sm" style={{ marginTop: 12, marginLeft: -8 }} onClick={() => { setApp({ settings: 'keys' }); finish(); }}>
          <Icon path={mdiKeyVariant} size={16} />Add API keys for ships, faster aircraft and the AI analyst
        </button>
      )}
    </section>
  );
}
