import React from 'react';
import { X } from 'lucide-react';

interface EntityInfoPanelProps {
  entity: {
    id: string;
    type: string;
    position: Record<string, string>;
    metadata: Record<string, any>;
    name: string;
  };
  onClose: () => void;
}

const TYPE_LABELS: Record<string, string> = {
  aircraft: 'Aircraft',
  ship: 'Maritime Vessel',
  satellite: 'Satellite',
  earthquake: 'Seismic Event',
  event: 'Environmental Event',
  lightning: 'Lightning Strike',
  weather: 'Weather Station',
  launch: 'Space Launch',
  wildfire: 'Active Fire',
  cable: 'Submarine Cable',
  volcano: 'Volcano',
};

const TYPE_COLORS: Record<string, string> = {
  aircraft: '#38bdf8',
  ship: '#facc15',
  satellite: '#a78bfa',
  earthquake: '#ef4444',
  event: '#f97316',
  lightning: '#fef08a',
  weather: '#3b82f6',
  launch: '#10b981',
  wildfire: '#dc2626',
  cable: '#00ffaa',
  volcano: '#ff6b35',
};

function formatValue(key: string, value: any): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (key.includes('time') || key.includes('Time')) {
      return new Date(value).toLocaleString();
    }
    return value.toLocaleString();
  }
  return String(value);
}

// Keys to hide from the detail view
const HIDDEN_KEYS = new Set(['raw', 'path', 'sources']);

export function EntityInfoPanel({ entity, onClose }: EntityInfoPanelProps) {
  const color = TYPE_COLORS[entity.type] || '#fff';
  const label = TYPE_LABELS[entity.type] || entity.type;

  // Build display metadata
  const displayMeta = Object.entries(entity.metadata || {}).filter(
    ([key]) => !HIDDEN_KEYS.has(key) && !key.startsWith('_')
  );

  return (
    <div style={{
      position: 'absolute',
      top: 96,
      right: 24,
      width: 320,
      maxHeight: 'calc(100vh - 120px)',
      backgroundColor: 'rgba(0,0,0,0.95)',
      backdropFilter: 'blur(8px)',
      border: '1px solid #262626',
      pointerEvents: 'auto',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      fontFamily: "'Inter', sans-serif",
      zIndex: 30,
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid #262626',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <div style={{ width: 8, height: 8, backgroundColor: color, borderRadius: 1 }} />
            <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.15em', color: color, fontWeight: 600 }}>
              {label}
            </span>
          </div>
          <h3 style={{ fontSize: 14, color: '#fff', fontWeight: 600, margin: 0, lineHeight: 1.3, wordBreak: 'break-word' }}>
            {entity.name}
          </h3>
        </div>
        <button 
          onClick={onClose}
          style={{
            background: 'none',
            border: '1px solid #262626',
            color: '#a3a3a3',
            cursor: 'pointer',
            padding: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <X style={{ width: 14, height: 14 }} />
        </button>
      </div>

      {/* Position */}
      {Object.keys(entity.position).length > 0 && (
        <div style={{ padding: '12px 20px', borderBottom: '1px solid #1a1a1a' }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.12em', color: '#525252', marginBottom: 8 }}>
            Position
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {Object.entries(entity.position).map(([key, val]) => (
              <div key={key}>
                <div style={{ fontSize: 9, textTransform: 'uppercase', color: '#525252', marginBottom: 2 }}>{key}</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#e5e5e5' }}>{val}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Metadata */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px' }}>
        {displayMeta.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {displayMeta.map(([key, value]) => (
              <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                <span style={{ fontSize: 11, color: '#525252', textTransform: 'capitalize', flexShrink: 0 }}>
                  {key.replace(/_/g, ' ')}
                </span>
                <span style={{ 
                  fontFamily: "'JetBrains Mono', monospace", 
                  fontSize: 11, 
                  color: '#e5e5e5', 
                  textAlign: 'right',
                  wordBreak: 'break-word',
                  maxWidth: '60%',
                }}>
                  {formatValue(key, value)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: 11, color: '#525252', fontStyle: 'italic' }}>No additional data</div>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: '8px 20px', borderTop: '1px solid #1a1a1a' }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#333', wordBreak: 'break-all' }}>
          {entity.id}
        </span>
      </div>
    </div>
  );
}
