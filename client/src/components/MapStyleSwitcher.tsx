import { memo, useState } from 'react';
import {
  mdiEarth,
  mdiSatelliteVariant,
  mdiRoadVariant,
  mdiTerrain,
} from '@mdi/js';

export type MapStyle = 'dark' | 'satellite' | 'street' | 'terrain';

export interface MapStyleDef {
  id: MapStyle;
  label: string;
  iconPath: string;
}

export const MAP_STYLES: MapStyleDef[] = [
  { id: 'dark', label: 'Dark', iconPath: mdiEarth },
  { id: 'satellite', label: 'Satellite', iconPath: mdiSatelliteVariant },
  { id: 'street', label: 'Street', iconPath: mdiRoadVariant },
  { id: 'terrain', label: 'Terrain', iconPath: mdiTerrain },
];

interface MapStyleSwitcherProps {
  viewer: any;
}

function MdiIcon({ path, size = 14, color = 'currentColor' }: { path: string; size?: number; color?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ display: 'block', color, flexShrink: 0 }}>
      <path d={path} fill="currentColor" />
    </svg>
  );
}

export const MapStyleSwitcher = memo(function MapStyleSwitcher({ viewer }: MapStyleSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<MapStyle>('satellite');

  if (!viewer) return null;

  const switchStyle = (style: MapStyle) => {
    setActive(style);
    setOpen(false);

    const Cesium = (viewer as any).__cesium;
    if (!Cesium) return;

    // Remove current imagery layers (keep data sources)
    const imageryLayers = viewer.scene.imageryLayers;
    while (imageryLayers.length > 0) {
      imageryLayers.remove(imageryLayers.get(0));
    }

    let provider: any;
    switch (style) {
      case 'dark':
        provider = new Cesium.UrlTemplateImageryProvider({
          url: 'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
          credit: 'CartoDB',
        });
        break;
      case 'satellite':
        provider = new Cesium.UrlTemplateImageryProvider({
          url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          credit: 'Esri',
        });
        break;
      case 'street':
        provider = new Cesium.UrlTemplateImageryProvider({
          url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
          subdomains: ['a', 'b', 'c'],
          credit: 'OpenStreetMap',
        });
        break;
      case 'terrain':
        provider = new Cesium.UrlTemplateImageryProvider({
          url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
          credit: 'Esri',
        });
        break;
    }

    if (provider) {
      imageryLayers.addImageryProvider(provider);
    }
  };

  return (
    <div style={{ position: 'relative', pointerEvents: 'auto' }}>
      <button
        onClick={() => setOpen(!open)}
        title="Map Style"
        style={{
          width: 40,
          height: 40,
          borderRadius: 8,
          border: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(255,255,255,0.03)',
          color: 'var(--text-secondary)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          transition: 'all 150ms',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
          e.currentTarget.style.color = '#fff';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
          e.currentTarget.style.color = 'var(--text-secondary)';
        }}
      >
        <MdiIcon path={MAP_STYLES.find(s => s.id === active)?.iconPath || mdiEarth} size={18} />
      </button>

      {open && (
        <div
          className="glass-panel"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            borderRadius: 8,
            padding: 4,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
            minWidth: 130,
            animation: 'fadeSlideIn 180ms ease',
            zIndex: 50,
          }}
        >
          {MAP_STYLES.map((s) => (
            <button
              key={s.id}
              onClick={() => switchStyle(s.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 10px',
                borderRadius: 5,
                border: 'none',
                background: active === s.id ? 'rgba(56,189,248,0.12)' : 'transparent',
                color: active === s.id ? 'var(--accent-primary)' : 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: active === s.id ? 500 : 400,
                transition: 'all 120ms',
                textAlign: 'left',
              }}
              onMouseEnter={(e) => {
                if (active !== s.id) {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                }
              }}
              onMouseLeave={(e) => {
                if (active !== s.id) {
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              <MdiIcon path={s.iconPath} size={14} />
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
