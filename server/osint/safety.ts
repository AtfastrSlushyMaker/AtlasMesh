import dns from 'dns/promises';
import net from 'net';
import { client, USER_AGENT } from '../lib/http';

/**
 * Safety boundaries for the OSINT engine.
 *
 * - Only public http(s) endpoints on default ports; private, loopback,
 *   link-local and cloud-metadata ranges are refused (SSRF protection).
 * - robots.txt is honoured for arbitrary websites.
 * - Excerpts are scrubbed of phone numbers and street addresses; the engine
 *   never creates nodes for either.
 */

const PRIVATE_V4: Array<[string, number]> = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['224.0.0.0', 4], ['240.0.0.0', 4],
];

function v4ToInt(ip: string) {
  return ip.split('.').reduce((acc, o) => (acc << 8) + Number(o), 0) >>> 0;
}

export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const n = v4ToInt(ip);
    return PRIVATE_V4.some(([base, bits]) => {
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      return (n & mask) === (v4ToInt(base) & mask);
    });
  }
  if (net.isIPv6(ip)) {
    const l = ip.toLowerCase();
    if (l === '::1' || l === '::') return true;
    if (l.startsWith('fe80') || l.startsWith('fc') || l.startsWith('fd') || l.startsWith('ff')) return true;
    const mapped = l.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return false;
  }
  return true;
}

export class SafetyError extends Error {}

export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SafetyError(`Not a valid URL: ${raw}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new SafetyError('Only http and https URLs are allowed');
  if (url.port && url.port !== '80' && url.port !== '443') throw new SafetyError('Only default ports are allowed');
  if (url.username || url.password) throw new SafetyError('URLs with credentials are not allowed');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (/^(localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i.test(host)) {
    throw new SafetyError('Local hostnames are not allowed');
  }
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) {
    throw new SafetyError(`${host} resolves to a non-public address`);
  }
  return url;
}

/** Fetch a public web page with SSRF checks on every redirect hop. */
export async function safeFetchPage(raw: string, maxBytes = 1.5 * 1024 * 1024) {
  let current = raw;
  for (let hop = 0; hop < 4; hop++) {
    const url = await assertPublicUrl(current);
    const res = await client.get(url.toString(), {
      responseType: 'text',
      maxRedirects: 0,
      maxContentLength: maxBytes,
      timeout: 15000,
      validateStatus: (s) => s < 400 || (s >= 300 && s < 400),
      headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': USER_AGENT },
    });
    if (res.status >= 300 && res.status < 400 && res.headers.location) {
      current = new URL(res.headers.location, url).toString();
      continue;
    }
    return { url: url.toString(), html: String(res.data), contentType: String(res.headers['content-type'] || '') };
  }
  throw new SafetyError('Too many redirects');
}

const robotsCache = new Map<string, { at: number; disallow: string[] }>();

/** Minimal robots.txt check for the "*" user agent and our own agent token. */
export async function robotsAllows(raw: string): Promise<boolean> {
  const url = new URL(raw);
  const origin = url.origin;
  let entry = robotsCache.get(origin);
  if (!entry || Date.now() - entry.at > 6 * 60 * 60 * 1000) {
    const disallow: string[] = [];
    try {
      await assertPublicUrl(`${origin}/robots.txt`);
      const res = await client.get(`${origin}/robots.txt`, { responseType: 'text', timeout: 8000, maxRedirects: 2, validateStatus: () => true });
      if (res.status < 400) {
        let applies = false;
        for (const line of String(res.data).split('\n')) {
          const [k, ...rest] = line.split(':');
          const key = k.trim().toLowerCase();
          const val = rest.join(':').trim();
          if (key === 'user-agent') applies = val === '*' || /atlasmesh/i.test(val);
          else if (applies && key === 'disallow' && val) disallow.push(val);
        }
      }
    } catch {
      // unreachable robots.txt → treat as allowed, the page fetch will still be SSRF-checked
    }
    entry = { at: Date.now(), disallow };
    robotsCache.set(origin, entry);
  }
  const path = url.pathname || '/';
  return !entry.disallow.some((d) => path.startsWith(d.replace(/\*.*$/, '')));
}

const PHONE = /(?:\+?\d[\d\s().-]{7,}\d)/g;
const STREET = /\b\d{1,5}\s+(?:[A-Z][a-z]+\s){0,3}(?:Street|St\.?|Avenue|Ave\.?|Road|Rd\.?|Boulevard|Blvd\.?|Lane|Ln\.?|Drive|Dr\.?|Court|Ct\.?|Way|Place|Pl\.?|Rue|Strasse|Straße|Calle)\b/gi;

/** Remove phone numbers and street addresses from free text before storing it. */
export function redact(text: string): string {
  return text
    .replace(STREET, '[address removed]')
    .replace(PHONE, (m) => (m.replace(/\D/g, '').length >= 9 ? '[phone removed]' : m));
}

/** Location strings are kept only at city/region/country granularity. */
export function safeLocation(text: string | undefined | null): string | undefined {
  if (!text) return undefined;
  const t = String(text).trim();
  if (!t || t.length > 80) return undefined;
  if (STREET.test(t)) {
    STREET.lastIndex = 0;
    return undefined;
  }
  STREET.lastIndex = 0;
  if (/\d{3,}/.test(t)) return undefined; // postcodes / house numbers
  return t;
}
