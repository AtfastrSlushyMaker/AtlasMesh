import { getApp } from '../state';

const nf = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

export const fmtNum = (n: number | undefined | null, digits = 1) =>
  n == null || !Number.isFinite(n) ? '—' : digits === 0 ? nf0.format(n) : new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(n);

export const fmtInt = (n: number) => nf0.format(n);

export function fmtCompact(n: number) {
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

export function fmtAgo(ts: number | string | null | undefined) {
  if (ts == null) return '—';
  const t = typeof ts === 'string' ? Date.parse(ts) : ts;
  if (!Number.isFinite(t)) return '—';
  const s = Math.round((t - Date.now()) / 1000);
  const a = Math.abs(s);
  if (a < 45) return s <= 0 ? 'just now' : 'in a moment';
  if (a < 3600) return rtf.format(Math.round(s / 60), 'minute');
  if (a < 86400) return rtf.format(Math.round(s / 3600), 'hour');
  if (a < 86400 * 45) return rtf.format(Math.round(s / 86400), 'day');
  if (a < 86400 * 400) return rtf.format(Math.round(s / (86400 * 30)), 'month');
  return rtf.format(Math.round(s / (86400 * 365)), 'year');
}

export function fmtDate(v: string | number | undefined | null, withTime = true) {
  if (v == null || v === '') return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString(undefined, withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' });
}

/** 51.5074, -0.1278 → 51°30′27″N 0°07′40″W */
export function fmtDMS(lat: number, lon: number) {
  const part = (v: number, pos: string, neg: string) => {
    const a = Math.abs(v);
    const d = Math.floor(a);
    const m = Math.floor((a - d) * 60);
    const s = Math.round(((a - d) * 60 - m) * 60);
    return `${d}°${String(m).padStart(2, '0')}′${String(s === 60 ? 59 : s).padStart(2, '0')}″${v >= 0 ? pos : neg}`;
  };
  return `${part(lat, 'N', 'S')}  ${part(lon, 'E', 'W')}`;
}

export function fmtAltitude(m: number) {
  if (!Number.isFinite(m)) return '—';
  if (m >= 100000) return `${nf0.format(m / 1000)} km`;
  if (m >= 1000) return `${nf.format(m / 1000)} km`;
  return `${nf0.format(m)} m`;
}

export function titleCase(key: string) {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b(ms|m|km|c|mw|hpa|pct|s|mm|k)$/i, (u) => `(${u})`)
    .replace(/^./, (c) => c.toUpperCase());
}

// ---------- Unit-aware formatting (follows Settings → General → Units) ----------

const units = () => getApp().prefs.units;

/** Speed from metres per second. */
export function fmtSpeed(ms: number | undefined | null) {
  if (ms == null || !Number.isFinite(ms)) return undefined;
  const u = units();
  if (u === 'imperial') return `${fmtNum(ms * 2.23694, 0)} mph`;
  if (u === 'nautical') return `${fmtNum(ms * 1.94384, 0)} kn`;
  return `${fmtNum(ms * 3.6, 0)} km/h`;
}

/** Wind uses m/s in metric, which is what forecasters use. */
export function fmtWind(ms: number | undefined | null) {
  if (ms == null || !Number.isFinite(ms)) return undefined;
  const u = units();
  if (u === 'imperial') return `${fmtNum(ms * 2.23694, 0)} mph`;
  if (u === 'nautical') return `${fmtNum(ms * 1.94384, 0)} kn`;
  return `${fmtNum(ms, 1)} m/s`;
}

/** Height or elevation from metres. */
export function fmtHeight(m: number | undefined | null) {
  if (m == null || !Number.isFinite(m)) return undefined;
  return units() === 'metric' ? `${fmtNum(m, 0)} m` : `${fmtNum(m * 3.28084, 0)} ft`;
}

/** Distance from kilometres. */
export function fmtDistance(km: number | undefined | null) {
  if (km == null || !Number.isFinite(km)) return undefined;
  const u = units();
  if (u === 'imperial') return `${fmtNum(km * 0.621371, km < 16 ? 1 : 0)} mi`;
  if (u === 'nautical') return `${fmtNum(km * 0.539957, km < 18 ? 1 : 0)} nmi`;
  return `${fmtNum(km, km < 10 ? 1 : 0)} km`;
}

export function fmtTemp(c: number | undefined | null) {
  if (c == null || !Number.isFinite(c)) return undefined;
  return units() === 'imperial' ? `${fmtNum(c * 1.8 + 32, 0)} °F` : `${fmtNum(c, 1)} °C`;
}

/** Clock text for the strip: UTC or local per preference. */
export function fmtClock(d: Date) {
  const utc = getApp().prefs.clock === 'utc';
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: utc ? 'UTC' : undefined });
  const date = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: utc ? 'UTC' : undefined });
  return { time, date, zone: utc ? 'UTC' : Intl.DateTimeFormat().resolvedOptions().timeZone.split('/').pop()!.replace(/_/g, ' ') };
}
