import { mdiLayersOutline, mdiPulse, mdiBroadcast, mdiGraphOutline, mdiHelpCircleOutline, mdiEarth } from '@mdi/js';
import { Icon } from './Icon';
import { Logo } from './Logo';
import { setApp, useApp, Drawer } from '../state';
import { useLive } from '../lib/live';

function feedHealth(sources: ReturnType<typeof useLive>['sources']) {
  const enabled = sources.filter((s) => s.status !== 'disabled');
  if (!enabled.length) return null;
  if (enabled.some((s) => s.status === 'error' || s.status === 'stale')) return 'var(--warn)';
  return null;
}

/** Primary navigation. Desktop: vertical rail. Mobile: bottom tab bar. */
export function Rail() {
  const mode = useApp((s) => s.mode);
  const drawer = useApp((s) => s.drawer);
  const { sources } = useLive();
  const warn = feedHealth(sources);

  const openDrawer = (d: Drawer) => setApp((s) => ({ mode: 'globe', drawer: s.mode === 'globe' && s.drawer === d ? null : d }));

  const item = (label: string, icon: string, current: boolean, onClick: () => void, badge?: string | null, desktopOnly = false) => (
    <button className={`rail-item${desktopOnly ? ' rail-desktop' : ''}`} aria-current={current} onClick={onClick} title={label}>
      <Icon path={icon} size={22} />
      <span>{label}</span>
      {badge && <span className="rail-badge" style={{ background: badge }} />}
    </button>
  );

  return (
    <nav className="rail" aria-label="Main">
      <div className="rail-logo" title="AtlasMesh">
        <Logo size={34} />
      </div>
      {item('Globe', mdiEarth, mode === 'globe' && drawer === null, () => setApp({ mode: 'globe', drawer: null }))}
      {item('Layers', mdiLayersOutline, mode === 'globe' && drawer === 'layers', () => openDrawer('layers'))}
      {item('Activity', mdiPulse, mode === 'globe' && drawer === 'activity', () => openDrawer('activity'))}
      {item('Feeds', mdiBroadcast, mode === 'globe' && drawer === 'feeds', () => openDrawer('feeds'), warn)}
      {item('Intel', mdiGraphOutline, mode === 'intel', () => setApp({ mode: 'intel', selectedId: null }))}
      <div className="rail-spacer" />
      {item('Help', mdiHelpCircleOutline, false, () => setApp({ helpOpen: true }), null, true)}
    </nav>
  );
}
