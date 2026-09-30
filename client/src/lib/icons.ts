import {
  mdiWeatherHurricane, mdiSnowflake, mdiWeatherDust, mdiTerrain, mdiWater, mdiFire, mdiVolcano,
  mdiWeatherLightning, mdiPulse, mdiBroadcast, mdiImageFilterHdr, mdiSprout,
} from '@mdi/js';
import { LAYERS } from './layers';

/**
 * Billboard icons drawn once to canvas. A thin dark ring keeps them legible
 * over both satellite imagery and the dark basemap.
 */
const cache = new Map<string, string>();

export function markerIcon(path: string, color: string, size = 40, shape: 'disc' | 'diamond' = 'disc'): string {
  const key = `${path.slice(0, 32)}|${color}|${size}|${shape}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  const ratio = 2;
  canvas.width = canvas.height = size * ratio;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(ratio, ratio);
  const c = size / 2;
  const r = size * 0.36;
  ctx.beginPath();
  if (shape === 'diamond') {
    ctx.moveTo(c, c - r - 2);
    ctx.lineTo(c + r + 2, c);
    ctx.lineTo(c, c + r + 2);
    ctx.lineTo(c - r - 2, c);
    ctx.closePath();
  } else {
    ctx.arc(c, c, r + 1.5, 0, Math.PI * 2);
  }
  ctx.fillStyle = 'rgba(9,18,26,0.85)';
  ctx.fill();
  ctx.beginPath();
  if (shape === 'diamond') {
    ctx.moveTo(c, c - r);
    ctx.lineTo(c + r, c);
    ctx.lineTo(c, c + r);
    ctx.lineTo(c - r, c);
    ctx.closePath();
  } else {
    ctx.arc(c, c, r, 0, Math.PI * 2);
  }
  ctx.fillStyle = color;
  ctx.fill();
  ctx.save();
  const glyph = size * 0.46;
  ctx.translate(c - glyph / 2, c - glyph / 2);
  ctx.scale(glyph / 24, glyph / 24);
  ctx.fillStyle = '#0b141c';
  ctx.fill(new Path2D(path));
  ctx.restore();
  const url = canvas.toDataURL('image/png');
  cache.set(key, url);
  return url;
}

/** Plain glyph with a dark outline, used for heading-rotated vehicles. */
export function glyphIcon(path: string, color: string, size = 32): string {
  const key = `g|${path.slice(0, 32)}|${color}|${size}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  const ratio = 2;
  canvas.width = canvas.height = size * ratio;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(ratio * (size / 24), ratio * (size / 24));
  const p = new Path2D(path);
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = 'rgba(9,18,26,0.9)';
  ctx.lineJoin = 'round';
  ctx.stroke(p);
  ctx.fillStyle = color;
  ctx.fill(p);
  const url = canvas.toDataURL('image/png');
  cache.set(key, url);
  return url;
}

/** Small filled dot for dense layers (fires, buoys). */
export function dotIcon(color: string, size = 12): string {
  const key = `d|${color}|${size}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size * 2;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(2, 2);
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = 'rgba(9,18,26,0.85)';
  ctx.stroke();
  const url = canvas.toDataURL('image/png');
  cache.set(key, url);
  return url;
}

export const EVENT_CATEGORY_ICON: Record<string, string> = {
  'Severe Storms': mdiWeatherHurricane,
  'Sea and Lake Ice': mdiSnowflake,
  Snow: mdiSnowflake,
  'Dust and Haze': mdiWeatherDust,
  Landslides: mdiImageFilterHdr,
  Floods: mdiWater,
  Wildfires: mdiFire,
  Volcanoes: mdiVolcano,
  Earthquakes: mdiPulse,
  'Temperature Extremes': mdiWeatherLightning,
  Drought: mdiSprout,
  'Water Color': mdiWater,
  Manmade: mdiTerrain,
};

export const DISASTER_ICON: Record<string, string> = {
  TC: mdiWeatherHurricane,
  FL: mdiWater,
  DR: mdiSprout,
  EQ: mdiPulse,
  VO: mdiVolcano,
  WF: mdiFire,
};

export const ALERT_COLOR: Record<string, string> = {
  Red: '#e5534b',
  Orange: '#ff8a4c',
  Green: '#5bc98a',
};

export function iconForLayer(id: string) {
  const l = LAYERS.find((x) => x.id === id);
  return l ? markerIcon(l.icon, l.color) : markerIcon(mdiBroadcast, '#999');
}
