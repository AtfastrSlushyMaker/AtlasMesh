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
