import React, { useMemo, useState, useRef, useEffect, memo } from 'react';
import {
  mdiAirplane,
  mdiBroadcast,
  mdiCableData,
  mdiCrosshairsGps,
  mdiFactory,
  mdiFerry,
  mdiFire,
  mdiMagnify,
  mdiMenu,
  mdiMenuOpen,
  mdiMeteor,
  mdiMinus,
  mdiPlus,
  mdiRadar,
  mdiRocketLaunch,
  mdiRouterNetwork,
  mdiSatelliteVariant,
  mdiSpaceStation,
  mdiStarFourPoints,
  mdiTarget,
  mdiTsunami,
  mdiVolcano,
  mdiWeatherCloudy,
  mdiWindTurbine,
  mdiKeyboardOutline,
} from '@mdi/js';
import { useFuzzySearch } from '../hooks/useFuzzySearch';
import { useToast } from './Toast';
import { MapStyleSwitcher } from '../components/MapStyleSwitcher';
import { Logo } from './Logo';

export interface LayerDef {
  id: string;
  label: string;
  color: string;
  iconPath: string;
  category: 'transport' | 'natural' | 'space' | 'infrastructure' | 'weather' | 'energy';
}

export const LAYERS: LayerDef[] = [
  { id: 'aircraft', label: 'Aircraft', color: '#38bdf8', iconPath: mdiAirplane, category: 'transport' },
  { id: 'ship', label: 'Ships (AIS)', color: '#facc15', iconPath: mdiFerry, category: 'transport' },
  { id: 'satellite', label: 'Satellites', color: '#a78bfa', iconPath: mdiSatelliteVariant, category: 'space' },
  { id: 'launch', label: 'Space Launches', color: '#10b981', iconPath: mdiRocketLaunch, category: 'space' },
  { id: 'earthquake', label: 'Earthquakes', color: '#ef4444', iconPath: mdiTsunami, category: 'natural' },
  { id: 'event', label: 'Global Events', color: '#f97316', iconPath: mdiBroadcast, category: 'natural' },
  { id: 'wildfire', label: 'Wildfires', color: '#dc2626', iconPath: mdiFire, category: 'natural' },
  { id: 'weather', label: 'Weather', color: '#3b82f6', iconPath: mdiWeatherCloudy, category: 'weather' },
  { id: 'cable', label: 'Subsea Cables', color: '#00ffaa', iconPath: mdiCableData, category: 'infrastructure' },
  { id: 'volcano', label: 'Volcanoes', color: '#ff6b35', iconPath: mdiVolcano, category: 'natural' },
  { id: 'fireball', label: 'Fireballs', color: '#f472b6', iconPath: mdiCrosshairsGps, category: 'space' },
  { id: 'starlink', label: 'Starlink', color: '#c084fc', iconPath: mdiStarFourPoints, category: 'space' },
  { id: 'iss', label: 'ISS', color: '#22d3ee', iconPath: mdiSpaceStation, category: 'space' },
  { id: 'powerplant', label: 'Power Plants', color: '#fbbf24', iconPath: mdiFactory, category: 'energy' },
  { id: 'windfarm', label: 'Wind Farms', color: '#34d399', iconPath: mdiWindTurbine, category: 'energy' },
  { id: 'meteorite', label: 'Meteorites', color: '#fb923c', iconPath: mdiMeteor, category: 'natural' },
  { id: 'ixp', label: 'Internet Exchanges', color: '#818cf8', iconPath: mdiRouterNetwork, category: 'infrastructure' },
  { id: 'airport', label: 'Airports', color: '#94a3b8', iconPath: mdiAirplane, category: 'infrastructure' },
];

const CATEGORY_ORDER: Record<string, number> = {
  transport: 0,
  space: 1,
  natural: 2,
  weather: 3,
  energy: 4,
  infrastructure: 5,
};

const CATEGORY_LABELS: Record<string, string> = {
  transport: 'Transport',
  space: 'Space',
  natural: 'Natural Hazards',
  weather: 'Weather',
  energy: 'Energy',
  infrastructure: 'Infrastructure',
};

interface AppUIProps {
  connected: boolean;
  visibility: Record<string, boolean>;
  setVisibility: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  stats: Record<string, number>;
  searchItems: Array<{
    id: string;
    name: string;
    type: string;
    lat: number;
    lon: number;
    alt?: number;
  }>;
  onFocusEntity: (item: { id: string; name: string; type: string; lat: number; lon: number; alt?: number }) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  onToggleHelp: () => void;
  onMyLocation?: () => void;
  viewer?: any;
}

function MdiIcon({ path, size = 16, color = 'currentColor' }: { path: string; size?: number; color?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ display: 'block', color, flexShrink: 0 }}>
      <path d={path} fill="currentColor" />
    </svg>
  );
}

export const AppUI = memo(function AppUI({
  connected,
  visibility,
  setVisibility,
  stats,
  searchItems,
  onFocusEntity,
  onZoomIn,
  onZoomOut,
  onResetView,
  onToggleHelp,
  onMyLocation,
  viewer,
}: AppUIProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' && window.innerWidth < 768
  );

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Default sidebar closed on mobile
  useEffect(() => {
    setSidebarOpen(!isMobile);
  }, [isMobile]);

  const searchResults = useFuzzySearch(searchItems, search, 12);

  const toggleLayer = (layer: string) => {
    setVisibility(prev => {
      const next = { ...prev, [layer]: !(prev[layer] ?? true) };
      const isVisible = next[layer];
      toast.addToast(
        `${LAYERS.find(l => l.id === layer)?.label} ${isVisible ? 'shown' : 'hidden'}`,
        'info',
        2000
      );
      return next;
    });
  };

  const toggleAllInCategory = (category: string) => {
    const ids = LAYERS.filter(l => l.category === category).map(l => l.id);
    const allVisible = ids.every(id => visibility[id] ?? true);
    setVisibility(prev => {
      const next = { ...prev };
      ids.forEach(id => (next[id] = !allVisible));
      return next;
    });
    toast.addToast(
      `${CATEGORY_LABELS[category]} ${allVisible ? 'hidden' : 'shown'}`,
      'info',
      2000
    );
  };

  // Keyboard shortcut for search focus
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Group layers by category
  const groupedLayers = useMemo(() => {
    const groups: Record<string, LayerDef[]> = {};
    for (const l of LAYERS) {
      if (!groups[l.category]) groups[l.category] = [];
      groups[l.category].push(l);
    }
    return Object.entries(groups).sort((a, b) => CATEGORY_ORDER[a[0]] - CATEGORY_ORDER[b[0]]);
  }, []);

  const totalEntities = Object.values(stats).reduce((a, b) => a + b, 0);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        fontFamily: "'Inter', sans-serif",
      }}
    >
      {/* ===== TOP HUD ===== */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          padding: isMobile ? 8 : '20px 24px',
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          justifyContent: 'space-between',
          alignItems: isMobile ? 'stretch' : 'flex-start',
          zIndex: 30,
          gap: isMobile ? 6 : 12,
        }}
      >
        {/* Left: Title Card */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, pointerEvents: 'auto' }}>
          <div
            className="glass-panel"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 16px',
              borderRadius: 8,
            }}
          >
            <Logo size={26} />
            <h1
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: '#fff',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                margin: 0,
                display: isMobile ? 'none' : 'block',
              }}
            >
              AtlasMesh
            </h1>
            <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.10)', display: isMobile ? 'none' : 'block' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  backgroundColor: connected ? 'var(--accent-success)' : 'var(--accent-danger)',
                  boxShadow: connected ? '0 0 8px var(--accent-success)' : 'none',
                  transition: 'all 300ms',
                }}
              />
              <span
                style={{
                  fontSize: 10,
                  fontFamily: 'var(--font-mono)',
                  letterSpacing: '0.12em',
                  color: 'var(--text-muted)',
                  textTransform: 'uppercase',
                }}
              >
                {connected ? 'Live' : 'Offline'}
              </span>
            </div>
          </div>
        </div>

        {/* Center: Floating Search */}
        <div
          style={{
            position: isMobile ? 'relative' : 'absolute',
            top: isMobile ? undefined : 20,
            left: isMobile ? undefined : '50%',
            transform: isMobile ? undefined : 'translateX(-50%)',
            width: isMobile ? '100%' : 420,
            maxWidth: isMobile ? undefined : '60vw',
            pointerEvents: 'auto',
            zIndex: 35,
            marginTop: isMobile ? 8 : 0,
          }}
        >
          <div
            className="glass-panel"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 14px',
              borderRadius: 10,
              borderColor: searchFocused ? 'rgba(56,189,248,0.35)' : undefined,
              boxShadow: searchFocused
                ? '0 0 0 1px rgba(56,189,248,0.20), 0 12px 40px rgba(0,0,0,0.50)'
                : '0 8px 32px rgba(0,0,0,0.35)',
              transition: 'all var(--transition-base)',
            }}
          >
            <MdiIcon path={mdiMagnify} size={16} color="var(--text-muted)" />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
              placeholder="Search aircraft, ships, earthquakes..."
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--text-primary)',
                fontSize: 13,
                letterSpacing: '0.01em',
                fontFamily: 'var(--font-sans)',
              }}
            />
            {!isMobile && (
              <kbd
                style={{
                  padding: '2px 6px',
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 4,
                  fontSize: 10,
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-muted)',
                }}
              >
                ⌘K
              </kbd>
            )}
          </div>

          {/* Search Results Dropdown */}
          {searchFocused && search.trim() && (
            <div
              className="glass-panel"
              style={{
                marginTop: 8,
                maxHeight: 320,
                overflowY: 'auto',
                borderRadius: 10,
                zIndex: 40,
                animation: 'fadeSlideIn 200ms ease',
                boxShadow: '0 16px 48px rgba(0,0,0,0.50)',
              }}
            >
              {searchResults.length > 0 ? (
                searchResults.map((item) => (
                  <button
                    key={item.id}
                    onMouseDown={() => {
                      onFocusEntity(item);
                      setSearch('');
                      setSearchFocused(false);
                    }}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '10px 14px',
                      border: 'none',
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      background: 'transparent',
                      color: 'var(--text-primary)',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      transition: 'background var(--transition-fast)',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 500,
                        maxWidth: '70%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.name}
                    </span>
                    <span
                      style={{
                        fontSize: 10,
                        color: 'var(--text-muted)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        fontFamily: 'var(--font-mono)',
                        flexShrink: 0,
                        paddingLeft: 8,
                      }}
                    >
                      {item.type}
                    </span>
                  </button>
                ))
              ) : (
                <div
                  style={{
                    padding: '16px 14px',
                    textAlign: 'center',
                    fontSize: 12,
                    color: 'var(--text-muted)',
                  }}
                >
                  No results for &quot;{search}&quot;
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Stats + Controls */}
        <div style={{ display: 'flex', flexDirection: isMobile ? 'row' : 'column', alignItems: isMobile ? 'center' : 'flex-end', gap: isMobile ? 6 : 10, pointerEvents: 'auto' }}>
          {/* Entity Count Card */}
          {!isMobile && (
          <div
            className="glass-panel"
            style={{
              padding: '12px 18px',
              borderRadius: 8,
              textAlign: 'right',
            }}
          >
            <div
              style={{
                fontSize: 9,
                textTransform: 'uppercase',
                letterSpacing: '0.18em',
                color: 'var(--text-muted)',
                marginBottom: 4,
              }}
            >
              Global Entities
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 22,
                color: '#fff',
                fontWeight: 500,
                lineHeight: 1,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {totalEntities.toLocaleString()}
            </div>
          </div>
          )}

          {/* Zoom Controls */}
          <div
            className="glass-panel"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: isMobile ? 2 : 4,
              padding: isMobile ? '4px 6px' : 8,
              borderRadius: 10,
            }}
          >
            <IconButton onClick={onZoomIn} title="Zoom In" icon={mdiPlus} size={isMobile ? 34 : 40} />
            <IconButton onClick={onResetView} title="Reset View (R)" icon={mdiTarget} accent size={isMobile ? 34 : 40} />
            <IconButton onClick={onZoomOut} title="Zoom Out" icon={mdiMinus} size={isMobile ? 34 : 40} />
            <div style={{ width: isMobile ? 16 : 24, height: 1, background: 'rgba(255,255,255,0.08)', margin: '2px 0' }} />
            <IconButton onClick={onMyLocation} title="My Location" icon={mdiCrosshairsGps} size={isMobile ? 34 : 40} />
            <IconButton onClick={onToggleHelp} title="Shortcuts (?)" icon={mdiKeyboardOutline} size={isMobile ? 34 : 40} />
            {viewer && <MapStyleSwitcher viewer={viewer} />}
          </div>
        </div>
      </div>

      {/* ===== SIDEBAR ===== */}
      <div
        className="glass-panel"
        style={{
          position: 'absolute',
          bottom: 24,
          left: isMobile ? 12 : 24,
          top: isMobile ? 140 : 96,
          width: isMobile ? 'calc(100vw - 24px)' : 300,
          borderRadius: 12,
          display: 'flex',
          flexDirection: 'column',
          pointerEvents: 'auto',
          transition: 'transform var(--transition-slow), opacity var(--transition-base)',
          transform: sidebarOpen ? 'translateX(0)' : 'translateX(calc(-100% - 40px))',
          opacity: sidebarOpen ? 1 : 0,
          zIndex: 20,
          overflow: 'hidden',
        }}
      >
        {/* Sidebar Header */}
        <div
          style={{
            padding: '16px 18px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <MdiIcon path={mdiRadar} size={16} color="var(--text-muted)" />
            <span
              style={{
                fontSize: 11,
                textTransform: 'uppercase',
                letterSpacing: '0.14em',
                color: 'var(--text-muted)',
                fontWeight: 500,
              }}
            >
              Data Feeds
            </span>
          </div>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            {LAYERS.filter(l => visibility[l.id] ?? true).length}/{LAYERS.length}
          </span>
        </div>

        {/* Layer List by Category */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '6px' }}>
          {groupedLayers.map(([category, layers]) => (
            <div key={category} style={{ marginBottom: 8 }}>
              {/* Category Header */}
              <button
                onClick={() => toggleAllInCategory(category)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 10px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-muted)',
                  fontSize: 10,
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                  fontWeight: 600,
                  transition: 'color var(--transition-fast)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
              >
                <span>{CATEGORY_LABELS[category]}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 400 }}>
                  {layers.filter(l => visibility[l.id] ?? true).length}/{layers.length}
                </span>
              </button>

              {layers.map(l => {
                const isVisible = visibility[l.id] ?? true;
                const count = stats[l.id] || 0;
                return (
                  <button
                    key={l.id}
                    onClick={() => toggleLayer(l.id)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '9px 12px',
                      margin: '2px 0',
                      borderRadius: 6,
                      backgroundColor: isVisible ? 'rgba(255,255,255,0.03)' : 'transparent',
                      border: '1px solid transparent',
                      cursor: 'pointer',
                      transition: 'all var(--transition-fast)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)';
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = isVisible ? 'rgba(255,255,255,0.03)' : 'transparent';
                      e.currentTarget.style.borderColor = 'transparent';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <MdiIcon path={l.iconPath} size={15} color={isVisible ? l.color : 'var(--text-disabled)'} />
                      <div
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: 3,
                          border: `1.5px solid ${isVisible ? l.color : 'var(--text-disabled)'}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all var(--transition-fast)',
                        }}
                      >
                        {isVisible && (
                          <div
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: 1,
                              backgroundColor: l.color,
                            }}
                          />
                        )}
                      </div>
                      <span
                        style={{
                          fontSize: 12.5,
                          letterSpacing: '0.02em',
                          color: isVisible ? 'var(--text-primary)' : 'var(--text-disabled)',
                          fontWeight: isVisible ? 500 : 400,
                          transition: 'color var(--transition-fast)',
                        }}
                      >
                        {l.label}
                      </span>
                    </div>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11,
                        color: isVisible ? 'var(--text-muted)' : 'var(--text-disabled)',
                        fontVariantNumeric: 'tabular-nums',
                        transition: 'color var(--transition-fast)',
                      }}
                    >
                      {count > 0 ? count.toLocaleString() : '—'}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Sidebar Footer */}
        <div
          style={{
            padding: '12px 16px',
            borderTop: '1px solid var(--border-subtle)',
            backgroundColor: 'rgba(255,255,255,0.02)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: 10,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--text-disabled)',
              fontFamily: 'var(--font-mono)',
            }}
          >
            <span>AtlasMesh v2</span>
            <MdiIcon path={mdiCrosshairsGps} size={12} color="var(--text-disabled)" />
          </div>
        </div>
      </div>

      {/* Sidebar Toggle Button */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className="glass-panel"
        style={{
          position: 'absolute',
          bottom: 24,
          left: isMobile ? (sidebarOpen ? undefined : 12) : (sidebarOpen ? 318 : 24),
          right: isMobile && sidebarOpen ? 12 : undefined,
          width: 42,
          height: 42,
          borderRadius: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          cursor: 'pointer',
          transition: 'all var(--transition-slow)',
          pointerEvents: 'auto',
          zIndex: 25,
          border: '1px solid rgba(255,255,255,0.10)',
        }}
        title={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
      >
        <MdiIcon
          path={sidebarOpen ? mdiMenuOpen : mdiMenu}
          size={20}
          color="#ffffff"
        />
      </button>
    </div>
  );
});

/* ===== IconButton subcomponent ===== */
function IconButton({
  onClick,
  title,
  icon,
  accent = false,
  size = 32,
}: {
  onClick: () => void;
  title: string;
  icon: string;
  accent?: boolean;
  size?: number;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: size,
        height: size,
        borderRadius: 6,
        border: '1px solid rgba(255,255,255,0.08)',
        background: accent ? 'rgba(56,189,248,0.10)' : 'rgba(255,255,255,0.03)',
        color: accent ? 'var(--accent-primary)' : 'var(--text-secondary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        transition: 'all var(--transition-fast)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = accent ? 'rgba(56,189,248,0.18)' : 'rgba(255,255,255,0.08)';
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)';
        e.currentTarget.style.color = accent ? 'var(--accent-primary)' : '#fff';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = accent ? 'rgba(56,189,248,0.10)' : 'rgba(255,255,255,0.03)';
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
        e.currentTarget.style.color = accent ? 'var(--accent-primary)' : 'var(--text-secondary)';
      }}
    >
      <MdiIcon path={icon} size={16} />
    </button>
  );
}
