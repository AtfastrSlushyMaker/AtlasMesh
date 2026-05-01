import React, { useMemo, useState } from 'react';
import {
  mdiAirplane,
  mdiBroadcast,
  mdiCableData,
  mdiCrosshairsGps,
  mdiFerry,
  mdiFire,
  mdiGlobeLight,
  mdiLightningBolt,
  mdiMagnify,
  mdiMenu,
  mdiMenuOpen,
  mdiMinus,
  mdiPlus,
  mdiRadar,
  mdiRocketLaunch,
  mdiSatelliteVariant,
  mdiTarget,
  mdiTsunami,
  mdiVolcano,
  mdiWeatherCloudy,
} from '@mdi/js';

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
}

export function AppUI({
  connected,
  visibility,
  setVisibility,
  stats,
  searchItems,
  onFocusEntity,
  onZoomIn,
  onZoomOut,
  onResetView,
}: AppUIProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);

  const MdiIcon = ({ path, size = 16, color = 'currentColor' }: { path: string; size?: number; color?: string }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ display: 'block', color }}>
      <path d={path} fill="currentColor" />
    </svg>
  );

  const toggleLayer = (layer: string) => {
    setVisibility(prev => ({ ...prev, [layer]: !(prev[layer] ?? true) }));
  };

  const layers = [
    { id: 'aircraft', label: 'Aircraft', color: '#38bdf8', iconPath: mdiAirplane },
    { id: 'ship', label: 'Ships (AIS)', color: '#facc15', iconPath: mdiFerry },
    { id: 'satellite', label: 'Satellites', color: '#a78bfa', iconPath: mdiSatelliteVariant },
    { id: 'launch', label: 'Space Launches', color: '#10b981', iconPath: mdiRocketLaunch },
    { id: 'earthquake', label: 'Earthquakes', color: '#ef4444', iconPath: mdiTsunami },
    { id: 'event', label: 'Global Events', color: '#f97316', iconPath: mdiBroadcast },
    { id: 'wildfire', label: 'Wildfires', color: '#dc2626', iconPath: mdiFire },
    { id: 'lightning', label: 'Lightning', color: '#fef08a', iconPath: mdiLightningBolt },
    { id: 'weather', label: 'Weather Stations', color: '#3b82f6', iconPath: mdiWeatherCloudy },
    { id: 'cable', label: 'Subsea Cables', color: '#00ffaa', iconPath: mdiCableData },
    { id: 'volcano', label: 'Volcanoes', color: '#ff6b35', iconPath: mdiVolcano },
  ];

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];

    return searchItems
      .filter((item) => {
        return (
          item.name.toLowerCase().includes(q) ||
          item.id.toLowerCase().includes(q) ||
          item.type.toLowerCase().includes(q)
        );
      })
      .slice(0, 10);
  }, [search, searchItems]);

  const totalEntities = Object.values(stats).reduce((a, b) => a + b, 0);

  return (
    <div className="absolute inset-0 pointer-events-none flex overflow-hidden" style={{ fontFamily: "'Inter', sans-serif" }}>
      
      {/* Top HUD */}
      <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-start z-10">
        <div className="flex flex-col gap-1 pointer-events-auto">
          <div className="flex items-center gap-3 px-4 py-2 transition-colors group" 
               style={{ backgroundColor: '#000', border: '1px solid #262626' }}>
            <MdiIcon path={mdiGlobeLight} size={18} color="#ffffff" />
            <h1 className="font-semibold text-white tracking-widest uppercase text-sm">AtlasMesh</h1>
            <div style={{ width: 1, height: 16, backgroundColor: '#262626', margin: '0 8px' }}></div>
            <div className="flex items-center gap-2">
              <div style={{ 
                width: 8, height: 8, 
                backgroundColor: connected ? '#10b981' : '#ef4444',
                animation: connected ? 'pulse 2s infinite' : 'none'
              }} />
              <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.15em', color: '#a3a3a3', textTransform: 'uppercase' }}>
                {connected ? 'Sync Active' : 'Offline'}
              </span>
            </div>
          </div>

          <div
            style={{
              position: 'relative',
              marginTop: 10,
              width: 340,
              pointerEvents: 'auto',
              transform: searchOpen ? 'translateY(0)' : 'translateY(2px)',
              transition: 'all 220ms cubic-bezier(0.16,1,0.3,1)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 12px',
                background: 'linear-gradient(180deg, rgba(8,10,14,0.95), rgba(4,6,10,0.95))',
                border: '1px solid #1f2937',
                boxShadow: searchOpen ? '0 8px 28px rgba(0,0,0,0.45)' : '0 2px 10px rgba(0,0,0,0.35)',
              }}
            >
              <MdiIcon path={mdiMagnify} size={18} color="#93c5fd" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onFocus={() => setSearchOpen(true)}
                onBlur={() => setTimeout(() => setSearchOpen(false), 120)}
                placeholder="Search aircraft, events, IDs..."
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: '#e5e7eb',
                  fontSize: 13,
                  letterSpacing: '0.02em',
                }}
              />
            </div>

            {searchOpen && searchResults.length > 0 && (
              <div
                style={{
                  marginTop: 6,
                  backgroundColor: 'rgba(5,8,12,0.96)',
                  border: '1px solid #1f2937',
                  maxHeight: 280,
                  overflowY: 'auto',
                  animation: 'fadeSlideIn 220ms ease',
                }}
              >
                {searchResults.map((item) => (
                  <button
                    key={item.id}
                    onMouseDown={() => {
                      onFocusEntity(item);
                      setSearch(item.name);
                    }}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '10px 12px',
                      border: 'none',
                      borderBottom: '1px solid rgba(31,41,55,0.5)',
                      background: 'transparent',
                      color: '#e5e7eb',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span style={{ fontSize: 12, fontWeight: 500, maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.name}
                    </span>
                    <span style={{ fontSize: 10, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      {item.type}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-4 pointer-events-auto">
          <div className="flex flex-col items-end px-5 py-2" 
               style={{ backgroundColor: '#000', border: '1px solid #262626' }}>
            <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#525252', marginBottom: 4 }}>Global Entities</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, color: '#fff', fontWeight: 500, lineHeight: 1 }}>
              {totalEntities.toLocaleString()}
            </span>
          </div>

          <div style={{ backgroundColor: '#000', border: '1px solid #262626', padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={onZoomOut} title="Zoom Out" style={{ width: 28, height: 28, border: '1px solid #1f2937', background: '#05070b', color: '#d1d5db', cursor: 'pointer' }}>
              <MdiIcon path={mdiMinus} size={16} color="#d1d5db" />
            </button>
            <button onClick={onResetView} title="Reset View" style={{ width: 28, height: 28, border: '1px solid #1f2937', background: '#05070b', color: '#93c5fd', cursor: 'pointer' }}>
              <MdiIcon path={mdiTarget} size={16} color="#93c5fd" />
            </button>
            <button onClick={onZoomIn} title="Zoom In" style={{ width: 28, height: 28, border: '1px solid #1f2937', background: '#05070b', color: '#d1d5db', cursor: 'pointer' }}>
              <MdiIcon path={mdiPlus} size={16} color="#d1d5db" />
            </button>
          </div>
        </div>
      </div>

      {/* Control Panel (Sidebar) */}
      <div style={{
        position: 'absolute',
        bottom: 24, left: 24, top: 96,
        width: 280,
        backgroundColor: 'rgba(0,0,0,0.95)',
        backdropFilter: 'blur(4px)',
        border: '1px solid #262626',
        display: 'flex',
        flexDirection: 'column',
        pointerEvents: 'auto',
        transition: 'transform 0.5s cubic-bezier(0.16,1,0.3,1)',
        transform: sidebarOpen ? 'translateX(0)' : 'translateX(-120%)',
      }}>
        <div style={{ padding: 20, borderBottom: '1px solid #262626', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.15em', color: '#a3a3a3', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
            <MdiIcon path={mdiRadar} size={16} color="#a3a3a3" /> Data Feeds
          </h2>
        </div>
        
        <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
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
                  padding: '10px 12px',
                  border: '1px solid transparent',
                  backgroundColor: 'transparent',
                  cursor: 'pointer',
                  transition: 'background-color 0.15s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#0a0a0a')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span style={{ color: isVisible ? l.color : '#4b5563', display: 'flex', alignItems: 'center', transition: 'color 0.2s' }}>
                    <MdiIcon path={l.iconPath} size={16} color={isVisible ? l.color : '#4b5563'} />
                  </span>
                  <div style={{
                    width: 14, height: 14,
                    border: `1.5px solid ${isVisible ? '#fff' : '#525252'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'border-color 0.2s',
                  }}>
                    {isVisible && <div style={{ width: 6, height: 6, backgroundColor: l.color }} />}
                  </div>
                  <span style={{
                    fontSize: 13,
                    letterSpacing: '0.04em',
                    color: isVisible ? '#fff' : '#525252',
                    fontWeight: isVisible ? 500 : 400,
                    transition: 'color 0.2s',
                  }}>
                    {l.label}
                  </span>
                </div>
                <span style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 11,
                  color: isVisible ? '#a3a3a3' : 'rgba(82,82,82,0.5)',
                  transition: 'color 0.2s',
                }}>
                  {count.toLocaleString()}
                </span>
              </button>
            );
          })}
        </div>
        
        <div style={{ padding: 14, borderTop: '1px solid #262626', backgroundColor: 'rgba(10,10,10,0.5)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#525252' }}>
            <span>Terminal V1.0</span>
            <MdiIcon path={mdiCrosshairsGps} size={12} color="#525252" />
          </div>
        </div>
      </div>

      {/* Sidebar Toggle */}
      <button 
        onClick={() => setSidebarOpen(!sidebarOpen)}
        style={{
          position: 'absolute',
          bottom: 24, left: 24,
          width: 40, height: 40,
          backgroundColor: '#000',
          border: '1px solid #262626',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff',
          cursor: 'pointer',
          transition: 'transform 0.5s cubic-bezier(0.16,1,0.3,1)',
          transform: sidebarOpen ? 'translateX(300px)' : 'translateX(0)',
          pointerEvents: 'auto',
          zIndex: 20,
        }}
      >
        {sidebarOpen ? <MdiIcon path={mdiMenuOpen} size={20} color="#ffffff" /> : <MdiIcon path={mdiMenu} size={20} color="#ffffff" />}
      </button>

      {/* Bottom Right Decoration */}
      <div style={{ position: 'absolute', bottom: 24, right: 24, width: 128, height: 128, pointerEvents: 'none', opacity: 0.2 }}>
        <div style={{ position: 'absolute', bottom: 0, right: 0, width: '100%', height: 1, backgroundColor: '#fff' }}></div>
        <div style={{ position: 'absolute', bottom: 0, right: 0, width: 1, height: '100%', backgroundColor: '#fff' }}></div>
        <div style={{ position: 'absolute', bottom: 8, right: 8, fontSize: 10, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.15em', color: '#fff' }}>SYS.OP.OK</div>
      </div>
    </div>
  );
}
