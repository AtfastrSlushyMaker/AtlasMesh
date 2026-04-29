import React, { useState } from 'react';
import { Activity, Globe, Crosshair, ChevronLeft, ChevronRight, BarChart2 } from 'lucide-react';

interface AppUIProps {
  connected: boolean;
  visibility: Record<string, boolean>;
  setVisibility: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  stats: Record<string, number>;
}

export function AppUI({ connected, visibility, setVisibility, stats }: AppUIProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const toggleLayer = (layer: string) => {
    setVisibility(prev => ({ ...prev, [layer]: !(prev[layer] ?? true) }));
  };

  const layers = [
    { id: 'aircraft', label: 'Aircraft', color: '#38bdf8' },
    { id: 'ship', label: 'Maritime', color: '#facc15' },
    { id: 'satellite', label: 'Satellites', color: '#a78bfa' },
    { id: 'launch', label: 'Launches', color: '#10b981' },
    { id: 'earthquake', label: 'Seismic', color: '#ef4444' },
    { id: 'event', label: 'Events', color: '#f97316' },
    { id: 'wildfire', label: 'Wildfires', color: '#dc2626' },
    { id: 'lightning', label: 'Lightning', color: '#fef08a' },
    { id: 'weather', label: 'Atmosphere', color: '#3b82f6' },
    { id: 'cable', label: 'Fiber Optic', color: '#00ffaa' },
    { id: 'volcano', label: 'Volcanoes', color: '#ff6b35' },
  ];

  const totalEntities = Object.values(stats).reduce((a, b) => a + b, 0);

  return (
    <div className="absolute inset-0 pointer-events-none flex overflow-hidden" style={{ fontFamily: "'Inter', sans-serif" }}>
      
      {/* Top HUD */}
      <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-start z-10">
        <div className="flex flex-col gap-1 pointer-events-auto">
          <div className="flex items-center gap-3 px-4 py-2 transition-colors group" 
               style={{ backgroundColor: '#000', border: '1px solid #262626' }}>
            <Globe className="w-5 h-5 text-white" />
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
        </div>

        <div className="flex gap-4 pointer-events-auto">
          <div className="flex flex-col items-end px-5 py-2" 
               style={{ backgroundColor: '#000', border: '1px solid #262626' }}>
            <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#525252', marginBottom: 4 }}>Global Entities</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, color: '#fff', fontWeight: 500, lineHeight: 1 }}>
              {totalEntities.toLocaleString()}
            </span>
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
            <BarChart2 style={{ width: 16, height: 16 }} /> Data Feeds
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
            <Activity style={{ width: 12, height: 12 }} />
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
        {sidebarOpen ? <ChevronLeft style={{ width: 20, height: 20 }} /> : <Crosshair style={{ width: 20, height: 20 }} />}
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
