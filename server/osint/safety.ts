import dns from 'dns/promises';
import net from 'net';
import type { AxiosRequestConfig } from 'axios';
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

const blocked = new net.BlockList();
for (const [base, bits] of PRIVATE_V4) blocked.addSubnet(base, bits, 'ipv4');
blocked.addAddress('::', 'ipv6');
blocked.addAddress('::1', 'ipv6');
blocked.addSubnet('fe80::', 10, 'ipv6');
blocked.addSubnet('fc00::', 7, 'ipv6');
blocked.addSubnet('ff00::', 8, 'ipv6');

export function isPrivateAddress(ip: string): boolean {
  const family = net.isIP(ip);
  // BlockList also checks IPv4-mapped IPv6, including its hexadecimal forms.
  return !family || blocked.check(ip, family === 6 ? 'ipv6' : 'ipv4');
}

export class SafetyError extends Error {}
type RequestGate = () => Promise<void> | void;
const CREDENTIAL_HEADERS = new Set([
  'authorization', 'cookie', 'proxy-authorization', 'x-api-key', 'api-key', 'apikey',
  'x-auth-token', 'x-access-token', 'x-atlas-key', 'x-client-secret', 'x-authorization',
]);

async function resolvePublicUrl(raw: string) {
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
  const addrs = net.isIP(host) ? [{ address: host, family: net.isIP(host) }] : await dns.lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) {
    throw new SafetyError(`${host} resolves to a non-public address`);
  }
  return { url, addrs };
}

export async function assertPublicUrl(raw: string): Promise<URL> {
  return (await resolvePublicUrl(raw)).url;
}

/** Validate each redirect and pin the socket lookup to the addresses we checked. */
export async function safeGet(raw: string, config: AxiosRequestConfig = {}, checkRobots = false, beforeRequest?: RequestGate) {
  let current = raw;
  const maxRedirects = Math.max(0, Math.min(config.maxRedirects ?? 5, 5));
  let headers = { ...config.headers };
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const { url, addrs } = await resolvePublicUrl(current);
    if (checkRobots && !(await robotsAllows(url.toString(), beforeRequest))) throw new SafetyError(`robots.txt disallows ${url}`);
    const address = addrs.find((a) => a.family === 4) || addrs[0];
    await beforeRequest?.();
    const res = await client.get(url.toString(), {
      ...config,
      headers,
      // A second DNS resolution could return a private address after validation.
      lookup: (_host, options: any, cb: any) => cb(null, options.all ? [address] : address.address, address.family),
      family: address.family as 4 | 6,
      proxy: false,
      httpVersion: 1,
      maxRedirects: 0,
      validateStatus: (s) => (s >= 300 && s < 400) || (config.validateStatus ? config.validateStatus(s) : s >= 200 && s < 300),
    });
    if (res.status >= 300 && res.status < 400 && res.headers.location) {
      const target = new URL(res.headers.location, url);
      if (target.origin !== url.origin) {
        headers = Object.fromEntries(Object.entries(headers).filter(([key]) => !CREDENTIAL_HEADERS.has(key.toLowerCase())));
      }
      current = target.toString();
      continue;
    }
    return { url: url.toString(), response: res };
  }
  throw new SafetyError('Too many redirects');
}

/** Fetch a public page, enforcing robots.txt on every destination too. */
export async function safeFetchPage(raw: string, maxBytes = 1.5 * 1024 * 1024, beforeRequest?: RequestGate) {
  const { url, response } = await safeGet(raw, {
    responseType: 'text', maxContentLength: maxBytes, timeout: 15000,
    headers: { Accept: 'text/html,application/xhtml+xml', 'User-Agent': USER_AGENT },
  }, true, beforeRequest);
  return { url, html: String(response.data), contentType: String(response.headers['content-type'] || '') };
}

const robotsCache = new Map<string, { at: number; allow: RegExp[]; disallow: RegExp[] }>();

/** robots.txt path pattern → RegExp ("*" wildcard, "$" end anchor). */
function robotsPattern(p: string) {
  const anchored = p.endsWith('$');
  const body = (anchored ? p.slice(0, -1) : p).replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${body}${anchored ? '$' : ''}`);
}

/** robots.txt check for "*" and our own agent token, with Allow/Disallow precedence by specificity. */
export async function robotsAllows(raw: string, beforeRequest?: RequestGate): Promise<boolean> {
  const url = new URL(raw);
  const origin = url.origin;
  let entry = robotsCache.get(origin);
  if (!entry || Date.now() - entry.at > 6 * 60 * 60 * 1000) {
    const allow: RegExp[] = [];
    const disallow: RegExp[] = [];
    try {
      const { response: res } = await safeGet(`${origin}/robots.txt`, { responseType: 'text', timeout: 8000, maxContentLength: 512 * 1024, validateStatus: () => true }, false, beforeRequest);
      if (res.status >= 500) throw new SafetyError(`robots.txt is unavailable for ${origin}`);
      if (res.status < 400) {
        let agents: string[] = [];
        let inRules = false;
        for (const rawLine of String(res.data).split('\n')) {
          const line = rawLine.replace(/#.*/, '').trim();
          if (!line) continue;
          const i = line.indexOf(':');
          if (i < 0) continue;
          const key = line.slice(0, i).trim().toLowerCase();
          const val = line.slice(i + 1).trim();
          if (key === 'user-agent') {
            // Consecutive user-agent lines form one group.
            if (inRules) agents = [];
            inRules = false;
            agents.push(val.toLowerCase());
            continue;
          }
          if (key !== 'allow' && key !== 'disallow') continue;
          inRules = true;
          const applies = agents.some((a) => a === '*' || a.includes('atlasmesh'));
          if (!applies || !val) continue;
          (key === 'allow' ? allow : disallow).push(robotsPattern(val));
        }
      }
    } catch (err) {
      // Network failures and exhausted budgets must not silently permit a crawl.
      throw err;
    }
    entry = { at: Date.now(), allow, disallow };
    robotsCache.set(origin, entry);
  }
  const path = (url.pathname || '/') + url.search;
  const longest = (list: RegExp[]) => Math.max(-1, ...list.filter((r) => r.test(path)).map((r) => r.source.length));
  // The most specific matching rule wins; ties go to Allow.
  return longest(entry.allow) >= longest(entry.disallow);
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
