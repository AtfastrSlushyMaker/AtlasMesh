import React, { useState, memo, useEffect } from 'react';
import { X, Copy, Check, ExternalLink } from 'lucide-react';
import { useToast } from './Toast';

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
  weather: 'Weather Station',
  launch: 'Space Launch',
  wildfire: 'Active Fire',
  cable: 'Submarine Cable',
  volcano: 'Volcano',
  fireball: 'Meteor Fireball',
  airport: 'Airport',
};

const TYPE_COLORS: Record<string, string> = {
  aircraft: '#38bdf8',
  ship: '#facc15',
  satellite: '#a78bfa',
  earthquake: '#ef4444',
  event: '#f97316',
  weather: '#3b82f6',
  launch: '#10b981',
  wildfire: '#dc2626',
  cable: '#00ffaa',
  volcano: '#ff6b35',
  fireball: '#f472b6',
  airport: '#94a3b8',
};

function formatValue(key: string, value: any): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (key.includes('time') || key.includes('Time') || key.includes('at') || key.includes('Date')) {
      const d = new Date(value);
      if (!isNaN(d.getTime())) return d.toLocaleString();
    }
    return value.toLocaleString();
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

const HIDDEN_KEYS = new Set(['raw', 'path', 'sources', '__v', '_id']);

export const EntityInfoPanel = memo(function EntityInfoPanel({ entity, onClose }: EntityInfoPanelProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'metadata' | 'raw'>('overview');
  const [copied, setCopied] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' && window.innerWidth < 768
  );
  const toast = useToast();

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const color = TYPE_COLORS[entity.type] || '#fff';
  const label = TYPE_LABELS[entity.type] || entity.type;

  const displayMeta = Object.entries(entity.metadata || {}).filter(
    ([key]) => !HIDDEN_KEYS.has(key) && !key.startsWith('_')
  );

  const handleCopy = (text: string, label?: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(text);
      toast.addToast(`${label || 'Value'} copied to clipboard`, 'success', 2000);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const tabs: { id: 'overview' | 'metadata' | 'raw'; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'metadata', label: `Metadata ${displayMeta.length > 0 ? `(${displayMeta.length})` : ''}` },
    { id: 'raw', label: 'Raw' },
  ];

  return (
    <div
      style={{
        position: 'absolute',
        top: isMobile ? undefined : 96,
        right: isMobile ? 8 : 24,
        bottom: isMobile ? 24 : undefined,
        width: isMobile ? 'calc(100vw - 16px)' : 340,
        maxHeight: isMobile ? '50vh' : 'calc(100vh - 120px)',
        background: 'rgba(8,12,24,0.92)',
        backdropFilter: 'blur(24px) saturate(140%)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 12,
        pointerEvents: 'auto',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: "'Inter', sans-serif",
        zIndex: 30,
        animation: 'slideInRight 280ms cubic-bezier(0.16,1,0.3,1)',
        boxShadow: '0 24px 64px rgba(0,0,0,0.50), 0 0 0 1px rgba(255,255,255,0.04)',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '18px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
        }}
      >
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: 2,
                backgroundColor: color,
                boxShadow: `0 0 10px ${color}40`,
              }}
            />
            <span
              style={{
                fontSize: 10,
                textTransform: 'uppercase',
                letterSpacing: '0.14em',
                color: color,
                fontWeight: 600,
              }}
            >
              {label}
            </span>
          </div>
          <h3
            style={{
              fontSize: 14,
              color: '#fff',
              fontWeight: 600,
              margin: 0,
              lineHeight: 1.35,
              wordBreak: 'break-word',
            }}
          >
            {entity.name}
          </h3>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0, marginLeft: 8 }}>
          <HeaderIconButton
            onClick={() => handleCopy(entity.id, 'ID')}
            title="Copy ID"
            icon={copied === entity.id ? <Check size={13} /> : <Copy size={13} />}
          />
          <HeaderIconButton onClick={onClose} title="Close" icon={<X size={14} />} />
        </div>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          padding: '0 8px',
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '10px 12px',
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: '0.04em',
              background: 'none',
              border: 'none',
              borderBottom: `2px solid ${activeTab === tab.id ? color : 'transparent'}`,
              color: activeTab === tab.id ? '#fff' : 'var(--text-muted)',
              cursor: 'pointer',
              transition: 'all var(--transition-fast)',
              marginBottom: -1,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {activeTab === 'overview' && (
          <div style={{ padding: '16px 20px' }}>
            {/* Position Grid */}
            {Object.keys(entity.position).length > 0 && (
              <div
                style={{
                  background: 'rgba(255,255,255,0.03)',
                  borderRadius: 8,
                  padding: 14,
                  marginBottom: 16,
                }}
              >
                <div
                  style={{
                    fontSize: 9,
                    textTransform: 'uppercase',
                    letterSpacing: '0.14em',
                    color: 'var(--text-muted)',
                    marginBottom: 10,
                    fontWeight: 600,
                  }}
                >
                  Position
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  {Object.entries(entity.position).map(([key, val]) => (
                    <div key={key}>
                      <div
                        style={{
                          fontSize: 9,
                          textTransform: 'uppercase',
                          color: 'var(--text-muted)',
                          marginBottom: 3,
                          letterSpacing: '0.08em',
                        }}
                      >
                        {key}
                      </div>
                      <div
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 12,
                          color: 'var(--text-primary)',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {val}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quick Stats from metadata */}
            {displayMeta.length > 0 && (
              <div>
                <div
                  style={{
                    fontSize: 9,
                    textTransform: 'uppercase',
                    letterSpacing: '0.14em',
                    color: 'var(--text-muted)',
                    marginBottom: 10,
                    fontWeight: 600,
                  }}
                >
                  Quick Info
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {displayMeta.slice(0, 6).map(([key, value]) => (
                    <div
                      key={key}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'baseline',
                        gap: 12,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 11,
                          color: 'var(--text-muted)',
                          textTransform: 'capitalize',
                          flexShrink: 0,
                        }}
                      >
                        {key.replace(/_/g, ' ')}
                      </span>
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 11,
                          color: 'var(--text-primary)',
                          textAlign: 'right',
                          wordBreak: 'break-word',
                          maxWidth: '55%',
                        }}
                      >
                        {formatValue(key, value)}
                      </span>
                    </div>
                  ))}
                  {displayMeta.length > 6 && (
                    <button
                      onClick={() => setActiveTab('metadata')}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: color,
                        fontSize: 11,
                        cursor: 'pointer',
                        textAlign: 'center',
                        padding: '4px 0',
                        marginTop: 4,
                      }}
                    >
                      +{displayMeta.length - 6} more fields →
                    </button>
                  )}
                </div>
              </div>
            )}

            {displayMeta.length === 0 && Object.keys(entity.position).length === 0 && (
              <div
                style={{
                  textAlign: 'center',
                  padding: '30px 0',
                  color: 'var(--text-muted)',
                  fontSize: 12,
                }}
              >
                No data available
              </div>
            )}
          </div>
        )}

        {activeTab === 'metadata' && (
          <div style={{ padding: '12px 0' }}>
            {displayMeta.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {displayMeta.map(([key, value]) => (
                  <div
                    key={key}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: 12,
                      padding: '10px 20px',
                      borderBottom: '1px solid rgba(255,255,255,0.03)',
                      transition: 'background var(--transition-fast)',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span
                      style={{
                        fontSize: 11,
                        color: 'var(--text-muted)',
                        textTransform: 'capitalize',
                        flexShrink: 0,
                        paddingTop: 1,
                      }}
                    >
                      {key.replace(/_/g, ' ')}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, maxWidth: '60%' }}>
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 11,
                          color: 'var(--text-primary)',
                          textAlign: 'right',
                          wordBreak: 'break-word',
                        }}
                      >
                        {formatValue(key, value)}
                      </span>
                      <button
                        onClick={() => handleCopy(String(value), key)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          padding: 2,
                          opacity: 0,
                          transition: 'opacity var(--transition-fast)',
                          flexShrink: 0,
                        }}
                        className="copy-btn-trigger"
                        title="Copy"
                      >
                        {copied === String(value) ? <Check size={12} /> : <Copy size={12} />}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div
                style={{
                  textAlign: 'center',
                  padding: '40px 0',
                  color: 'var(--text-muted)',
                  fontSize: 12,
                }}
              >
                No metadata available
              </div>
            )}
          </div>
        )}

        {activeTab === 'raw' && (
          <div style={{ padding: '16px 20px' }}>
            <pre
              style={{
                background: 'rgba(0,0,0,0.3)',
                padding: 14,
                borderRadius: 8,
                fontSize: 10,
                fontFamily: 'var(--font-mono)',
                color: 'var(--text-secondary)',
                overflow: 'auto',
                maxHeight: 400,
                lineHeight: 1.5,
                border: '1px solid rgba(255,255,255,0.04)',
              }}
            >
              {JSON.stringify(
                { id: entity.id, type: entity.type, name: entity.name, position: entity.position, metadata: entity.metadata },
                null,
                2
              )}
            </pre>
            <button
              onClick={() =>
                handleCopy(
                  JSON.stringify({ id: entity.id, type: entity.type, name: entity.name, position: entity.position, metadata: entity.metadata }, null, 2),
                  'JSON'
                )
              }
              style={{
                marginTop: 10,
                width: '100%',
                padding: '8px 0',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: 'var(--text-secondary)',
                fontSize: 11,
                cursor: 'pointer',
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                transition: 'all var(--transition-fast)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                e.currentTarget.style.color = '#fff';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
                e.currentTarget.style.color = 'var(--text-secondary)';
              }}
            >
              {copied?.startsWith('{') ? <Check size={13} /> : <Copy size={13} />}
              Copy JSON
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        style={{
          padding: '10px 20px',
          borderTop: '1px solid rgba(255,255,255,0.05)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9,
            color: 'var(--text-disabled)',
            wordBreak: 'break-all',
            maxWidth: '80%',
          }}
        >
          {entity.id}
        </span>
        <button
          onClick={() => handleCopy(entity.id, 'ID')}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: 4,
            transition: 'color var(--transition-fast)',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#fff')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
          title="Copy ID"
        >
          {copied === entity.id ? <Check size={12} /> : <Copy size={12} />}
        </button>
      </div>

      <style>{`
        .copy-btn-trigger {
          opacity: 0 !important;
        }
        div:hover .copy-btn-trigger {
          opacity: 0.6 !important;
        }
        div:hover .copy-btn-trigger:hover {
          opacity: 1 !important;
          color: #fff !important;
        }
      `}</style>
    </div>
  );
});

function HeaderIconButton({
  onClick,
  title,
  icon,
}: {
  onClick: () => void;
  title: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 30,
        height: 30,
        borderRadius: 6,
        border: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(255,255,255,0.03)',
        color: 'var(--text-secondary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        transition: 'all var(--transition-fast)',
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
        e.currentTarget.style.color = '#fff';
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
        e.currentTarget.style.color = 'var(--text-secondary)';
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
      }}
    >
      {icon}
    </button>
  );
}
